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

# 创建必要的数据目录
New-Item -ItemType Directory -Force -Path "data" | Out-Null
New-Item -ItemType Directory -Force -Path "data\sessions" | Out-Null
New-Item -ItemType Directory -Force -Path "data\uploads" | Out-Null
New-Item -ItemType Directory -Force -Path "data\temp" | Out-Null
Write-Host "   ✅ 数据目录创建完成" -ForegroundColor Green

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

# 保存登录状态脚本
$saveSessionScript = @"
@echo off
chcp 65001 >nul
title ChatPartner - 保存登录状态
color 0B

echo.
echo   ============================================
echo      ChatPartner - 保存登录状态
echo   ============================================
echo.

:: 获取脚本所在目录（项目根目录）
set "PROJECT_DIR=%~dp0chatpartner"
set "BACKEND_DIR=%PROJECT_DIR%\backend-playwright"
set "SESSIONS_DIR=%BACKEND_DIR%\data\sessions"
set "BACKUP_DIR=%BACKEND_DIR%\data\sessions_backup"

:: 检查目录是否存在
if not exist "%BACKEND_DIR%" (
    echo [错误] 未找到项目目录: %BACKEND_DIR%
    echo 请确保已正确安装 ChatPartner
    echo.
    pause
    exit /b 1
)

:: 创建备份目录
if not exist "%BACKUP_DIR%" (
    mkdir "%BACKUP_DIR%"
    echo ✅ 创建备份目录: %BACKUP_DIR%
)

:: 检查是否有session文件
if not exist "%SESSIONS_DIR%" (
    echo ℹ️  未找到session目录，可能还没有登录任何账号
    echo.
    pause
    exit /b 0
)

:: 备份所有session文件
echo 📦 正在备份登录状态...
echo.

setlocal enabledelayedexpansion
set "BACKUP_COUNT=0"
for /d %%d in ("%SESSIONS_DIR%\*") do (
    set "SESSION_NAME=%%~nxd"
    set "BACKUP_PATH=%BACKUP_DIR%\!SESSION_NAME!"
    
    :: 如果备份目录已存在，先删除
    if exist "!BACKUP_PATH!" (
        rd /s /q "!BACKUP_PATH!" 2>nul
    )
    
    :: 复制session目录
    xcopy /E /I /Y "%%d" "!BACKUP_PATH!\" >nul 2>&1
    if !errorLevel! equ 0 (
        echo   ✅ 已备份: !SESSION_NAME!
        set /a BACKUP_COUNT+=1
    ) else (
        echo   ⚠️  备份失败: !SESSION_NAME!
    )
)

:: 也备份单个session文件（兼容旧版本）
for %%f in ("%SESSIONS_DIR%\*.session") do (
    set "SESSION_FILE=%%~nxf"
    copy /Y "%%f" "%BACKUP_DIR%\%SESSION_FILE%" >nul 2>&1
    if !errorLevel! equ 0 (
        echo   ✅ 已备份文件: !SESSION_FILE!
        set /a BACKUP_COUNT+=1
    )
)

echo.
if %BACKUP_COUNT% gtr 0 (
    echo ✅ 备份完成！共备份 %BACKUP_COUNT% 个登录状态
    echo.
    echo 📁 备份位置: %BACKUP_DIR%
    echo.
    echo 💡 提示: 下次启动时会自动恢复这些登录状态
) else (
    echo ℹ️  没有找到需要备份的登录状态
)

echo.
pause
"@
$saveSessionScript | Out-File -FilePath "$INSTALL_DIR\保存登录状态.bat" -Encoding ASCII

# 恢复登录状态脚本
$restoreSessionScript = @"
@echo off
chcp 65001 >nul
title ChatPartner - 恢复登录状态
color 0B

echo.
echo   ============================================
echo      ChatPartner - 恢复登录状态
echo   ============================================
echo.

:: 获取脚本所在目录（项目根目录）
set "PROJECT_DIR=%~dp0chatpartner"
set "BACKEND_DIR=%PROJECT_DIR%\backend-playwright"
set "SESSIONS_DIR=%BACKEND_DIR%\data\sessions"
set "BACKUP_DIR=%BACKEND_DIR%\data\sessions_backup"

:: 检查备份目录是否存在
if not exist "%BACKUP_DIR%" (
    echo ℹ️  未找到备份目录，可能还没有保存过登录状态
    echo.
    pause
    exit /b 0
)

:: 确保session目录存在
if not exist "%SESSIONS_DIR%" (
    mkdir "%SESSIONS_DIR%"
    echo ✅ 创建session目录: %SESSIONS_DIR%
)

:: 恢复所有session备份
echo 📦 正在恢复登录状态...
echo.

setlocal enabledelayedexpansion
set "RESTORE_COUNT=0"
for /d %%d in ("%BACKUP_DIR%\*") do (
    set "SESSION_NAME=%%~nxd"
    set "TARGET_PATH=%SESSIONS_DIR%\!SESSION_NAME!"
    
    :: 如果目标目录已存在，先删除
    if exist "!TARGET_PATH!" (
        rd /s /q "!TARGET_PATH!" 2>nul
    )
    
    :: 复制session目录
    xcopy /E /I /Y "%%d" "!TARGET_PATH!\" >nul 2>&1
    if !errorLevel! equ 0 (
        echo   ✅ 已恢复: !SESSION_NAME!
        set /a RESTORE_COUNT+=1
    ) else (
        echo   ⚠️  恢复失败: !SESSION_NAME!
    )
)

:: 也恢复单个session文件（兼容旧版本）
for %%f in ("%BACKUP_DIR%\*.session") do (
    set "SESSION_FILE=%%~nxf"
    copy /Y "%%f" "%SESSIONS_DIR%\%SESSION_FILE%" >nul 2>&1
    if !errorLevel! equ 0 (
        echo   ✅ 已恢复文件: !SESSION_FILE!
        set /a RESTORE_COUNT+=1
    )
)

echo.
if %RESTORE_COUNT% gtr 0 (
    echo ✅ 恢复完成！共恢复 %RESTORE_COUNT% 个登录状态
) else (
    echo ℹ️  没有找到需要恢复的登录状态
)

echo.
pause
"@
$restoreSessionScript | Out-File -FilePath "$INSTALL_DIR\恢复登录状态.bat" -Encoding ASCII

# 更新启动脚本，在启动前自动恢复登录状态
$startScript = @"
@echo off
title ChatPartner v2.0
cd /d "$projectDir"

echo.
echo   ====================================
echo      ChatPartner v2.0 启动中...
echo   ====================================
echo.

REM 自动恢复登录状态
echo 📦 正在恢复登录状态...
call "%~dp0恢复登录状态.bat" >nul 2>&1

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
echo   💡 提示: 使用"保存登录状态.bat"可以备份所有登录状态
echo.
pause
"@
$startScript | Out-File -FilePath "$INSTALL_DIR\启动ChatPartner.bat" -Encoding ASCII

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

