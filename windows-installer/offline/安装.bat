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
echo [1/6] 检查 Node.js...
where node >nul 2>&1
if %errorLevel% neq 0 (
    if exist "%SCRIPT_DIR%installers\node-v20.10.0-x64.msi" (
        echo       正在安装 Node.js...
        msiexec /i "%SCRIPT_DIR%installers\node-v20.10.0-x64.msi" /qn /norestart
        set "PATH=%ProgramFiles%\nodejs;%PATH%"
        echo       √ Node.js 安装完成
    ) else (
        echo       [!] 未找到 Node.js 安装包，请手动安装
        echo       下载地址: https://nodejs.org/
    )
) else (
    echo       √ Node.js 已安装
)

:: ============================================
:: 2. 安装 Git
:: ============================================
echo [2/6] 检查 Git...
where git >nul 2>&1
if %errorLevel% neq 0 (
    if exist "%SCRIPT_DIR%installers\Git-2.43.0-64-bit.exe" (
        echo       正在安装 Git...
        "%SCRIPT_DIR%installers\Git-2.43.0-64-bit.exe" /VERYSILENT /NORESTART
        echo       √ Git 安装完成
    ) else (
        echo       [!] 未找到 Git 安装包，请手动安装
        echo       下载地址: https://git-scm.com/
    )
) else (
    echo       √ Git 已安装
)

:: ============================================
:: 3. 安装 PostgreSQL
:: ============================================
echo [3/6] 检查 PostgreSQL...
if not exist "%ProgramFiles%\PostgreSQL\16" (
    if exist "%SCRIPT_DIR%installers\postgresql-16.1-1-windows-x64.exe" (
        echo       正在安装 PostgreSQL（约需5分钟）...
        "%SCRIPT_DIR%installers\postgresql-16.1-1-windows-x64.exe" ^
            --mode unattended ^
            --unattendedmodeui minimal ^
            --superpassword chatpartner123 ^
            --servicename postgresql-16 ^
            --servicepassword chatpartner123 ^
            --serverport 5432
        echo       √ PostgreSQL 安装完成
        timeout /t 10 /nobreak >nul
    ) else (
        echo       [!] 未找到 PostgreSQL 安装包
        echo       请手动安装 PostgreSQL 16，设置密码为: chatpartner123
    )
) else (
    echo       √ PostgreSQL 已安装
)

set "PATH=%ProgramFiles%\PostgreSQL\16\bin;%PATH%"

:: ============================================
:: 4. 创建数据库
:: ============================================
echo [4/6] 配置数据库...
set PGPASSWORD=chatpartner123
"%ProgramFiles%\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE DATABASE chatpartner;" 2>nul
if %errorLevel% equ 0 (
    echo       √ 数据库创建成功
) else (
    echo       √ 数据库已存在
)

:: ============================================
:: 5. 复制项目文件
:: ============================================
echo [5/6] 复制项目文件...
if exist "%SCRIPT_DIR%chatpartner" (
    xcopy /E /I /Y "%SCRIPT_DIR%chatpartner" "%INSTALL_DIR%\chatpartner" >nul
    echo       √ 项目文件复制完成
) else (
    echo       [!] 未找到项目文件，正在从 GitHub 下载...
    cd /d "%INSTALL_DIR%"
    git clone https://github.com/MetaLoan/chatpartner.git
    echo       √ 项目下载完成
)

:: ============================================
:: 6. 配置并安装依赖
:: ============================================
echo [6/6] 安装项目依赖...

:: 创建 .env 文件
(
echo DATABASE_URL="postgresql://postgres:chatpartner123@localhost:5432/chatpartner"
echo PORT=8080
echo SESSION_DIR=./data/sessions
) > "%INSTALL_DIR%\chatpartner\backend-playwright\.env"

:: 安装后端依赖
echo       安装后端依赖...
cd /d "%INSTALL_DIR%\chatpartner\backend-playwright"

:: 创建必要的数据目录
if not exist "data" mkdir "data"
if not exist "data\sessions" mkdir "data\sessions"
if not exist "data\uploads" mkdir "data\uploads"
if not exist "data\temp" mkdir "data\temp"

call npm install --legacy-peer-deps 2>nul
call npx prisma generate
call npx prisma db push
echo       安装 Playwright 浏览器...
call npx playwright install chromium
echo       √ 后端配置完成

:: 安装前端依赖
echo       安装前端依赖...
cd /d "%INSTALL_DIR%\chatpartner\frontend"
call npm install --legacy-peer-deps 2>nul
echo       √ 前端配置完成

:: ============================================
:: 创建启动脚本
:: ============================================
echo 创建启动脚本...

(
echo @echo off
echo title ChatPartner v2.0
echo cd /d "%INSTALL_DIR%\chatpartner"
echo echo.
echo echo   ====================================
echo echo      ChatPartner v2.0 启动中...
echo echo   ====================================
echo echo.
echo start "Backend" cmd /k "cd backend-playwright && npm run dev"
echo timeout /t 5 /nobreak ^> nul
echo start "Frontend" cmd /k "cd frontend && npm run dev"
echo timeout /t 5 /nobreak ^> nul
echo start http://localhost:3000
echo echo   服务已启动! 访问: http://localhost:3000
echo pause
) > "%INSTALL_DIR%\启动ChatPartner.bat"

(
echo @echo off
echo taskkill /f /im node.exe 2^>nul
echo echo 服务已停止
echo pause
) > "%INSTALL_DIR%\停止ChatPartner.bat"

:: 创建桌面快捷方式
powershell -Command "$s = (New-Object -COM WScript.Shell).CreateShortcut('%USERPROFILE%\Desktop\ChatPartner.lnk'); $s.TargetPath = '%INSTALL_DIR%\启动ChatPartner.bat'; $s.Save()"

:: ============================================
:: 完成
:: ============================================
echo.
echo ============================================
echo   √ ChatPartner v2.0 安装完成!
echo ============================================
echo.
echo 安装目录: %INSTALL_DIR%
echo 启动方式: 双击桌面 ChatPartner 快捷方式
echo 访问地址: http://localhost:3000
echo.

set /p START_NOW="是否现在启动? (Y/N): "
if /i "%START_NOW%"=="Y" start "" "%INSTALL_DIR%\启动ChatPartner.bat"

pause

