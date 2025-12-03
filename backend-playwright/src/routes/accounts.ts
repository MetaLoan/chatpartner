import { Router, Request, Response } from 'express';
import { PrismaClient, Account } from '@prisma/client';
import { TelegramManager } from '../telegram/manager.js';
import fs from 'fs';
import path from 'path';

export const accountRoutes = Router();

// 将 Prisma 返回的 camelCase 转换为前端需要的 snake_case
function formatAccount(account: any) {
  return {
    id: account.id,
    phone_number: account.phoneNumber,
    nickname: account.nickname,
    status: account.status,
    session_path: account.sessionPath,
    last_login_at: account.lastLoginAt,
    ai_api_key: account.aiApiKey,
    ai_api_base_url: account.aiApiBaseUrl,
    ai_model: account.aiModel,
    system_prompt: account.systemPrompt,
    reply_interval: account.replyInterval,
    listen_interval: account.listenInterval,
    buffer_size: account.bufferSize,
    auto_reply: account.autoReply,
    reply_probability: account.replyProbability,
    split_by_newline: account.splitByNewline,
    multi_msg_interval: account.multiMsgInterval,
    priority: account.priority,
    tone: account.tone,
    enabled: account.enabled,
    enable_image_recognition: account.enableImageRecognition,
    target_group_id: account.targetGroupId,
    target_group: account.targetGroup ? {
      id: account.targetGroup.id,
      title: account.targetGroup.title,
      telegram_id: account.targetGroup.telegramId
    } : null,
    // 主动发言相关 (v2.0)
    proactive_enabled: account.proactiveEnabled,
    proactive_interval_min: account.proactiveIntervalMin,
    proactive_interval_max: account.proactiveIntervalMax,
    proactive_prompt: account.proactivePrompt,
    last_proactive_at: account.lastProactiveAt,
    created_at: account.createdAt,
    updated_at: account.updatedAt
  };
}

// 获取账号列表
accountRoutes.get('/', async (req: Request, res: Response) => {
  const prisma: PrismaClient = req.app.get('prisma');
  
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.page_size as string) || 20;
    const search = req.query.search as string;
    const status = req.query.status as string;

    const where: any = {};
    
    if (search) {
      where.OR = [
        { phoneNumber: { contains: search } },
        { nickname: { contains: search } }
      ];
    }
    
    if (status) {
      where.status = status;
    }

    const [accounts, total] = await Promise.all([
      prisma.account.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: { targetGroup: true }
      }),
      prisma.account.count({ where })
    ]);

    res.json({
      data: accounts.map(formatAccount),
      total,
      page,
      page_size: pageSize
    });
  } catch (error) {
    console.error('获取账号列表失败:', error);
    res.status(500).json({ error: '查询失败' });
  }
});

// 保存所有登录状态（必须在 /:id 路由之前定义）
accountRoutes.post('/save-sessions', async (req: Request, res: Response) => {
  const prisma: PrismaClient = req.app.get('prisma');
  
  try {
    const SESSION_DIR = process.env.SESSION_DIR || path.join(process.cwd(), 'data', 'sessions');
    
    // 确保登录目录存在
    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    }
    
    // 获取所有账号
    const accounts = await prisma.account.findMany({
      select: {
        id: true,
        phoneNumber: true,
        sessionPath: true
      }
    });
    
    const results: Array<{
      accountId: number;
      phoneNumber: string;
      success: boolean;
      message: string;
      sessionPath?: string;
    }> = [];
    
    let totalBackedUp = 0;
    let totalSkipped = 0;
    let totalFailed = 0;
    
    for (const account of accounts) {
      // 获取session文件路径
      let sessionPath: string;
      if (account.sessionPath) {
        sessionPath = account.sessionPath;
        if (!path.isAbsolute(sessionPath)) {
          sessionPath = path.resolve(process.cwd(), sessionPath);
        }
      } else {
        // 使用默认路径
        const phoneNumberClean = account.phoneNumber.replace(/\+/g, '');
        sessionPath = path.join(SESSION_DIR, `${phoneNumberClean}.json`);
      }
      
      // 检查session文件是否存在且有效
      if (!fs.existsSync(sessionPath)) {
        results.push({
          accountId: account.id,
          phoneNumber: account.phoneNumber,
          success: false,
          message: 'Session file not found',
          sessionPath
        });
        totalSkipped++;
        continue;
      }
      
      // 检查文件大小
      const stats = fs.statSync(sessionPath);
      if (stats.size === 0) {
        results.push({
          accountId: account.id,
          phoneNumber: account.phoneNumber,
          success: false,
          message: 'Session file is empty',
          sessionPath
        });
        totalSkipped++;
        continue;
      }
      
      // 尝试解析JSON验证文件有效性
      try {
        const content = fs.readFileSync(sessionPath, 'utf-8');
        JSON.parse(content); // 验证JSON格式
      } catch (parseError) {
        results.push({
          accountId: account.id,
          phoneNumber: account.phoneNumber,
          success: false,
          message: 'Session file is invalid JSON',
          sessionPath
        });
        totalSkipped++;
        continue;
      }
      
      // 保存session文件到登录目录（如果session文件不在登录目录，则复制过去）
      try {
        const phoneNumberClean = account.phoneNumber.replace(/\+/g, '');
        const targetPath = path.join(SESSION_DIR, `${phoneNumberClean}.json`);
        
        // 如果session文件已经在登录目录，跳过
        if (sessionPath === targetPath) {
          results.push({
            accountId: account.id,
            phoneNumber: account.phoneNumber,
            success: true,
            message: 'Already in sessions directory',
            sessionPath
          });
          totalBackedUp++;
          continue;
        }
        
        // 如果目标文件已存在，先删除
        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
        }
        
        // 复制文件到登录目录
        fs.copyFileSync(sessionPath, targetPath);
        
        // 更新数据库中的sessionPath
        await prisma.account.update({
          where: { id: account.id },
          data: { sessionPath: targetPath }
        });
        
        results.push({
          accountId: account.id,
          phoneNumber: account.phoneNumber,
          success: true,
          message: 'Saved to sessions directory successfully',
          sessionPath: targetPath
        });
        totalBackedUp++;
      } catch (saveError: any) {
        results.push({
          accountId: account.id,
          phoneNumber: account.phoneNumber,
          success: false,
          message: `Save failed: ${saveError.message}`,
          sessionPath
        });
        totalFailed++;
      }
    }
    
    res.json({
      success: true,
      message: `Save completed: ${totalBackedUp} saved, ${totalSkipped} skipped, ${totalFailed} failed`,
      summary: {
        total: accounts.length,
        saved: totalBackedUp,
        skipped: totalSkipped,
        failed: totalFailed
      },
      results,
      sessionsDir: SESSION_DIR
    });
  } catch (error: any) {
    console.error('保存登录状态失败:', error);
    res.status(500).json({ 
      success: false,
      error: '保存失败',
      message: error.message 
    });
  }
});

// 获取单个账号
accountRoutes.get('/:id', async (req: Request, res: Response) => {
  const prisma: PrismaClient = req.app.get('prisma');
  
  try {
    const account = await prisma.account.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { targetGroup: true }
    });

    if (!account) {
      return res.status(404).json({ error: '账号不存在' });
    }

    res.json({ data: formatAccount(account) });
  } catch (error) {
    res.status(500).json({ error: '查询失败' });
  }
});

// 创建账号（不再需要 API ID 和 API Hash！）
accountRoutes.post('/', async (req: Request, res: Response) => {
  const prisma: PrismaClient = req.app.get('prisma');
  
  try {
    const { phone_number, ai_api_key, nickname, ai_model, system_prompt, ...rest } = req.body;

    // 验证必填字段（注意：不再需要 api_id 和 api_hash！）
    if (!phone_number || !ai_api_key) {
      return res.status(400).json({ error: '手机号和 AI API Key 为必填项' });
    }

    // 检查手机号是否已存在
    const existing = await prisma.account.findUnique({
      where: { phoneNumber: phone_number.trim() }
    });

    if (existing) {
      return res.status(409).json({ error: '该手机号已存在' });
    }

    const account = await prisma.account.create({
      data: {
        phoneNumber: phone_number.trim(),
        aiApiKey: ai_api_key,
        nickname: nickname?.trim(),
        aiModel: ai_model || 'gpt-4o-mini',
        systemPrompt: system_prompt,
        replyInterval: rest.reply_interval || 60,
        listenInterval: rest.listen_interval || 5,
        bufferSize: rest.buffer_size || 10,
        autoReply: rest.auto_reply !== false,
        replyProbability: rest.reply_probability ?? 100,
        splitByNewline: rest.split_by_newline !== false,
        multiMsgInterval: rest.multi_msg_interval || 5,
        priority: rest.priority || 5,
        enabled: rest.enabled !== false,
        enableImageRecognition: rest.enable_image_recognition || false,
        targetGroupId: rest.target_group_id || null
      },
      include: { targetGroup: true }
    });

    res.status(201).json({
      message: '账号创建成功',
      data: formatAccount(account)
    });
  } catch (error) {
    console.error('创建账号失败:', error);
    res.status(500).json({ error: '创建失败' });
  }
});

// 更新账号
accountRoutes.put('/:id', async (req: Request, res: Response) => {
  const prisma: PrismaClient = req.app.get('prisma');
  
  try {
    const id = parseInt(req.params.id);
    const data = req.body;

    // 构建更新数据，只包含提供的字段
    const updateData: any = {};
    if (data.phone_number !== undefined) updateData.phoneNumber = data.phone_number?.trim();
    if (data.nickname !== undefined) updateData.nickname = data.nickname?.trim();
    if (data.status !== undefined) updateData.status = data.status;
    if (data.session_path !== undefined) updateData.sessionPath = data.session_path;
    if (data.ai_api_key !== undefined) updateData.aiApiKey = data.ai_api_key;
    if (data.ai_api_base_url !== undefined) updateData.aiApiBaseUrl = data.ai_api_base_url;
    if (data.ai_model !== undefined) updateData.aiModel = data.ai_model;
    if (data.system_prompt !== undefined) updateData.systemPrompt = data.system_prompt;
    if (data.reply_interval !== undefined) updateData.replyInterval = data.reply_interval;
    if (data.listen_interval !== undefined) updateData.listenInterval = data.listen_interval;
    if (data.buffer_size !== undefined) updateData.bufferSize = data.buffer_size;
    if (data.auto_reply !== undefined) updateData.autoReply = data.auto_reply;
    if (data.reply_probability !== undefined) updateData.replyProbability = data.reply_probability;
    if (data.split_by_newline !== undefined) updateData.splitByNewline = data.split_by_newline;
    if (data.multi_msg_interval !== undefined) updateData.multiMsgInterval = data.multi_msg_interval;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.tone !== undefined) updateData.tone = data.tone;
    if (data.enabled !== undefined) updateData.enabled = data.enabled;
    if (data.enable_image_recognition !== undefined) updateData.enableImageRecognition = data.enable_image_recognition;
    if (data.target_group_id !== undefined) updateData.targetGroupId = data.target_group_id;
    // 主动发言相关 (v2.0)
    if (data.proactive_enabled !== undefined) updateData.proactiveEnabled = data.proactive_enabled;
    if (data.proactive_interval_min !== undefined) updateData.proactiveIntervalMin = data.proactive_interval_min;
    if (data.proactive_interval_max !== undefined) updateData.proactiveIntervalMax = data.proactive_interval_max;
    if (data.proactive_prompt !== undefined) updateData.proactivePrompt = data.proactive_prompt;

    const account = await prisma.account.update({
      where: { id },
      data: updateData,
      include: { targetGroup: true }
    });

    res.json({
      message: '账号更新成功',
      data: formatAccount(account)
    });
  } catch (error) {
    console.error('更新账号失败:', error);
    res.status(500).json({ error: '更新失败' });
  }
});

// 删除账号
accountRoutes.delete('/:id', async (req: Request, res: Response) => {
  const prisma: PrismaClient = req.app.get('prisma');
  const manager: TelegramManager = req.app.get('telegramManager');
  
  try {
    const id = parseInt(req.params.id);

    // 停止客户端
    await manager.removeClient(id);

    // 删除相关数据
    await prisma.infoItemUsage.deleteMany({ where: { accountId: id } }).catch(() => {});
    await prisma.message.deleteMany({ where: { accountId: id } }).catch(() => {});
    
    // 删除账号
    await prisma.account.delete({ where: { id } });

    res.json({ message: '账号已删除' });
  } catch (error) {
    console.error('删除账号失败:', error);
    res.status(500).json({ error: '删除失败' });
  }
});

// 登录账号（启动浏览器，发送验证码）
accountRoutes.post('/:id/login', async (req: Request, res: Response) => {
  const prisma: PrismaClient = req.app.get('prisma');
  const manager: TelegramManager = req.app.get('telegramManager');
  
  try {
    const id = parseInt(req.params.id);
    
    // 启动浏览器
    await manager.initiateLogin(id);
    
    // 等待一下让浏览器打开
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 检查是否已经登录（有会话的账号会自动登录）
    const client = manager.getClient(id);
    let needsLogin = true;
    
    if (client) {
      const page = client.getPage();
      if (page) {
        // 快速检查登录状态
        const isLoggedIn = await Promise.race([
          client.waitForLogin(3000),
          new Promise<boolean>(resolve => setTimeout(() => resolve(false), 3000))
        ]);
        
        if (isLoggedIn) {
          needsLogin = false;
        }
      }
    }

    res.json({
      message: needsLogin ? '登录请求已提交，请在浏览器中完成登录' : '浏览器已打开，已自动登录',
      account_id: id,
      needs_login: needsLogin,
      already_logged_in: !needsLogin
    });
  } catch (error) {
    console.error('登录失败:', error);
    res.status(500).json({ error: `登录失败: ${error}` });
  }
});

// 登出账号
accountRoutes.post('/:id/logout', async (req: Request, res: Response) => {
  const manager: TelegramManager = req.app.get('telegramManager');
  
  try {
    const id = parseInt(req.params.id);
    await manager.removeClient(id);

    res.json({ message: '已登出' });
  } catch (error) {
    res.status(500).json({ error: '登出失败' });
  }
});

// 确认登录状态
accountRoutes.post('/:id/confirm-login', async (req: Request, res: Response) => {
  const prisma: PrismaClient = req.app.get('prisma');
  const manager: TelegramManager = req.app.get('telegramManager');
  
  try {
    const id = parseInt(req.params.id);
    const client = manager.getClient(id);
    
    if (client) {
      // 检查浏览器中的登录状态
      const isLoggedIn = await client.waitForLogin(5000); // 5秒超时快速检查
      
      if (isLoggedIn) {
        res.json({ message: '登录成功', status: 'online' });
      } else {
        res.json({ message: '等待登录中', status: 'authenticating' });
      }
    } else {
      res.json({ message: '客户端未启动', status: 'offline' });
    }
  } catch (error) {
    res.status(500).json({ error: '确认登录失败' });
  }
});

// 开始监控群组
accountRoutes.post('/:id/monitor', async (req: Request, res: Response) => {
  const manager: TelegramManager = req.app.get('telegramManager');
  
  try {
    const id = parseInt(req.params.id);
    const { group_id } = req.body;
    
    if (!group_id) {
      return res.status(400).json({ error: '群组ID为必填项' });
    }
    
    const client = manager.getClient(id);
    
    if (client) {
      // 跳转到群组并开始监控
      client.navigateToGroupAndMonitor(group_id).catch(console.error);
      res.json({ message: '已开始监控', group_id });
    } else {
      res.status(400).json({ error: '客户端未启动，请先登录' });
    }
  } catch (error) {
    console.error('开始监控失败:', error);
    res.status(500).json({ error: '开始监控失败' });
  }
});

