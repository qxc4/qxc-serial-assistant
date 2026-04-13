@echo off
chcp 65001 >nul
title QXC RTT Bridge

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║           QXC Serial RTT Bridge 启动器                     ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

cd /d "%~dp0"

:: 检查 Node.js 是否安装
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

:: 检查 node_modules 是否存在
if not exist "node_modules" (
    echo [提示] 首次运行，正在安装依赖...
    call npm install
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
)

:: 检查是否已编译
if not exist "dist\index.js" (
    echo [提示] 正在编译...
    call npm run build
    if %errorlevel% neq 0 (
        echo [错误] 编译失败
        pause
        exit /b 1
    )
)

echo [启动] RTT Bridge 服务启动中...
echo.
node dist/index.js

pause
