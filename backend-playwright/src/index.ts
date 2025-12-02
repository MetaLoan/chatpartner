import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { PrismaClient } from '@prisma/client';
import { TelegramManager } from './telegram/manager.js';
import { accountRoutes } from './routes/accounts.js';
import { groupRoutes } from './routes/groups.js';
import { messageRoutes } from './routes/messages.js';
import { authRoutes } from './routes/auth.js';
import { configRoutes } from './routes/config.js';
import { statisticsRoutes } from './routes/statistics.js';

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

// 挂载到 app 上供路由使用
app.set('prisma', prisma);
app.set('telegramManager', telegramManager);
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
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/configs', configRoutes);

// 统计路由
app.use('/api/v1/statistics', statisticsRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});
app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// 启动服务器
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 服务器已启动: http://localhost:${PORT}`);
  console.log('📡 WebSocket 服务已就绪');
  
  // 启动所有已启用的账号
  telegramManager.startAll().catch(console.error);
});

// 优雅关闭
process.on('SIGTERM', async () => {
  console.log('🛑 正在关闭服务器...');
  await telegramManager.stopAll();
  await prisma.$disconnect();
  server.close();
  process.exit(0);
});

