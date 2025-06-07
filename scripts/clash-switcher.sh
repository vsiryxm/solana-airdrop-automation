#!/bin/bash
# scripts/clash-switcher.sh
# Clash代理切换脚本

API_URL="http://127.0.0.1:9097"
GROUP_NAME="BV用户后台!"
LOG_FILE="logs/airdrop.log"

# 记录日志
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# 获取美国+亚洲节点
get_target_proxies() {
    curl -s "$API_URL/proxies" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    group_name = '$GROUP_NAME'
    if group_name in data['proxies']:
        all_proxies = data['proxies'][group_name]['all']
        # 只选择美国和亚洲节点
        target_regions = ['🇺🇸', '🇯🇵', '🇸🇬', '🇭🇰', '🇰🇷', '🇹🇼']
        exclude = ['♻️自动选择', '🔯故障转移', 'DIRECT', 'REJECT', 'Trojan', '🔥ChatGPT', 'Hysteria2']
        
        filtered = []
        for proxy in all_proxies:
            if proxy not in exclude:
                for region in target_regions:
                    if proxy.startswith(region):
                        filtered.append(proxy)
                        break
        
        for proxy in filtered:
            print(proxy)
    else:
        print('ERROR: Group not found', file=sys.stderr)
except Exception as e:
    print(f'ERROR: {e}', file=sys.stderr)
"
}

# 切换代理
switch_proxy() {
    local proxy_name="$1"
    local encoded_group=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$GROUP_NAME'))")
    
    local result=$(curl -s -X PUT "$API_URL/proxies/$encoded_group" \
         -H "Content-Type: application/json" \
         -d "{\"name\": \"$proxy_name\"}")
    
    if [ $? -eq 0 ]; then
        log "✅ 切换到节点: $proxy_name"
        return 0
    else
        log "❌ 切换节点失败: $proxy_name"
        return 1
    fi
}

# 获取当前IP
get_current_ip() {
    curl -s --connect-timeout 10 \
         --proxy "http://127.0.0.1:7897" \
         "https://api.ipify.org" 2>/dev/null || echo "获取失败"
}

# 测试代理连接
test_proxy_connection() {
    local ip=$(get_current_ip)
    if [ "$ip" != "获取失败" ] && [ -n "$ip" ]; then
        log "🌐 代理连接正常，当前IP: $ip"
        return 0
    else
        log "❌ 代理连接失败"
        return 1
    fi
}

# 切换到随机节点
switch_random_proxy() {
    # 使用数组获取代理列表
    local proxies=($(get_target_proxies))
    
    if [ ${#proxies[@]} -eq 0 ]; then
        log "❌ 没有找到目标节点"
        return 1
    fi
    
    log "📡 找到 ${#proxies[@]} 个可用节点"
    
    # 随机选择一个节点
    local random_index=$((RANDOM % ${#proxies[@]}))
    local selected_proxy="${proxies[$random_index]}"
    
    if switch_proxy "$selected_proxy"; then
        sleep 5  # 等待代理生效
        if test_proxy_connection; then
            return 0
        else
            log "⚠️ 代理切换成功但连接测试失败，继续使用"
            return 0
        fi
    else
        return 1
    fi
}

# 获取代理状态
get_proxy_status() {
    local current_proxy=$(curl -s "$API_URL/proxies/$GROUP_NAME" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('now', 'Unknown'))
except:
    print('Unknown')
")
    echo "$current_proxy"
}

# 列出所有可用节点
list_available_proxies() {
    log "📋 可用代理节点："
    get_target_proxies | while read -r proxy; do
        echo "  - $proxy"
    done
}

# 如果直接运行此脚本
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    case "${1:-switch}" in
        "switch")
            log "🚀 开始切换代理..."
            switch_random_proxy
            ;;
        "status")
            current=$(get_proxy_status)
            ip=$(get_current_ip)
            echo "当前节点: $current"
            echo "当前IP: $ip"
            ;;
        "list")
            list_available_proxies
            ;;
        "test")
            log "🧪 测试代理连接..."
            test_proxy_connection
            ;;
        *)
            echo "用法: $0 [switch|status|list|test]"
            echo "  switch - 切换到随机节点 (默认)"
            echo "  status - 显示当前状态"
            echo "  list   - 列出可用节点"
            echo "  test   - 测试代理连接"
            ;;
    esac
fi
