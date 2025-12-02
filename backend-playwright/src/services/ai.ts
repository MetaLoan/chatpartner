import OpenAI from 'openai';

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
    messages: Array<{ text: string; images?: string[] }> | string,
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

      if (isMultiModal) {
        // 多模态模式：支持图片
        formattedContent = messageArray
          .map((msg, idx) => {
            const imageInfo = msg.images && msg.images.length > 0 
              ? ` [包含${msg.images.length}张图片]` 
              : '';
            return `[${idx + 1}] ${msg.text}${imageInfo}`;
          })
          .join('\n\n');

        // 构建多模态内容
        const contentParts: any[] = [
          {
            type: 'text',
            text: `【群聊背景】
以下是群里最近的对话记录，请作为背景资料整体理解：

${formattedContent}

【回复要求】
1. 先花3秒理解：大家在聊什么话题？氛围如何？图片在表达什么？
2. 整体把握：不要逐句回应，要针对整个话题发表看法
3. 自然表达：像真人聊天一样，不要说"根据上述"、"我觉得"等生硬开头
4. 连贯完整：用1-3句话表达一个完整的观点，语义要连贯
5. 融入氛围：根据你的人设风格，自然地参与讨论
6. 如有图片：可以自然地提及图片内容，但不要生硬地说"我看到图片"

现在，用你的风格说点什么：`
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
            .map((msg, idx) => `[${idx + 1}] ${msg.text}`)
            .join('\n\n');
        } else {
          formattedContent = messages;
        }

        apiMessages.push({
          role: 'user',
          content: `【群聊背景】
以下是群里最近的对话记录，请作为背景资料整体理解：

${formattedContent}

【回复要求】
1. 先花3秒理解：大家在聊什么话题？氛围如何？
2. 整体把握：不要逐句回应，要针对整个话题发表看法
3. 自然表达：像真人聊天一样，不要说"根据上述"、"我觉得"等生硬开头
4. 连贯完整：用1-3句话表达一个完整的观点，语义要连贯
5. 融入氛围：根据你的人设风格，自然地参与讨论

现在，用你的风格说点什么：`
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
    if (model.startsWith('deepseek')) {
      return 'https://api.deepseek.com';
    }
    if (model.startsWith('claude')) {
      return 'https://api.anthropic.com/v1';
    }
    return 'https://api.openai.com/v1';
  }
}


