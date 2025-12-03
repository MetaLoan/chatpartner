import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

export const configRoutes = Router();

// 获取配置
configRoutes.get('/:key', async (req: Request, res: Response) => {
  const prisma: PrismaClient = req.app.get('prisma');
  
  try {
    const config = await prisma.config.findUnique({
      where: { key: req.params.key }
    });

    if (!config) {
      return res.status(404).json({ error: '配置不存在' });
    }

    res.json({ data: JSON.parse(config.value) });
  } catch (error) {
    res.status(500).json({ error: '查询失败' });
  }
});

// 更新配置
configRoutes.put('/:key', async (req: Request, res: Response) => {
  const prisma: PrismaClient = req.app.get('prisma');
  
  try {
    const { value } = req.body;

    const config = await prisma.config.upsert({
      where: { key: req.params.key },
      create: { key: req.params.key, value: JSON.stringify(value) },
      update: { value: JSON.stringify(value) }
    });

    res.json({
      message: '配置更新成功',
      data: JSON.parse(config.value)
    });
  } catch (error) {
    res.status(500).json({ error: '更新失败' });
  }
});

// 获取所有配置
configRoutes.get('/', async (req: Request, res: Response) => {
  const prisma: PrismaClient = req.app.get('prisma');
  
  try {
    const configs = await prisma.config.findMany();
    
    const result: Record<string, any> = {};
    for (const config of configs) {
      try {
        result[config.key] = JSON.parse(config.value);
      } catch {
        result[config.key] = config.value;
      }
    }

    res.json({ data: result });
  } catch (error) {
    res.status(500).json({ error: '查询失败' });
  }
});




