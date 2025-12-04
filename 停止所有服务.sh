#!/bin/bash

# AI 炒群工具 - 停止所有服务

cd "$(dirname "$0")"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "       🛑 停止所有服务                  "
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ============ 停止后端服务 ============
echo "📦 停止后端服务..."

# 通过 PID 文件停止
if [ -f logs/backend-playwright.pid ]; then
    PID=$(cat logs/backend-playwright.pid)
    if kill -0 $PID 2>/dev/null; then
        kill $PID 2>/dev/null
        echo "   ✓ 停止后端进程 (PID: $PID)"
    fi
    rm -f logs/backend-playwright.pid
fi

# 强制停止相关进程
pkill -f "tsx.*backend-playwright" 2>/dev/null && echo "   ✓ 停止 tsx 进程"
pkill -f "node.*backend-playwright" 2>/dev/null && echo "   ✓ 停止 node 进程"
pkill -f "tsx watch" 2>/dev/null && echo "   ✓ 停止 tsx watch"

# ============ 停止前端服务 ============
echo ""
echo "🎨 停止前端服务..."

# 通过 PID 文件停止
if [ -f logs/frontend.pid ]; then
    PID=$(cat logs/frontend.pid)
    if kill -0 $PID 2>/dev/null; then
        kill $PID 2>/dev/null
        echo "   ✓ 停止前端进程 (PID: $PID)"
    fi
    rm -f logs/frontend.pid
fi

# 强制停止相关进程
pkill -f "vite.*frontend" 2>/dev/null && echo "   ✓ 停止 vite 进程"
pkill -f "node.*vite" 2>/dev/null && echo "   ✓ 停止 vite node 进程"

# ============ 停止 Playwright 浏览器 ============
echo ""
echo "🌐 关闭 Playwright 浏览器..."

pkill -f "chromium.*playwright" 2>/dev/null && echo "   ✓ 关闭 Chromium 浏览器"
pkill -f "chrome.*playwright" 2>/dev/null && echo "   ✓ 关闭 Chrome 浏览器"
pkill -f "Chromium.*--user-data-dir" 2>/dev/null && echo "   ✓ 关闭 Chromium 实例"

# ============ 释放端口 ============
echo ""
echo "🔌 释放端口..."

# 端口 8080 (后端)
PORT_8080=$(lsof -ti:8080 2>/dev/null)
if [ ! -z "$PORT_8080" ]; then
    echo "$PORT_8080" | xargs kill -9 2>/dev/null
    echo "   ✓ 释放端口 8080"
fi

# 端口 3000 (前端)
PORT_3000=$(lsof -ti:3000 2>/dev/null)
if [ ! -z "$PORT_3000" ]; then
    echo "$PORT_3000" | xargs kill -9 2>/dev/null
    echo "   ✓ 释放端口 3000"
fi

# ============ 清理残留进程 ============
echo ""
echo "🧹 清理残留进程..."

# 杀掉所有可能的残留 tsx 进程
pkill -f "tsx" 2>/dev/null && echo "   ✓ 清理 tsx 进程"

# 等待进程完全退出
sleep 1

# ============ 验证结果 ============
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "       📊 服务状态检查                  "
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 检查端口
check_port() {
    if lsof -ti:$1 > /dev/null 2>&1; then
        echo "   ⚠️  端口 $1 仍被占用"
        lsof -ti:$1 | head -1 | xargs ps -p 2>/dev/null | tail -1
    else
        echo "   ✅ 端口 $1 已释放"
    fi
}

check_port 8080
check_port 3000

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "       ✅ 所有服务已停止                "
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 重新启动服务请运行: ./一键启动炒群.sh"
echo ""




