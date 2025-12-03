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
        api_url: s.apiUrl,
        tradepair: s.tradepair,
        leverage_options: s.leverageOptions,
        open_time_range_hours: s.openTimeRangeHours,
        cleanup_hours: s.cleanupHours,
        fetch_interval: s.fetchInterval,
        work_mode: s.workMode,
        reusable: s.reusable,
        allow_same_account_reuse: s.allowSameAccountReuse,
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
    const { 
      type, name, rss_url, price_api_url, api_url, tradepair, leverage_options,
      open_time_range_hours, cleanup_hours, fetch_interval, symbols, history_size,
      work_mode, reusable, allow_same_account_reuse, expire_hours, enabled 
    } = req.body;
    
    if (!type || !name) {
      return res.status(400).json({ error: '缺少必填字段' });
    }
    
    // 验证晒单图类型必填字段
    if (type === 'contract_image') {
      if (!api_url || !tradepair) {
        return res.status(400).json({ error: '晒单图类型需要填写API地址和交易对' });
      }
    }
    
    // 验证实时币价类型必填字段
    if (type === 'crypto_price') {
      if (!symbols || (Array.isArray(symbols) && symbols.length === 0)) {
        return res.status(400).json({ error: '实时币价类型需要至少选择一个币种' });
      }
    }
    
    // 处理杠杆选项（如果是数组，转换为JSON字符串）
    let leverageOptionsStr: string | null = null;
    if (leverage_options) {
      if (Array.isArray(leverage_options)) {
        leverageOptionsStr = JSON.stringify(leverage_options);
      } else if (typeof leverage_options === 'string') {
        leverageOptionsStr = leverage_options;
      }
    }
    
    // 处理币种列表（如果是数组，转换为JSON字符串）
    let symbolsStr: string | null = null;
    if (symbols) {
      if (Array.isArray(symbols)) {
        symbolsStr = JSON.stringify(symbols);
      } else if (typeof symbols === 'string') {
        symbolsStr = symbols;
      }
    }
    
    const source = await prisma.infoSource.create({
      data: {
        type,
        name,
        rssUrl: rss_url,
        priceApiUrl: price_api_url,
        apiUrl: api_url,
        tradepair: tradepair,
        leverageOptions: leverageOptionsStr,
        openTimeRangeHours: open_time_range_hours,
        cleanupHours: cleanup_hours,
        symbols: symbolsStr,
        historySize: history_size || 20,
        fetchInterval: fetch_interval || (type === 'crypto_price' ? 60 : 300),
        workMode: work_mode || 'comment',
        reusable: reusable || false,
        allowSameAccountReuse: allow_same_account_reuse || false,
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
    const { 
      name, rss_url, price_api_url, api_url, tradepair, leverage_options,
      open_time_range_hours, cleanup_hours, fetch_interval, 
      work_mode, reusable, allow_same_account_reuse, expire_hours, enabled 
    } = req.body;
    
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (rss_url !== undefined) updateData.rssUrl = rss_url;
    if (price_api_url !== undefined) updateData.priceApiUrl = price_api_url;
    if (api_url !== undefined) updateData.apiUrl = api_url;
    if (tradepair !== undefined) updateData.tradepair = tradepair;
    if (leverage_options !== undefined) {
      // 处理杠杆选项（如果是数组，转换为JSON字符串）
      if (Array.isArray(leverage_options)) {
        updateData.leverageOptions = JSON.stringify(leverage_options);
      } else if (typeof leverage_options === 'string') {
        updateData.leverageOptions = leverage_options;
      } else {
        updateData.leverageOptions = null;
      }
    }
    if (open_time_range_hours !== undefined) updateData.openTimeRangeHours = open_time_range_hours;
    if (cleanup_hours !== undefined) updateData.cleanupHours = cleanup_hours;
    if (fetch_interval !== undefined) updateData.fetchInterval = fetch_interval;
    if (work_mode !== undefined) updateData.workMode = work_mode;
    if (reusable !== undefined) updateData.reusable = reusable;
    if (allow_same_account_reuse !== undefined) updateData.allowSameAccountReuse = allow_same_account_reuse;
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

// 批量添加手动内容（文字）
router.post('/items/text/batch', async (req: Request, res: Response) => {
  const prisma = req.app.get('prisma') as PrismaClient;
  
  try {
    const { source_id, items } = req.body;
    
    // items 格式: [{ title?: string, content: string }, ...]
    // 或者直接是字符串数组: ["内容1", "内容2", ...]
    
    if (!source_id || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: '缺少必填字段或格式错误' });
    }
    
    // 验证信息源类型
    const source = await prisma.infoSource.findUnique({
      where: { id: source_id }
    });
    
    if (!source || source.type !== 'manual_text') {
      return res.status(400).json({ error: '信息源类型不匹配' });
    }
    
    let successCount = 0;
    let failCount = 0;
    
    for (const item of items) {
      try {
        // 支持字符串或对象格式
        const content = typeof item === 'string' ? item : item.content;
        const title = typeof item === 'string' ? undefined : item.title;
        
        if (!content || content.trim() === '') {
          failCount++;
          continue;
        }
        
        await prisma.infoItem.create({
          data: {
            sourceId: source_id,
            contentType: 'text',
            title: title || undefined,
            content: content.trim(),
            publishedAt: new Date()
          }
        });
        
        successCount++;
      } catch {
        failCount++;
      }
    }
    
    res.json({ 
      message: `批量添加完成`, 
      success: successCount, 
      failed: failCount 
    });
  } catch (error) {
    console.error('批量添加文字内容失败:', error);
    res.status(500).json({ error: '批量添加文字内容失败' });
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

// 测试路由是否工作
router.get('/test-route', (req: Request, res: Response) => {
  res.json({ message: '路由正常工作', timestamp: new Date().toISOString() });
});

// 测试晒单图API（通过后端代理，避免CORS问题）
router.post('/test-contract-image', async (req: Request, res: Response) => {
  try {
    const { api_url, tradepair, opendate, date, direction, lev } = req.body;
    
    if (!api_url) {
      return res.status(400).json({ error: '缺少API地址' });
    }
    
    // 构建请求URL
    const params = new URLSearchParams({
      tradepair: tradepair || 'ETHUSDT',
      opendate: opendate,
      date: date,
      direction: direction || 'long',
      lev: lev?.toString() || '50'
    });
    
    const requestUrl = `${api_url}?${params.toString()}`;
    console.log('测试请求URL:', requestUrl);
    
    // 通过后端调用API（避免CORS问题）
    const response = await fetch(requestUrl, {
      headers: {
        'ngrok-skip-browser-warning': 'true',
        'User-Agent': 'Mozilla/5.0 (compatible; API-Client/1.0)',
        'Accept': 'application/json',
      }
    });
    
    // 获取响应文本
    const responseText = await response.text();
    
    // 尝试解析JSON
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      return res.status(500).json({
        success: false,
        error: 'API返回的不是JSON格式',
        message: `响应内容: ${responseText.substring(0, 200)}...`,
        requestUrl,
        rawResponse: responseText
      });
    }
    
    // 返回结果
    res.json({
      success: response.ok && data.success,
      requestUrl,
      data,
      status: response.status,
      statusText: response.statusText
    });
    
  } catch (error: any) {
    console.error('测试API失败:', error);
    res.status(500).json({
      success: false,
      error: '请求失败',
      message: error.message || '未知错误',
      stack: error.stack
    });
  }
});

export const infoPoolRoutes = router;

