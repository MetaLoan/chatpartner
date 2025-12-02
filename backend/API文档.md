# API文档

## 基础信息

- **Base URL**: `http://localhost:8080/api/v1`
- **Content-Type**: `application/json`

## 通用响应格式

### 成功响应
```json
{
  "data": {...},
  "message": "操作成功"
}
```

### 错误响应
```json
{
  "error": "错误信息"
}
```

## API端点

### 健康检查

#### GET /health
检查服务状态

**响应示例**:
```json
{
  "status": "ok",
  "message": "AI群营销工具运行中"
}
```

---

### 账号管理

#### GET /accounts
获取账号列表

**查询参数**:
- `page` (int, 可选): 页码，默认1
- `page_size` (int, 可选): 每页数量，默认20
- `search` (string, 可选): 搜索关键词（手机号或昵称）
- `status` (string, 可选): 状态过滤（online/offline/error）

**响应示例**:
```json
{
  "data": [
    {
      "id": 1,
      "phone_number": "+8613800138000",
      "nickname": "AI助手1",
      "status": "online",
      ...
    }
  ],
  "total": 10,
  "page": 1,
  "page_size": 20
}
```

#### GET /accounts/:id
获取单个账号详情

#### POST /accounts
创建账号

**请求体**:
```json
{
  "phone_number": "+8613800138000",
  "api_id": 123456,
  "api_hash": "abc123...",
  "ai_api_key": "sk-...",
  "nickname": "AI助手1",
  "ai_model": "gpt-4o-mini",
  "system_prompt": "你是一个友好的AI助手",
  "reply_interval": 60
}
```

#### PUT /accounts/:id
更新账号

#### DELETE /accounts/:id
删除账号（软删除）

#### POST /accounts/:id/login
登录账号（启动Telegram客户端）

---

### 群组管理

#### GET /groups
获取群组列表

**查询参数**:
- `page` (int, 可选): 页码
- `page_size` (int, 可选): 每页数量
- `search` (string, 可选): 搜索关键词
- `status` (string, 可选): 状态过滤

#### GET /groups/:id
获取单个群组详情

#### POST /groups
创建群组

**请求体**:
```json
{
  "chat_id": -1001234567890,
  "title": "我的群组",
  "username": "mygroup",
  "type": "supergroup"
}
```

#### PUT /groups/:id
更新群组

#### DELETE /groups/:id
删除群组

#### POST /groups/:id/assign-accounts
为群组分配账号

**请求体**:
```json
{
  "account_ids": [1, 2, 3]
}
```

#### GET /groups/:id/accounts
获取群组的账号列表

---

### 消息管理

#### GET /messages
获取消息列表

**查询参数**:
- `page` (int, 可选): 页码
- `page_size` (int, 可选): 每页数量
- `account_id` (int, 可选): 账号ID过滤
- `group_id` (int, 可选): 群组ID过滤
- `start_time` (string, 可选): 开始时间（格式: 2006-01-02 15:04:05）
- `end_time` (string, 可选): 结束时间
- `search` (string, 可选): 内容搜索

#### GET /messages/:id
获取单个消息详情

#### POST /messages/send
手动发送消息

**请求体**:
```json
{
  "account_id": 1,
  "group_id": 1,
  "content": "这是一条测试消息"
}
```

---

### 统计

#### GET /statistics
获取全局统计数据

**响应示例**:
```json
{
  "data": {
    "total_accounts": 10,
    "online_accounts": 8,
    "total_groups": 20,
    "today_messages": 150,
    "total_messages": 5000,
    "daily_trend": [
      {"date": "2024-12-01", "count": 120},
      ...
    ],
    "account_ranking": [
      {"account_id": 1, "phone_number": "+86...", "count": 500},
      ...
    ],
    "group_ranking": [
      {"group_id": 1, "title": "群组1", "count": 300},
      ...
    ]
  }
}
```

#### GET /accounts/:id/statistics
获取账号统计数据

#### GET /groups/:id/statistics
获取群组统计数据

---

## 状态码

- `200` - 成功
- `201` - 创建成功
- `400` - 请求参数错误
- `404` - 资源不存在
- `409` - 资源冲突（如重复创建）
- `500` - 服务器内部错误

