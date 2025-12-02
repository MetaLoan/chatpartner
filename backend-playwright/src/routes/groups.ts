import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

export const groupRoutes = Router();

// 格式化群组数据为 snake_case
function formatGroup(group: any) {
  return {
    id: group.id,
    telegram_id: group.telegramId,
    chat_id: group.telegramId, // 兼容旧字段名
    title: group.name,  // 数据库字段是 name
    name: group.name,
    member_count: group.memberCount,
    is_active: group.isActive,
    created_at: group.createdAt,
    updated_at: group.updatedAt,
    accounts: group.accounts
  };
}

// 获取群组列表
groupRoutes.get('/', async (req: Request, res: Response) => {
  const prisma: PrismaClient = req.app.get('prisma');
  
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.page_size as string) || 20;

    const [groups, total] = await Promise.all([
      prisma.group.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          accounts: true
        }
      }),
      prisma.group.count()
    ]);

    res.json({
      data: groups.map(formatGroup),
      total,
      page,
      page_size: pageSize
    });
  } catch (error) {
    res.status(500).json({ error: '查询失败' });
  }
});

// 获取单个群组
groupRoutes.get('/:id', async (req: Request, res: Response) => {
  const prisma: PrismaClient = req.app.get('prisma');
  
  try {
    const group = await prisma.group.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        accounts: {
          include: { account: true }
        }
      }
    });

    if (!group) {
      return res.status(404).json({ error: '群组不存在' });
    }

    res.json({ data: formatGroup(group) });
  } catch (error) {
    res.status(500).json({ error: '查询失败' });
  }
});

// 获取群组的账号列表
groupRoutes.get('/:id/accounts', async (req: Request, res: Response) => {
  const prisma: PrismaClient = req.app.get('prisma');
  
  try {
    const groupId = parseInt(req.params.id);
    
    const accountGroups = await prisma.accountGroup.findMany({
      where: { groupId },
      include: { account: true }
    });

    const accounts = accountGroups.map(ag => ({
      id: ag.account.id,
      phone_number: ag.account.phoneNumber,
      nickname: ag.account.nickname,
      status: ag.account.status
    }));

    res.json({ data: accounts });
  } catch (error) {
    res.status(500).json({ error: '查询失败' });
  }
});

// 创建群组
groupRoutes.post('/', async (req: Request, res: Response) => {
  const prisma: PrismaClient = req.app.get('prisma');
  
  try {
    const { telegram_id, chat_id, title, type, username } = req.body;
    
    // 兼容 chat_id 和 telegram_id
    const groupId = telegram_id || chat_id?.toString();

    if (!groupId || !title) {
      return res.status(400).json({ error: '群组ID 和标题为必填项' });
    }

    const group = await prisma.group.create({
      data: {
        telegramId: groupId,
        name: title  // 数据库字段是 name
      }
    });

    res.status(201).json({
      message: '群组创建成功',
      data: formatGroup(group)
    });
  } catch (error) {
    console.error('创建群组失败:', error);
    res.status(500).json({ error: '创建失败' });
  }
});

// 更新群组
groupRoutes.put('/:id', async (req: Request, res: Response) => {
  const prisma: PrismaClient = req.app.get('prisma');
  
  try {
    const id = parseInt(req.params.id);
    const { telegram_id, chat_id, title, type, username } = req.body;
    
    // 兼容 chat_id 和 telegram_id
    const groupId = telegram_id || chat_id?.toString();

    const group = await prisma.group.update({
      where: { id },
      data: {
        telegramId: groupId,
        title,
        type,
        username
      }
    });

    res.json({
      message: '群组更新成功',
      data: formatGroup(group)
    });
  } catch (error) {
    res.status(500).json({ error: '更新失败' });
  }
});

// 删除群组
groupRoutes.delete('/:id', async (req: Request, res: Response) => {
  const prisma: PrismaClient = req.app.get('prisma');
  
  try {
    const id = parseInt(req.params.id);

    await prisma.accountGroup.deleteMany({ where: { groupId: id } });
    await prisma.message.deleteMany({ where: { groupId: id } });
    await prisma.group.delete({ where: { id } });

    res.json({ message: '群组已删除' });
  } catch (error) {
    res.status(500).json({ error: '删除失败' });
  }
});

// 分配账号到群组
groupRoutes.post('/:id/assign-accounts', async (req: Request, res: Response) => {
  const prisma: PrismaClient = req.app.get('prisma');
  
  try {
    const groupId = parseInt(req.params.id);
    const { account_ids, reply_probability } = req.body;

    if (!Array.isArray(account_ids)) {
      return res.status(400).json({ error: 'account_ids 必须是数组' });
    }

    // 删除现有关联
    await prisma.accountGroup.deleteMany({ where: { groupId } });

    // 创建新关联
    if (account_ids.length > 0) {
      await prisma.accountGroup.createMany({
        data: account_ids.map((accountId: number) => ({
          accountId,
          groupId,
          replyProbability: reply_probability || 1.0,
          enabled: true
        }))
      });
    }

    res.json({ message: '账号分配成功' });
  } catch (error) {
    console.error('分配账号失败:', error);
    res.status(500).json({ error: '分配失败' });
  }
});
