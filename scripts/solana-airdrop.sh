#!/bin/zsh

# Solana Airdrop Script
# Usage: ./solana-airdrop.sh <amount> <recipient> [keypair_file]

set -e

# 参数检查
if [ $# -lt 2 ]; then
    echo "Usage: $0 <amount> <recipient> [keypair_file]"
    echo "Example: $0 2 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
    exit 1
fi

AMOUNT=$1
RECIPIENT=$2
KEYPAIR_FILE=${3:-""}

# 设置Solana配置为devnet
export SOLANA_RPC_URL="https://api.devnet.solana.com"

# 确保PATH包含Solana和其他必要工具的路径
export PATH="/Users/yangxinmin/.local/share/solana/install/active_release/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

# 使用完整路径的solana命令
SOLANA_CMD="/Users/yangxinmin/.local/share/solana/install/active_release/bin/solana"

# 构建命令
if [ -n "$KEYPAIR_FILE" ]; then
    CMD="$SOLANA_CMD airdrop $AMOUNT $RECIPIENT --keypair $KEYPAIR_FILE --url devnet"
else
    CMD="$SOLANA_CMD airdrop $AMOUNT $RECIPIENT --url devnet"
fi

# 执行命令并捕获输出
echo "Executing: $CMD" >&2

# 直接执行命令，不使用eval
$SOLANA_CMD airdrop $AMOUNT $RECIPIENT --url devnet 2>&1
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo "Airdrop successful" >&2
    exit 0
elif [ $EXIT_CODE -eq 124 ]; then
    echo "Airdrop timeout after 60 seconds" >&2
    exit 124
else
    echo "Airdrop failed with exit code $EXIT_CODE" >&2
    exit $EXIT_CODE
fi
