/**
 * 主动发言调度器
 * 负责定时从公共信息池获取内容并让AI账号主动发言
 */

import { PrismaClient } from '@prisma/client';
import { InfoPoolService } from './info-pool.js';
import { AIService } from './ai.js';
import path from 'path';
import fs from 'fs';

interface SendFunctions {
  sendText: (message: string) => Promise<void>;
  sendImage: (base64Data: string, caption?: string) => Promise<void>;
}

export class ProactiveScheduler {
  private prisma: PrismaClient;
  private infoPoolService: InfoPoolService;
  private aiService: AIService;
  private timers: Map<number, NodeJS.Timeout> = new Map();
  private sendFunctions: Map<number, SendFunctions> = new Map();
  
  constructor(prisma: PrismaClient, infoPoolService: InfoPoolService) {
    this.prisma = prisma;
    this.infoPoolService = infoPoolService;
    this.aiService = new AIService();
  }
  
  /**
   * 注册账号的发送消息函数（兼容旧版本）
   */
  registerSendFunction(accountId: number, sendFn: (message: string) => Promise<void>): void {
    // 兼容旧版本，只设置 sendText
    const existing = this.sendFunctions.get(accountId);
    this.sendFunctions.set(accountId, {
      sendText: sendFn,
      sendImage: existing?.sendImage || (async () => { console.log(`[账号${accountId}] ⚠️ 图片发送未注册`); })
    });
  }
  
  /**
   * 注册完整的发送函数（包括图片）
   */
  registerFullSendFunctions(accountId: number, fns: SendFunctions): void {
    this.sendFunctions.set(accountId, fns);
  }
  
  /**
   * 取消注册
   */
  unregisterSendFunction(accountId: number): void {
    this.sendFunctions.delete(accountId);
    this.stopAccount(accountId);
  }
  
  /**
   * 启动所有已启用主动发言的账号
   */
  async startAll(): Promise<void> {
    const accounts = await this.prisma.account.findMany({
      where: {
        enabled: true,
        proactiveEnabled: true
      }
    });
    
    console.log(`📣 启动 ${accounts.length} 个主动发言账号`);
    
    for (const account of accounts) {
      this.startAccount(account.id);
    }
  }
  
  /**
   * 启动单个账号的主动发言
   */
  async startAccount(accountId: number): Promise<void> {
    // 停止旧的定时器
    this.stopAccount(accountId);
    
    const account = await this.prisma.account.findUnique({
      where: { id: accountId }
    });
    
    if (!account || !account.enabled || !account.proactiveEnabled) {
      return;
    }
    
    // 计算随机间隔
    const scheduleNext = async () => {
      const interval = this.getRandomInterval(
        account.proactiveIntervalMin,
        account.proactiveIntervalMax
      );
      
      console.log(`[${account.phoneNumber}] 📣 下次主动发言: ${Math.round(interval / 60)}分钟后`);
      
      const timer = setTimeout(async () => {
        await this.executeProactive(accountId);
        // 继续调度下一次
        scheduleNext();
      }, interval * 1000);
      
      this.timers.set(accountId, timer);
    };
    
    // 检查是否需要立即执行（距离上次发言超过最大间隔）
    if (account.lastProactiveAt) {
      const elapsed = (Date.now() - account.lastProactiveAt.getTime()) / 1000;
      if (elapsed > account.proactiveIntervalMax) {
        // 立即执行一次
        await this.executeProactive(accountId);
      }
    }
    
    // 开始调度
    scheduleNext();
  }
  
  /**
   * 停止单个账号的主动发言
   */
  stopAccount(accountId: number): void {
    const timer = this.timers.get(accountId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(accountId);
    }
  }
  
  /**
   * 停止所有
   */
  stopAll(): void {
    for (const [accountId] of this.timers) {
      this.stopAccount(accountId);
    }
  }
  
  /**
   * 执行主动发言
   */
  private async executeProactive(accountId: number): Promise<void> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId }
    });
    
    if (!account || !account.enabled || !account.proactiveEnabled) {
      return;
    }
    
    const fns = this.sendFunctions.get(accountId);
    if (!fns) {
      console.log(`[${account.phoneNumber}] ⚠️ 发送函数未注册，跳过主动发言`);
      return;
    }
    
    try {
      // 从信息池获取一条可用内容
      const result = await this.infoPoolService.getAvailableItem(accountId);
      
      if (!result) {
        console.log(`[${account.phoneNumber}] 📣 信息池无可用内容，跳过`);
        return;
      }
      
      const { item, source } = result;
      const isImageContent = item.contentType === 'image';
      
      console.log(`[${account.phoneNumber}] 📣 从 [${source.name}] 获取${isImageContent ? '图片' : '文本'}内容: "${item.title || (item.content?.substring(0, 30) || '图片')}..."`);
      
      if (isImageContent) {
        // === 图片内容处理 ===
        
        // 获取图片的 base64 数据
        let imageBase64: string;
        
        if (item.imagePath) {
          // 从文件读取
          const uploadDir = path.join(process.cwd(), 'data', 'uploads');
          const imagePath = path.join(uploadDir, item.imagePath);
          
          if (!fs.existsSync(imagePath)) {
            console.log(`[${account.phoneNumber}] ⚠️ 图片文件不存在: ${imagePath}`);
            return;
          }
          
          const imageBuffer = fs.readFileSync(imagePath);
          const ext = path.extname(item.imagePath).toLowerCase();
          const mimeType = ext === '.png' ? 'image/png' 
                        : ext === '.gif' ? 'image/gif' 
                        : 'image/jpeg';
          imageBase64 = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
          console.log(`[${account.phoneNumber}] 📷 读取图片: ${item.imagePath} (${(imageBuffer.length / 1024).toFixed(1)}KB)`);
        } else if (item.content && item.content.startsWith('data:')) {
          // 已经是 base64 数据
          imageBase64 = item.content;
        } else {
          console.log(`[${account.phoneNumber}] ⚠️ 图片内容无效`);
          return;
        }
        
        if (source.workMode === 'forward') {
          // 直接转发图片
          console.log(`[${account.phoneNumber}] 📤 直接转发图片...`);
          await fns.sendImage(imageBase64, item.title || undefined);
        } else {
          // 图片+AI生成评论
          const prompt = account.proactivePrompt || '你看到了一张图片，请用简短自然的方式发表你的看法。';
          console.log(`[${account.phoneNumber}] 📣 AI正在生成图片评论...`);
          
          const reply = await this.aiService.generateReply(
            account.aiApiKey || '',
            account.aiModel,
            prompt,
            [{ 
              type: 'image_url',
              image_url: { url: imageBase64 }
            }],
            account.aiApiBaseUrl || undefined,
            false
          );
          
          if (reply) {
            // 发送图片并附带AI评论
            await fns.sendImage(imageBase64, reply);
          } else {
            // AI无法生成评论，直接发图
            await fns.sendImage(imageBase64, item.title || undefined);
          }
        }
        
        // 标记内容已使用
        await this.infoPoolService.markItemUsed(item.id, accountId, '[图片]');
        
      } else {
        // === 文本内容处理 ===
        let messageToSend: string;
        
        if (source.workMode === 'forward') {
          // 直接转发
          messageToSend = item.content || item.title || '';
          
          // 如果是价格类型，格式化输出
          if (item.contentType === 'price') {
            messageToSend = item.content || `${item.title}: $${item.priceValue?.toLocaleString()}`;
          }
          
          // 如果有链接，附加上
          if (item.sourceUrl) {
            messageToSend += `\n\n${item.sourceUrl}`;
          }
        } else {
          // 输出观点（需要AI处理）
          const prompt = account.proactivePrompt || '你需要根据以下信息，用自然、口语化的方式发表你的看法或评论。';
          
          const contentForAI = `
标题: ${item.title || '无'}
内容: ${item.content || '无'}
${item.priceValue ? `价格: $${item.priceValue.toLocaleString()}` : ''}
${item.priceChange ? `涨跌: ${item.priceChange >= 0 ? '+' : ''}${item.priceChange.toFixed(2)}%` : ''}
${item.sourceUrl ? `来源: ${item.sourceUrl}` : ''}
          `.trim();
          
          console.log(`[${account.phoneNumber}] 📣 AI正在生成观点...`);
          
          const reply = await this.aiService.generateReply(
            account.aiApiKey || '',
            account.aiModel,
            prompt,
            [{ text: contentForAI }],
            account.aiApiBaseUrl || undefined,
            false
          );
          
          messageToSend = reply || item.content || '';
        }
        
        if (!messageToSend) {
          console.log(`[${account.phoneNumber}] ⚠️ 无法生成消息内容`);
          return;
        }
        
        // 发送消息
        await fns.sendText(messageToSend);
        
        // 标记内容已使用
        await this.infoPoolService.markItemUsed(item.id, accountId, messageToSend);
      }
      
      // 更新最后主动发言时间
      await this.prisma.account.update({
        where: { id: accountId },
        data: { lastProactiveAt: new Date() }
      });
      
      console.log(`[${account.phoneNumber}] ✅ 主动发言成功`);
      
    } catch (error) {
      console.error(`[${account.phoneNumber}] ❌ 主动发言失败:`, error);
    }
  }
  
  /**
   * 获取随机间隔（秒）
   */
  private getRandomInterval(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  
  /**
   * 手动触发主动发言（用于测试）
   */
  async triggerProactive(accountId: number): Promise<void> {
    await this.executeProactive(accountId);
  }
}

