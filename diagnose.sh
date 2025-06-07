#!/bin/bash

# Solana 空投监控系统 - 全面诊断脚本
# 作者: GitHub Copilot
# 日期: 2025-06-07

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

# 项目配置
PROJECT_DIR="/Users/yangxinmin/workspace/solproject/solana-airdrop-automation"
WEB_PORT=3008
API_BASE_URL="http://localhost:$WEB_PORT"

# 诊断结果统计
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNING_CHECKS=0

# 函数：打印标题
print_header() {
    echo -e "${WHITE}================================================${NC}"
    echo -e "${CYAN}🩺 Solana 空投监控系统 - 全面诊断工具${NC}"
    echo -e "${WHITE}================================================${NC}"
    echo -e "${BLUE}📅 诊断时间: $(date '+%Y-%m-%d %H:%M:%S')${NC}"
    echo -e "${BLUE}📁 项目目录: $PROJECT_DIR${NC}"
    echo ""
}

# 函数：检查结果记录
check_result() {
    local status=$1
    local message=$2
    local details=$3
    
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    case $status in
        "PASS")
            PASSED_CHECKS=$((PASSED_CHECKS + 1))
            echo -e "${GREEN}✅ PASS${NC} - $message"
            ;;
        "FAIL")
            FAILED_CHECKS=$((FAILED_CHECKS + 1))
            echo -e "${RED}❌ FAIL${NC} - $message"
            ;;
        "WARN")
            WARNING_CHECKS=$((WARNING_CHECKS + 1))
            echo -e "${YELLOW}⚠️  WARN${NC} - $message"
            ;;
    esac
    
    if [ ! -z "$details" ]; then
        echo -e "   ${CYAN}ℹ️  详情: $details${NC}"
    fi
}

# 函数：环境检查
check_environment() {
    echo -e "${PURPLE}🔧 环境检查${NC}"
    echo "----------------------------------------"
    
    # 检查Node.js
    if command -v node >/dev/null 2>&1; then
        local node_version=$(node --version)
        check_result "PASS" "Node.js 已安装" "版本: $node_version"
    else
        check_result "FAIL" "Node.js 未安装" "请安装 Node.js"
    fi
    
    # 检查npm
    if command -v npm >/dev/null 2>&1; then
        local npm_version=$(npm --version)
        check_result "PASS" "npm 已安装" "版本: $npm_version"
    else
        check_result "FAIL" "npm 未安装" "请安装 npm"
    fi
    
    # 检查项目目录
    if [ -d "$PROJECT_DIR" ]; then
        check_result "PASS" "项目目录存在" "$PROJECT_DIR"
    else
        check_result "FAIL" "项目目录不存在" "$PROJECT_DIR"
        return
    fi
    
    cd "$PROJECT_DIR"
    
    # 检查package.json
    if [ -f "package.json" ]; then
        check_result "PASS" "package.json 存在"
    else
        check_result "FAIL" "package.json 不存在"
    fi
    
    # 检查node_modules
    if [ -d "node_modules" ]; then
        check_result "PASS" "依赖已安装 (node_modules存在)"
    else
        check_result "WARN" "依赖未安装" "运行 npm install"
    fi
    
    echo ""
}

# 函数：文件结构检查
check_file_structure() {
    echo -e "${PURPLE}📁 文件结构检查${NC}"
    echo "----------------------------------------"
    
    # 关键文件列表
    local critical_files=(
        "src/main.js"
        "src/web-server.js"
        "src/solana-client.js"
        "src/account-manager.js"
        "src/proxy-manager.js"
        "web/index.html"
        "web/script.js"
        "web/style.css"
        "config/config.json"
        "config/accounts.json"
    )
    
    # 关键目录列表
    local critical_dirs=(
        "src"
        "web"
        "config"
        "logs"
        "scripts"
    )
    
    # 检查目录
    for dir in "${critical_dirs[@]}"; do
        if [ -d "$dir" ]; then
            check_result "PASS" "目录存在: $dir"
        else
            check_result "FAIL" "目录缺失: $dir"
        fi
    done
    
    # 检查文件
    for file in "${critical_files[@]}"; do
        if [ -f "$file" ]; then
            check_result "PASS" "文件存在: $file"
        else
            check_result "FAIL" "文件缺失: $file"
        fi
    done
    
    echo ""
}

# 函数：进程检查
check_processes() {
    echo -e "${PURPLE}🔍 进程检查${NC}"
    echo "----------------------------------------"
    
    # 检查Web服务器进程
    local web_pids=$(pgrep -f "node src/web-server.js" 2>/dev/null || true)
    if [ ! -z "$web_pids" ]; then
        check_result "PASS" "Web服务器进程运行中" "PID: $web_pids"
    else
        check_result "FAIL" "Web服务器进程未运行"
    fi
    
    # 检查主程序进程
    local main_pids=$(pgrep -f "node src/main.js\|node start.js" 2>/dev/null || true)
    if [ ! -z "$main_pids" ]; then
        check_result "PASS" "主程序进程运行中" "PID: $main_pids"
    else
        check_result "WARN" "主程序进程未运行" "这是正常的，除非你正在运行空投服务"
    fi
    
    # 检查端口占用
    local port_check=$(lsof -ti:$WEB_PORT 2>/dev/null || true)
    if [ ! -z "$port_check" ]; then
        check_result "PASS" "端口 $WEB_PORT 正在监听" "PID: $port_check"
    else
        check_result "FAIL" "端口 $WEB_PORT 未监听"
    fi
    
    echo ""
}

# 函数：网络连接检查
check_network() {
    echo -e "${PURPLE}🌐 网络连接检查${NC}"
    echo "----------------------------------------"
    
    # 检查本地Web服务器连接
    if curl -s -o /dev/null -w "%{http_code}" "$API_BASE_URL" | grep -q "200\|404"; then
        check_result "PASS" "Web服务器连接正常" "$API_BASE_URL"
    else
        check_result "FAIL" "Web服务器连接失败" "$API_BASE_URL"
        return
    fi
    
    # 检查Solana网络连接
    local solana_rpc="https://api.devnet.solana.com"
    if curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$solana_rpc" | grep -q "200\|405"; then
        check_result "PASS" "Solana devnet 连接正常" "$solana_rpc"
    else
        check_result "WARN" "Solana devnet 连接超时或失败" "网络可能有问题"
    fi
    
    echo ""
}

# 函数：API端点检查
check_api_endpoints() {
    echo -e "${PURPLE}🔌 API端点检查${NC}"
    echo "----------------------------------------"
    
    # API端点列表
    local endpoints=(
        "/api/status"
        "/api/stats"
        "/api/accounts"
        "/api/config"
        "/api/logs"
    )
    
    for endpoint in "${endpoints[@]}"; do
        local response=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE_URL$endpoint" 2>/dev/null || echo "000")
        
        if [ "$response" = "200" ]; then
            check_result "PASS" "API端点正常: $endpoint" "HTTP $response"
        elif [ "$response" = "500" ]; then
            check_result "WARN" "API端点服务器错误: $endpoint" "HTTP $response"
        else
            check_result "FAIL" "API端点无响应: $endpoint" "HTTP $response"
        fi
    done
    
    echo ""
}

# 函数：配置文件检查
check_configuration() {
    echo -e "${PURPLE}⚙️  配置文件检查${NC}"
    echo "----------------------------------------"
    
    # 检查主配置文件
    if [ -f "config/config.json" ]; then
        if jq empty config/config.json 2>/dev/null; then
            check_result "PASS" "主配置文件格式正确" "config/config.json"
        else
            check_result "FAIL" "主配置文件JSON格式错误" "config/config.json"
        fi
    else
        check_result "FAIL" "主配置文件不存在" "config/config.json"
    fi
    
    # 检查账户配置文件
    if [ -f "config/accounts.json" ]; then
        if jq empty config/accounts.json 2>/dev/null; then
            local account_count=$(jq length config/accounts.json 2>/dev/null || echo "0")
            check_result "PASS" "账户配置文件格式正确" "包含 $account_count 个账户"
        else
            check_result "FAIL" "账户配置文件JSON格式错误" "config/accounts.json"
        fi
    else
        check_result "WARN" "账户配置文件不存在" "可能还未生成账户"
    fi
    
    echo ""
}

# 函数：日志文件检查
check_logs() {
    echo -e "${PURPLE}📋 日志文件检查${NC}"
    echo "----------------------------------------"
    
    # 检查日志目录
    if [ -d "logs" ]; then
        check_result "PASS" "日志目录存在" "logs/"
        
        # 检查关键日志文件
        local log_files=$(ls logs/ 2>/dev/null | wc -l | tr -d ' ')
        if [ "$log_files" -gt 0 ]; then
            check_result "PASS" "日志文件存在" "$log_files 个文件"
            
            # 检查最新的日志文件
            local latest_log=$(ls -t logs/*.log 2>/dev/null | head -1 || echo "")
            if [ ! -z "$latest_log" ]; then
                local log_size=$(stat -f%z "$latest_log" 2>/dev/null || echo "0")
                check_result "PASS" "最新日志文件" "$latest_log (${log_size} bytes)"
            fi
        else
            check_result "WARN" "日志目录为空" "可能还未产生日志"
        fi
    else
        check_result "WARN" "日志目录不存在" "将自动创建"
    fi
    
    echo ""
}

# 函数：Web界面检查
check_web_interface() {
    echo -e "${PURPLE}🖥️  Web界面检查${NC}"
    echo "----------------------------------------"
    
    # 检查HTML文件
    if [ -f "web/index.html" ]; then
        local title=$(grep -o '<title>.*</title>' web/index.html | sed 's/<title>\|<\/title>//g' || echo "未知")
        check_result "PASS" "HTML文件存在" "标题: $title"
    else
        check_result "FAIL" "HTML文件不存在" "web/index.html"
    fi
    
    # 检查JavaScript文件
    if [ -f "web/script.js" ]; then
        local js_size=$(stat -f%z "web/script.js" 2>/dev/null || echo "0")
        check_result "PASS" "JavaScript文件存在" "${js_size} bytes"
    else
        check_result "FAIL" "JavaScript文件不存在" "web/script.js"
    fi
    
    # 检查CSS文件
    if [ -f "web/style.css" ]; then
        local css_size=$(stat -f%z "web/style.css" 2>/dev/null || echo "0")
        check_result "PASS" "CSS文件存在" "${css_size} bytes"
    else
        check_result "FAIL" "CSS文件不存在" "web/style.css"
    fi
    
    echo ""
}

# 函数：性能检查
check_performance() {
    echo -e "${PURPLE}⚡ 性能检查${NC}"
    echo "----------------------------------------"
    
    # 检查内存使用
    local web_pid=$(pgrep -f "node src/web-server.js" | head -1)
    if [ ! -z "$web_pid" ]; then
        local memory_usage=$(ps -p "$web_pid" -o rss= 2>/dev/null | tr -d ' ' || echo "0")
        local memory_mb=$((memory_usage / 1024))
        
        if [ "$memory_mb" -lt 100 ]; then
            check_result "PASS" "Web服务器内存使用正常" "${memory_mb}MB"
        elif [ "$memory_mb" -lt 200 ]; then
            check_result "WARN" "Web服务器内存使用偏高" "${memory_mb}MB"
        else
            check_result "FAIL" "Web服务器内存使用过高" "${memory_mb}MB"
        fi
    else
        check_result "WARN" "无法检查内存使用" "Web服务器未运行"
    fi
    
    # 检查API响应时间
    if curl -s "$API_BASE_URL" >/dev/null 2>&1; then
        local response_time=$(curl -s -o /dev/null -w "%{time_total}" "$API_BASE_URL/api/status" 2>/dev/null || echo "9.999")
        
        # 使用awk替代bc进行计算，更可靠
        local response_ms=$(echo "$response_time" | awk '{printf "%.0f", $1 * 1000}')
        
        # 确保response_ms是数字
        if [[ "$response_ms" =~ ^[0-9]+$ ]]; then
            if [ "$response_ms" -lt 100 ]; then
                check_result "PASS" "API响应时间优秀" "${response_ms}ms"
            elif [ "$response_ms" -lt 500 ]; then
                check_result "WARN" "API响应时间一般" "${response_ms}ms"
            else
                check_result "FAIL" "API响应时间过慢" "${response_ms}ms"
            fi
        else
            check_result "WARN" "无法计算API响应时间" "测量失败"
        fi
    else
        check_result "FAIL" "无法测试API响应时间" "服务器无响应"
    fi
    
    echo ""
}

# 函数：安全检查
check_security() {
    echo -e "${PURPLE}🔒 安全检查${NC}"
    echo "----------------------------------------"
    
    # 检查敏感文件权限
    local sensitive_files=("config/config.json" "config/accounts.json")
    for file in "${sensitive_files[@]}"; do
        if [ -f "$file" ]; then
            local perms=$(stat -f%Mp%Lp "$file" 2>/dev/null || echo "unknown")
            if [[ "$perms" =~ ^[0-7][0-6][0-4]$ ]]; then
                check_result "PASS" "文件权限安全: $file" "权限: $perms"
            else
                check_result "WARN" "文件权限可能过于开放: $file" "权限: $perms"
            fi
        fi
    done
    
    # 检查敏感信息泄露
    if grep -r "private.*key\|secret\|password" config/ 2>/dev/null | grep -v "placeholder" >/dev/null; then
        check_result "WARN" "配置文件可能包含敏感信息" "请确保不要提交到版本控制"
    else
        check_result "PASS" "未发现明显的敏感信息泄露"
    fi
    
    echo ""
}

# 函数：输出诊断报告
generate_report() {
    echo -e "${WHITE}================================================${NC}"
    echo -e "${CYAN}📊 诊断报告摘要${NC}"
    echo -e "${WHITE}================================================${NC}"
    
    echo -e "${GREEN}✅ 通过检查: $PASSED_CHECKS${NC}"
    echo -e "${YELLOW}⚠️  警告检查: $WARNING_CHECKS${NC}"
    echo -e "${RED}❌ 失败检查: $FAILED_CHECKS${NC}"
    echo -e "${BLUE}📊 总计检查: $TOTAL_CHECKS${NC}"
    
    echo ""
    
    # 计算成功率
    local success_rate=0
    if [ "$TOTAL_CHECKS" -gt 0 ]; then
        success_rate=$(echo "$PASSED_CHECKS $TOTAL_CHECKS" | awk '{printf "%.1f", $1 * 100 / $2}')
    fi
    
    echo -e "${BLUE}🎯 成功率: ${success_rate}%${NC}"
    
    # 给出总体评估
    if [ "$FAILED_CHECKS" -eq 0 ] && [ "$WARNING_CHECKS" -eq 0 ]; then
        echo -e "${GREEN}🎉 系统状态: 完美${NC}"
    elif [ "$FAILED_CHECKS" -eq 0 ]; then
        echo -e "${YELLOW}👍 系统状态: 良好 (有警告)${NC}"
    elif [ "$FAILED_CHECKS" -le 2 ]; then
        echo -e "${YELLOW}⚠️  系统状态: 需要注意${NC}"
    else
        echo -e "${RED}🚨 系统状态: 需要修复${NC}"
    fi
    
    echo ""
    echo -e "${BLUE}💡 建议:${NC}"
    
    if [ "$FAILED_CHECKS" -gt 0 ]; then
        echo -e "   • 优先修复标记为 ${RED}FAIL${NC} 的问题"
    fi
    
    if [ "$WARNING_CHECKS" -gt 0 ]; then
        echo -e "   • 检查标记为 ${YELLOW}WARN${NC} 的项目"
    fi
    
    echo -e "   • 使用 ${CYAN}./quick-restart.sh${NC} 重启服务"
    echo -e "   • 使用 ${CYAN}./restart-web.sh status${NC} 检查服务状态"
    echo -e "   • 访问 ${CYAN}http://localhost:3008${NC} 查看监控界面"
    
    echo ""
    echo -e "${GREEN}诊断完成！${NC}"
}

# 主执行流程
main() {
    # 确保在正确目录中
    cd "$PROJECT_DIR" 2>/dev/null || {
        echo -e "${RED}错误: 无法进入项目目录 $PROJECT_DIR${NC}"
        exit 1
    }
    
    print_header
    check_environment
    check_file_structure
    check_processes
    check_network
    check_api_endpoints
    check_configuration
    check_logs
    check_web_interface
    check_performance
    check_security
    generate_report
}

# 执行主函数
main "$@"
