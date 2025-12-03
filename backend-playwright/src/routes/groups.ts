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
    description: group.description,
    member_count: group.memberCount,
    is_active: group.isActive,
    language: group.language || 'zh-CN', // 群组语言设置
    status: group.isActive ? 'active' : 'inactive', // 兼容前端期望的 status 字段
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
    
    // 查找所有 targetGroupId 指向此群组的账号
    const accounts = await prisma.account.findMany({
      where: { targetGroupId: groupId }
    });

    res.json({ 
      data: accounts.map(acc => ({
        id: acc.id,
        phone_number: acc.phoneNumber,
        nickname: acc.nickname,
        status: acc.status
      }))
    });
  } catch (error) {
    console.error('获取群组账号失败:', error);
    res.status(500).json({ error: '查询失败' });
  }
});

// 创建群组
groupRoutes.post('/', async (req: Request, res: Response) => {
  const prisma: PrismaClient = req.app.get('prisma');
  
  try {
    const { telegram_id, chat_id, title, type, username, language } = req.body;
    
    // 兼容 chat_id 和 telegram_id
    const groupId = telegram_id || chat_id?.toString();

    if (!groupId || !title) {
      return res.status(400).json({ error: '群组ID 和标题为必填项' });
    }

    const group = await prisma.group.create({
      data: {
        telegramId: groupId,
        name: title,  // 数据库字段是 name
        language: language || 'zh-CN'  // 默认中文
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
    const { telegram_id, chat_id, title, status, description, language } = req.body;
    
    // 兼容 chat_id 和 telegram_id
    const groupId = telegram_id || chat_id?.toString();
    
    // 转换状态：'active' -> true, 其他 -> false
    const isActive = status === 'active' || status === true;

    const group = await prisma.group.update({
      where: { id },
      data: {
        ...(groupId && { telegramId: groupId }),
        ...(title && { name: title }),
        ...(description !== undefined && { description }),
        ...(status !== undefined && { isActive }),
        ...(language && { language })
      }
    });

    res.json({
      message: '群组更新成功',
      data: formatGroup(group)
    });
  } catch (error) {
    console.error('更新群组失败:', error);
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
    const { account_ids } = req.body;

    if (!Array.isArray(account_ids)) {
      return res.status(400).json({ error: 'account_ids 必须是数组' });
    }

    // 先清除所有指向此群组的账号
    await prisma.account.updateMany({
      where: { targetGroupId: groupId },
      data: { targetGroupId: null }
    });

    // 将选中的账号关联到此群组
    if (account_ids.length > 0) {
      await prisma.account.updateMany({
        where: { id: { in: account_ids } },
        data: { targetGroupId: groupId }
      });
    }

    res.json({ message: '账号分配成功' });
  } catch (error) {
    console.error('分配账号失败:', error);
    res.status(500).json({ error: '分配失败' });
  }
});
