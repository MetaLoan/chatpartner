/**
 * 实时币价获取方法（扩展）
 * 由于 info-pool.ts 文件较大，将此方法单独提取
 */

import { PrismaClient } from '@prisma/client';
import { getBinanceSymbol } from '../config/crypto-symbols.js';

/**
 * 拉取实时币价（支持批量币种）
 */
export async function fetchCryptoPrice(prisma: PrismaClient, source: any): Promise<void> {
  try {
    const historySize = source.historySize || 5;
    const historyInterval = source.historyInterval || 30; // 分钟

    // 获取该信息源下所有的币种（从 InfoItem 中获取）
    const cryptoItems = await prisma.infoItem.findMany({
      where: {
        sourceId: source.id,
        contentType: 'price',
        symbol: { not: null }
      }
    });

    if (cryptoItems.length === 0) {
      console.log(`[${source.name}] 没有添加任何币种，跳过`);
      return;
    }

    console.log(`[${source.name}] 开始拉取 ${cryptoItems.length} 个币种的价格`);

    for (const item of cryptoItems) {
      const symbolStr = item.symbol!;
      
      // 优先使用预设的 Binance 交易对，如果不在预设中，尝试 {SYMBOL}USDT
      let binanceSymbol = getBinanceSymbol(symbolStr);
      if (!binanceSymbol) {
        binanceSymbol = `${symbolStr}USDT`;
        console.log(`[${source.name}] ${symbolStr} 不在预设列表，尝试使用 ${binanceSymbol}`);
      }

      try {
        // 从 Binance API 获取价格
        const response = await fetch(
          `https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSymbol}`,
          {
            signal: AbortSignal.timeout(5000),
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; ChatPartner/2.0)'
            }
          }
        );

        const data = await response.json() as {
          lastPrice?: string;
          priceChangePercent?: string;
        };

        if (!data.lastPrice) {
          console.log(`[${source.name}] ${symbol} 价格数据无效`);
          continue;
        }

        const price = parseFloat(data.lastPrice);
        const change24h = parseFloat(data.priceChangePercent || '0');
        const now = new Date();

        // 每次拉取都记录历史价格（因为 fetchInterval = historyInterval）
        await prisma.cryptoPriceHistory.create({
          data: {
            sourceId: source.id,
            symbol: symbolStr,
            price,
            change24h,
            timestamp: now
          }
        });
        console.log(`[${source.name}] ${symbolStr}: 已记录历史价格快照`);

        // 获取所有历史记录（最多 historySize 条）
        const histories = await prisma.cryptoPriceHistory.findMany({
          where: { sourceId: source.id, symbol: symbolStr },
          orderBy: { timestamp: 'desc' },
          take: historySize
        });

        // 清理超出堆栈大小的旧记录
        if (histories.length === historySize) {
          const oldRecords = await prisma.cryptoPriceHistory.findMany({
            where: { sourceId: source.id, symbol: symbolStr },
            orderBy: { timestamp: 'desc' },
            skip: historySize
          });
          if (oldRecords.length > 0) {
            await prisma.cryptoPriceHistory.deleteMany({
              where: {
                id: { in: oldRecords.map(h => h.id) }
              }
            });
          }
        }

        // 计算价格趋势（基于历史记录）
        let trend = '横盘';
        if (histories.length >= 2) {
          const oldestPrice = histories[histories.length - 1].price;
          const newestPrice = histories[0].price;
          const changePercent = ((newestPrice - oldestPrice) / oldestPrice) * 100;
          
          if (changePercent > 2) trend = '上涨';
          else if (changePercent < -2) trend = '下跌';
        }

        // 格式化价格（智能处理小数）
        const formatPrice = (p: number): string => {
          if (p >= 1) {
            // 价格 >= 1，保留2位小数
            return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          } else if (p >= 0.01) {
            // 0.01 <= 价格 < 1，保留4位小数
            return p.toFixed(4);
          } else if (p >= 0.0001) {
            // 0.0001 <= 价格 < 0.01，保留6位小数
            return p.toFixed(6);
          } else {
            // 价格 < 0.0001，保留8位小数
            return p.toFixed(8);
          }
        };
        
        // 格式化历史价格（从旧到新，包含时间戳）
        const historyText = histories
          .reverse() // 从旧到新排序
          .map(h => {
            const date = new Date(h.timestamp);
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hour = String(date.getHours()).padStart(2, '0');
            const minute = String(date.getMinutes()).padStart(2, '0');
            return `$${formatPrice(h.price)}（${month}${day} ${hour}:${minute}）`;
          })
          .join(' → ');

        // 格式化更新时间
        const updateDate = now.toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });

        // 生成内容
        const content = `${symbolStr} 当前价格: $${formatPrice(price)}

更新日期：${updateDate}

24小时涨跌: ${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%

近期趋势: ${trend}

（${histories.length}堆栈，间隔${historyInterval}分钟）历史价格: ${historyText}`;

        const title = `${symbolStr} ${change24h >= 0 ? '📈' : '📉'} $${formatPrice(price)} (${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%)`;

        // 更新对应的 InfoItem
        await prisma.infoItem.update({
          where: { id: item.id },
          data: {
            title,
            content,
            priceValue: price,
            priceChange: change24h
          }
        });

        console.log(`[${source.name}] ${symbolStr}: $${price.toLocaleString()} (${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%)`);

      } catch (error: any) {
        console.error(`[${source.name}] 获取 ${symbolStr} 价格失败:`, error.message);
      }
    }

    console.log(`[${source.name}] 币价拉取完成`);

  } catch (error: any) {
    console.error(`[${source.name}] 拉取币价失败:`, error);
  }
}

