import { PrismaClient } from '@prisma/client';
import { TelegramClient } from './client.js';

/**
 * Telegram 客户端管理器
 * 管理多个账号的 Playwright 浏览器实例
 */
export class TelegramManager {
  private clients: Map<number, TelegramClient> = new Map();
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * 启动所有已启用的账号
   */
  async startAll(): Promise<void> {
    const accounts = await this.prisma.account.findMany({
      where: { enabled: true },
      include: { targetGroup: true }
    });

    console.log(`📋 找到 ${accounts.length} 个已启用账号`);

    for (const account of accounts) {
      // 只启动已认证的账号（有会话文件的）
      if (account.sessionPath) {
        try {
          console.log(`🚀 启动账号 [ID: ${account.id}, 手机号: ${account.phoneNumber}]`);
          
          const client = await this.addClient(account.id);
          
          // 如果设置了目标群组，自动跳转并开始监控
          if (account.targetGroupId && account.targetGroup) {
            console.log(`   → 目标群组: ${account.targetGroup.title} (${account.targetGroup.telegramId})`);
            // 异步执行，不阻塞其他账号启动
            setTimeout(() => {
              client.navigateToGroupAndMonitor(account.targetGroup!.telegramId).catch((error) => {
                console.error(`❌ 账号 ${account.phoneNumber} 监控失败:`, error);
              });
            }, 2000);
          } else {
            console.log(`   ⚠️ 未设置目标群组，跳过监控`);
          }
        } catch (error) {
          console.error(`❌ 启动账号 ${account.phoneNumber} 失败:`, error);
        }
      } else {
        console.log(`⏸️ 跳过账号 [${account.phoneNumber}] - 未登录（无会话）`);
      }
    }
  }

  /**
   * 添加并启动一个客户端
   */
  async addClient(accountId: number): Promise<TelegramClient> {
    // 检查是否已存在
    if (this.clients.has(accountId)) {
      console.log(`⚠️ 账号 ${accountId} 客户端已存在，先停止旧实例`);
      await this.removeClient(accountId);
    }

    const account = await this.prisma.account.findUnique({
      where: { id: accountId }
    });

    if (!account) {
      throw new Error(`账号 ${accountId} 不存在`);
    }

    console.log(`🚀 启动客户端 [账号ID: ${accountId}, 手机号: ${account.phoneNumber}]`);

    const client = new TelegramClient(account, this.prisma);
    this.clients.set(accountId, client);
    console.log(`   ✅ 客户端实例已创建并添加到管理器 (当前客户端数: ${this.clients.size})`);

    // 异步启动客户端
    client.start().then(() => {
      console.log(`   ✅ 客户端 ${accountId} 启动成功`);
    }).catch((error) => {
      console.error(`❌ 客户端 ${accountId} 启动失败:`, error);
      this.clients.delete(accountId);
      console.log(`   ⚠️ 已从管理器移除失败的客户端 (当前客户端数: ${this.clients.size})`);
    });

    return client;
  }

  /**
   * 移除并停止一个客户端
   */
  async removeClient(accountId: number): Promise<void> {
    const client = this.clients.get(accountId);
    if (client) {
      await client.stop();
      this.clients.delete(accountId);
      console.log(`🛑 客户端 ${accountId} 已停止`);
    }
    
    // 无论客户端是否存在，都更新数据库状态为 offline
    await this.prisma.account.update({
      where: { id: accountId },
      data: { status: 'offline' }
    }).catch(() => {});
  }

  /**
   * 获取客户端
   */
  getClient(accountId: number): TelegramClient | undefined {
    return this.clients.get(accountId);
  }

  /**
   * 获取所有客户端
   */
  getClients(): Map<number, TelegramClient> {
    return this.clients;
  }

  /**
   * 获取所有客户端状态
   */
  getStatus(): { accountId: number; status: string }[] {
    return Array.from(this.clients.entries()).map(([id, client]) => ({
      accountId: id,
      status: client.getStatus()
    }));
  }

  /**
   * 停止所有客户端
   */
  async stopAll(): Promise<void> {
    console.log(`🛑 正在停止所有客户端...`);
    const promises = Array.from(this.clients.keys()).map((id) => this.removeClient(id));
    await Promise.all(promises);
    console.log(`✅ 所有客户端已停止`);
  }

  /**
   * 发起登录认证（发送验证码）
   */
  async initiateLogin(accountId: number): Promise<void> {
    // 检查是否已存在客户端
    let client = this.clients.get(accountId);
    
    if (!client) {
      // 创建新客户端但不启动
      const account = await this.prisma.account.findUnique({
        where: { id: accountId }
      });

      if (!account) {
        throw new Error(`账号 ${accountId} 不存在`);
      }

      console.log(`🚀 创建客户端 [账号ID: ${accountId}, 手机号: ${account.phoneNumber}]`);
      client = new TelegramClient(account, this.prisma);
      this.clients.set(accountId, client);
    }
    
    // 只在这里启动浏览器并登录
    await client.initiateLogin();
  }

  /**
   * 提交验证码
   */
  async submitCode(accountId: number, code: string): Promise<void> {
    const client = this.clients.get(accountId);
    if (!client) {
      throw new Error('客户端未启动，请先点击登录');
    }
    await client.submitCode(code);
  }

  /**
   * 提交 2FA 密码
   */
  async submitPassword(accountId: number, password: string): Promise<void> {
    const client = this.clients.get(accountId);
    if (!client) {
      throw new Error('客户端未启动');
    }
    await client.submitPassword(password);
  }
}

