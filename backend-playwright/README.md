# AI 群营销工具 - Playwright 版本 🤖

基于 Playwright 浏览器自动化的 Telegram AI 群营销管理平台。

## ✨ 主要优势

相比原版（使用 Telegram API），Playwright 版本有以下优势：

| 特性 | 原版 (Telegram API) | Playwright 版 |
|------|---------------------|---------------|
| **配置复杂度** | 需要 API ID + API Hash | ❌ 不需要 |
| **认证方式** | MTProto 协议 | 浏览器登录（更直观） |
| **封号风险** | 较高（API 调用特征明显） | 较低（模拟真人操作） |
| **部署难度** | 需要配置 API 凭据 | 开箱即用 |

## 🚀 快速开始

### 1. 安装依赖

```bash
cd backend-playwright
npm install
npx playwright install chromium
```

### 2. 配置数据库

创建 `.env` 文件：

```env
DATABASE_URL="postgresql://user:password@localhost:5432/aibot_playwright?schema=public"
PORT=8080
SESSION_DIR=./data/sessions
HEADLESS=true
```

### 3. 初始化数据库

```bash
npx prisma migrate dev
npx prisma generate
```

### 4. 启动服务

```bash
# 开发模式
npm run dev

# 生产模式
npm run build
npm start
```

## 📱 使用流程

### 添加账号

1. 在前端界面点击「添加账号」
2. 填写：
   - **手机号**：国际格式，如 `+8613800138000`
   - **AI API Key**：OpenAI/DeepSeek 等 API 密钥
   - 其他可选配置

> **注意**：不需要 API ID 和 API Hash！

### 登录账号

1. 点击账号的「登录」按钮
2. 系统会启动浏览器，自动打开 Telegram Web
3. 验证码会发送到你的 Telegram 客户端（手机/桌面）
4. 在弹出的对话框中输入验证码
5. 如果开启了两步验证，还需要输入 2FA 密码

### 群组配置

1. 登录成功后，系统会自动同步群组列表
2. 在「群组管理」中分配账号到指定群组
3. 配置回复概率等参数

## 🏗️ 技术架构

```
backend-playwright/
├── src/
│   ├── index.ts              # 入口文件
│   ├── telegram/
│   │   ├── client.ts         # Playwright 客户端（核心）
│   │   └── manager.ts        # 客户端管理器
│   ├── services/
│   │   └── ai.ts             # AI 服务
│   └── routes/               # API 路由
│       ├── accounts.ts
│       ├── groups.ts
│       ├── messages.ts
│       ├── auth.ts
│       └── config.ts
├── prisma/
│   └── schema.prisma         # 数据库模型
└── data/
    └── sessions/             # 浏览器会话存储
```

## 🔧 核心实现

### Telegram Web 自动化

使用 Playwright 操作 Telegram Web (https://web.telegram.org/k/):

1. **登录流程**：
   - 启动 Chromium 浏览器
   - 打开 Telegram Web
   - 自动填写手机号
   - 等待用户输入验证码
   - 保存浏览器会话（cookies、localStorage）

2. **消息监听**：
   - 定时轮询消息列表
   - 解析 DOM 获取新消息
   - 触发 AI 回复逻辑

3. **消息发送**：
   - 定位消息输入框
   - 填写文本内容
   - 点击发送按钮

### 会话持久化

浏览器会话保存在 `data/sessions/` 目录，包含：
- Cookies
- LocalStorage
- SessionStorage

重启后自动恢复登录状态，无需重新认证。

## ⚠️ 注意事项

1. **HEADLESS 模式**：
   - 开发调试时设置 `HEADLESS=false` 可以看到浏览器操作
   - 生产环境建议设置 `HEADLESS=true`

2. **资源占用**：
   - 每个账号需要一个独立的浏览器实例
   - 建议每台服务器运行不超过 10 个账号

3. **Telegram Web 更新**：
   - 如果 Telegram Web 界面更新，可能需要调整选择器
   - 核心选择器定义在 `client.ts` 中

## 📄 API 文档

### 账号管理

```
GET    /api/accounts          # 获取账号列表
POST   /api/accounts          # 创建账号
GET    /api/accounts/:id      # 获取单个账号
PUT    /api/accounts/:id      # 更新账号
DELETE /api/accounts/:id      # 删除账号
POST   /api/accounts/:id/login   # 登录
POST   /api/accounts/:id/logout  # 登出
```

### 认证

```
GET  /api/auth/:accountId/status    # 获取认证状态
POST /api/auth/:accountId/code      # 提交验证码
POST /api/auth/:accountId/password  # 提交 2FA 密码
```

### 群组管理

```
GET    /api/groups                    # 获取群组列表
POST   /api/groups                    # 创建群组
PUT    /api/groups/:id                # 更新群组
DELETE /api/groups/:id                # 删除群组
POST   /api/groups/:id/assign-accounts  # 分配账号
```

### 消息

```
GET /api/messages             # 获取消息列表
GET /api/messages/statistics  # 获取统计数据
```

## 📝 License

MIT




