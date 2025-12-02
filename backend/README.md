# AI群营销工具 - Go后端

## 技术栈

- **语言**: Go 1.21+
- **Web框架**: Gin
- **ORM**: GORM
- **数据库**: PostgreSQL
- **Telegram SDK**: gotd/td
- **AI服务**: OpenAI Go SDK

## 项目结构

```
backend/
├── main.go                 # 入口文件
├── go.mod                  # Go模块定义
├── go.sum                  # 依赖校验
├── .env.example            # 环境变量示例
├── internal/               # 内部包
│   ├── config/            # 配置管理
│   ├── database/          # 数据库连接
│   ├── server/            # HTTP服务器
│   ├── telegram/          # Telegram客户端
│   └── ai/                # AI服务
├── models/                 # 数据模型
├── handlers/               # 请求处理器
├── services/               # 业务逻辑
└── utils/                  # 工具函数
```

## 快速开始

### 1. 安装依赖

```bash
go mod download
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，填入配置
```

### 3. 运行程序

```bash
go run main.go
```

### 4. 构建

```bash
go build -o bin/aibot main.go
```

## 环境变量配置

### 必需配置

- `TELEGRAM_API_ID`: Telegram API ID
- `TELEGRAM_API_HASH`: Telegram API Hash
- `OPENAI_API_KEY`: OpenAI API Key
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`: 数据库配置

### 可选配置

- `SERVER_PORT`: 服务器端口（默认: 8080）
- `OPENAI_MODEL`: AI模型（默认: gpt-4o-mini）
- `JWT_SECRET`: JWT密钥
- `REDIS_HOST`, `REDIS_PORT`: Redis配置

## API端点

### 健康检查
- `GET /health` - 健康检查

### 账号管理
- `GET /api/v1/accounts` - 获取账号列表
- `POST /api/v1/accounts` - 创建账号
- `PUT /api/v1/accounts/:id` - 更新账号
- `DELETE /api/v1/accounts/:id` - 删除账号

### 群组管理
- `GET /api/v1/groups` - 获取群组列表
- `POST /api/v1/groups` - 创建群组
- `PUT /api/v1/groups/:id` - 更新群组
- `DELETE /api/v1/groups/:id` - 删除群组

### 消息管理
- `GET /api/v1/messages` - 获取消息列表
- `POST /api/v1/messages/send` - 发送消息

### 统计
- `GET /api/v1/statistics` - 获取统计数据

## 开发计划

- [ ] 实现Telegram客户端连接
- [ ] 实现消息监听和自动回复
- [ ] 实现数据模型和数据库迁移
- [ ] 实现完整的API接口
- [ ] 实现认证和授权
- [ ] 实现WebSocket实时通信

