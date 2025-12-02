import OpenAI from 'openai';

/**
 * 获取加密货币实时价格（使用 Binance API，免费且稳定）
 */
async function fetchCryptoPrice(symbol: string): Promise<{
  price: number;
  change24h: number;
} | null> {
  try {
    // Binance 交易对映射
    const pairs: Record<string, string> = {
      'BTC': 'BTCUSDT',
      'ETH': 'ETHUSDT',
      'SOL': 'SOLUSDT',
      'BNB': 'BNBUSDT',
      'DOGE': 'DOGEUSDT',
      'XRP': 'XRPUSDT',
      'ZEC': 'ZECUSDT',
      'HYPE': 'HYPEUSDT',
      'PIPPIN': 'PIPPINUSDT',
      'ASTER': 'ASTERUSDT'
    };
    
    const pair = pairs[symbol.toUpperCase()];
    if (!pair) return null;
    
    const response = await fetch(
      `https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`,
      { signal: AbortSignal.timeout(3000) } // 3秒超时
    );
    
    const data = await response.json();
    
    if (!data || !data.lastPrice) return null;
    
    return {
      price: parseFloat(data.lastPrice),
      change24h: parseFloat(data.priceChangePercent) || 0
    };
  } catch (error) {
    // 静默失败，不影响主流程
    return null;
  }
}

/**
 * 格式化价格显示
 */
function formatPrice(price: number): string {
  if (price >= 1000) {
    return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } else if (price >= 1) {
    return `$${price.toFixed(2)}`;
  } else if (price >= 0.01) {
    return `$${price.toFixed(4)}`;
  } else {
    return `$${price.toFixed(6)}`;
  }
}

/**
 * 获取实时市场数据上下文
 */
async function getRealtimeContext(): Promise<string> {
  try {
    // 要获取的币种列表
    const symbols = ['BTC', 'ETH', 'SOL', 'BNB', 'DOGE', 'XRP', 'ZEC', 'HYPE', 'PIPPIN', 'ASTER'];
    
    // 并行获取所有价格
    const results = await Promise.all(
      symbols.map(async (symbol) => {
        const data = await fetchCryptoPrice(symbol);
        return { symbol, data };
      })
    );
    
    // 过滤有效结果
    const validResults = results.filter(r => r.data !== null);
    
    if (validResults.length === 0) return '';
    
    const lines: string[] = ['【实时行情】'];
    
    for (const { symbol, data } of validResults) {
      if (data) {
        const changeStr = data.change24h >= 0 ? `+${data.change24h.toFixed(2)}%` : `${data.change24h.toFixed(2)}%`;
        const emoji = data.change24h >= 0 ? '📈' : '📉';
        lines.push(`${emoji} ${symbol}: ${formatPrice(data.price)} (${changeStr})`);
      }
    }
    
    return lines.join('\n');
  } catch {
    return '';
  }
}

/**
 * AI 服务 - 使用 OpenAI 兼容 API 生成回复
 */
export class AIService {
  /**
   * 生成 AI 回复
   */
  async generateReply(
    apiKey: string,
    model: string,
    systemPrompt: string,
    messages: Array<{ text: string; images?: string[]; fromSelf?: boolean }> | string,
    baseUrl?: string | null,
    enableImages: boolean = false
  ): Promise<string> {
    try {
      const openai = new OpenAI({
        apiKey,
        baseURL: baseUrl || this.getBaseUrl(model)
      });

      const apiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

      if (systemPrompt) {
        apiMessages.push({ role: 'system', content: systemPrompt });
      }

      // 处理消息格式
      let formattedContent: string;
      const messageArray = Array.isArray(messages) ? messages : [];
      const isMultiModal = enableImages && messageArray.length > 0 && messageArray.some(m => m.images && m.images.length > 0);

      // 获取实时市场数据
      const realtimeData = await getRealtimeContext();
      const realtimeSection = realtimeData ? `\n\n${realtimeData}\n` : '';

      if (isMultiModal) {
        // 多模态模式：支持图片
        formattedContent = messageArray
          .map((msg, idx) => {
            const imageInfo = msg.images && msg.images.length > 0 
              ? ` [包含${msg.images.length}张图片]` 
              : '';
            const sender = msg.fromSelf ? '【我】' : '【群友】';
            return `${sender} ${msg.text}${imageInfo}`;
          })
          .join('\n\n');

        // 构建多模态内容
        const contentParts: any[] = [
          {
            type: 'text',
            text: `【群聊背景】
以下是群里最近的对话记录，【我】表示你自己之前说的话，【群友】表示其他人说的：

${formattedContent}
${realtimeSection}
【回复要求】
1. 先理解对话：大家在聊什么话题？你之前说了什么观点？
2. 保持一致：你之前的观点要延续，不要自相矛盾！如果你之前看多，就继续看多；之前看空，就继续看空
3. 自然表达：像真人聊天一样，不要说"根据上述"、"我觉得"等生硬开头
4. 连贯完整：用1-3句话表达一个完整的观点，语义要连贯
5. 融入氛围：根据你的人设风格，自然地参与讨论
6. 如果群里在讨论行情，可以参考实时数据，但要和你之前的观点保持一致

现在，延续你之前的立场，用你的风格说点什么：`
          }
        ];

        // 添加图片（只添加最近的1张，避免token过多）
        const allImages: string[] = [];
        for (const msg of messageArray) {
          if (msg.images) {
            allImages.push(...msg.images);
          }
        }
        
        // 最多添加1张图片（节省token）
        const imagesToSend = allImages.slice(-1);
        for (const imageUrl of imagesToSend) {
          contentParts.push({
            type: 'image_url',
            image_url: { url: imageUrl }
          });
        }

        apiMessages.push({
          role: 'user',
          content: contentParts
        });
      } else {
        // 纯文本模式
        if (Array.isArray(messages)) {
          formattedContent = messageArray
            .map((msg) => {
              const sender = msg.fromSelf ? '【我】' : '【群友】';
              return `${sender} ${msg.text}`;
            })
            .join('\n\n');
        } else {
          formattedContent = messages;
        }

        apiMessages.push({
          role: 'user',
          content: `【群聊背景】
以下是群里最近的对话记录，【我】表示你自己之前说的话，【群友】表示其他人说的：

${formattedContent}
${realtimeSection}
【回复要求】
1. 先理解对话：大家在聊什么话题？你之前说了什么观点？
2. 保持一致：你之前的观点要延续，不要自相矛盾！如果你之前看多，就继续看多；之前看空，就继续看空
3. 自然表达：像真人聊天一样，不要说"根据上述"、"我觉得"等生硬开头
4. 连贯完整：用1-3句话表达一个完整的观点，语义要连贯
5. 融入氛围：根据你的人设风格，自然地参与讨论
6. 如果群里在讨论行情，可以参考实时数据，但要和你之前的观点保持一致

现在，延续你之前的立场，用你的风格说点什么：`
        });
      }

      const completion = await openai.chat.completions.create({
        model,
        messages: apiMessages,
        max_tokens: 500,
        temperature: 0.9, // 提高温度让回复更自然、有变化
        top_p: 0.95
      });

      return completion.choices[0]?.message?.content || '';
    } catch (error) {
      console.error('AI 生成回复失败:', error);
      throw error;
    }
  }

  /**
   * 根据模型获取 API base URL
   */
  private getBaseUrl(model: string): string {
    // Perplexity - 支持联网搜索的AI
    if (model.startsWith('llama-3.1-sonar') || model.startsWith('sonar')) {
      return 'https://api.perplexity.ai';
    }
    if (model.startsWith('deepseek')) {
      return 'https://api.deepseek.com';
    }
    if (model.startsWith('claude')) {
      return 'https://api.anthropic.com/v1';
    }
    return 'https://api.openai.com/v1';
  }

  /**
   * 检查模型是否支持联网搜索
   */
  private isOnlineSearchModel(model: string): boolean {
    // Perplexity 的 sonar 系列模型支持联网搜索
    return model.startsWith('llama-3.1-sonar') || 
           model.startsWith('sonar') ||
           model.includes('online') ||
           model.includes('search');
  }
}


