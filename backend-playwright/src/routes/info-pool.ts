/**
 * 公共信息池 API 路由
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { InfoPoolService } from '../services/info-pool.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// 配置图片上传
const uploadDir = path.join(process.cwd(), 'data', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件类型') as any, false);
    }
  }
});

// ============ 信息源管理 ============

// 获取所有信息源
router.get('/sources', async (req: Request, res: Response) => {
  const prisma = req.app.get('prisma') as PrismaClient;
  
  try {
    const sources = await prisma.infoSource.findMany({
      include: {
        _count: {
          select: { items: true }
        }
      },
      orderBy: { id: 'asc' }
    });
    
    res.json({
      data: sources.map(s => ({
        id: s.id,
        type: s.type,
        name: s.name,
        rss_url: s.rssUrl,
        price_api_url: s.priceApiUrl,
        fetch_interval: s.fetchInterval,
        work_mode: s.workMode,
        reusable: s.reusable,
        expire_hours: s.expireHours,
        enabled: s.enabled,
        last_fetch_at: s.lastFetchAt,
        item_count: s._count.items,
        created_at: s.createdAt
      }))
    });
  } catch (error) {
    console.error('获取信息源失败:', error);
    res.status(500).json({ error: '获取信息源失败' });
  }
});

// 创建信息源
router.post('/sources', async (req: Request, res: Response) => {
  const prisma = req.app.get('prisma') as PrismaClient;
  const infoPoolService = req.app.get('infoPoolService') as InfoPoolService;
  
  try {
    const { type, name, rss_url, price_api_url, fetch_interval, work_mode, reusable, expire_hours, enabled } = req.body;
    
    if (!type || !name) {
      return res.status(400).json({ error: '缺少必填字段' });
    }
    
    const source = await prisma.infoSource.create({
      data: {
        type,
        name,
        rssUrl: rss_url,
        priceApiUrl: price_api_url,
        fetchInterval: fetch_interval || 300,
        workMode: work_mode || 'comment',
        reusable: reusable || false,
        expireHours: expire_hours || 24,
        enabled: enabled !== false
      }
    });
    
    // 如果启用，开始拉取
    if (source.enabled) {
      infoPoolService.startSource(source.id);
    }
    
    res.json({ message: '创建成功', data: source });
  } catch (error) {
    console.error('创建信息源失败:', error);
    res.status(500).json({ error: '创建信息源失败' });
  }
});

// 更新信息源
router.put('/sources/:id', async (req: Request, res: Response) => {
  const prisma = req.app.get('prisma') as PrismaClient;
  const infoPoolService = req.app.get('infoPoolService') as InfoPoolService;
  
  try {
    const id = parseInt(req.params.id);
    const { name, rss_url, price_api_url, fetch_interval, work_mode, reusable, expire_hours, enabled } = req.body;
    
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (rss_url !== undefined) updateData.rssUrl = rss_url;
    if (price_api_url !== undefined) updateData.priceApiUrl = price_api_url;
    if (fetch_interval !== undefined) updateData.fetchInterval = fetch_interval;
    if (work_mode !== undefined) updateData.workMode = work_mode;
    if (reusable !== undefined) updateData.reusable = reusable;
    if (expire_hours !== undefined) updateData.expireHours = expire_hours;
    if (enabled !== undefined) updateData.enabled = enabled;
    
    const source = await prisma.infoSource.update({
      where: { id },
      data: updateData
    });
    
    // 重新启动/停止信息源
    if (source.enabled) {
      infoPoolService.startSource(source.id);
    } else {
      infoPoolService.stopSource(source.id);
    }
    
    res.json({ message: '更新成功', data: source });
  } catch (error) {
    console.error('更新信息源失败:', error);
    res.status(500).json({ error: '更新信息源失败' });
  }
});

// 删除信息源
router.delete('/sources/:id', async (req: Request, res: Response) => {
  const prisma = req.app.get('prisma') as PrismaClient;
  const infoPoolService = req.app.get('infoPoolService') as InfoPoolService;
  
  try {
    const id = parseInt(req.params.id);
    
    // 停止信息源
    infoPoolService.stopSource(id);
    
    // 删除信息源（级联删除items和usages）
    await prisma.infoSource.delete({ where: { id } });
    
    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('删除信息源失败:', error);
    res.status(500).json({ error: '删除信息源失败' });
  }
});

// 手动触发拉取
router.post('/sources/:id/fetch', async (req: Request, res: Response) => {
  const infoPoolService = req.app.get('infoPoolService') as InfoPoolService;
  
  try {
    const id = parseInt(req.params.id);
    await infoPoolService.fetchSource(id);
    res.json({ message: '拉取完成' });
  } catch (error) {
    console.error('拉取失败:', error);
    res.status(500).json({ error: '拉取失败' });
  }
});

// ============ 信息条目管理 ============

// 获取信息条目列表
router.get('/items', async (req: Request, res: Response) => {
  const prisma = req.app.get('prisma') as PrismaClient;
  
  try {
    const { source_id, expired, page = '1', page_size = '20' } = req.query;
    
    const where: any = {};
    if (source_id) where.sourceId = parseInt(source_id as string);
    if (expired !== undefined) where.expired = expired === 'true';
    
    const skip = (parseInt(page as string) - 1) * parseInt(page_size as string);
    const take = parseInt(page_size as string);
    
    const [items, total] = await Promise.all([
      prisma.infoItem.findMany({
        where,
        include: {
          source: { select: { name: true, type: true, workMode: true } },
          usages: {
            include: {
              account: { select: { phoneNumber: true, nickname: true } }
            }
          }
        },
        orderBy: { publishedAt: 'desc' },
        skip,
        take
      }),
      prisma.infoItem.count({ where })
    ]);
    
    res.json({
      data: items.map(item => ({
        id: item.id,
        source_id: item.sourceId,
        source_name: item.source.name,
        source_type: item.source.type,
        work_mode: item.source.workMode,
        content_type: item.contentType,
        title: item.title,
        content: item.content,
        image_path: item.imagePath,
        source_url: item.sourceUrl,
        price_value: item.priceValue,
        price_change: item.priceChange,
        expired: item.expired,
        published_at: item.publishedAt,
        created_at: item.createdAt,
        usages: item.usages.map(u => ({
          account_id: u.accountId,
          account_name: u.account.nickname || u.account.phoneNumber,
          used_at: u.usedAt
        }))
      })),
      total,
      page: parseInt(page as string),
      page_size: parseInt(page_size as string)
    });
  } catch (error) {
    console.error('获取信息条目失败:', error);
    res.status(500).json({ error: '获取信息条目失败' });
  }
});

// 添加手动内容（文字）
router.post('/items/text', async (req: Request, res: Response) => {
  const prisma = req.app.get('prisma') as PrismaClient;
  
  try {
    const { source_id, title, content } = req.body;
    
    if (!source_id || !content) {
      return res.status(400).json({ error: '缺少必填字段' });
    }
    
    // 验证信息源类型
    const source = await prisma.infoSource.findUnique({
      where: { id: source_id }
    });
    
    if (!source || source.type !== 'manual_text') {
      return res.status(400).json({ error: '信息源类型不匹配' });
    }
    
    const item = await prisma.infoItem.create({
      data: {
        sourceId: source_id,
        contentType: 'text',
        title,
        content,
        publishedAt: new Date()
      }
    });
    
    res.json({ message: '添加成功', data: item });
  } catch (error) {
    console.error('添加文字内容失败:', error);
    res.status(500).json({ error: '添加文字内容失败' });
  }
});

// 添加手动内容（图片）
router.post('/items/image', upload.single('image'), async (req: Request, res: Response) => {
  const prisma = req.app.get('prisma') as PrismaClient;
  
  try {
    const { source_id, title, content } = req.body;
    const file = req.file;
    
    if (!source_id || !file) {
      return res.status(400).json({ error: '缺少必填字段' });
    }
    
    // 验证信息源类型
    const source = await prisma.infoSource.findUnique({
      where: { id: parseInt(source_id) }
    });
    
    if (!source || source.type !== 'manual_image') {
      return res.status(400).json({ error: '信息源类型不匹配' });
    }
    
    const item = await prisma.infoItem.create({
      data: {
        sourceId: parseInt(source_id),
        contentType: 'image',
        title,
        content,
        imagePath: file.filename,
        publishedAt: new Date()
      }
    });
    
    res.json({ message: '添加成功', data: item });
  } catch (error) {
    console.error('添加图片内容失败:', error);
    res.status(500).json({ error: '添加图片内容失败' });
  }
});

// 删除信息条目
router.delete('/items/:id', async (req: Request, res: Response) => {
  const prisma = req.app.get('prisma') as PrismaClient;
  
  try {
    const id = parseInt(req.params.id);
    
    // 获取条目信息（用于删除图片文件）
    const item = await prisma.infoItem.findUnique({ where: { id } });
    
    if (item?.imagePath) {
      const imagePath = path.join(uploadDir, item.imagePath);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    
    await prisma.infoItem.delete({ where: { id } });
    
    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('删除信息条目失败:', error);
    res.status(500).json({ error: '删除信息条目失败' });
  }
});

// 清除使用标记
router.post('/items/:id/clear-usage', async (req: Request, res: Response) => {
  const prisma = req.app.get('prisma') as PrismaClient;
  
  try {
    const id = parseInt(req.params.id);
    
    await prisma.infoItemUsage.deleteMany({
      where: { itemId: id }
    });
    
    res.json({ message: '已清除使用标记' });
  } catch (error) {
    console.error('清除使用标记失败:', error);
    res.status(500).json({ error: '清除使用标记失败' });
  }
});

// ============ 统计 ============

// 获取统计信息
router.get('/stats', async (req: Request, res: Response) => {
  const infoPoolService = req.app.get('infoPoolService') as InfoPoolService;
  
  try {
    const stats = await infoPoolService.getStats();
    res.json({ data: stats });
  } catch (error) {
    console.error('获取统计失败:', error);
    res.status(500).json({ error: '获取统计失败' });
  }
});

// 提供上传的图片
router.get('/uploads/:filename', (req: Request, res: Response) => {
  const filename = req.params.filename;
  const filePath = path.join(uploadDir, filename);
  
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: '文件不存在' });
  }
});

export const infoPoolRoutes = router;

