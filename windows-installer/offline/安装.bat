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

:: 启动脚本（包含自动恢复登录状态）
(
echo @echo off
echo title ChatPartner v2.0
echo cd /d "%INSTALL_DIR%\chatpartner"
echo echo.
echo echo   ====================================
echo echo      ChatPartner v2.0 启动中...
echo echo   ====================================
echo echo.
echo REM 自动恢复登录状态
echo echo 📦 正在恢复登录状态...
echo call "%~dp0恢复登录状态.bat" ^>nul 2^>^&1
echo.
echo start "Backend" cmd /k "cd backend-playwright && npm run dev"
echo timeout /t 5 /nobreak ^> nul
echo start "Frontend" cmd /k "cd frontend && npm run dev"
echo timeout /t 5 /nobreak ^> nul
echo start http://localhost:3000
echo echo   服务已启动! 访问: http://localhost:3000
echo echo.
echo echo   💡 提示: 使用"保存登录状态.bat"可以备份所有登录状态
echo pause
) > "%INSTALL_DIR%\启动ChatPartner.bat"

:: 停止脚本
(
echo @echo off
echo taskkill /f /im node.exe 2^>nul
echo echo 服务已停止
echo pause
) > "%INSTALL_DIR%\停止ChatPartner.bat"

:: 保存登录状态脚本
(
echo @echo off
echo chcp 65001 ^>nul
echo title ChatPartner - 保存登录状态
echo color 0B
echo.
echo echo   ============================================
echo echo      ChatPartner - 保存登录状态
echo echo   ============================================
echo echo.
echo set "PROJECT_DIR=%~dp0chatpartner"
echo set "BACKEND_DIR=%%PROJECT_DIR%%\backend-playwright"
echo set "SESSIONS_DIR=%%BACKEND_DIR%%\data\sessions"
echo set "BACKUP_DIR=%%BACKEND_DIR%%\data\sessions_backup"
echo.
echo if not exist "%%BACKEND_DIR%%" (
echo     echo [错误] 未找到项目目录
echo     pause
echo     exit /b 1
echo )
echo.
echo if not exist "%%BACKUP_DIR%%" mkdir "%%BACKUP_DIR%%"
echo.
echo if not exist "%%SESSIONS_DIR%%" (
echo     echo ℹ️  未找到session目录，可能还没有登录任何账号
echo     pause
echo     exit /b 0
echo )
echo.
echo echo 📦 正在备份登录状态...
echo echo.
echo setlocal enabledelayedexpansion
echo set "BACKUP_COUNT=0"
echo for /d %%%%d in ("%%SESSIONS_DIR%%\*"^) do (
echo     set "SESSION_NAME=%%%%~nxd"
echo     set "BACKUP_PATH=%%BACKUP_DIR%%\!SESSION_NAME!"
echo     if exist "!BACKUP_PATH!" rd /s /q "!BACKUP_PATH!" 2^>nul
echo     xcopy /E /I /Y "%%%%d" "!BACKUP_PATH!\" ^>nul 2^>^&1
echo     if !errorLevel! equ 0 (
echo         echo   ✅ 已备份: !SESSION_NAME!
echo         set /a BACKUP_COUNT+=1
echo     )
echo )
echo for %%%%f in ("%%SESSIONS_DIR%%\*.session"^) do (
echo     set "SESSION_FILE=%%%%~nxf"
echo     copy /Y "%%%%f" "%%BACKUP_DIR%%\%%SESSION_FILE%%" ^>nul 2^>^&1
echo     if !errorLevel! equ 0 (
echo         echo   ✅ 已备份文件: !SESSION_FILE!
echo         set /a BACKUP_COUNT+=1
echo     )
echo )
echo.
echo if %%BACKUP_COUNT%% gtr 0 (
echo     echo ✅ 备份完成！共备份 %%BACKUP_COUNT%% 个登录状态
echo     echo 📁 备份位置: %%BACKUP_DIR%%
echo ) else (
echo     echo ℹ️  没有找到需要备份的登录状态
echo )
echo pause
) > "%INSTALL_DIR%\保存登录状态.bat"

:: 恢复登录状态脚本
(
echo @echo off
echo chcp 65001 ^>nul
echo title ChatPartner - 恢复登录状态
echo color 0B
echo.
echo echo   ============================================
echo echo      ChatPartner - 恢复登录状态
echo echo   ============================================
echo echo.
echo set "PROJECT_DIR=%~dp0chatpartner"
echo set "BACKEND_DIR=%%PROJECT_DIR%%\backend-playwright"
echo set "SESSIONS_DIR=%%BACKEND_DIR%%\data\sessions"
echo set "BACKUP_DIR=%%BACKEND_DIR%%\data\sessions_backup"
echo.
echo if not exist "%%BACKUP_DIR%%" exit /b 0
echo.
echo if not exist "%%SESSIONS_DIR%%" mkdir "%%SESSIONS_DIR%%"
echo.
echo echo 📦 正在恢复登录状态...
echo echo.
echo setlocal enabledelayedexpansion
echo set "RESTORE_COUNT=0"
echo for /d %%%%d in ("%%BACKUP_DIR%%\*"^) do (
echo     set "SESSION_NAME=%%%%~nxd"
echo     set "TARGET_PATH=%%SESSIONS_DIR%%\!SESSION_NAME!"
echo     if exist "!TARGET_PATH!" rd /s /q "!TARGET_PATH!" 2^>nul
echo     xcopy /E /I /Y "%%%%d" "!TARGET_PATH!\" ^>nul 2^>^&1
echo     if !errorLevel! equ 0 (
echo         echo   ✅ 已恢复: !SESSION_NAME!
echo         set /a RESTORE_COUNT+=1
echo     )
echo )
echo for %%%%f in ("%%BACKUP_DIR%%\*.session"^) do (
echo     set "SESSION_FILE=%%%%~nxf"
echo     copy /Y "%%%%f" "%%SESSIONS_DIR%%\%%SESSION_FILE%%" ^>nul 2^>^&1
echo     if !errorLevel! equ 0 (
echo         echo   ✅ 已恢复文件: !SESSION_FILE!
echo         set /a RESTORE_COUNT+=1
echo     )
echo )
echo.
echo if %%RESTORE_COUNT%% gtr 0 (
echo     echo ✅ 恢复完成！共恢复 %%RESTORE_COUNT%% 个登录状态
echo ) else (
echo     echo ℹ️  没有找到需要恢复的登录状态
echo )
) > "%INSTALL_DIR%\恢复登录状态.bat"

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

