/**
 * 公共信息池服务
 * 负责管理、获取和分配公共信息池的内容
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fetchCryptoPrice } from './info-pool-crypto.js';

// RSS/Atom 解析器 - 同时支持 RSS 和 Atom 格式
async function parseRSS(url: string): Promise<Array<{
  title: string;
  content: string;
  link: string;
  pubDate: Date;
  guid: string;
}>> {
  try {
    // 添加 User-Agent 避免被拒绝
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ChatPartner/2.0)'
      }
    });
    const xml = await response.text();
    
    const items: Array<{
      title: string;
      content: string;
      link: string;
      pubDate: Date;
      guid: string;
    }> = [];
    
    // 通用标签内容获取函数
    const getTagContent = (xmlStr: string, tag: string): string => {
      // 处理CDATA
      const cdataMatch = xmlStr.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i'));
      if (cdataMatch) return cdataMatch[1].trim();
      
      const simpleMatch = xmlStr.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return simpleMatch ? simpleMatch[1].trim() : '';
    };
    
    // 获取 link href 属性（Atom 格式）
    const getLinkHref = (xmlStr: string): string => {
      // 先尝试获取 alternate 链接
      const alternateMatch = xmlStr.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i);
      if (alternateMatch) return alternateMatch[1];
      
      // 再尝试获取普通链接
      const hrefMatch = xmlStr.match(/<link[^>]*href=["']([^"']+)["']/i);
      if (hrefMatch) return hrefMatch[1];
      
      // 最后尝试获取标签内容
      return getTagContent(xmlStr, 'link');
    };
    
    // 判断是 Atom 还是 RSS 格式
    const isAtom = xml.includes('<feed') && xml.includes('<entry>');
    
    if (isAtom) {
      // Atom 格式解析 (Reddit, GitHub 等使用)
      const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
      let match;
      
      while ((match = entryRegex.exec(xml)) !== null) {
        const entryXml = match[1];
        
        const title = getTagContent(entryXml, 'title');
        const content = getTagContent(entryXml, 'content') || getTagContent(entryXml, 'summary');
        const link = getLinkHref(entryXml);
        const pubDateStr = getTagContent(entryXml, 'published') || getTagContent(entryXml, 'updated');
        const guid = getTagContent(entryXml, 'id') || link;
        
        if (title) {
          items.push({
            title,
            content,
            link,
            pubDate: pubDateStr ? new Date(pubDateStr) : new Date(),
            guid
          });
        }
      }
    } else {
      // 标准 RSS 格式解析
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;
      
      while ((match = itemRegex.exec(xml)) !== null) {
        const itemXml = match[1];
        
        const title = getTagContent(itemXml, 'title');
        const description = getTagContent(itemXml, 'description');
        const contentEncoded = getTagContent(itemXml, 'content:encoded');
        const link = getTagContent(itemXml, 'link');
        const pubDateStr = getTagContent(itemXml, 'pubDate');
        const guid = getTagContent(itemXml, 'guid') || link;
        
        items.push({
          title,
          content: contentEncoded || description,
          link,
          pubDate: pubDateStr ? new Date(pubDateStr) : new Date(),
          guid
        });
      }
    }
    
    console.log(`[RSS] 解析完成: ${url} (${isAtom ? 'Atom' : 'RSS'}格式, ${items.length}条)`);
    return items;
  } catch (error) {
    console.error('RSS解析失败:', error);
    return [];
  }
}

// 获取加密货币价格
async function fetchCryptoPrice(symbol: string): Promise<{
  price: number;
  change24h: number;
} | null> {
  try {
    // 使用CoinGecko免费API
    const ids: Record<string, string> = {
      'BTC': 'bitcoin',
      'ETH': 'ethereum'
    };
    
    const id = ids[symbol.toUpperCase()];
    if (!id) return null;
    
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`
    );
    
    const data = await response.json();
    const coinData = data[id];
    
    if (!coinData) return null;
    
    return {
      price: coinData.usd,
      change24h: coinData.usd_24h_change || 0
    };
  } catch (error) {
    console.error(`获取${symbol}价格失败:`, error);
    return null;
  }
}

export class InfoPoolService {
  private prisma: PrismaClient;
  private fetchIntervals: Map<number, NodeJS.Timeout> = new Map();
  
  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }
  
  /**
   * 启动所有信息源的自动拉取
   */
  async startAll(): Promise<void> {
    const sources = await this.prisma.infoSource.findMany({
      where: { enabled: true }
    });
    
    console.log(`📡 启动 ${sources.length} 个信息源`);
    
    for (const source of sources) {
      await this.startSource(source.id);
    }
  }
  
  /**
   * 启动单个信息源
   */
  async startSource(sourceId: number): Promise<void> {
    const source = await this.prisma.infoSource.findUnique({
      where: { id: sourceId }
    });
    
    if (!source || !source.enabled) return;
    
    // 清除旧的定时器
    this.stopSource(sourceId);
    
    // 立即执行一次
    await this.fetchSource(sourceId);
    
    // 设置定时拉取
    const interval = setInterval(
      () => this.fetchSource(sourceId),
      source.fetchInterval * 1000
    );
    
    this.fetchIntervals.set(sourceId, interval);
    console.log(`📡 [${source.name}] 已启动，间隔 ${source.fetchInterval} 秒`);
  }
  
  /**
   * 停止单个信息源
   */
  stopSource(sourceId: number): void {
    const interval = this.fetchIntervals.get(sourceId);
    if (interval) {
      clearInterval(interval);
      this.fetchIntervals.delete(sourceId);
    }
  }
  
  /**
   * 停止所有信息源
   */
  stopAll(): void {
    for (const [sourceId] of this.fetchIntervals) {
      this.stopSource(sourceId);
    }
  }
  
  /**
   * 拉取单个信息源的数据
   */
  async fetchSource(sourceId: number): Promise<void> {
    try {
      const source = await this.prisma.infoSource.findUnique({
        where: { id: sourceId }
      });
      
      if (!source) {
        console.error(`[fetchSource] 信息源 ${sourceId} 不存在`);
        return;
      }
      
      if (!source.enabled) {
        console.log(`[${source.name}] 信息源已禁用，跳过拉取`);
        return;
      }
      
      console.log(`[${source.name}] 开始拉取数据，类型: ${source.type}`);
      
      switch (source.type) {
        case 'rss':
          await this.fetchRSS(source);
          break;
        case 'btc_price':
          await this.fetchPrice(source, 'BTC');
          break;
        case 'eth_price':
          await this.fetchPrice(source, 'ETH');
          break;
        case 'contract_image':
          // 确保source包含必要的字段
          if (source && typeof source === 'object' && 'id' in source && 'name' in source) {
            console.log(`[${source.name}] 准备拉取晒单图，apiUrl: ${source.apiUrl}, tradepair: ${source.tradepair}`);
            await this.fetchContractImage(source as any);
          } else {
            console.error(`[${source?.name || 'Unknown'}] 信息源数据不完整，无法拉取晒单图`);
          }
          break;
        case 'crypto_price':
          await fetchCryptoPrice(this.prisma, source);
          break;
        // manual_text 和 manual_image 不需要自动拉取
        default:
          console.log(`[${source.name}] 未知的信息源类型: ${source.type}`);
      }
      
      // 更新最后拉取时间
      await this.prisma.infoSource.update({
        where: { id: sourceId },
        data: { lastFetchAt: new Date() }
      });
      
    } catch (error: any) {
      console.error(`[${source.name}] 拉取失败:`, error);
      console.error(`[${source.name}] 错误详情:`, error?.message || error);
      if (error?.stack) {
        console.error(`[${source.name}] 错误堆栈:`, error.stack);
      }
    }
  }
  
  /**
   * 拉取RSS内容
   */
  private async fetchRSS(source: { id: number; name: string; rssUrl: string | null; expireHours: number }): Promise<void> {
    if (!source.rssUrl) return;
    
    const items = await parseRSS(source.rssUrl);
    console.log(`📰 [${source.name}] 获取到 ${items.length} 条RSS内容`);
    
    const expireTime = new Date();
    expireTime.setHours(expireTime.getHours() - source.expireHours);
    
    let newCount = 0;
    
    for (const item of items) {
      // 检查是否过期
      if (item.pubDate < expireTime) continue;
      
      // 检查是否已存在
      const existing = await this.prisma.infoItem.findUnique({
        where: {
          sourceId_externalId: {
            sourceId: source.id,
            externalId: item.guid
          }
        }
      });
      
      if (existing) continue;
      
      // 创建新条目
      await this.prisma.infoItem.create({
        data: {
          sourceId: source.id,
          contentType: 'text',
          title: item.title,
          content: item.content,
          sourceUrl: item.link,
          externalId: item.guid,
          publishedAt: item.pubDate
        }
      });
      
      newCount++;
    }
    
    if (newCount > 0) {
      console.log(`📰 [${source.name}] 新增 ${newCount} 条内容`);
    }
    
    // 清理过期内容（保留已使用标记）
    await this.cleanExpiredItems(source.id, source.expireHours);
  }
  
  /**
   * 拉取晒单图
   */
  private async fetchContractImage(source: {
    id: number;
    name: string;
    apiUrl: string | null;
    tradepair: string | null;
    leverageOptions: string | null;
    openTimeRangeHours: number | null;
    cleanupHours: number | null;
    [key: string]: any; // 允许其他字段
  }): Promise<void> {
    // 参数验证
    if (!source) {
      console.error('[fetchContractImage] source 参数为空');
      return;
    }
    
    if (!source.apiUrl || !source.tradepair) {
      console.error(`[${source.name || 'Unknown'}] 缺少必要配置: apiUrl 或 tradepair`);
      return;
    }

    try {
      // 生成随机开仓时间（最近xx小时内的随机时间）
      const rangeHours = source.openTimeRangeHours || 24;
      const now = new Date();
      const openTime = new Date(now.getTime() - Math.random() * rangeHours * 60 * 60 * 1000);
      
      // 格式化时间（YYYY-MM-DD HH:mm）
      const formatDateTime = (date: Date): string => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}`;
      };

      // 随机选择方向（70%做多，30%做空）
      const direction = Math.random() < 0.7 ? 'long' : 'short';
      
      // 从配置的杠杆选项中随机选择
      let leverage: number;
      if (source.leverageOptions) {
        try {
          const options = JSON.parse(source.leverageOptions) as number[];
          if (Array.isArray(options) && options.length > 0) {
            leverage = options[Math.floor(Math.random() * options.length)];
          } else {
            leverage = 50; // 默认值
          }
        } catch {
          leverage = 50; // 解析失败时使用默认值
        }
      } else {
        leverage = 50; // 默认50倍
      }
      
      // date 参数：使用发出请求的当前时间（用于显示在图上和获取最新价格）
      // 在构建URL之前再次获取当前时间，确保是最新的请求时间
      const requestTime = new Date();
      
      // 构建API请求URL
      const params = new URLSearchParams({
        tradepair: source.tradepair,
        opendate: formatDateTime(openTime),  // 开仓时间（历史随机时间）
        date: formatDateTime(requestTime),    // 显示时间（发出请求的当前时间）
        direction,
        lev: leverage.toString()
      });
      
      // 生成唯一标识（基于参数）
      const externalId = `contract_${source.tradepair}_${formatDateTime(openTime)}_${formatDateTime(requestTime)}_${direction}_${leverage}`;
      
      // 先检查是否已存在，避免重复请求
      const existing = await this.prisma.infoItem.findUnique({
        where: {
          sourceId_externalId: {
            sourceId: source.id,
            externalId
          }
        }
      });
      
      if (existing) {
        console.log(`📸 [${source.name}] 图片已存在，跳过`);
        return;
      }
      
      const apiUrl = `${source.apiUrl}?${params.toString()}`;
      console.log(`📸 [${source.name}] 请求晒单图: ${apiUrl}`);
      
      // 调用API（添加ngrok绕过请求头）
      const response = await fetch(apiUrl, {
        headers: {
          'ngrok-skip-browser-warning': 'true',
          'User-Agent': 'Mozilla/5.0 (compatible; API-Client/1.0)',
        }
      });
      
      if (!response.ok) {
        throw new Error(`API返回错误: ${response.status} ${response.statusText}`);
      }
      
      // 先获取文本，检查是否是JSON
      const responseText = await response.text();
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        throw new Error(`API返回的不是JSON格式。响应内容: ${responseText.substring(0, 200)}...`);
      }
      
      // 从JSON中提取图片数据（优先使用image字段，如果没有则使用base64字段）
      let imageBase64: string | null = null;
      
      if (result.data?.image) {
        // image字段是完整的data URL格式：data:image/png;base64,xxxxx
        const imageData = result.data.image;
        if (imageData.startsWith('data:image')) {
          // 提取base64部分（去掉data:image/png;base64,前缀）
          const base64Match = imageData.match(/^data:image\/[^;]+;base64,(.+)$/);
          if (base64Match && base64Match[1]) {
            imageBase64 = base64Match[1];
          } else {
            // 如果没有匹配到，尝试直接使用（可能格式不同）
            imageBase64 = imageData.split(',')[1] || imageData;
          }
        } else {
          // 如果image字段本身就是base64字符串
          imageBase64 = imageData;
        }
      } else if (result.data?.base64) {
        // 如果没有image字段，使用base64字段
        imageBase64 = result.data.base64;
      } else if (result.image) {
        // 也可能image在顶层
        const imageData = result.image;
        if (imageData.startsWith('data:image')) {
          const base64Match = imageData.match(/^data:image\/[^;]+;base64,(.+)$/);
          imageBase64 = base64Match?.[1] || imageData.split(',')[1] || imageData;
        } else {
          imageBase64 = imageData;
        }
      }
      
      if (!imageBase64) {
        throw new Error('API返回数据中没有找到图片数据（缺少image或base64字段）');
      }
      
      // 保存图片
      const uploadDir = path.join(process.cwd(), 'data', 'uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      const imageBuffer = Buffer.from(imageBase64, 'base64');
      const filename = `contract_${Date.now()}_${Math.random().toString(36).slice(2, 9)}.png`;
      const filepath = path.join(uploadDir, filename);
      
      fs.writeFileSync(filepath, imageBuffer);
      
      // 从API返回的数据中提取所有文字内容作为标题
      let title = `${source.tradepair} ${direction === 'long' ? '做多' : '做空'} ${leverage}x`;
      
      // 如果API返回了params，组合所有参数信息作为标题
      if (result.data?.params) {
        const params = result.data.params;
        const parts: string[] = [];
        
        // 交易对（优先使用tradepair_display，否则使用tradepair）
        if (params.tradepair_display) {
          parts.push(`交易对: ${params.tradepair_display}`);
        } else if (params.tradepair) {
          parts.push(`交易对: ${params.tradepair}`);
        } else if (source.tradepair) {
          parts.push(`交易对: ${source.tradepair}`);
        }
        
        // 方向（优先使用direction_text，否则转换）
        if (params.direction_text) {
          parts.push(params.direction_text);
        } else if (params.direction) {
          parts.push(params.direction === 'long' ? '做多' : '做空');
        }
        
        // 杠杆
        if (params.lev) {
          parts.push(`${params.lev}x`);
        }
        
        // 开仓时间
        if (params.opendate) {
          parts.push(`开仓: ${params.opendate}`);
        }
        
        // 显示时间
        if (params.date) {
          parts.push(`显示: ${params.date}`);
        }
        
        // 开仓价
        if (params.entprice) {
          parts.push(`开仓价: ${params.entprice}`);
        }
        
        // 最新价
        if (params.lastprice) {
          parts.push(`最新价: ${params.lastprice}`);
        }
        
        // 收益率
        if (params.yield) {
          parts.push(`收益率: ${params.yield}`);
        }
        
        // 如果提取到了参数信息，使用组合的标题
        if (parts.length > 0) {
          title = parts.join(' | ');
        }
      }
      
      // 创建新条目（只保存图片，不保存文字内容）
      await this.prisma.infoItem.create({
        data: {
          sourceId: source.id,
          contentType: 'image',
          title,
          content: null, // 晒单图只保留图片，不保存文字内容
          imagePath: filename,
          externalId,
          publishedAt: requestTime
        }
      });
      
      console.log(`📸 [${source.name}] 新增晒单图: ${title}`);
      
      // 清理过期数据
      if (source.cleanupHours && source.cleanupHours > 0) {
        await this.cleanupContractImages(source.id, source.cleanupHours);
      }
      
    } catch (error: any) {
      console.error(`[${source.name}] 拉取晒单图失败:`, error);
      console.error(`[${source.name}] 错误详情:`, error?.message || error);
      if (error?.stack) {
        console.error(`[${source.name}] 错误堆栈:`, error.stack);
      }
    }
  }

  /**
   * 清理过期的晒单图
   */
  private async cleanupContractImages(sourceId: number, cleanupHours: number): Promise<void> {
    const cleanupTime = new Date();
    cleanupTime.setHours(cleanupTime.getHours() - cleanupHours);
    
    // 查找过期的条目
    const expiredItems = await this.prisma.infoItem.findMany({
      where: {
        sourceId,
        publishedAt: { lt: cleanupTime }
      }
    });
    
    if (expiredItems.length === 0) return;
    
    // 删除图片文件
    const uploadDir = path.join(process.cwd(), 'data', 'uploads');
    for (const item of expiredItems) {
      if (item.imagePath) {
        const filepath = path.join(uploadDir, item.imagePath);
        if (fs.existsSync(filepath)) {
          try {
            fs.unlinkSync(filepath);
          } catch (error) {
            console.error(`删除图片文件失败: ${filepath}`, error);
          }
        }
      }
    }
    
    // 删除数据库记录（级联删除使用记录）
    await this.prisma.infoItem.deleteMany({
      where: {
        sourceId,
        publishedAt: { lt: cleanupTime }
      }
    });
    
    console.log(`🧹 清理了 ${expiredItems.length} 条过期晒单图`);
  }

  /**
   * 拉取价格数据（旧方法，用于 btc_price/eth_price 类型）
   */
  private async fetchPrice(source: { id: number; name: string }, symbol: string): Promise<void> {
    const priceData = await fetchCryptoPriceLegacy(symbol);
    if (!priceData) return;
    
    const externalId = `${symbol}_${new Date().toISOString().slice(0, 13)}`; // 每小时一条
    
    // 检查是否已存在
    const existing = await this.prisma.infoItem.findUnique({
      where: {
        sourceId_externalId: {
          sourceId: source.id,
          externalId
        }
      }
    });
    
    if (existing) {
      // 更新价格
      await this.prisma.infoItem.update({
        where: { id: existing.id },
        data: {
          priceValue: priceData.price,
          priceChange: priceData.change24h
        }
      });
    } else {
      // 创建新条目
      const changeEmoji = priceData.change24h >= 0 ? '📈' : '📉';
      const changeStr = priceData.change24h >= 0 
        ? `+${priceData.change24h.toFixed(2)}%` 
        : `${priceData.change24h.toFixed(2)}%`;
      
      await this.prisma.infoItem.create({
        data: {
          sourceId: source.id,
          contentType: 'price',
          title: `${symbol} 实时价格`,
          content: `${changeEmoji} ${symbol} 当前价格 $${priceData.price.toLocaleString()} (${changeStr})`,
          externalId,
          priceValue: priceData.price,
          priceChange: priceData.change24h,
          publishedAt: new Date()
        }
      });
      
      console.log(`💰 [${source.name}] ${symbol}: $${priceData.price.toLocaleString()} (${changeStr})`);
    }
  }
  
  /**
   * 清理过期内容
   */
  private async cleanExpiredItems(sourceId: number, expireHours: number): Promise<void> {
    if (expireHours <= 0) return;
    
    const expireTime = new Date();
    expireTime.setHours(expireTime.getHours() - expireHours);
    
    // 标记过期但不删除（保留使用记录）
    await this.prisma.infoItem.updateMany({
      where: {
        sourceId,
        publishedAt: { lt: expireTime },
        expired: false
      },
      data: { expired: true }
    });
  }
  
  /**
   * 获取可用的信息条目（供AI账号使用）
   */
  async getAvailableItem(accountId: number, sourceTypes?: string[]): Promise<{
    item: any;
    source: any;
  } | null> {
    // 获取启用的信息源
    const whereSource: any = { enabled: true };
    if (sourceTypes && sourceTypes.length > 0) {
      whereSource.type = { in: sourceTypes };
    }
    
    const sources = await this.prisma.infoSource.findMany({
      where: whereSource
    });
    
    if (sources.length === 0) {
      console.log(`[信息池] 没有启用的信息源`);
      return null;
    }
    
    // 随机打乱信息源顺序，尝试找到有可用内容的
    const shuffledSources = [...sources].sort(() => Math.random() - 0.5);
    
    for (const source of shuffledSources) {
      // 先直接查询该信息源下所有未过期的条目数量
      const totalItems = await this.prisma.infoItem.count({
        where: {
          sourceId: source.id,
          expired: false
        }
      });
      
      if (totalItems === 0) {
        continue; // 该信息源没有内容，跳过
      }
      
      // 获取当前账号已使用的条目ID
      const usedItemIds = await this.prisma.infoItemUsage.findMany({
        where: {
          accountId,
          item: { sourceId: source.id }
        },
        select: { itemId: true }
      });
      
      const usedIds = usedItemIds.map(u => u.itemId);
      
      // 构建查询条件
      const whereItem: any = {
        sourceId: source.id,
        expired: false
      };
      
      // 如果允许同一账号反复引用，则不排除任何内容
      if (source.allowSameAccountReuse) {
        // 允许同一账号反复使用，不需要排除
      } else if (source.reusable) {
        // 可复用（不同账号可用）：只排除当前账号已使用的
        if (usedIds.length > 0) {
          whereItem.id = { notIn: usedIds };
        }
      } else {
        // 不可复用：排除所有已使用的
        const allUsedIds = await this.prisma.infoItemUsage.findMany({
          where: { item: { sourceId: source.id } },
          select: { itemId: true },
          distinct: ['itemId']
        });
        const allIds = allUsedIds.map(u => u.itemId);
        if (allIds.length > 0) {
          whereItem.id = { notIn: allIds };
        }
      }
      
      // 查找可用条目
      const items = await this.prisma.infoItem.findMany({
        where: whereItem,
        orderBy: { publishedAt: 'desc' },
        take: 10
      });
      
      if (items.length > 0) {
        // 随机选择一条
        const item = items[Math.floor(Math.random() * items.length)];
        console.log(`[信息池] 选中: [${source.name}] - ${item.title || item.contentType}`);
        return { item, source };
      }
    }
    
    // 所有信息源都没有可用内容
    console.log(`[信息池] 所有信息源均无可用内容 (账号ID: ${accountId})`);
    return null;
  }
  
  /**
   * 标记信息已使用
   */
  async markItemUsed(itemId: number, accountId: number, sentContent?: string): Promise<void> {
    await this.prisma.infoItemUsage.upsert({
      where: {
        itemId_accountId: { itemId, accountId }
      },
      create: {
        itemId,
        accountId,
        sentContent
      },
      update: {
        usedAt: new Date(),
        sentContent
      }
    });
  }
  
  /**
   * 添加手动内容
   */
  async addManualItem(sourceId: number, data: {
    title?: string;
    content?: string;
    imagePath?: string;
  }): Promise<any> {
    const source = await this.prisma.infoSource.findUnique({
      where: { id: sourceId }
    });
    
    if (!source) throw new Error('信息源不存在');
    
    const contentType = source.type === 'manual_image' ? 'image' : 'text';
    
    return this.prisma.infoItem.create({
      data: {
        sourceId,
        contentType,
        title: data.title,
        content: data.content,
        imagePath: data.imagePath,
        publishedAt: new Date()
      }
    });
  }
  
  /**
   * 获取统计信息
   */
  async getStats(): Promise<{
    totalSources: number;
    enabledSources: number;
    totalItems: number;
    availableItems: number;
    usedItems: number;
  }> {
    const [totalSources, enabledSources, totalItems, expiredItems, usedItemIds] = await Promise.all([
      this.prisma.infoSource.count(),
      this.prisma.infoSource.count({ where: { enabled: true } }),
      this.prisma.infoItem.count(),
      this.prisma.infoItem.count({ where: { expired: true } }),
      this.prisma.infoItemUsage.findMany({ select: { itemId: true }, distinct: ['itemId'] })
    ]);
    
    return {
      totalSources,
      enabledSources,
      totalItems,
      availableItems: totalItems - expiredItems,
      usedItems: usedItemIds.length
    };
  }
}

