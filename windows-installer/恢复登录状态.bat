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



