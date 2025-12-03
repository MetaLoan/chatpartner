#!/bin/bash
# ChatPartner v2.0 - 离线安装包构建脚本
# 在 macOS/Linux 上运行，生成 Windows 离线安装包

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$SCRIPT_DIR/build"
PACKAGE_NAME="ChatPartner-v2.0-Windows-x64"

echo ""
echo "============================================"
echo "  ChatPartner v2.0 离线安装包构建工具"
echo "============================================"
echo ""

# 清理旧构建
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/$PACKAGE_NAME"

echo "📁 构建目录: $BUILD_DIR/$PACKAGE_NAME"
echo ""

# 1. 下载 Windows 依赖
echo "📥 下载 Windows 依赖..."
mkdir -p "$BUILD_DIR/$PACKAGE_NAME/installers"

# Node.js
echo "   下载 Node.js..."
curl -L -o "$BUILD_DIR/$PACKAGE_NAME/installers/node-v20.10.0-x64.msi" \
    "https://nodejs.org/dist/v20.10.0/node-v20.10.0-x64.msi"

# Git
echo "   下载 Git..."
curl -L -o "$BUILD_DIR/$PACKAGE_NAME/installers/Git-2.43.0-64-bit.exe" \
    "https://github.com/git-for-windows/git/releases/download/v2.43.0.windows.1/Git-2.43.0-64-bit.exe"

# PostgreSQL
echo "   下载 PostgreSQL..."
curl -L -o "$BUILD_DIR/$PACKAGE_NAME/installers/postgresql-16.1-1-windows-x64.exe" \
    "https://get.enterprisedb.com/postgresql/postgresql-16.1-1-windows-x64.exe"

echo "   ✅ 依赖下载完成"

# 2. 复制项目代码
echo "📦 复制项目代码..."
mkdir -p "$BUILD_DIR/$PACKAGE_NAME/chatpartner"

# 复制后端
cp -r "$PROJECT_DIR/backend-playwright" "$BUILD_DIR/$PACKAGE_NAME/chatpartner/"
# 复制前端
cp -r "$PROJECT_DIR/frontend" "$BUILD_DIR/$PACKAGE_NAME/chatpartner/"

# 删除 node_modules（稍后重新安装打包）
rm -rf "$BUILD_DIR/$PACKAGE_NAME/chatpartner/backend-playwright/node_modules"
rm -rf "$BUILD_DIR/$PACKAGE_NAME/chatpartner/frontend/node_modules"

echo "   ✅ 项目代码复制完成"

# 3. 创建离线安装脚本
echo "📝 创建离线安装脚本..."

cat > "$BUILD_DIR/$PACKAGE_NAME/安装.bat" << 'BATCH_EOF'
@echo off
chcp 65001 >nul
title ChatPartner v2.0 离线安装程序
color 0B

echo.
echo   ============================================
echo      ChatPartner v2.0 - AI 群营销助手
echo           Windows 离线安装程序
echo   ============================================
echo.

:: 检查管理员权限
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [错误] 请右键点击此文件，选择"以管理员身份运行"
    echo.
    pause
    exit /b 1
)

set "INSTALL_DIR=%USERPROFILE%\ChatPartner"
set "SCRIPT_DIR=%~dp0"

echo 安装目录: %INSTALL_DIR%
echo.

:: 创建安装目录
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

:: ============================================
:: 1. 安装 Node.js
:: ============================================
echo [1/6] 安装 Node.js...
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo       正在安装 Node.js...
    msiexec /i "%SCRIPT_DIR%installers\node-v20.10.0-x64.msi" /qn /norestart
    echo       ✓ Node.js 安装完成
) else (
    echo       ✓ Node.js 已安装
)

:: 刷新环境变量
call refreshenv.cmd 2>nul || (
    set "PATH=%ProgramFiles%\nodejs;%PATH%"
)

:: ============================================
:: 2. 安装 Git
:: ============================================
echo [2/6] 安装 Git...
where git >nul 2>&1
if %errorLevel% neq 0 (
    echo       正在安装 Git...
    "%SCRIPT_DIR%installers\Git-2.43.0-64-bit.exe" /VERYSILENT /NORESTART
    echo       ✓ Git 安装完成
) else (
    echo       ✓ Git 已安装
)

:: ============================================
:: 3. 安装 PostgreSQL
:: ============================================
echo [3/6] 安装 PostgreSQL...
if not exist "%ProgramFiles%\PostgreSQL\16" (
    echo       正在安装 PostgreSQL（可能需要几分钟）...
    "%SCRIPT_DIR%installers\postgresql-16.1-1-windows-x64.exe" ^
        --mode unattended ^
        --unattendedmodeui minimal ^
        --superpassword chatpartner123 ^
        --servicename postgresql-16 ^
        --servicepassword chatpartner123 ^
        --serverport 5432
    echo       ✓ PostgreSQL 安装完成
    
    :: 等待服务启动
    timeout /t 10 /nobreak >nul
) else (
    echo       ✓ PostgreSQL 已安装
)

:: 添加 PostgreSQL 到 PATH
set "PATH=%ProgramFiles%\PostgreSQL\16\bin;%PATH%"

:: ============================================
:: 4. 创建数据库
:: ============================================
echo [4/6] 配置数据库...
set PGPASSWORD=chatpartner123
"%ProgramFiles%\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE DATABASE chatpartner;" 2>nul
echo       ✓ 数据库配置完成

:: ============================================
:: 5. 复制项目文件
:: ============================================
echo [5/6] 复制项目文件...
xcopy /E /I /Y "%SCRIPT_DIR%chatpartner" "%INSTALL_DIR%\chatpartner" >nul
echo       ✓ 项目文件复制完成

:: ============================================
:: 6. 安装依赖并初始化
:: ============================================
echo [6/6] 安装项目依赖（可能需要几分钟）...

:: 创建 .env 文件
echo DATABASE_URL="postgresql://postgres:chatpartner123@localhost:5432/chatpartner" > "%INSTALL_DIR%\chatpartner\backend-playwright\.env"
echo PORT=8080 >> "%INSTALL_DIR%\chatpartner\backend-playwright\.env"
echo SESSION_DIR=./data/sessions >> "%INSTALL_DIR%\chatpartner\backend-playwright\.env"

:: 安装后端依赖
cd /d "%INSTALL_DIR%\chatpartner\backend-playwright"
call npm install --legacy-peer-deps
call npx prisma generate
call npx prisma db push
call npx playwright install chromium
echo       ✓ 后端依赖安装完成

:: 安装前端依赖
cd /d "%INSTALL_DIR%\chatpartner\frontend"
call npm install --legacy-peer-deps
echo       ✓ 前端依赖安装完成

:: ============================================
:: 创建启动脚本
:: ============================================
echo 创建启动脚本...

:: 启动脚本
(
echo @echo off
echo title ChatPartner v2.0
echo cd /d "%INSTALL_DIR%\chatpartner"
echo echo.
echo echo   ====================================
echo echo      ChatPartner v2.0 启动中...
echo echo   ====================================
echo echo.
echo start "ChatPartner Backend" cmd /k "cd backend-playwright && npm run dev"
echo timeout /t 5 /nobreak ^> nul
echo start "ChatPartner Frontend" cmd /k "cd frontend && npm run dev"
echo timeout /t 5 /nobreak ^> nul
echo start http://localhost:3000
echo echo.
echo echo   服务已启动!
echo echo   前端: http://localhost:3000
echo echo   后端: http://localhost:8080
echo echo.
echo pause
) > "%INSTALL_DIR%\启动ChatPartner.bat"

:: 停止脚本
(
echo @echo off
echo echo 正在停止 ChatPartner 服务...
echo taskkill /f /im node.exe 2^>nul
echo echo 服务已停止
echo pause
) > "%INSTALL_DIR%\停止ChatPartner.bat"

:: ============================================
:: 创建桌面快捷方式
:: ============================================
echo 创建桌面快捷方式...
powershell -Command "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%USERPROFILE%\Desktop\ChatPartner.lnk'); $Shortcut.TargetPath = '%INSTALL_DIR%\启动ChatPartner.bat'; $Shortcut.WorkingDirectory = '%INSTALL_DIR%'; $Shortcut.Save()"

:: ============================================
:: 完成
:: ============================================
echo.
echo ============================================
echo   ✓ ChatPartner v2.0 安装完成!
echo ============================================
echo.
echo 安装目录: %INSTALL_DIR%
echo 启动方式: 双击桌面上的 ChatPartner 快捷方式
echo 访问地址: http://localhost:3000
echo.

set /p START_NOW="是否现在启动 ChatPartner? (Y/N): "
if /i "%START_NOW%"=="Y" (
    start "" "%INSTALL_DIR%\启动ChatPartner.bat"
)

pause
BATCH_EOF

echo "   ✅ 离线安装脚本创建完成"

# 4. 复制说明文件
echo "📄 复制说明文件..."
cp "$SCRIPT_DIR/README.md" "$BUILD_DIR/$PACKAGE_NAME/"

# 5. 打包
echo "📦 创建压缩包..."
cd "$BUILD_DIR"
zip -r "$PACKAGE_NAME.zip" "$PACKAGE_NAME"

# 计算大小
SIZE=$(du -sh "$BUILD_DIR/$PACKAGE_NAME.zip" | cut -f1)

echo ""
echo "============================================"
echo "  ✅ 离线安装包构建完成!"
echo "============================================"
echo ""
echo "📦 安装包位置: $BUILD_DIR/$PACKAGE_NAME.zip"
echo "📊 安装包大小: $SIZE"
echo ""
echo "使用方法:"
echo "  1. 将 $PACKAGE_NAME.zip 复制到 Windows 电脑"
echo "  2. 解压缩"
echo "  3. 右键点击 '安装.bat'，选择'以管理员身份运行'"
echo ""



