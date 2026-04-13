#!/bin/bash

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║           QXC Serial RTT Bridge 启动器                     ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

cd "$(dirname "$0")"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "[错误] 未检测到 Node.js，请先安装 Node.js"
    echo "下载地址: https://nodejs.org/"
    exit 1
fi

# 检查 node_modules
if [ ! -d "node_modules" ]; then
    echo "[提示] 首次运行，正在安装依赖..."
    npm install
    if [ $? -ne 0 ]; then
        echo "[错误] 依赖安装失败"
        exit 1
    fi
fi

# 检查编译
if [ ! -f "dist/index.js" ]; then
    echo "[提示] 正在编译..."
    npm run build
    if [ $? -ne 0 ]; then
        echo "[错误] 编译失败"
        exit 1
    fi
fi

echo "[启动] RTT Bridge 服务启动中..."
echo ""
node dist/index.js
