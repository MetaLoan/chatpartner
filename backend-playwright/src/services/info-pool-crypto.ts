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
    if (!source.symbols) {
      console.log(`[${source.name}] 未配置币种列表，跳过`);
      return;
    }

    const symbols: string[] = JSON.parse(source.symbols);
    const historySize = source.historySize || 20;

    console.log(`[${source.name}] 开始拉取 ${symbols.length} 个币种的价格`);

    for (const symbol of symbols) {
      const binanceSymbol = getBinanceSymbol(symbol);
      if (!binanceSymbol) {
        console.log(`[${source.name}] 跳过不支持的币种: ${symbol}`);
        continue;
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

        // 保存历史记录
        await prisma.cryptoPriceHistory.create({
          data: {
            sourceId: source.id,
            symbol,
            price,
            change24h
          }
        });

        // 清理旧历史记录，只保留最近 historySize 条
        const histories = await prisma.cryptoPriceHistory.findMany({
          where: { sourceId: source.id, symbol },
          orderBy: { timestamp: 'desc' }
        });

        if (histories.length > historySize) {
          const toDelete = histories.slice(historySize);
          await prisma.cryptoPriceHistory.deleteMany({
            where: {
              id: { in: toDelete.map(h => h.id) }
            }
          });
        }

        // 获取历史价格用于生成分析内容
        const recentHistories = histories.slice(0, Math.min(5, historySize));
        const priceHistory = recentHistories.map(h => h.price);
        
        // 计算价格趋势
        let trend = '横盘';
        if (priceHistory.length >= 2) {
          const firstPrice = priceHistory[priceHistory.length - 1];
          const lastPrice = priceHistory[0];
          const changePercent = ((lastPrice - firstPrice) / firstPrice) * 100;
          
          if (changePercent > 2) trend = '上涨';
          else if (changePercent < -2) trend = '下跌';
        }

        // 生成内容
        const content = `${symbol} 当前价格: $${price.toLocaleString()}
24小时涨跌: ${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%
近期趋势: ${trend}
历史价格: ${priceHistory.slice(0, 3).map(p => '$' + p.toLocaleString()).join(' → ')}`;

        const title = `${symbol} ${change24h >= 0 ? '📈' : '📉'} $${price.toLocaleString()} (${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%)`;

        // 创建或更新 InfoItem
        const existing = await prisma.infoItem.findFirst({
          where: {
            sourceId: source.id,
            title: { contains: symbol }
          }
        });

        if (existing) {
          await prisma.infoItem.update({
            where: { id: existing.id },
            data: {
              title,
              content,
              priceValue: price,
              priceChange: change24h
            }
          });
        } else {
          await prisma.infoItem.create({
            data: {
              sourceId: source.id,
              contentType: 'price',
              title,
              content,
              priceValue: price,
              priceChange: change24h
            }
          });
        }

        console.log(`[${source.name}] ${symbol}: $${price.toLocaleString()} (${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%)`);

      } catch (error: any) {
        console.error(`[${source.name}] 获取 ${symbol} 价格失败:`, error.message);
      }
    }

    console.log(`[${source.name}] 币价拉取完成`);

  } catch (error: any) {
    console.error(`[${source.name}] 拉取币价失败:`, error);
  }
}

