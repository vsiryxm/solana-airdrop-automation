#!/bin/zsh

# Solana 空投监控系统 - Web服务重启脚本
# 日期: 2025-06-07

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 项目目录
PROJECT_DIR="/Users/yangxinmin/workspace/solproject/solana-airdrop-automation"
WEB_SERVER_SCRIPT="src/web-server.js"
PID_FILE="$PROJECT_DIR/web-server.pid"
PORT=3008

echo -e "${BLUE}🔄 Solana 空投监控系统 - Web服务重启脚本${NC}"
echo "========================================"

# 检查端口是否被占用
PIDS=($(lsof -ti tcp:$PORT))
if [[ ${#PIDS[@]} -gt 0 ]]; then
  echo "端口 $PORT 被进程 ${PIDS[@]} 占用，正在终止..."
  kill -9 "${PIDS[@]}"
  echo "已释放端口 $PORT"
else
  echo "端口 $PORT 未被占用"
fi

echo "重启服务..."
nohup node start.js > logs/web-server.log 2>&1 &
echo "服务已重启，日志输出到 logs/web-server.log"

echo "========================================"
echo -e "${GREEN}🎉 操作完成！${NC}"
