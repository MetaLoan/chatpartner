import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

export const messageRoutes = Router();

// 获取消息列表
messageRoutes.get('/', async (req: Request, res: Response) => {
  const prisma: PrismaClient = req.app.get('prisma');
  
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.page_size as string) || 50;
    const accountId = req.query.account_id ? parseInt(req.query.account_id as string) : undefined;
    const groupId = req.query.group_id ? parseInt(req.query.group_id as string) : undefined;

    const where: any = {};
    if (accountId) where.accountId = accountId;
    if (groupId) where.groupId = groupId;

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          account: { select: { phoneNumber: true, nickname: true } },
          group: { select: { title: true } }
        }
      }),
      prisma.message.count({ where })
    ]);

    res.json({
      data: messages,
      total,
      page,
      page_size: pageSize
    });
  } catch (error) {
    res.status(500).json({ error: '查询失败' });
  }
});

// 获取统计数据
messageRoutes.get('/statistics', async (req: Request, res: Response) => {
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
    res.status(500).json({ error: '查询失败' });
  }
});


