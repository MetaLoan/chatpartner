import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { PrismaClient, Account } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import { AIService } from '../services/ai.js';

const TELEGRAM_WEB_URL = 'https://web.telegram.org/k/';
const SESSION_DIR = process.env.SESSION_DIR || './data/sessions';

/**
 * Telegram Web 自动化客户端
 * 使用 Playwright 操作 Telegram Web 版
 */
export class TelegramClient {
  private account: Account;
  private prisma: PrismaClient;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private aiService: AIService;
  private status: string = 'offline';
  private isRunning: boolean = false;
  private lastReplyTime: Map<string, Date> = new Map();
  private lastSeenMessageId: string = ''; // 最后看到的消息标识
  private targetGroupId: string = ''; // 目标群组ID，用于重新定位
  private recentSentMessages: string[] = []; // 最近发送的消息内容，用于去重
  private readonly MAX_SENT_HISTORY = 20; // 最多保留多少条发送记录

  constructor(account: Account, prisma: PrismaClient) {
    this.account = account;
    this.prisma = prisma;
    this.aiService = new AIService();
  }

  /**
   * 获取会话存储路径（绝对路径）
   */
  private getSessionPath(): string {
    const relativePath = path.join(SESSION_DIR, `${this.account.phoneNumber.replace(/\+/g, '')}.json`);
    // 如果是相对路径，转换为绝对路径
    if (path.isAbsolute(relativePath)) {
      return relativePath;
    }
    return path.resolve(process.cwd(), relativePath);
  }

  /**
   * 启动浏览器（非无头模式，让用户手动登录）
   */
  async start(): Promise<void> {
    try {
      if (this.browser) {
        this.log(`⚠️ 浏览器已存在 [账号: ${this.account.phoneNumber}]`);
        return;
      }

      this.log(`🌐 启动浏览器 [账号: ${this.account.phoneNumber}]`);

      // 优先使用数据库中保存的sessionPath，否则生成新的
      let sessionPath = this.account.sessionPath || this.getSessionPath();
      
      // 确保是绝对路径
      if (!path.isAbsolute(sessionPath)) {
        sessionPath = path.resolve(process.cwd(), sessionPath);
      }
      
      const hasSession = fs.existsSync(sessionPath);

      if (hasSession) {
        this.log(`   ✅ 找到会话文件: ${sessionPath}`);
        this.log(`   → 将使用已保存的登录状态`);
      } else {
        this.log(`   ℹ️  未找到会话文件: ${sessionPath}`);
        this.log(`   → 需要手动登录`);
      }

      // 确保会话目录存在
      const sessionDir = path.dirname(sessionPath);
      fs.mkdirSync(sessionDir, { recursive: true });

      // 启动浏览器（非无头模式，让用户看到并操作）
      this.log(`   → 正在启动浏览器...`);
      this.browser = await chromium.launch({
        headless: false, // 必须显示浏览器让用户登录
        slowMo: 50,
      });
      this.log(`   ✅ 浏览器已启动`);

      // 创建上下文
      this.log(`   → 正在创建浏览器上下文...`);
      this.context = await this.browser.newContext({
        storageState: hasSession ? sessionPath : undefined,
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      this.log(`   ✅ 浏览器上下文已创建`);

      this.page = await this.context.newPage();
      this.log(`   ✅ 页面已创建`);

      // 导航到 Telegram Web
      this.log(`📱 打开 Telegram Web...`);
      await this.page.goto(TELEGRAM_WEB_URL, { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 
      });
      this.log(`   ✅ Telegram Web 已加载`);

      await this.updateStatus('authenticating');
      
      // 启动后台登录监测任务
      this.log(`   → 启动登录监测...`);
      this.startLoginMonitoring(sessionPath, hasSession);
      this.log(`   ✅ 客户端启动完成`);
    } catch (error) {
      this.logError(`❌ 客户端启动失败:`, error);
      await this.updateStatus('error');
      throw error;
    }
  }

  /**
   * 持续监测登录状态并自动保存session
   */
  private async startLoginMonitoring(sessionPath: string, hadSession: boolean): Promise<void> {
    if (hadSession) {
      // 有session文件，快速检查是否登录
      this.log(`   检查登录状态...`);
      await this.page!.waitForTimeout(2000);
      
      const isLoggedIn = await this.checkLoginStatus();
      if (isLoggedIn) {
        this.log(`   ✅ 自动登录成功`);
        this.status = 'online';
        this.isRunning = true;
        await this.updateStatus('online');
        return; // 已登录，无需继续监测
      } else {
        this.log(`   ⚠️ Session失效，需要重新登录`);
        // 删除失效的session文件
        if (fs.existsSync(sessionPath)) {
          fs.unlinkSync(sessionPath);
          this.log(`   已删除失效的session文件`);
        }
      }
    }
    
    // 开始持续监测（每10秒检查一次，最多监测10分钟）
    this.log(`   🔄 开始持续监测登录状态（每10秒检查一次）...`);
    this.log(`   💡 请在浏览器中完成登录（包括2FA密码）`);
    
    const maxAttempts = 60; // 60次，共10分钟
    let attempt = 0;
    
    const checkInterval = setInterval(async () => {
      attempt++;
      
      if (!this.page || this.status === 'online') {
        clearInterval(checkInterval);
        return;
      }
      
      try {
        const isLoggedIn = await this.checkLoginStatus();
        if (isLoggedIn) {
          this.log(`\n✅ 检测到登录成功！[${this.account.phoneNumber}]`);
          clearInterval(checkInterval);
          
          // 等待Telegram完全加载
          this.log(`   等待Telegram完全加载...`);
          await this.page!.waitForTimeout(3000);
          
          // 保存session
          try {
            await this.context!.storageState({ path: sessionPath });
            this.log(`💾 会话已保存到: ${sessionPath}`);
          } catch (saveError) {
            this.logError(`❌ 保存会话失败:`, saveError);
          }
          
          // 更新数据库
          await this.prisma.account.update({
            where: { id: this.account.id },
            data: {
              status: 'online',
              sessionPath: sessionPath,
              lastLoginAt: new Date()
            }
          });
          
          this.status = 'online';
          this.isRunning = true;
          
          this.log(`🎉 账号 ${this.account.phoneNumber} 已就绪！`);
        } else if (attempt >= maxAttempts) {
          this.log(`⏰ 登录监测超时（10分钟），请手动重启服务`);
          clearInterval(checkInterval);
        } else if (attempt % 6 === 0) {
          // 每1分钟提醒一次
          this.log(`   ⏳ [${this.account.phoneNumber}] 仍在等待登录... (${Math.floor(attempt/6)}分钟)`);
        }
      } catch (error) {
        this.logError(`   ❌ 登录检测出错:`, error);
      }
    }, 10000); // 每10秒检查一次
  }

  /**
   * 等待用户手动登录完成
   */
  async waitForLogin(timeoutMs: number = 300000): Promise<boolean> {
    if (!this.page) {
      throw new Error('浏览器未启动');
    }

    this.log(`⏳ 等待用户在浏览器中完成登录...`);
    this.log(`   （超时时间: ${timeoutMs / 1000} 秒）`);

    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const isLoggedIn = await this.checkLoginStatus();
      if (isLoggedIn) {
        this.log(`✅ 检测到登录成功！`);
        
        // 等待3秒让Telegram Web完全初始化并保存认证信息到localStorage
        this.log(`   等待Telegram完全加载...`);
        await this.page!.waitForTimeout(3000);
        
        // 保存会话
        const sessionPath = this.getSessionPath();
        await this.context!.storageState({ path: sessionPath });
        this.log(`💾 会话已保存到: ${sessionPath}`);

        // 更新数据库
        await this.prisma.account.update({
          where: { id: this.account.id },
          data: {
            status: 'online',
            sessionPath: sessionPath,
            lastLoginAt: new Date()
          }
        });

        this.status = 'online';
        this.isRunning = true;
        return true;
      }

      // 每 2 秒检查一次
      await this.page.waitForTimeout(2000);
    }

    this.log(`❌ 登录超时`);
    return false;
  }

  /**
   * 检查是否已登录
   */
  private async checkLoginStatus(): Promise<boolean> {
    if (!this.page) return false;

    try {
      // 检查是否存在聊天列表（已登录的标志）
      const chatList = await this.page.$('.chatlist-container, .chat-list, [class*="ChatList"], .folders-tabs');
      return !!chatList;
    } catch {
      return false;
    }
  }

  /**
   * 通过搜索框搜索并进入群组
   */
  async searchAndEnterGroup(groupId: string): Promise<boolean> {
    if (!this.page) return false;
    
    try {
      this.log(`🔍 通过搜索框查找群组: ${groupId}`);
      
      // 点击搜索框
      const searchInput = await this.page.$('.input-search input, input[type="search"], .search-input input, #telegram-search-input');
      if (searchInput) {
        await searchInput.click();
        await this.page.waitForTimeout(500);
      } else {
        // 尝试点击搜索按钮/图标
        const searchBtn = await this.page.$('.btn-menu-toggle, .sidebar-header button, [class*="search"]');
        if (searchBtn) {
          await searchBtn.click();
          await this.page.waitForTimeout(500);
        }
      }
      
      // 等待搜索输入框出现并输入
      await this.page.waitForSelector('.input-search input, input[placeholder*="Search"], input[type="search"]', { timeout: 5000 });
      const input = await this.page.$('.input-search input, input[placeholder*="Search"], input[type="search"]');
      
      if (!input) {
        this.log(`   ⚠️ 未找到搜索输入框`);
        return false;
      }
      
      // 清空并输入群组ID
      await input.click();
      await this.page.waitForTimeout(200);
      await input.fill('');
      await this.page.waitForTimeout(200);
      await input.fill(groupId);
      await this.page.waitForTimeout(1500); // 等待搜索结果
      
      this.log(`   📋 已输入搜索: ${groupId}`);
      
      // 点击搜索结果中的群组
      // 尝试多种选择器匹配搜索结果
      const resultSelectors = [
        `.search-super-content-chats .chatlist-chat`,
        `.chatlist-chat`,
        `[data-peer-id="${groupId}"]`,
        `[data-peer-id="-${groupId}"]`,
        `.search-group .chatlist-chat`,
        `.search-super .row`
      ];
      
      for (const selector of resultSelectors) {
        const result = await this.page.$(selector);
        if (result) {
          await result.click();
          this.log(`   ✅ 点击搜索结果进入群组`);
          await this.page.waitForTimeout(2000);
          return true;
        }
      }
      
      this.log(`   ⚠️ 搜索结果中未找到匹配的群组`);
      
      return false;
    } catch (e) {
      this.log(`   ⚠️ 搜索群组出错: ${e}`);
      return false;
    }
  }

  /**
   * 检查是否已进入群组（有消息输入框）
   */
  async isInGroup(): Promise<boolean> {
    if (!this.page) return false;
    
    try {
      // 检查是否有消息输入框
      const inputBox = await this.page.$('.input-message-input, [contenteditable="true"].input-field-input, div[class*="composer"] [contenteditable]');
      return !!inputBox;
    } catch {
      return false;
    }
  }

  /**
   * 跳转到指定群组并开始监控
   */
  async navigateToGroupAndMonitor(groupTelegramId: string): Promise<void> {
    if (!this.page) {
      throw new Error('浏览器未启动');
    }

    // 等待登录完成（如果还没登录）
    if (this.status === 'authenticating') {
      this.log(`   等待账号登录完成...`);
      
      // 等待最多5分钟
      const maxWait = 5 * 60 * 1000; // 5分钟
      const startTime = Date.now();
      
      while (this.status === 'authenticating' && (Date.now() - startTime) < maxWait) {
        await this.page.waitForTimeout(5000); // 每5秒检查一次
      }
      
      if (this.status !== 'online') {
        this.log(`   ⚠️ 账号未在5分钟内完成登录，跳过监控`);
        return;
      }
      
      this.log(`   ✅ 账号已登录，开始监控`);
    }

    // 构建群组 URL
    const normalizedId = groupTelegramId.replace('-', '');
    this.log(`🚀 准备进入群组: ${normalizedId}`);

    // 方法1: 先尝试直接URL跳转
    const groupUrl = `https://web.telegram.org/k/#-${normalizedId}`;
    await this.page.goto(groupUrl, { waitUntil: 'domcontentloaded' });
    await this.page.waitForTimeout(3000);

    // 检查是否成功进入群组
    let inGroup = await this.isInGroup();
    
    if (!inGroup) {
      this.log(`   📋 URL跳转未进入群组，尝试搜索方式...`);
      // 方法2: 使用搜索框搜索进入
      const searchSuccess = await this.searchAndEnterGroup(normalizedId);
      
      if (searchSuccess) {
        await this.page.waitForTimeout(2000);
        inGroup = await this.isInGroup();
      }
    }

    if (inGroup) {
      this.log(`✅ 已成功进入目标群组`);
    } else {
      this.log(`⚠️ 可能未成功进入群组，将继续尝试监控`);
    }
    
    this.log(`👂 开始监控群组消息...`);
    
    // 确保状态正确
    this.isRunning = true;
    this.status = 'online';
    
    // 保存目标群组ID用于后续重新定位
    this.targetGroupId = normalizedId;
    
    // 开始消息监听循环（异步执行，不阻塞）
    this.startMessageLoop(normalizedId).catch((error) => {
      this.logError(`❌ 监听循环异常退出:`, error);
    });
  }

  /**
   * 开始消息监听循环
   */
  private async startMessageLoop(groupId?: string): Promise<void> {
    this.log(`⏰ 消息监听循环已启动 [监听间隔: ${this.account.listenInterval}秒]`);

    let isActivelyMonitoring = true; // 是否正在积极监控
    let consecutiveNoInputCount = 0; // 连续找不到输入框的次数
    const MAX_NO_INPUT_RETRIES = 3; // 最大重试次数
    
    this.log(`🔍 目标群组ID: ${this.targetGroupId}`);

    while (this.isRunning && this.page) {
      try {
        // 检查是否能找到输入框（说明在群组内）
        const inGroup = await this.isInGroup();
        
        if (!inGroup) {
          consecutiveNoInputCount++;
          
          if (consecutiveNoInputCount === 1) {
            this.log(`⚠️ 未找到消息输入框，可能未在群组内`);
          }
          
          if (consecutiveNoInputCount >= MAX_NO_INPUT_RETRIES && this.targetGroupId) {
            this.log(`🔄 连续${MAX_NO_INPUT_RETRIES}次找不到输入框，尝试重新定位群组...`);
            
            // 尝试通过搜索重新进入群组
            const searchSuccess = await this.searchAndEnterGroup(this.targetGroupId);
            
            if (searchSuccess) {
              await this.page.waitForTimeout(2000);
              const nowInGroup = await this.isInGroup();
              if (nowInGroup) {
                this.log(`✅ 重新定位成功，恢复监控`);
                consecutiveNoInputCount = 0;
                isActivelyMonitoring = true;
                await this.updateStatus('online');
              } else {
                this.log(`⚠️ 重新定位后仍未进入群组`);
                isActivelyMonitoring = false;
                await this.updateStatus('idle');
              }
            } else {
              this.log(`⚠️ 搜索定位失败`);
              isActivelyMonitoring = false;
              await this.updateStatus('idle');
            }
            
            // 重置计数，避免频繁重试
            consecutiveNoInputCount = 0;
          }
          
          // 等待后继续检查
          await this.page.waitForTimeout(5000);
          continue;
        }
        
        // 找到输入框，说明在群组内
        if (!isActivelyMonitoring) {
          this.log(`✅ 检测到已进入群组，开始监听`);
          isActivelyMonitoring = true;
          await this.updateStatus('online');
        }
        consecutiveNoInputCount = 0;
        
        // 处理消息
        await this.processCurrentChat(groupId);
        
      } catch (error) {
        this.logError(`❌ 消息处理错误:`, error);
        this.logError(error);
      }

      // 动态调整等待间隔：监听时用配置的间隔，等待时用5秒
      const waitTime = isActivelyMonitoring ? this.account.listenInterval * 1000 : 5000;
      await this.page.waitForTimeout(waitTime);
    }

    this.log(`🛑 消息监听循环已停止 [isRunning: ${this.isRunning}, page: ${!!this.page}]`);
  }

  /**
   * 热更新：从数据库重新加载账号配置
   */
  private async reloadAccountConfig(): Promise<void> {
    const updated = await this.prisma.account.findUnique({
      where: { id: this.account.id }
    });
    if (updated) {
      this.account = updated;
    }
  }

  /**
   * 处理当前聊天
   * 逻辑：有新消息 → 检查间隔 → 概率判定 → 用最近N条消息作为上下文回复一条
   */
  private async processCurrentChat(groupId?: string): Promise<void> {
    // 热更新：每次处理前重新加载配置
    await this.reloadAccountConfig();
    
    if (!this.page || !this.account.autoReply) return;

    const chatId = groupId || 'current';

    // 读取最新消息（最近 bufferSize 条，不包括自己发的）
    const messages = await this.readMessages();
    if (messages.length === 0) return;

    // 临时调试：输出所有消息的 fromSelf 状态
    if (messages.length > 0) {
      this.log(`📋 读取到 ${messages.length} 条消息:`);
      messages.forEach((msg, idx) => {
        const preview = msg.text.substring(0, 30) + (msg.text.length > 30 ? '...' : '');
        this.log(`   [${idx + 1}] ${msg.fromSelf ? '🟢 自己' : '🔵 他人'}: "${preview}"`);
      });
    }

    // 找到最新的非自身消息用于触发逻辑
    const latestIncoming = [...messages].reverse().find(msg => !msg.fromSelf);
    if (!latestIncoming) {
      // 只有自己刚发的消息，暂不处理
      this.log(`⚠️ 没有检测到非自身消息，跳过回复（共${messages.length}条消息）`);
      return;
    }

    const latestMessageId = latestIncoming.messageId;
    
    // 检查是否有新消息
    if (latestMessageId === this.lastSeenMessageId) {
      // 没有新消息，静默等待
      return;
    }
    
    // 更新最后看到的消息
    const previousMessageId = this.lastSeenMessageId;
    this.lastSeenMessageId = latestMessageId;
    
    // 如果是第一次运行，只记录不回复
    if (!previousMessageId) {
      this.log(`📝 首次运行，已记录当前消息状态，等待新消息...`);
      return;
    }

    // 显示检测到的新消息
    const hasImages = latestIncoming.images && latestIncoming.images.length > 0;
    const imageInfo = hasImages ? ` [📷 ${latestIncoming.images!.length}张图片]` : '';
    const newMsgPreview = latestIncoming.text.length > 50 
      ? latestIncoming.text.substring(0, 50) + '...' 
      : latestIncoming.text;
    this.log(`\n📨 轮询监测到新消息: "${newMsgPreview}"${imageInfo}`);

    // 检查发言间隔
    const lastReply = this.lastReplyTime.get(chatId);
    if (lastReply) {
      const elapsed = (Date.now() - lastReply.getTime()) / 1000;
      if (elapsed < this.account.replyInterval) {
        this.log(`⏳ 发言间隔未到 (${Math.round(elapsed)}/${this.account.replyInterval}秒)，跳过回复`);
        return;
      }
    }

    // 概率判断
    const roll = Math.random() * 100;
    if (roll > this.account.replyProbability) {
      this.log(`🎲 概率判定: ${Math.round(roll)}% > ${this.account.replyProbability}%，跳过这条消息回复`);
      return;
    }
    this.log(`🎲 概率判定: ${Math.round(roll)}% <= ${this.account.replyProbability}%，准备回复`);

    // 生成 AI 回复（用最近的 bufferSize 条消息作为上下文）
    const contextMessages = messages.slice(-this.account.bufferSize);
    
    // 统计图片数量
    const totalImages = contextMessages.reduce((sum, msg) => 
      sum + (msg.images?.length || 0), 0
    );
    
    // 检查是否有图片且启用了图片识别
    const contextHasImages = totalImages > 0;
    const shouldProcessImages = contextHasImages && this.account.enableImageRecognition;
    
    if (hasImages && !shouldProcessImages) {
      this.log(`📝 正在总结最近 ${contextMessages.length} 条消息的内容... (${totalImages}张图片未启用识别)`);
    } else if (shouldProcessImages) {
      this.log(`📝 正在总结最近 ${contextMessages.length} 条消息的内容... (包含${totalImages}张图片)`);
    } else {
      this.log(`📝 正在总结最近 ${contextMessages.length} 条消息的内容...`);
    }
    
    try {
      // 获取目标群组的语言设置
      const targetGroup = await this.prisma.group.findUnique({
        where: { id: this.account.targetGroupId! },
        select: { language: true }
      });
      const groupLanguage = (targetGroup?.language || 'zh-CN') as 'zh-CN' | 'en-US';
      
      // 调试日志：输出群组语言和账号提示词
      this.log(`🌐 群组语言: ${groupLanguage}`);
      if (this.account.systemPrompt) {
        this.log(`📝 账号自定义提示词: ${this.account.systemPrompt.substring(0, 80)}${this.account.systemPrompt.length > 80 ? '...' : ''}`);
      } else {
        this.log(`📝 账号提示词为空，将使用群组语言默认提示词`);
      }
      
      const reply = await this.aiService.generateReply(
        this.account.aiApiKey,
        this.account.aiModel,
        this.account.systemPrompt || '',
        contextMessages,
        this.account.aiApiBaseUrl,
        shouldProcessImages,
        groupLanguage
      );

      if (reply) {
        // 检查是否发送过相同或相似的内容
        const normalizedReply = reply.trim().toLowerCase();
        const isDuplicate = this.recentSentMessages.some(sent => {
          const normalizedSent = sent.trim().toLowerCase();
          // 完全相同或高度相似（前10个字相同）
          return normalizedSent === normalizedReply || 
                 (normalizedReply.length > 5 && normalizedSent.startsWith(normalizedReply.substring(0, 10)));
        });
        
        if (isDuplicate) {
          this.log(`🚫 AI生成了重复内容，跳过发送: "${reply.substring(0, 30)}..."`);
          return;
        }
        
        const replyPreview = reply.length > 80 ? reply.substring(0, 80) + '...' : reply;
        this.log(`🤖 AI回复内容: "${replyPreview}"`);
        await this.sendMessage(reply);  // sendMessage 会自动记录到 recentSentMessages
        this.log(`✅ 发送成功!\n`);

        // 更新最后回复时间
        this.lastReplyTime.set(chatId, new Date());

        // 保存消息记录
        if (groupId) {
          const group = await this.prisma.group.findUnique({ 
            where: { telegramId: groupId } 
          });
          if (group) {
            await this.prisma.message.create({
              data: {
                accountId: this.account.id,
                groupId: group.id,
                content: reply
              }
            });
          }
        }
      }
    } catch (error) {
      this.logError(`❌ AI 回复失败:`, error);
    }
  }

  /**
   * 读取当前聊天的消息（不包括自己发的）
   * 返回格式：{ text: string, images?: string[], messageId: string }[]
   */
  private async readMessages(): Promise<Array<{ text: string; images?: string[]; messageId: string; fromSelf?: boolean }>> {
    if (!this.page) return [];

    const messages: Array<{ text: string; images?: string[]; messageId: string; fromSelf?: boolean }> = [];

    try {
      // 尝试多个可能的选择器
      const selectors = [
        '.bubble',
        '.message-bubble',
        '[class*="bubble"]',
        '.messages-container .message',
        '.bubbles-group .bubble'
      ];

      let messageElements: any[] = [];
      for (const selector of selectors) {
        messageElements = await this.page.$$(selector);
        if (messageElements.length > 0) {
          break;
        }
      }

      if (messageElements.length === 0) {
        return [];
      }
      
      // 只读取最近的消息
      const recentMessages = messageElements.slice(-this.account.bufferSize * 2);

      for (const el of recentMessages) {
        // 增强检测自己发的消息（兼容多种样式）
        const selfCheckResult = await el.evaluate((e: Element) => {
          const classes = Array.from(e.classList || []);
          const outgoingClasses = ['is-out', 'own', 'message-out', 'outgoing', 'is-me'];
          
          // 检查类名
          const hasOutgoingClass = classes.some(cls => outgoingClasses.includes(cls));
          if (hasOutgoingClass) return { isOutgoing: true, reason: 'class: ' + classes.join(',') };
          
          // 检查 data-out 属性
          const attrOut = e.getAttribute('data-out');
          if (attrOut === 'true' || attrOut === '1') return { isOutgoing: true, reason: 'data-out' };
          
          // 检查 data-peer 属性
          const peer = e.getAttribute('data-peer') || '';
          if (peer.toLowerCase().includes('me')) return { isOutgoing: true, reason: 'data-peer: ' + peer };
          
          // 检查头像
          const hasSelfAvatar = e.querySelector('[class*="avatar"][class*="own"], [class*="avatar"][class*="self"], [class*="avatar"][class*="me"]');
          if (hasSelfAvatar) return { isOutgoing: true, reason: 'avatar' };
          
          // 检查 role 属性
          const role = e.getAttribute('role') || '';
          if (role.toLowerCase().includes('outgoing')) return { isOutgoing: true, reason: 'role: ' + role };
          
          // 检查父元素是否有 .own-message 等类名
          const parent = e.parentElement;
          if (parent) {
            const parentClasses = Array.from(parent.classList || []);
            if (parentClasses.some(cls => ['own', 'is-out', 'outgoing'].includes(cls))) {
              return { isOutgoing: true, reason: 'parent class: ' + parentClasses.join(',') };
            }
          }
          
          // 检查是否在右侧（发送的消息通常在右侧）
          const style = window.getComputedStyle(e);
          const marginLeft = parseFloat(style.marginLeft || '0');
          const marginRight = parseFloat(style.marginRight || '0');
          if (marginLeft > marginRight + 50) {
            return { isOutgoing: true, reason: 'margin-left > margin-right (right-aligned)' };
          }
          
          return { isOutgoing: false, reason: 'no match' };
        });
        
        const fromSelf = selfCheckResult.isOutgoing;
        
        // 如果启用了调试，输出检测结果
        if (fromSelf) {
          // this.log(`   🔍 检测到自己的消息 (${selfCheckResult.reason})`);
        }

        // 先检查是否有图片元素（仅在启用图片识别时输出调试信息）
        const shouldLogImageDebug = !!this.account.enableImageRecognition;
        let images: string[] = [];

        // 获取消息ID和文本
        const msgData = await el.evaluate((e: Element) => {
          // 获取消息ID（用于去重）
          const mid = e.getAttribute('data-mid') || 
                      e.getAttribute('data-message-id') ||
                      e.getAttribute('id') ||
                      '';
          
          // 获取文本
          let content = '';
          const textSelectors = ['.message', '.text-content', '.text', '.message-content'];
          
          for (const sel of textSelectors) {
            const textEl = e.querySelector(sel);
            if (textEl?.textContent) {
              content = textEl.textContent.trim();
              break;
            }
          }
          
          if (!content) {
            content = e.textContent?.trim() || '';
          }
          
          return { mid, content };
        });

        if (this.account.enableImageRecognition) {
          const imgElements = await el.$$('img');
          if (imgElements.length > 0) {
            if (shouldLogImageDebug) {
            this.log(`📷 检测到${imgElements.length}张图片，开始提取...`);
            }
            for (const imgEl of imgElements) {
              try {
                const imgBuffer = await imgEl.screenshot({ type: 'png', timeout: 5000 });
                const base64 = imgBuffer.toString('base64');
                images.push(`data:image/png;base64,${base64}`);
                if (shouldLogImageDebug) {
                this.log(`   ✅ 已提取图片 (${Math.round(base64.length / 1024)}KB)`);
                }
              } catch (error) {
                if (shouldLogImageDebug) {
                this.log(`   ⚠️  图片提取失败:`, error);
                }
              }
            }
          }
        }
        
        // 生成消息ID（如果没有data-mid，用文本+时间戳）
        const messageId = msgData.mid || `${msgData.content.substring(0, 20)}_${Date.now()}`;
        
        const cleanedText = this.stripTimestamp(msgData.content);
        const hasText = cleanedText.length > 0;

        // 如果没有文字内容，仅包含图片，则直接忽略（避免对纯图片进行AI回复）
        if (!hasText && images.length === 0) {
          continue;
        }
        
        // 二次检查：如果检测不到 fromSelf，但内容与最近发送的消息完全一致，标记为 fromSelf
        if (!fromSelf && this.lastSentMessages.length > 0) {
          const normalizedText = cleanedText.trim().toLowerCase();
          const isRecentlySent = this.lastSentMessages.some(sent => {
            const normalizedSent = sent.trim().toLowerCase();
            return normalizedSent === normalizedText;
          });
          if (isRecentlySent) {
            // this.log(`   🔍 二次检查：内容匹配最近发送，标记为 fromSelf`);
            messages.push({ text: cleanedText, images, messageId, fromSelf: true });
            continue;
          }
        }

        // 纯图片消息：记录日志并跳过
        if (!hasText && images.length > 0 && !fromSelf) {
          this.log('🖼️ 检测到纯图片消息，已忽略监听');
          continue;
        }

        // 有文字（即使附带图片），正常处理文字部分
        messages.push({
          text: cleanedText,
          images: images.length > 0 ? images : undefined,
          messageId: messageId,
          fromSelf
        });
      }
    } catch (error) {
      this.logError('❌ 读取消息失败:', error);
    }

    // 返回最近的 bufferSize 条
    return messages.slice(-this.account.bufferSize);
  }

  /**
   * 发送消息
   */
  async sendMessage(text: string): Promise<void> {
    if (!this.page) return;

    try {
      // 找到消息输入框 - 适配 Telegram Web K 版本
      const inputBox = await this.page.$('.input-message-input, [contenteditable="true"].input-field-input');
      
      if (inputBox) {
        // 处理消息拆分
        if (this.account.splitByNewline && text.includes('\n')) {
          const parts = text.split('\n').filter(p => p.trim());
          for (let i = 0; i < parts.length; i++) {
            await this.sendSingleMessage(inputBox, parts[i]);
            // 记录每条消息
            this.recordSentMessage(parts[i]);
            if (i < parts.length - 1) {
              await this.page.waitForTimeout(this.account.multiMsgInterval * 1000);
            }
          }
        } else {
          await this.sendSingleMessage(inputBox, text);
          // 记录发送的消息
          this.recordSentMessage(text);
        }
      } else {
        this.log(`⚠️ 未找到消息输入框`);
      }
    } catch (error) {
      this.logError('发送消息失败:', error);
      throw error;
    }
  }
  
  /**
   * 记录已发送的消息（用于去重）
   */
  private recordSentMessage(text: string): void {
    this.recentSentMessages.push(text);
    if (this.recentSentMessages.length > this.MAX_SENT_HISTORY) {
      this.recentSentMessages.shift();
    }
  }

  /**
   * 去除消息中的时间戳（Telegram气泡下方的 13:49 这类文本）
   */
  private stripTimestamp(text: string): string {
    if (!text) return '';
    return text
      .replace(/(\d{1,2}:\d{2}\s*)+$/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * 发送单条消息
   */
  private async sendSingleMessage(inputBox: any, text: string): Promise<void> {
    if (!this.page) return;

    // 点击输入框获取焦点
    await inputBox.click();
    await this.page.waitForTimeout(100);

    // 输入文本
    await inputBox.fill(text);
    await this.page.waitForTimeout(300);

    // 按 Enter 发送
    await this.page.keyboard.press('Enter');
    await this.page.waitForTimeout(500);
  }

  /**
   * 发送图片（从base64数据，使用粘贴方式）
   */
  async sendImage(base64Data: string, caption?: string): Promise<void> {
    if (!this.page) {
      this.log(`⚠️ 页面未初始化，无法发送图片`);
      return;
    }

    try {
      this.log(`📤 正在发送图片（粘贴方式）...`);
      
      // 从 base64 data URL 中提取实际数据和类型
      let imageBuffer: Buffer;
      let mimeType = 'image/png';
      
      if (base64Data.startsWith('data:')) {
        const matches = base64Data.match(/^data:(image\/\w+);base64,(.+)$/);
        if (matches) {
          mimeType = matches[1];
          imageBuffer = Buffer.from(matches[2], 'base64');
        } else {
          throw new Error('无效的 base64 图片格式');
        }
      } else {
        // 纯 base64 数据
        imageBuffer = Buffer.from(base64Data, 'base64');
      }
      
      this.log(`   📷 图片大小: ${(imageBuffer.length / 1024).toFixed(1)}KB, 类型: ${mimeType}`);
      
      // 找到消息输入框并聚焦
      const inputBox = await this.page.$('.input-message-input, [contenteditable="true"].input-field-input');
      if (!inputBox) {
        throw new Error('未找到消息输入框');
      }
      
      await inputBox.click();
      await this.page.waitForTimeout(200);
      
      // 使用 Playwright 的 evaluate 在浏览器中执行粘贴操作
      // 创建一个包含图片的 ClipboardItem 并触发粘贴事件
      const pasteResult = await this.page.evaluate(async ({ base64, mime, captionText }) => {
        try {
          // 将 base64 转换为 Blob
          const byteCharacters = atob(base64);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: mime });
          
          // 创建 File 对象
          const file = new File([blob], 'image.png', { type: mime });
          
          // 创建 DataTransfer 对象
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          
          // 找到输入区域
          const inputArea = document.querySelector('.input-message-input, [contenteditable="true"]');
          if (!inputArea) {
            return { success: false, error: '未找到输入区域' };
          }
          
          // 创建并触发粘贴事件
          const pasteEvent = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: dataTransfer
          });
          
          inputArea.dispatchEvent(pasteEvent);
          
          return { success: true };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      }, { 
        base64: base64Data.includes(',') ? base64Data.split(',')[1] : base64Data, 
        mime: mimeType,
        captionText: caption || ''
      });
      
      if (!pasteResult.success) {
        this.log(`   ⚠️ 粘贴方式失败: ${pasteResult.error}，尝试拖拽方式...`);
        
        // 备用方案：保存到临时文件后用 setInputFiles
        const tempDir = path.join(process.cwd(), 'data', 'temp');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        const tempFilePath = path.join(tempDir, `upload_${Date.now()}.png`);
        fs.writeFileSync(tempFilePath, imageBuffer);
        
        try {
          // 使用 filechooser 事件
          const [fileChooser] = await Promise.all([
            this.page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null),
            this.page.evaluate(() => {
              // 触发文件选择
              const input = document.querySelector('input[type="file"][accept*="image"]') as HTMLInputElement;
              if (input) input.click();
            })
          ]);
          
          if (fileChooser) {
            await fileChooser.setFiles(tempFilePath);
            this.log(`   ✅ 通过文件选择器上传`);
          } else {
            // 最后方案：直接设置 input
            const fileInput = await this.page.$('input[type="file"]');
            if (fileInput) {
              await fileInput.setInputFiles(tempFilePath);
              this.log(`   ✅ 直接设置文件输入`);
            } else {
              throw new Error('无法上传图片');
            }
          }
        } finally {
          // 清理临时文件
          try { fs.unlinkSync(tempFilePath); } catch (e) {}
        }
      } else {
        this.log(`   ✅ 粘贴成功`);
      }
      
      // 等待图片预览出现
      await this.page.waitForTimeout(1500);
      
      // 检查是否有弹窗（发送确认）
      const popup = await this.page.$('.popup-send-photo, .popup-new-media, .popup');
      if (popup) {
        this.log(`   📋 检测到发送确认弹窗`);
        
        // 如果有说明文字，输入它
        if (caption) {
          const captionInput = await popup.$('.input-field-input, [contenteditable="true"], input');
          if (captionInput) {
            await captionInput.click();
            await captionInput.fill(caption);
            this.log(`   💬 已添加说明文字`);
            await this.page.waitForTimeout(200);
          }
        }
        
        // 点击发送按钮
        const sendBtn = await popup.$('.btn-primary, .popup-send-btn, button:has-text("Send"), button:has-text("发送")');
        if (sendBtn) {
          await sendBtn.click();
          this.log(`   📨 点击发送按钮`);
        } else {
          // 按 Enter 发送
          await this.page.keyboard.press('Enter');
          this.log(`   ⏎ 按 Enter 发送`);
        }
      } else {
        // 没有弹窗，可能图片直接在输入框预览
        // 如果有说明文字，输入它
        if (caption) {
          await inputBox.fill(caption);
          await this.page.waitForTimeout(200);
        }
        
        // 按 Enter 发送
        await this.page.keyboard.press('Enter');
        this.log(`   ⏎ 按 Enter 发送`);
      }
      
      await this.page.waitForTimeout(1000);
      this.log(`✅ 图片发送完成`);
      
    } catch (error) {
      this.logError('发送图片失败:', error);
      throw error;
    }
  }

  /**
   * 更新账号状态
   */
  private async updateStatus(status: string): Promise<void> {
    this.status = status;
    await this.prisma.account.update({
      where: { id: this.account.id },
      data: { status }
    });
  }

  /**
   * 获取状态
   */
  getStatus(): string {
    return this.status;
  }

  /**
   * 获取 Page 对象（供外部使用）
   */
  getPage(): Page | null {
    return this.page;
  }

  /**
   * 停止客户端
   */
  /**
   * 强制刷新并保存当前登录状态
   * 即使原session文件不存在，也能从浏览器context中创建新文件
   */
  async refreshSession(targetPath?: string): Promise<boolean> {
    // 检查浏览器context是否存在（即使status不是online，只要context存在就可以刷新）
    if (!this.context) {
      this.log(`⚠️ 浏览器context不存在，无法刷新session`);
      return false;
    }

    // 检查是否真的已登录（通过检查页面状态）
    try {
      const isLoggedIn = await this.checkLoginStatus();
      if (!isLoggedIn) {
        this.log(`⚠️ 账号未登录，无法刷新session`);
        return false;
      }
    } catch (error) {
      this.logError('检查登录状态失败:', error);
      return false;
    }

    try {
      // 如果指定了目标路径，使用目标路径；否则使用默认路径
      let sessionPath = targetPath || this.account.sessionPath || this.getSessionPath();
      if (!path.isAbsolute(sessionPath)) {
        sessionPath = path.resolve(process.cwd(), sessionPath);
      }

      // 确保目录存在
      const sessionDir = path.dirname(sessionPath);
      fs.mkdirSync(sessionDir, { recursive: true });

      // 强制刷新session（即使原文件不存在也会创建新文件，覆盖保存）
      await this.context.storageState({ path: sessionPath });
      this.log(`💾 会话已刷新: ${sessionPath}`);

      // 更新数据库（保存相对路径）
      const relativePath = path.relative(process.cwd(), sessionPath);
      await this.prisma.account.update({
        where: { id: this.account.id },
        data: { sessionPath: relativePath.startsWith('..') ? sessionPath : relativePath }
      });

      return true;
    } catch (error) {
      this.logError('刷新会话失败:', error);
      return false;
    }
  }

  async stop(): Promise<void> {
    this.log(`🛑 停止客户端 [账号: ${this.account.phoneNumber}]`);
    this.isRunning = false;

    // 保存会话状态
    if (this.context) {
      try {
        let sessionPath = this.account.sessionPath || this.getSessionPath();
        if (!path.isAbsolute(sessionPath)) {
          sessionPath = path.resolve(process.cwd(), sessionPath);
        }
        await this.context.storageState({ path: sessionPath });
        this.log(`💾 会话已保存: ${sessionPath}`);
      } catch (error) {
        this.logError('保存会话失败:', error);
      }
    }

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }

    await this.updateStatus('offline');
  }

  // ============ 旧版 API 兼容 ============

  /**
   * 发起登录（兼容旧 API）
   */
  async initiateLogin(): Promise<void> {
    await this.start();
  }

  /**
   * 提交验证码（兼容旧 API - 新流程不需要）
   */
  async submitCode(code: string): Promise<void> {
    this.log(`⚠️ 新流程不需要手动提交验证码，请在浏览器中直接操作`);
  }

  /**
   * 提交密码（兼容旧 API - 新流程不需要）
   */
  async submitPassword(password: string): Promise<void> {
    this.log(`⚠️ 新流程不需要手动提交密码，请在浏览器中直接操作`);
  }

  /**
   * 日志工具，统一加上账号标签
   */
  private log(...args: any[]): void {
    console.log(`[${this.account.phoneNumber}]`, ...args);
  }

  private logError(...args: any[]): void {
    console.error(`[${this.account.phoneNumber}]`, ...args);
  }
}
