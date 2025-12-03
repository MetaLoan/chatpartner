#!/bin/bash

cd "$(dirname "$0")"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "       📊 Session 状态检查              "
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 检查session文件
echo "📁 Session 文件:"
if [ -d "backend-playwright/data/sessions" ]; then
    ls -lh backend-playwright/data/sessions/*.json 2>/dev/null | while read line; do
        echo "  $line"
    done
    
    if [ $(ls backend-playwright/data/sessions/*.json 2>/dev/null | wc -l) -eq 0 ]; then
        echo "  ⚠️  没有session文件"
    fi
else
    echo "  ❌ Session目录不存在"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💾 数据库记录:"
echo ""

curl -s http://localhost:8080/api/v1/accounts 2>/dev/null | python3 -c "
import json,sys,os

try:
    data = json.load(sys.stdin)
    for acc in data.get('data', []):
        phone = acc.get('phone_number', 'N/A')
        session_path = acc.get('session_path')
        status = acc.get('status', 'unknown')
        
        # 检查文件是否存在
        if session_path:
            full_path = f'backend-playwright/{session_path}'
            exists = os.path.exists(full_path)
            file_status = '✅' if exists else '❌'
        else:
            file_status = '⚪'
            full_path = '未设置'
        
        print(f'账号: {phone}')
        print(f'  状态: {status}')
        print(f'  Session路径: {session_path or \"未设置\"}')
        print(f'  文件存在: {file_status}')
        
        if session_path and os.path.exists(full_path):
            size = os.path.getsize(full_path)
            print(f'  文件大小: {size} 字节 ({\"正常\" if size > 3000 else \"异常\"})')
        print()
except Exception as e:
    print(f'❌ 错误: {e}')
" || echo "❌ 无法连接到后端API"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"



