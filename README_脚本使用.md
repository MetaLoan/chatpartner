# 脚本使用说明

## 可用脚本

### 1. 重启服务.sh
一键重启前后端及所有相关线程

**使用方法:**
```bash
./重启服务.sh
```

**功能:**
- 停止所有后端进程（Go进程）
- 停止所有前端进程（Vite进程）
- 释放端口8080和3000
- 检查PostgreSQL状态
- 重新启动后端和前端服务
- 验证服务健康状态
- 保存进程ID到文件

**输出:**
- 显示服务状态
- 提供访问地址
- 显示常用命令提示

### 2. 停止服务.sh
停止所有服务

**使用方法:**
```bash
./停止服务.sh
```

**功能:**
- 从PID文件读取并停止进程
- 查找并停止所有相关进程
- 释放端口8080和3000

### 3. 启动服务.sh
启动服务（如果未运行）

**使用方法:**
```bash
./启动服务.sh
```

**功能:**
- 检查PostgreSQL
- 启动后端服务
- 启动前端服务
- 验证服务状态

### 4. 查看日志.sh
查看服务日志

**使用方法:**
```bash
./查看日志.sh
```

**选项:**
1. 后端日志（最后50行）
2. 前端日志（最后50行）
3. 所有日志（各30行）
4. 实时后端日志（tail -f）
5. 实时前端日志（tail -f）

## 快速开始

### 首次启动
```bash
# 1. 确保PostgreSQL运行
brew services start postgresql  # macOS
# 或
sudo systemctl start postgresql  # Linux

# 2. 启动服务
./启动服务.sh
```

### 重启服务
```bash
./重启服务.sh
```

### 停止服务
```bash
./停止服务.sh
```

### 查看日志
```bash
./查看日志.sh
```

## 日志文件位置

- 后端日志: `logs/backend.log`
- 前端日志: `logs/frontend.log`
- 后端PID: `logs/backend.pid`
- 前端PID: `logs/frontend.pid`

## 服务地址

- 前端: http://localhost:3000
- 后端API: http://localhost:8080
- 健康检查: http://localhost:8080/health

## 故障排除

### 端口被占用
如果端口被占用，重启脚本会自动释放。如果仍有问题：
```bash
# 手动释放端口
lsof -ti:8080 | xargs kill -9
lsof -ti:3000 | xargs kill -9
```

### 服务无法启动
1. 检查PostgreSQL是否运行
2. 查看日志文件: `tail -f logs/backend.log`
3. 检查环境变量配置

### 进程残留
```bash
# 查找所有相关进程
ps aux | grep -E "(go run|vite)" | grep aibot

# 手动停止
kill -9 <PID>
```

## 注意事项

1. 确保PostgreSQL已启动
2. 确保端口8080和3000未被其他程序占用
3. 首次运行需要安装依赖（脚本会自动处理）
4. 日志文件会持续增长，定期清理

