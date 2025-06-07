#!/bin/zsh

# Solana Transfer Script
# Usage: ./solana-transfer.sh <amount> <recipient> <keypair_file>

set -e

# 参数检查
if [ $# -ne 3 ]; then
    echo "Usage: $0 <amount> <recipient> <keypair_file>"
    echo "Example: $0 1.5 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM /path/to/keypair.json"
    exit 1
fi

AMOUNT=$1
RECIPIENT=$2
KEYPAIR_FILE=$3

# 检查密钥文件是否存在
if [ ! -f "$KEYPAIR_FILE" ]; then
    echo "Error: Keypair file not found: $KEYPAIR_FILE" >&2
    exit 1
fi

# 设置Solana配置为devnet
export SOLANA_RPC_URL="https://api.devnet.solana.com"

# 确保PATH包含Solana和其他必要工具的路径
export PATH="/Users/yangxinmin/.local/share/solana/install/active_release/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

# 使用完整路径的solana命令
SOLANA_CMD="/Users/yangxinmin/.local/share/solana/install/active_release/bin/solana"

# 构建命令
CMD="$SOLANA_CMD transfer $RECIPIENT $AMOUNT --keypair $KEYPAIR_FILE --url devnet --allow-unfunded-recipient"

# 执行命令并捕获输出
echo "Executing: $CMD" >&2

# 直接执行命令
$SOLANA_CMD transfer $RECIPIENT $AMOUNT --keypair $KEYPAIR_FILE --url devnet --allow-unfunded-recipient 2>&1
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo "Transfer successful" >&2
    exit 0
elif [ $EXIT_CODE -eq 124 ]; then
    echo "Transfer timeout after 60 seconds" >&2
    exit 124
else
    echo "Transfer failed with exit code $EXIT_CODE" >&2
    exit $EXIT_CODE
fi
