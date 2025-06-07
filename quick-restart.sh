#!/bin/bash

# 快速重启脚本 - 简化版本

echo "🔄 快速重启Web服务..."

# 停止所有相关进程
pkill -f "node src/web-server.js" 2>/dev/null || true
pkill -f "web-server.js" 2>/dev/null || true

# 停止占用3008端口的进程
lsof -ti:3008 | xargs kill -9 2>/dev/null || true

echo "⏳ 等待进程完全停止..."
sleep 2

echo "🚀 启动新的Web服务..."

# 确保日志目录存在
mkdir -p logs

# 启动新服务
nohup node src/web-server.js > logs/web-server.log 2>&1 &

echo "✅ Web服务已重启"
echo "🌐 访问地址: http://localhost:3008"
echo "📋 查看日志: tail -f logs/web-server.log"
