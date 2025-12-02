import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { TelegramManager } from '../telegram/manager.js';

export const authRoutes = Router();

// 获取认证状态
authRoutes.get('/:accountId/status', async (req: Request, res: Response) => {
  const prisma: PrismaClient = req.app.get('prisma');
  
  try {
    const accountId = parseInt(req.params.accountId);
    
    const authSession = await prisma.authSession.findUnique({
      where: { accountId }
    });

    if (!authSession) {
      return res.json({
        state: 'none',
        message: '未开始认证'
      });
    }

    res.json({
      state: authSession.state,
      message: authSession.message
    });
  } catch (error) {
    res.status(500).json({ error: '获取认证状态失败' });
  }
});

// 提交验证码
authRoutes.post('/:accountId/code', async (req: Request, res: Response) => {
  const manager: TelegramManager = req.app.get('telegramManager');
  
  try {
    const accountId = parseInt(req.params.accountId);
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: '验证码不能为空' });
    }

    await manager.submitCode(accountId, code);
    
    res.json({ message: '验证码已提交' });
  } catch (error) {
    console.error('提交验证码失败:', error);
    res.status(500).json({ error: `提交验证码失败: ${error}` });
  }
});

// 提交 2FA 密码
authRoutes.post('/:accountId/password', async (req: Request, res: Response) => {
  const manager: TelegramManager = req.app.get('telegramManager');
  
  try {
    const accountId = parseInt(req.params.accountId);
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: '密码不能为空' });
    }

    await manager.submitPassword(accountId, password);
    
    res.json({ message: '密码已提交' });
  } catch (error) {
    console.error('提交密码失败:', error);
    res.status(500).json({ error: `提交密码失败: ${error}` });
  }
});


