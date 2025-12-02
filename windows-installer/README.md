# ChatPartner v2.0 - Windows 安装指南

## 🚀 一键在线安装（推荐）

打开 **PowerShell（管理员）**，复制粘贴以下命令：

```powershell
irm https://raw.githubusercontent.com/MetaLoan/chatpartner/main/windows-installer/install.ps1 | iex
```

## 📦 离线安装包安装

1. 下载 `ChatPartner-v2.0-Windows-x64.zip`
2. 解压到任意目录
3. 右键点击 `一键安装.bat`，选择 **"以管理员身份运行"**
4. 等待安装完成

## 🔧 安装内容

安装程序会自动安装以下组件：

| 组件 | 版本 | 说明 |
|------|------|------|
| Node.js | 20.x LTS | JavaScript 运行时 |
| PostgreSQL | 16 | 数据库 |
| Git | 最新版 | 版本控制 |
| Chromium | 最新版 | Playwright 浏览器 |

## 📁 安装目录结构

```
C:\Users\你的用户名\ChatPartner\
├── chatpartner\              # 项目代码
│   ├── backend-playwright\   # 后端服务
│   └── frontend\             # 前端界面
├── 启动ChatPartner.bat       # 启动脚本
└── 停止ChatPartner.bat       # 停止脚本
```

## 🖥️ 使用方法

### 启动服务
- 双击桌面上的 **ChatPartner** 快捷方式
- 或运行 `启动ChatPartner.bat`

### 访问界面
- 打开浏览器访问: http://localhost:3000

### 停止服务
- 运行 `停止ChatPartner.bat`
- 或关闭所有命令行窗口

## ⚙️ 数据库配置

默认配置：
- 主机: localhost
- 端口: 5432
- 用户名: postgres
- 密码: chatpartner123
- 数据库: chatpartner

## 🔄 更新方法

1. 停止服务
2. 打开 PowerShell，进入项目目录：
   ```powershell
   cd $env:USERPROFILE\ChatPartner\chatpartner
   git pull origin main
   cd backend-playwright
   npm install
   npx prisma db push
   cd ..\frontend
   npm install
   ```
3. 重新启动服务

## ❓ 常见问题

### Q: 安装失败怎么办？
A: 确保以管理员身份运行，并检查网络连接。

### Q: 端口被占用怎么办？
A: 修改 `backend-playwright/.env` 中的 `PORT` 配置。

### Q: 如何备份数据？
A: 在前端界面 "系统设置" 中使用 "导出配置" 功能。

## 📞 技术支持

如有问题，请提交 Issue: https://github.com/MetaLoan/chatpartner/issues

