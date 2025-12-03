import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

export const statisticsRoutes = Router();

// 获取全局统计数据
statisticsRoutes.get('/', async (req: Request, res: Response) => {
  const prisma: PrismaClient = req.app.get('prisma');
  
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalMessages,
      todayMessages,
      totalAccounts,
      onlineAccounts,
      totalGroups
    ] = await Promise.all([
      prisma.message.count(),
      prisma.message.count({ where: { createdAt: { gte: today } } }),
      prisma.account.count(),
      prisma.account.count({ where: { status: 'online' } }),
      prisma.group.count()
    ]);

    res.json({
      total_messages: totalMessages,
      today_messages: todayMessages,
      total_accounts: totalAccounts,
      online_accounts: onlineAccounts,
      total_groups: totalGroups
    });
  } catch (error) {
    console.error('获取统计数据失败:', error);
    res.status(500).json({ error: '查询失败' });
  }
});

// 获取账号统计
statisticsRoutes.get('/accounts/:id', async (req: Request, res: Response) => {
  const prisma: PrismaClient = req.app.get('prisma');
  
  try {
    const accountId = parseInt(req.params.id);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalMessages, todayMessages, groupCount] = await Promise.all([
      prisma.message.count({ where: { accountId } }),
      prisma.message.count({ where: { accountId, createdAt: { gte: today } } }),
      prisma.accountGroup.count({ where: { accountId, enabled: true } })
    ]);

    res.json({
      total_messages: totalMessages,
      today_messages: todayMessages,
      group_count: groupCount
    });
  } catch (error) {
    res.status(500).json({ error: '查询失败' });
  }
});

// 获取群组统计
statisticsRoutes.get('/groups/:id', async (req: Request, res: Response) => {
  const prisma: PrismaClient = req.app.get('prisma');
  
  try {
    const groupId = parseInt(req.params.id);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalMessages, todayMessages, accountCount] = await Promise.all([
      prisma.message.count({ where: { groupId } }),
      prisma.message.count({ where: { groupId, createdAt: { gte: today } } }),
      prisma.accountGroup.count({ where: { groupId, enabled: true } })
    ]);

    res.json({
      total_messages: totalMessages,
      today_messages: todayMessages,
      account_count: accountCount
    });
  } catch (error) {
    res.status(500).json({ error: '查询失败' });
  }
});




