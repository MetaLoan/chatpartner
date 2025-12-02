@echo off
title ChatPartner v2.0 安装程序
color 0B

echo.
echo   ============================================
echo      ChatPartner v2.0 - AI 群营销助手
echo            Windows 一键安装程序
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

echo 正在启动安装...
echo.

:: 运行 PowerShell 安装脚本
powershell -ExecutionPolicy Bypass -File "%~dp0install.ps1"

pause

