# ChatPartner v2.0 - Windows 一键安装脚本
# 运行方式: 以管理员身份运行 PowerShell，执行: irm https://raw.githubusercontent.com/MetaLoan/chatpartner/main/windows-installer/install.ps1 | iex

$ErrorActionPreference = "Stop"
$ProgressPreference = 'SilentlyContinue'

# 配置
$INSTALL_DIR = "$env:USERPROFILE\ChatPartner"
$REPO_URL = "https://github.com/MetaLoan/chatpartner.git"
$NODE_VERSION = "20.10.0"
$POSTGRES_VERSION = "16"

Write-Host @"

  ____  _           _   ____            _                        
 / ___|| |__   __ _| |_|  _ \ __ _ _ __| |_ _ __   ___ _ __      
| |    | '_ \ / _` | __| |_) / _` | '__| __| '_ \ / _ \ '__|     
| |___ | | | | (_| | |_|  __/ (_| | |  | |_| | | |  __/ |        
 \____ |_| |_|\__,_|\__|_|   \__,_|_|   \__|_| |_|\___|_|        
                                                                  
        AI 群营销助手 v2.0 - Windows 安装程序

"@ -ForegroundColor Cyan

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "⚠️ 请以管理员身份运行此脚本!" -ForegroundColor Red
    Write-Host "右键点击 PowerShell，选择'以管理员身份运行'" -ForegroundColor Yellow
    exit 1
}

Write-Host "📁 安装目录: $INSTALL_DIR" -ForegroundColor Green
Write-Host ""

# 创建安装目录
if (-not (Test-Path $INSTALL_DIR)) {
    New-Item -ItemType Directory -Path $INSTALL_DIR -Force | Out-Null
}

Set-Location $INSTALL_DIR

# ============================================
# 1. 安装 Chocolatey (Windows 包管理器)
# ============================================
Write-Host "🍫 检查 Chocolatey..." -ForegroundColor Yellow
if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
    Write-Host "   正在安装 Chocolatey..." -ForegroundColor Cyan
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    $env:Path = "$env:ALLUSERSPROFILE\chocolatey\bin;$env:Path"
    Write-Host "   ✅ Chocolatey 安装完成" -ForegroundColor Green
} else {
    Write-Host "   ✅ Chocolatey 已安装" -ForegroundColor Green
}

# ============================================
# 2. 安装 Node.js
# ============================================
Write-Host "📦 检查 Node.js..." -ForegroundColor Yellow
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "   正在安装 Node.js $NODE_VERSION..." -ForegroundColor Cyan
    choco install nodejs-lts -y --version=$NODE_VERSION
    $env:Path = "$env:ProgramFiles\nodejs;$env:Path"
    Write-Host "   ✅ Node.js 安装完成" -ForegroundColor Green
} else {
    $nodeVer = node -v
    Write-Host "   ✅ Node.js 已安装: $nodeVer" -ForegroundColor Green
}

# ============================================
# 3. 安装 Git
# ============================================
Write-Host "🔧 检查 Git..." -ForegroundColor Yellow
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "   正在安装 Git..." -ForegroundColor Cyan
    choco install git -y
    $env:Path = "$env:ProgramFiles\Git\bin;$env:Path"
    Write-Host "   ✅ Git 安装完成" -ForegroundColor Green
} else {
    Write-Host "   ✅ Git 已安装" -ForegroundColor Green
}

# ============================================
# 4. 安装 PostgreSQL
# ============================================
Write-Host "🐘 检查 PostgreSQL..." -ForegroundColor Yellow
$pgPath = "$env:ProgramFiles\PostgreSQL\$POSTGRES_VERSION\bin"
if (-not (Test-Path $pgPath)) {
    Write-Host "   正在安装 PostgreSQL $POSTGRES_VERSION..." -ForegroundColor Cyan
    Write-Host "   (这可能需要几分钟)" -ForegroundColor Gray
    
    # 使用 Chocolatey 安装 PostgreSQL
    choco install postgresql16 --params '/Password:chatpartner123' -y
    
    # 添加到 PATH
    $env:Path = "$pgPath;$env:Path"
    [Environment]::SetEnvironmentVariable("Path", "$pgPath;$([Environment]::GetEnvironmentVariable('Path', 'Machine'))", 'Machine')
    
    # 等待服务启动
    Start-Sleep -Seconds 5
    
    Write-Host "   ✅ PostgreSQL 安装完成" -ForegroundColor Green
} else {
    Write-Host "   ✅ PostgreSQL 已安装" -ForegroundColor Green
}

# ============================================
# 5. 创建数据库
# ============================================
Write-Host "🗄️ 配置数据库..." -ForegroundColor Yellow
$env:PGPASSWORD = "chatpartner123"
try {
    & "$pgPath\psql.exe" -U postgres -c "CREATE DATABASE chatpartner;" 2>$null
    Write-Host "   ✅ 数据库 chatpartner 创建成功" -ForegroundColor Green
} catch {
    Write-Host "   ℹ️ 数据库可能已存在" -ForegroundColor Gray
}

# ============================================
# 6. 克隆项目代码
# ============================================
Write-Host "📥 下载项目代码..." -ForegroundColor Yellow
$projectDir = "$INSTALL_DIR\chatpartner"
if (Test-Path $projectDir) {
    Write-Host "   更新现有代码..." -ForegroundColor Cyan
    Set-Location $projectDir
    git pull origin main
} else {
    Write-Host "   克隆仓库..." -ForegroundColor Cyan
    git clone $REPO_URL $projectDir
    Set-Location $projectDir
}
Write-Host "   ✅ 代码下载完成" -ForegroundColor Green

# ============================================
# 7. 安装后端依赖
# ============================================
Write-Host "📦 安装后端依赖..." -ForegroundColor Yellow
Set-Location "$projectDir\backend-playwright"

# 创建 .env 文件
$envContent = @"
DATABASE_URL="postgresql://postgres:chatpartner123@localhost:5432/chatpartner"
PORT=8080
SESSION_DIR=./data/sessions
"@
$envContent | Out-File -FilePath ".env" -Encoding UTF8

npm install
Write-Host "   ✅ 后端依赖安装完成" -ForegroundColor Green

# ============================================
# 8. 初始化数据库
# ============================================
Write-Host "🗄️ 初始化数据库表..." -ForegroundColor Yellow
npx prisma generate
npx prisma db push
Write-Host "   ✅ 数据库初始化完成" -ForegroundColor Green

# ============================================
# 9. 安装 Playwright 浏览器
# ============================================
Write-Host "🌐 安装 Playwright 浏览器..." -ForegroundColor Yellow
npx playwright install chromium
Write-Host "   ✅ 浏览器安装完成" -ForegroundColor Green

# ============================================
# 10. 安装前端依赖
# ============================================
Write-Host "📦 安装前端依赖..." -ForegroundColor Yellow
Set-Location "$projectDir\frontend"
npm install
Write-Host "   ✅ 前端依赖安装完成" -ForegroundColor Green

# ============================================
# 11. 创建启动脚本
# ============================================
Write-Host "📝 创建启动脚本..." -ForegroundColor Yellow

# 启动脚本
$startScript = @"
@echo off
title ChatPartner v2.0
cd /d "$projectDir"

echo.
echo   ====================================
echo      ChatPartner v2.0 启动中...
echo   ====================================
echo.

REM 启动后端
start "ChatPartner Backend" cmd /k "cd backend-playwright && npm run dev"

REM 等待后端启动
timeout /t 5 /nobreak > nul

REM 启动前端
start "ChatPartner Frontend" cmd /k "cd frontend && npm run dev"

REM 等待前端启动
timeout /t 5 /nobreak > nul

REM 打开浏览器
start http://localhost:3000

echo.
echo   ✅ 服务已启动!
echo   前端: http://localhost:3000
echo   后端: http://localhost:8080
echo.
pause
"@
$startScript | Out-File -FilePath "$INSTALL_DIR\启动ChatPartner.bat" -Encoding ASCII

# 停止脚本
$stopScript = @"
@echo off
echo 正在停止 ChatPartner 服务...
taskkill /f /im node.exe 2>nul
echo ✅ 服务已停止
pause
"@
$stopScript | Out-File -FilePath "$INSTALL_DIR\停止ChatPartner.bat" -Encoding ASCII

Write-Host "   ✅ 启动脚本创建完成" -ForegroundColor Green

# ============================================
# 12. 创建桌面快捷方式
# ============================================
Write-Host "🖥️ 创建桌面快捷方式..." -ForegroundColor Yellow
$WshShell = New-Object -comObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\ChatPartner.lnk")
$Shortcut.TargetPath = "$INSTALL_DIR\启动ChatPartner.bat"
$Shortcut.WorkingDirectory = $INSTALL_DIR
$Shortcut.Description = "ChatPartner AI 群营销助手"
$Shortcut.Save()
Write-Host "   ✅ 桌面快捷方式创建完成" -ForegroundColor Green

# ============================================
# 完成
# ============================================
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  ✅ ChatPartner v2.0 安装完成!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "📁 安装目录: $INSTALL_DIR" -ForegroundColor Cyan
Write-Host "🚀 启动方式: 双击桌面上的 'ChatPartner' 快捷方式" -ForegroundColor Cyan
Write-Host "🌐 访问地址: http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "是否现在启动 ChatPartner? (Y/N)" -ForegroundColor Yellow
$response = Read-Host
if ($response -eq 'Y' -or $response -eq 'y') {
    Start-Process "$INSTALL_DIR\启动ChatPartner.bat"
}

