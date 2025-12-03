#!/bin/bash

# 保存所有账号的登录状态
# 用法: ./保存所有登录状态.sh

cd "$(dirname "$0")"

API_BASE="http://localhost:8080/api/v1"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "       💾 保存所有登录状态              "
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 检查服务是否运行
if ! curl -s "$API_BASE/../health" > /dev/null 2>&1; then
    echo "❌ 后端服务未运行！请先启动服务"
    exit 1
fi

# 获取所有账号
ACCOUNTS=$(curl -s "$API_BASE/accounts" 2>/dev/null)

if [ -z "$ACCOUNTS" ]; then
    echo "❌ 无法获取账号列表"
    exit 1
fi

# 解析账号并保存登录状态
echo "$ACCOUNTS" | python3 -c "
import json
import sys
import subprocess

data = json.load(sys.stdin)
accounts = data.get('data', [])

if not accounts:
    print('❌ 没有找到任何账号')
    sys.exit(1)

print(f'📋 找到 {len(accounts)} 个账号\n')

success_count = 0
fail_count = 0

for acc in accounts:
    acc_id = acc['id']
    phone = acc['phone_number']
    status = acc.get('status', 'unknown')
    
    print(f'📱 账号: {phone} (ID: {acc_id})')
    print(f'   当前状态: {status}')
    
    # 调用confirm-login API
    try:
        result = subprocess.run(
            ['curl', '-s', '-X', 'POST', f'http://localhost:8080/api/v1/accounts/{acc_id}/confirm-login'],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        response = json.loads(result.stdout)
        new_status = response.get('status', 'unknown')
        message = response.get('message', '')
        
        if new_status == 'online':
            print(f'   ✅ {message}')
            success_count += 1
        else:
            print(f'   ⚠️  {message}')
            fail_count += 1
    except Exception as e:
        print(f'   ❌ 保存失败: {e}')
        fail_count += 1
    
    print()

print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
print(f'✅ 成功: {success_count} 个')
print(f'❌ 失败: {fail_count} 个')
print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
"

echo ""
echo "💡 提示: 运行 ./检查session状态.sh 查看详细信息"
echo ""




