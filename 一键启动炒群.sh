#!/bin/bash

# AI 炒群工具 - 一键启动脚本

cd "$(dirname "$0")"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "       🤖 AI 炒群工具 - 一键启动        "
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 创建日志目录
mkdir -p logs

# ============ 停止旧服务 ============
stop_services() {
    echo "🛑 停止旧服务..."
    
    # 停止后端
    if [ -f logs/backend-playwright.pid ]; then
        kill $(cat logs/backend-playwright.pid) 2>/dev/null
        rm logs/backend-playwright.pid
    fi
    pkill -f "tsx.*backend-playwright" 2>/dev/null
    pkill -f "node.*backend-playwright" 2>/dev/null
    
    # 停止前端
    if [ -f logs/frontend.pid ]; then
        kill $(cat logs/frontend.pid) 2>/dev/null
        rm logs/frontend.pid
    fi
    pkill -f "vite.*frontend" 2>/dev/null
    
    # 关闭 Playwright 浏览器
    pkill -f "chromium.*playwright" 2>/dev/null
    pkill -f "chrome.*playwright" 2>/dev/null
    
    # 释放端口
    lsof -ti:8080 | xargs kill -9 2>/dev/null
    lsof -ti:3000 | xargs kill -9 2>/dev/null
    
    sleep 2
    echo "   ✅ 旧服务已停止"
}

# ============ 启动后端 ============
start_backend() {
    echo ""
    echo "🔧 启动后端服务..."
    cd backend-playwright
    npx prisma generate > /dev/null 2>&1
    nohup npm run dev > ../logs/backend-playwright.log 2>&1 &
    echo $! > ../logs/backend-playwright.pid
    cd ..
    
    echo "   等待后端启动..."
    for i in {1..10}; do
        if curl -s http://localhost:8080/api/health > /dev/null 2>&1; then
            echo "   ✅ 后端已启动 (端口: 8080)"
            return 0
        fi
        sleep 1
    done
    
    echo "   ❌ 后端启动失败"
    exit 1
}

# ============ 启动前端 ============
start_frontend() {
    echo ""
    echo "🎨 启动前端服务..."
    cd frontend
    nohup npm run dev > ../logs/frontend.log 2>&1 &
    echo $! > ../logs/frontend.pid
    cd ..
    
    echo "   等待前端启动..."
    for i in {1..10}; do
        if curl -s http://localhost:3000 > /dev/null 2>&1; then
            echo "   ✅ 前端已启动 (端口: 3000)"
            return 0
        fi
        sleep 1
    done
    
    echo "   ⚠️ 前端启动可能较慢，请稍后访问 http://localhost:3000"
}

# ============ 主流程 ============

# 停止旧服务
stop_services

# 启动服务
start_backend
start_frontend

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "       ✅ 服务启动完成              "
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 显示启用的账号信息
echo "📊 正在启动已配置的账号..."
sleep 3

ACCOUNTS=$(curl -s "http://localhost:8080/api/v1/accounts?status=online,idle,authenticating" 2>/dev/null)

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "       📱 账号监控状态              "
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ ! -z "$ACCOUNTS" ]; then
    echo "$ACCOUNTS" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    accounts = data.get('data', [])
    if not accounts:
        print('  ℹ️  暂无启用的账号')
    else:
        print()
        for acc in accounts:
            phone = acc.get('phone_number', 'N/A')
            status = acc.get('status', 'offline')
            status_icon = {
                'online': '🟢',
                'idle': '🟡', 
                'authenticating': '🔵',
                'offline': '⚪',
                'error': '🔴'
            }.get(status, '⚪')
            print(f'  {status_icon} {phone}')
        print()
except:
    print('  ℹ️  正在初始化...')
" 2>/dev/null || echo "  ℹ️  正在初始化..."
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "       💡 使用说明                  "
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. 🌐 浏览器管理："
echo "   - 系统会自动为每个启用的账号打开浏览器"
echo "   - 如果账号已登录，会自动跳转到目标群组"
echo "   - 如果账号未登录，请在浏览器中手动登录"
echo ""
echo "2. 📱 账号配置："
echo "   - 访问 http://localhost:3000 管理账号"
echo "   - 在账号编辑页面设置「目标群组」"
echo "   - 开启「启用账号」开关"
echo "   - 修改AI参数后立即生效（无需重启）"
echo ""
echo "3. 👀 监控机制："
echo "   - 如果浏览器切换到其他页面，会暂停监听"
echo "   - 切换回目标群组页面后，自动恢复监听"
echo "   - 每5秒自动检测页面状态"
echo ""
echo "4. 📜 日志查看："
echo "   - 后端日志: tail -f logs/backend-playwright.log"
echo "   - 前端日志: tail -f logs/frontend.log"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🎉 系统已就绪！"
echo ""
echo "📍 前端管理界面: http://localhost:3000"
echo "📍 后端API地址: http://localhost:8080"
echo ""
echo "💡 按 Ctrl+C 查看实时日志，再次运行此脚本会自动重启服务"
echo ""

# 显示实时日志
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📜 后端实时日志："
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
tail -f logs/backend-playwright.log
