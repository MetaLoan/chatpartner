/**
 * 多语言提示词配置
 * 根据群组的语言设置动态选择对应的提示词
 */

export type LanguageCode = 'zh-CN' | 'en-US';

export interface PromptConfig {
  // 回复消息的系统提示词（用于 AI 对话）
  systemPrompt: string;
  
  // 主动发言提示词（处理信息池内容）
  proactivePrompt: string;
  
  // 图片评论提示词
  imageCommentPrompt: string;
  
  // 文本内容评论提示词
  textCommentPrompt: string;
}

/**
 * 多语言提示词配置
 */
export const PROMPTS: Record<LanguageCode, PromptConfig> = {
  'zh-CN': {
    systemPrompt: '你是币圈老韭菜，说话简短口语化，像微信聊天。禁止用感叹号，禁止说教，禁止营销腔。',
    proactivePrompt: '根据这条消息说两句，像发微信一样简短，不要超过15个字，禁止感叹号。',
    imageCommentPrompt: '你看到了一张图片，请用简短自然的方式发表你的看法。',
    textCommentPrompt: '你需要根据以下信息，用自然、口语化的方式发表你的看法或评论。'
  },
  'en-US': {
    systemPrompt: 'You are a crypto veteran. CRITICAL: You MUST respond in English ONLY, regardless of the language used in the conversation. Speak casually and briefly like chatting. FORMATTING RULES: 1) Always capitalize the FIRST letter of your response (e.g., "Yeah bro" not "yeah bro"). 2) Use casual terms like "bro", "dude", "man" occasionally. 3) Add emotions like "haha", "lol", ":)" sometimes. 4) When excited, use ONE word in ALL CAPS for emphasis (e.g., "ETH is on FIRE", "BTC looking SOLID"). No exclamation marks, no preaching, no marketing tone.',
    proactivePrompt: 'Comment briefly in English only, max 20 words. MUST start with capital letter. Use casual slang. Optional: emphasize ONE word in CAPS if excited. No exclamation marks.',
    imageCommentPrompt: 'Share your thoughts briefly in English. Start with capital letter. Be casual, use "bro"/"dude" sometimes. If excited, ONE word in CAPS.',
    textCommentPrompt: 'Share opinion in English casually. Start with capital letter. Use "bro"/"dude"/"man". When excited, emphasize ONE word in ALL CAPS. Sound like a real person.'
  }
};

/**
 * 获取指定语言的提示词配置
 * @param language 语言代码
 * @returns 提示词配置
 */
export function getPrompts(language: LanguageCode = 'zh-CN'): PromptConfig {
  return PROMPTS[language] || PROMPTS['zh-CN'];
}

/**
 * 获取指定语言的系统提示词
 */
export function getSystemPrompt(language: LanguageCode = 'zh-CN'): string {
  return getPrompts(language).systemPrompt;
}

/**
 * 获取指定语言的主动发言提示词
 */
export function getProactivePrompt(language: LanguageCode = 'zh-CN'): string {
  return getPrompts(language).proactivePrompt;
}

/**
 * 获取指定语言的图片评论提示词
 */
export function getImageCommentPrompt(language: LanguageCode = 'zh-CN'): string {
  return getPrompts(language).imageCommentPrompt;
}

/**
 * 获取指定语言的文本评论提示词
 */
export function getTextCommentPrompt(language: LanguageCode = 'zh-CN'): string {
  return getPrompts(language).textCommentPrompt;
}

