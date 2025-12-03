import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { PrismaClient } from '@prisma/client';
import { TelegramManager } from './telegram/manager.js';
import { accountRoutes } from './routes/accounts.js';
import { groupRoutes } from './routes/groups.js';
import { messageRoutes } from './routes/messages.js';
// auth routes removed - login is now handled directly in browser
import { configRoutes } from './routes/config.js';
import { statisticsRoutes } from './routes/statistics.js';
import { infoPoolRoutes } from './routes/info-pool.js';
import { backupRoutes } from './routes/backup.js';
import { templateRoutes } from './routes/templates.js';
import { InfoPoolService } from './services/info-pool.js';
import { ProactiveScheduler } from './services/proactive-scheduler.js';
import fs from 'fs';
import path from 'path';

// 确保必要的数据目录存在
const dataDirs = ['data', 'data/sessions', 'data/uploads', 'data/temp'];
for (const dir of dataDirs) {
  const fullPath = path.join(process.cwd(), dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`📁 创建目录: ${dir}`);
  }
}

// 初始化
const prisma = new PrismaClient();
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// 中间件
app.use(cors());
app.use(express.json());

// 创建 Telegram 管理器
const telegramManager = new TelegramManager(prisma);

// 创建信息池服务
const infoPoolService = new InfoPoolService(prisma);

// 创建主动发言调度器
const proactiveScheduler = new ProactiveScheduler(prisma, infoPoolService);

// 挂载到 app 上供路由使用
app.set('prisma', prisma);
app.set('telegramManager', telegramManager);
app.set('infoPoolService', infoPoolService);
app.set('proactiveScheduler', proactiveScheduler);
app.set('wss', wss);

// WebSocket 连接处理
wss.on('connection', (ws) => {
  console.log('🔌 WebSocket 客户端已连接');
  
  ws.on('close', () => {
    console.log('🔌 WebSocket 客户端已断开');
  });
});

// 广播消息到所有客户端
export function broadcast(data: object) {
  const message = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  });
}

// API 路由 (使用 /api/v1 前缀与前端保持一致)
app.use('/api/v1/accounts', accountRoutes);
app.use('/api/v1/groups', groupRoutes);
app.use('/api/v1/messages', messageRoutes);
// auth routes removed - login is now handled directly in browser
app.use('/api/v1/configs', configRoutes);

// 统计路由
app.use('/api/v1/statistics', statisticsRoutes);

// 信息池路由 (v2.0)
app.use('/api/v1/info-pool', infoPoolRoutes);

// 备份恢复路由
app.use('/api/v1/backup', backupRoutes);

// 模板路由
app.use('/api/v1/templates', templateRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0.0' });
});
app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0.0' });
});

// 启动服务器
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 服务器已启动: http://localhost:${PORT}`);
  console.log('📡 WebSocket 服务已就绪');
  
  // 不自动启动客户端，等待用户从管理后台手动启动
  console.log('📋 Telegram客户端管理器已就绪（未自动启动客户端，等待用户手动操作）');
  
  // 启动信息池服务
  infoPoolService.startAll().catch(console.error);
  
  // 启动主动发言调度器
  // 使用动态获取客户端的方式，避免时序问题
  const registerSendFunctions = () => {
    const clients = telegramManager.getClients();
    const clientCount = clients.size;
    
    if (clientCount === 0) {
      console.log(`📣 等待客户端启动...`);
      return false;
    }
    
    console.log(`📣 注册发送函数，当前客户端数: ${clientCount}`);
    
    for (const [accountId, client] of clients) {
      proactiveScheduler.registerFullSendFunctions(accountId, {
        sendText: async (msg) => {
          // 动态获取最新的客户端实例
          const currentClient = telegramManager.getClient(accountId);
          if (currentClient) {
            await currentClient.sendMessage(msg);
          } else {
            console.log(`[账号${accountId}] ⚠️ 客户端不可用`);
          }
        },
        sendImage: async (base64Data, caption) => {
          const currentClient = telegramManager.getClient(accountId);
          if (currentClient) {
            await currentClient.sendImage(base64Data, caption);
          } else {
            console.log(`[账号${accountId}] ⚠️ 客户端不可用`);
          }
        }
      });
    }
    return true;
  };
  
  // 等待客户端启动后再注册（最多等待2分钟）
  let registerAttempts = 0;
  const maxAttempts = 24; // 24 * 5秒 = 2分钟
  
  const tryRegister = () => {
    registerAttempts++;
    const success = registerSendFunctions();
    
    if (success) {
      console.log(`📣 发送函数注册成功！`);
      proactiveScheduler.startAll().catch(console.error);
      
      // 注册成功后，每60秒重新检查
      setInterval(() => {
        registerSendFunctions();
      }, 60000);
    } else if (registerAttempts < maxAttempts) {
      // 5秒后重试
      setTimeout(tryRegister, 5000);
    } else {
      console.log(`📣 等待超时，启动主动发言调度器（无客户端）`);
      proactiveScheduler.startAll().catch(console.error);
    }
  };
  
  // 10秒后开始尝试注册
  setTimeout(tryRegister, 10000);
});

// 优雅关闭
process.on('SIGTERM', async () => {
  console.log('🛑 正在关闭服务器...');
  proactiveScheduler.stopAll();
  infoPoolService.stopAll();
  await telegramManager.stopAll();
  await prisma.$disconnect();
  server.close();
  process.exit(0);
});

