#!/bin/bash

# Solana Balance Query Script
# Usage: ./solana-balance.sh <address> [keypair_file]

set -e

# 设置Solana PATH
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

# 参数检查
if [ $# -lt 1 ]; then
    echo "Usage: $0 <address> [keypair_file]"
    echo "Example: $0 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
    exit 1
fi

ADDRESS=$1
KEYPAIR_FILE=${2:-""}

# 设置Solana配置为devnet
export SOLANA_RPC_URL="https://api.devnet.solana.com"
SOLANA_BIN="$HOME/.local/share/solana/install/active_release/bin/solana"

# 构建命令
if [ -n "$KEYPAIR_FILE" ] && [ -f "$KEYPAIR_FILE" ]; then
    CMD="$SOLANA_BIN balance $ADDRESS --keypair $KEYPAIR_FILE --url devnet"
else
    CMD="$SOLANA_BIN balance $ADDRESS --url devnet"
fi

# 执行命令并捕获输出
echo "Executing: $CMD" >&2

# 直接执行命令
OUTPUT=$($CMD 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    # 提取余额数字（格式通常是 "X.XXXXXXX SOL"）
    BALANCE=$(echo "$OUTPUT" | grep -oE '[0-9]+(\.[0-9]+)?' | head -1)
    if [ -n "$BALANCE" ]; then
        echo "$BALANCE"
        exit 0
    else
        echo "0"
        exit 0
    fi
elif [ $EXIT_CODE -eq 124 ]; then
    echo "Balance query timeout after 30 seconds" >&2
    exit 124
else
    echo "Balance query failed with exit code $EXIT_CODE" >&2
    echo "$OUTPUT" >&2
    exit $EXIT_CODE
fi
