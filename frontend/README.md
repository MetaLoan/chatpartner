# AI群营销工具 - Vue前端

## 技术栈

- **框架**: Vue 3
- **构建工具**: Vite
- **UI组件库**: Element Plus
- **路由**: Vue Router
- **状态管理**: Pinia
- **HTTP客户端**: Axios
- **图表**: ECharts

## 项目结构

```
frontend/
├── src/
│   ├── api/              # API接口
│   ├── views/            # 页面组件
│   │   ├── Dashboard.vue
│   │   ├── Accounts.vue
│   │   ├── Groups.vue
│   │   ├── Messages.vue
│   │   ├── Statistics.vue
│   │   └── Settings.vue
│   ├── components/       # 公共组件
│   ├── router/          # 路由配置
│   ├── stores/          # 状态管理
│   ├── utils/           # 工具函数
│   ├── App.vue          # 根组件
│   └── main.js          # 入口文件
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

## 快速开始

### 1. 安装依赖

```bash
npm install
# 或
yarn install
# 或
pnpm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

### 3. 构建生产版本

```bash
npm run build
```

### 4. 预览生产构建

```bash
npm run preview
```

## 功能页面

- **仪表盘** (`/dashboard`) - 系统概览和统计数据
- **账号管理** (`/accounts`) - AI账号管理
- **群组管理** (`/groups`) - 群组管理
- **消息记录** (`/messages`) - 查看发言记录
- **数据统计** (`/statistics`) - 数据分析和图表
- **系统设置** (`/settings`) - 系统配置

## 开发计划

- [ ] 完善各页面功能
- [ ] 实现实时数据更新（WebSocket）
- [ ] 添加数据可视化图表
- [ ] 实现表单验证
- [ ] 添加错误处理
- [ ] 优化用户体验

