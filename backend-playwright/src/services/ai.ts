import OpenAI from 'openai';
import { getSystemPrompt, type LanguageCode } from '../config/prompts';

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
    
    const data = await response.json() as { lastPrice?: string; priceChangePercent?: string };
    
    if (!data || !data.lastPrice) return null;
    
    return {
      price: parseFloat(data.lastPrice),
      change24h: parseFloat(data.priceChangePercent || '0')
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
    // 要获取的币种列表（移除ZEC避免AI反复提及）
    const symbols = ['BTC', 'ETH', 'SOL', 'BNB', 'DOGE', 'XRP', 'HYPE', 'PIPPIN', 'ASTER'];
    
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
    enableImages: boolean = false,
    groupLanguage: LanguageCode = 'zh-CN',
    isPassiveReply: boolean = false  // 新增：标识是否为被动回复
  ): Promise<string> {
    try {
      const openai = new OpenAI({
        apiKey,
        baseURL: baseUrl || this.getBaseUrl(model)
      });

      const apiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

      // 构建最终提示词：默认提示词 + 账号补充提示词
      const basePrompt = getSystemPrompt(groupLanguage);
      let finalSystemPrompt = basePrompt;
      
      if (systemPrompt && systemPrompt.trim()) {
        // 账号有自定义提示词，作为补充追加到默认提示词后面
        finalSystemPrompt = `${basePrompt}\n\n【账号补充设定】\n${systemPrompt}`;
        console.log(`🎯 [AI] 使用默认提示词 + 账号补充提示词 (群组语言: ${groupLanguage})`);
        console.log(`   补充内容: ${systemPrompt.substring(0, 100)}${systemPrompt.length > 100 ? '...' : ''}`);
      } else {
        console.log(`🎯 [AI] 仅使用群组语言默认提示词: ${groupLanguage}`);
      }
      
      if (finalSystemPrompt) {
        apiMessages.push({ role: 'system', content: finalSystemPrompt });
      }

      // 处理消息格式
      let formattedContent: string;
      const messageArray = Array.isArray(messages) ? messages : [];
      const isMultiModal = enableImages && messageArray.length > 0 && messageArray.some(m => m.images && m.images.length > 0);

      // 实时价格数据已移至信息池系统，不再注入到AI上下文
      const realtimeSection = '';

      // 如果是英文模式，添加强制提示
      const languageReminder = groupLanguage === 'en-US' 
        ? '[IMPORTANT: You must respond in English regardless of the language in the conversation below]\n\n'
        : '';

      if (isMultiModal) {
        // 多模态模式：支持图片
        formattedContent = languageReminder + messageArray
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
【重要】
1. 保持之前的立场，不要自相矛盾
2. 说人话！像微信群里普通人聊天一样

【禁止的AI腔】
- 禁止"信号""启动""机会""明确"这类词
- 禁止感叹号
- 禁止"赶紧""别等了""上车"催促语气
- 禁止长句子，最多15个字

【示范】
❌ "ETH鲸鱼正在疯狂扫货，这绝对是牛市启动的明确信号！"
✅ "ETH有大户在买"
✅ "感觉要涨"
✅ "不好说"
✅ "看着挺猛"

用最简单的大白话回复：`
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
          formattedContent = languageReminder + messageArray
            .map((msg) => {
              const sender = msg.fromSelf ? '【我】' : '【群友】';
              return `${sender} ${msg.text}`;
            })
            .join('\n\n');
        } else {
          formattedContent = languageReminder + messages;
        }

        // 根据语言和回复类型选择不同的上下文提示
        const passiveReplyHint = isPassiveReply 
          ? (groupLanguage === 'en-US'
            ? '\n⚠️ IMPORTANT: If someone mentions a coin name in the chat, DON\'T repeat the coin name in your reply - they already know what coin they\'re talking about. Just give your take on it.'
            : '\n⚠️ 重要：如果对话中已经提到了某个币的名字，你回复时不要再重复说币名，大家都知道在聊什么币，直接发表看法就行。')
          : '';
        
        const contextPrompt = groupLanguage === 'en-US' 
          ? `[Chat Context]
Recent messages in the group (for context understanding). [Me] = YOUR OWN previous messages (you said these), [Others] = other people:

${formattedContent}
${realtimeSection}

⚠️ CRITICAL RULES: 
1. NEVER REPEAT what's already in the chat above - if someone said it, don't say it again word-for-word
2. NEVER REPEAT your own previous messages - check [Me] carefully, don't say the same thing twice
3. NEVER ECHO others' words - read what they said, then add something NEW and different
4. Don't contradict yourself or ask about things you just said
5. You only need to reply to the LAST message from [Others] (the most recent one that's not from you)
6. The earlier messages are just for context - don't respond to all of them, just the latest one

If you find yourself about to say something that's already in the chat, STOP and think of a different angle or just stay quiet.

Stay consistent with your previous takes. Just reply naturally like you're texting:${passiveReplyHint}`
          : `【群聊背景】
以下是群里最近的对话记录（用于理解上下文），【我】表示你自己之前说的话，【群友】表示其他人说的：

${formattedContent}
${realtimeSection}
【⚠️ 严禁重复规则】极其重要！
1. 绝对不要重复上面对话中已经出现过的话，无论是谁说的
2. 绝对不要重复【我】的内容，仔细检查你之前说过什么，不要说第二遍
3. 绝对不要照抄【群友】的话，看他们说了什么，然后说点不一样的
4. 如果你发现自己要说的话在上面已经出现过，立刻停止，换个角度或者干脆别说

【重要】
1. ⚠️ 仔细看【我】的消息，那是你自己说的！不要自相矛盾，不要质疑自己刚说的话
2. ⚠️ 你只需要回复【群友】的最后一条消息（最新的非你自己的那条）
3. 前面的消息只是让你理解上下文，不要对所有消息都发表意见，只回最后一条
4. 保持之前的立场，不要自相矛盾
5. 说人话！像微信群里普通人聊天一样

【禁止的AI腔】
- 禁止"信号""启动""机会""明确"这类词
- 禁止感叹号
- 禁止"赶紧""别等了""上车"催促语气
- 禁止长句子，最多15个字

【示范】
❌ "ETH鲸鱼正在疯狂扫货，这绝对是牛市启动的明确信号！"
✅ "ETH有大户在买"
✅ "感觉要涨"
✅ "不好说"
✅ "看着挺猛"

用最简单的大白话回复：${passiveReplyHint}`;

        apiMessages.push({
          role: 'user',
          content: contextPrompt
        });
      }

      const completion = await openai.chat.completions.create({
        model,
        messages: apiMessages,
        max_tokens: 200,
        temperature: 0.7, // 降低温度让AI更稳定、一致
        top_p: 0.9
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


