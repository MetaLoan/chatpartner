/**
 * 公共信息池服务
 * 负责管理、获取和分配公共信息池的内容
 */

import { PrismaClient } from '@prisma/client';

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
    const source = await this.prisma.infoSource.findUnique({
      where: { id: sourceId }
    });
    
    if (!source) return;
    
    try {
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
        // manual_text 和 manual_image 不需要自动拉取
      }
      
      // 更新最后拉取时间
      await this.prisma.infoSource.update({
        where: { id: sourceId },
        data: { lastFetchAt: new Date() }
      });
      
    } catch (error) {
      console.error(`[${source.name}] 拉取失败:`, error);
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
   * 拉取价格数据
   */
  private async fetchPrice(source: { id: number; name: string }, symbol: string): Promise<void> {
    const priceData = await fetchCryptoPrice(symbol);
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

