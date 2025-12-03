# 加密货币晒单收益模拟 API 文档

## 基础信息

| 项目 | 说明 |
|------|------|
| 基础地址 | `http://your-server:3000` |
| 请求方式 | GET |
| 返回格式 | JSON（包含 base64 图片数据） |
| 支持交易对 | ETHUSDT、BTCUSDT 等（需对应底图文件） |

---

## 接口：生成晒单图片

### 请求地址

```
GET /api/generate
```

### 请求参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `tradepair` | string | ✅ 是 | 交易对，如 `ETHUSDT`、`BTCUSDT`<br>对应底图文件：`ethusdt-background.jpg`、`btcusdt-background.jpg` |
| `opendate` | string | ✅ 是 | 开仓时间，格式：`YYYY-MM-DD HH:mm`<br>用于获取开仓价格，不显示在图上 |
| `date` | string | ✅ 是 | 显示时间，格式：`YYYY-MM-DD HH:mm`<br>显示在图上，也用于获取最新价格 |
| `lev` | number | ❌ 否 | 杠杆倍数，范围 1-500，默认 10 |
| `direction` | string | ❌ 否 | 交易方向：`long`(做多) / `short`(做空)，默认 `long` |

### 自动计算的数据

| 字段 | 说明 |
|------|------|
| `entprice` | 开仓价格，通过 `opendate` 时间自动获取指定交易对价格 |
| `lastprice` | 最新价格，通过 `date` 时间自动获取指定交易对价格 |
| `yield` | 收益率，根据价格差、方向、杠杆自动计算（如 `+688.78%`） |

### 收益率计算公式

```
做多: yield = (lastprice - entprice) / entprice × lev × 100%
做空: yield = (entprice - lastprice) / entprice × lev × 100%
```

---

## 请求示例

### 示例 1：ETHUSDT 做多 125 倍杠杆

```bash
# 返回 JSON（包含 base64 图片）
curl "http://localhost:3000/api/generate?tradepair=ETHUSDT&opendate=2025-12-01%2008:30&date=2025-12-03%2012:45&direction=long&lev=125"

# 解析并保存图片
curl -s "http://localhost:3000/api/generate?tradepair=ETHUSDT&opendate=2025-12-01%2008:30&date=2025-12-03%2012:45&direction=long&lev=125" | \
  python3 -c "import sys, json, base64; \
    result = json.load(sys.stdin); \
    base64.b64decode(result['data']['base64']) if result['success'] else sys.exit(1)" > output.png
```

### 示例 2：BTCUSDT 做空 50 倍杠杆

```bash
curl "http://localhost:3000/api/generate?tradepair=BTCUSDT&opendate=2025-11-25%2010:00&date=2025-11-26%2018:30&direction=short&lev=50"
```

### 示例 3：使用默认参数（做多 10 倍）

```bash
curl "http://localhost:3000/api/generate?tradepair=ETHUSDT&opendate=2025-12-01%2000:00&date=2025-12-02%2012:00"
```

---

## 返回说明

### 成功响应

- **Content-Type**: `application/json`
- **状态码**: `200`

```json
{
  "success": true,
  "data": {
    "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
    "base64": "iVBORw0KGgoAAAANSUhEUgAA...",
    "format": "png",
    "width": 908,
    "height": 1280,
    "params": {
      "opendate": "2025-11-20 10:00",
      "date": "2025-11-26 19:16",
      "direction": "short",
      "lev": 100,
      "entprice": 3047.51,
      "lastprice": 2915.31,
      "yield": "+433.80%"
    }
  }
}
```

**字段说明：**

| 字段 | 说明 |
|------|------|
| `image` | 完整的 base64 data URL，可直接用于 `<img src="">` |
| `base64` | 纯 base64 字符串（不含 `data:image/png;base64,` 前缀） |
| `format` | 图片格式，固定为 `png` |
| `width` | 图片宽度（像素） |
| `height` | 图片高度（像素） |
| `params` | 生成参数和计算结果 |

### 错误响应

- **Content-Type**: `application/json`
- **状态码**: `400` 或 `500`

```json
{
  "success": false,
  "error": "错误类型",
  "message": "错误详情"
}
```

### 错误码说明

| 状态码 | 错误类型 | 说明 |
|--------|----------|------|
| 400 | 缺少必要参数 | 未提供 `opendate` 或 `date` 参数 |
| 400 | 杠杆倍数无效 | `lev` 不在 1-500 范围内 |
| 400 | 方向无效 | `direction` 不是 `long` 或 `short` |
| 500 | 生成失败 | 服务器内部错误或价格获取失败 |

---

## 各语言调用示例

### Python

```python
import requests
import base64

params = {
    'tradepair': 'ETHUSDT',
    'opendate': '2025-12-01 08:30',
    'date': '2025-12-03 12:45',
    'direction': 'long',
    'lev': 125
}

response = requests.get('http://localhost:3000/api/generate', params=params)

if response.status_code == 200:
    result = response.json()
    if result['success']:
        # 方式1: 使用完整 data URL
        image_data_url = result['data']['image']
        with open('output.png', 'wb') as f:
            f.write(base64.b64decode(image_data_url.split(',')[1]))
        
        # 方式2: 使用纯 base64 字符串
        image_base64 = result['data']['base64']
        with open('output2.png', 'wb') as f:
            f.write(base64.b64decode(image_base64))
        
        print('图片保存成功')
        print('收益率:', result['data']['params']['yield'])
    else:
        print('错误:', result.get('message'))
else:
    print('HTTP 错误:', response.status_code)
```

### JavaScript (Node.js)

```javascript
const http = require('http');
const fs = require('fs');

const url = 'http://localhost:3000/api/generate?opendate=2025-12-01%2008:30&date=2025-12-03%2012:45&direction=long&lev=125';

http.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const result = JSON.parse(data);
    if (result.success) {
      // 从 base64 字符串解码图片
      const base64Data = result.data.base64;
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync('output.png', buffer);
      console.log('图片保存成功');
      console.log('收益率:', result.data.params.yield);
    } else {
      console.error('错误:', result.message);
    }
  });
});
```

### JavaScript (浏览器/Fetch)

```javascript
async function generateImage() {
  const params = new URLSearchParams({
    opendate: '2025-12-01 08:30',
    date: '2025-12-03 12:45',
    direction: 'long',
    lev: '125'
  });
  
  const response = await fetch(`http://localhost:3000/api/generate?${params}`);
  const result = await response.json();
  
  if (result.success) {
    // 方式1: 直接使用 data URL 显示图片
    const img = document.createElement('img');
    img.src = result.data.image;
    document.body.appendChild(img);
    
    // 方式2: 下载图片
    const a = document.createElement('a');
    a.href = result.data.image;
    a.download = 'eth-pnl.png';
    a.click();
    
    console.log('收益率:', result.data.params.yield);
  } else {
    console.error('错误:', result.message);
  }
}
```

### PHP

```php
<?php
$params = http_build_query([
    'opendate' => '2025-12-01 08:30',
    'date' => '2025-12-03 12:45',
    'direction' => 'long',
    'lev' => 125
]);

$url = "http://localhost:3000/api/generate?" . $params;
$response = file_get_contents($url);
$result = json_decode($response, true);

if ($result && $result['success']) {
    // 从 base64 解码图片
    $base64 = $result['data']['base64'];
    $image = base64_decode($base64);
    file_put_contents('output.png', $image);
    
    echo "图片保存成功\n";
    echo "收益率: " . $result['data']['params']['yield'] . "\n";
} else {
    echo "错误: " . ($result['message'] ?? '未知错误');
}
?>
```

### Java

```java
import java.net.*;
import java.io.*;
import java.util.Base64;
import org.json.JSONObject;

public class ApiClient {
    public static void main(String[] args) throws Exception {
        String url = "http://localhost:3000/api/generate" +
            "?opendate=2025-12-01%2008:30" +
            "&date=2025-12-03%2012:45" +
            "&direction=long" +
            "&lev=125";
        
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setRequestMethod("GET");
        
        if (conn.getResponseCode() == 200) {
            BufferedReader in = new BufferedReader(
                new InputStreamReader(conn.getInputStream())
            );
            StringBuilder response = new StringBuilder();
            String line;
            while ((line = in.readLine()) != null) {
                response.append(line);
            }
            in.close();
            
            JSONObject json = new JSONObject(response.toString());
            if (json.getBoolean("success")) {
                JSONObject data = json.getJSONObject("data");
                String base64 = data.getString("base64");
                
                // 解码 base64 图片
                byte[] imageBytes = Base64.getDecoder().decode(base64);
                FileOutputStream out = new FileOutputStream("output.png");
                out.write(imageBytes);
                out.close();
                
                System.out.println("图片保存成功");
                System.out.println("收益率: " + 
                    data.getJSONObject("params").getString("yield"));
            }
        }
    }
}
```

---

## 注意事项

1. **时间格式**：必须使用 `YYYY-MM-DD HH:mm` 格式，时间为 UTC+8 北京时间
2. **时间范围**：`opendate` 应该早于 `date`，且都应在 Binance 有历史数据的范围内
3. **URL 编码**：空格需要编码为 `%20`
4. **跨域支持**：API 已启用 CORS，可从浏览器直接调用
5. **响应时间**：首次请求约 2-3 秒（需要加载字体），后续请求约 1 秒

---

## 服务器部署

### 启动服务

```bash
cd /path/to/project
npm install
node server.js
```

### 服务运行日志示例

```
🚀 ETH 晒单收益模拟 API 已启动
   地址: http://localhost:3000
   使用 Playwright 渲染，支持 Google Fonts

✅ Playwright 浏览器已就绪

📊 生成晒单请求:
   开仓时间: 2025-12-01 08:30
   显示时间: 2025-12-03 12:45
   方向: 做多
   杠杆: 125x
   开仓价 (entprice): 2893.53
   最新价 (lastprice): 3052.97
   收益率 (yield): +688.78%
   ✅ 图片生成成功
```

# 公共访问说明

## 🚀 服务状态

- **本地地址**: http://localhost:3070
- **公共地址**: https://nathalie-clothlike-urgently.ngrok-free.dev

## 📝 公共 API 使用示例

### 生成 ETHUSDT 晒单图片

```bash
curl "https://nathalie-clothlike-urgently.ngrok-free.dev/api/generate?tradepair=ETHUSDT&opendate=2025-12-01%2008:30&date=2025-12-03%2012:45&direction=long&lev=125"
```

### 返回 JSON 格式（包含 base64 图片）

```json
{
  "success": true,
  "data": {
    "image": "data:image/png;base64,...",
    "base64": "...",
    "format": "png",
    "width": 908,
    "height": 1280,
    "params": {
      "tradepair": "ETHUSDT",
      "entprice": 2893.53,
      "lastprice": 3052.97,
      "yield": "+688.78%"
    }
  }
}
```

## 🔧 服务管理

### 查看服务状态

```bash
# 检查服务是否运行
lsof -ti:3070

# 检查 ngrok 状态
curl http://localhost:4040/api/tunnels
```

### 重启服务

```bash
# 停止服务
lsof -ti:3070 | xargs kill -9

# 启动服务
cd /Users/leo/Desktop/create && node server.js

# 启动 ngrok（新终端）
ngrok http 3070
```

## ⚠️ 注意事项

1. **ngrok 免费版限制**:
   - 每次启动 URL 可能会变化
   - 有请求数量限制
   - 需要访问确认页面（首次访问）

2. **保持服务运行**:
   - 确保服务器不关机
   - ngrok 需要保持运行状态

3. **更稳定的方案**:
   - 使用 ngrok 付费版（固定域名）
   - 部署到云服务器（VPS）
   - 使用其他内网穿透服务（frp、natapp 等）

## 🌐 其他访问方式

### 1. 使用 Cloudflare Tunnel（免费固定域名）

```bash
# 安装 cloudflared
brew install cloudflare/cloudflare/cloudflared

# 启动隧道
cloudflared tunnel --url http://localhost:3070
```

### 2. 部署到云服务器

- 购买 VPS（阿里云、腾讯云等）
- 配置域名和 SSL 证书
- 使用 PM2 保持服务运行

## 📞 测试 API

访问浏览器查看 API 文档：
https://nathalie-clothlike-urgently.ngrok-free.dev

