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



