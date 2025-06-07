#!/bin/bash
# scripts/check-environment.sh
# 系统环境检查脚本 - 用于验证运行环境是否满足要求

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查结果统计
PASS=0
FAIL=0
WARN=0

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASS++))
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAIL++))
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((WARN++))
}

# 检查命令是否存在
check_command() {
    local cmd=$1
    local required=${2:-true}
    local version_cmd=$3
    
    if command -v "$cmd" >/dev/null 2>&1; then
        if [ -n "$version_cmd" ]; then
            local version=$($version_cmd 2>/dev/null || echo "unknown")
            log_success "$cmd is installed (version: $version)"
        else
            log_success "$cmd is installed"
        fi
        return 0
    else
        if [ "$required" = "true" ]; then
            log_error "$cmd is not installed (required)"
            return 1
        else
            log_warning "$cmd is not installed (optional)"
            return 0
        fi
    fi
}

# 检查端口是否可用
check_port() {
    local port=$1
    local service=$2
    
    if lsof -i :$port >/dev/null 2>&1; then
        log_warning "Port $port is already in use (may conflict with $service)"
    else
        log_success "Port $port is available for $service"
    fi
}

# 检查目录权限
check_directory() {
    local dir=$1
    local perm=$2
    
    if [ -d "$dir" ]; then
        if [ -r "$dir" ] && [ -w "$dir" ]; then
            log_success "Directory $dir exists and is writable"
        else
            log_error "Directory $dir exists but lacks proper permissions"
        fi
    else
        log_warning "Directory $dir does not exist (will be created)"
    fi
}

# 检查网络连接
check_network() {
    local host=$1
    local port=$2
    local service=$3
    
    if timeout 5 bash -c "echo >/dev/tcp/$host/$port" 2>/dev/null; then
        log_success "Network connection to $service ($host:$port) is available"
    else
        log_error "Cannot connect to $service ($host:$port)"
    fi
}

# 检查文件是否存在
check_file() {
    local file=$1
    local required=${2:-true}
    
    if [ -f "$file" ]; then
        log_success "File $file exists"
        return 0
    else
        if [ "$required" = "true" ]; then
            log_error "File $file does not exist (required)"
            return 1
        else
            log_warning "File $file does not exist (optional)"
            return 0
        fi
    fi
}

echo "================================================"
echo "🔍 Solana Airdrop Automation - Environment Check"
echo "================================================"
echo ""

# 1. 操作系统检查
log_info "Checking operating system..."
OS=$(uname -s)
case "$OS" in
    Darwin)
        log_success "Running on macOS"
        PACKAGE_MANAGER="brew"
        ;;
    Linux)
        log_success "Running on Linux"
        if command -v apt >/dev/null 2>&1; then
            PACKAGE_MANAGER="apt"
        elif command -v yum >/dev/null 2>&1; then
            PACKAGE_MANAGER="yum"
        elif command -v pacman >/dev/null 2>&1; then
            PACKAGE_MANAGER="pacman"
        else
            PACKAGE_MANAGER="unknown"
        fi
        ;;
    *)
        log_error "Unsupported operating system: $OS"
        ;;
esac

echo ""

# 2. 必需的命令行工具检查
log_info "Checking required command line tools..."
check_command "node" true "node --version"
check_command "npm" true "npm --version"
check_command "yarn" true "yarn --version"
check_command "python3" true "python3 --version"
check_command "curl" true "curl --version | head -1"
check_command "git" true "git --version"

echo ""

# 3. Solana CLI 检查
log_info "Checking Solana CLI..."
check_command "solana" true "solana --version"
check_command "solana-keygen" true "solana-keygen --version"

if command -v solana >/dev/null 2>&1; then
    # 检查Solana配置
    SOLANA_CONFIG=$(solana config get 2>/dev/null || echo "")
    if echo "$SOLANA_CONFIG" | grep -q "devnet"; then
        log_success "Solana is configured for devnet"
    else
        log_warning "Solana is not configured for devnet"
        echo "  Current config:"
        echo "$SOLANA_CONFIG" | sed 's/^/    /'
    fi
fi

echo ""

# 4. 可选工具检查
log_info "Checking optional tools..."
check_command "timeout" false
check_command "gtimeout" false
check_command "lsof" false

# 如果timeout和gtimeout都不存在，建议安装
if ! command -v timeout >/dev/null 2>&1 && ! command -v gtimeout >/dev/null 2>&1; then
    log_error "Neither timeout nor gtimeout is available. Please install coreutils"
    case "$PACKAGE_MANAGER" in
        brew) echo "  Install with: brew install coreutils" ;;
        apt) echo "  Install with: sudo apt install coreutils" ;;
        yum) echo "  Install with: sudo yum install coreutils" ;;
        *) echo "  Please install coreutils package" ;;
    esac
fi

echo ""

# 5. 网络连接检查
log_info "Checking network connectivity..."
check_network "api.devnet.solana.com" 443 "Solana Devnet"
check_network "127.0.0.1" 9097 "Clash API"

echo ""

# 6. 端口可用性检查
log_info "Checking port availability..."
check_port 3008 "Web Interface"
check_port 9097 "Clash API"

echo ""

# 7. 目录结构检查
log_info "Checking directory structure..."
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
check_directory "$BASE_DIR/config" "rw"
check_directory "$BASE_DIR/logs" "rw"
check_directory "$BASE_DIR/scripts" "r"
check_directory "$BASE_DIR/src" "r"
check_directory "$BASE_DIR/web" "r"

echo ""

# 8. 配置文件检查
log_info "Checking configuration files..."
check_file "$BASE_DIR/package.json" true
check_file "$BASE_DIR/config/config.json" true
check_file "$BASE_DIR/config/accounts.json" false

echo ""

# 9. Node.js 依赖检查
log_info "Checking Node.js dependencies..."
if [ -f "$BASE_DIR/package.json" ]; then
    cd "$BASE_DIR"
    
    # 检查node_modules是否存在
    if [ -d "node_modules" ]; then
        log_success "node_modules directory exists"
        
        # 检查关键依赖
        DEPS=("express" "ws" "axios" "winston" "node-cron" "fs-extra")
        for dep in "${DEPS[@]}"; do
            if [ -d "node_modules/$dep" ]; then
                log_success "Dependency $dep is installed"
            else
                log_error "Dependency $dep is missing"
            fi
        done
    else
        log_error "node_modules directory not found. Run 'yarn install' or 'npm install'"
    fi
fi

echo ""

# 10. Python 模块检查
log_info "Checking Python modules..."
if command -v python3 >/dev/null 2>&1; then
    if python3 -c "import json" 2>/dev/null; then
        log_success "Python json module is available"
    else
        log_error "Python json module is not available"
    fi
    
    if python3 -c "import sys" 2>/dev/null; then
        log_success "Python sys module is available"
    else
        log_error "Python sys module is not available"
    fi
fi

echo ""

# 11. 权限检查
log_info "Checking script permissions..."
SCRIPTS=("$BASE_DIR/scripts/clash-switcher.sh" "$BASE_DIR/scripts/solana-airdrop.sh" "$BASE_DIR/scripts/solana-balance.sh" "$BASE_DIR/scripts/solana-transfer.sh")
for script in "${SCRIPTS[@]}"; do
    if [ -f "$script" ]; then
        if [ -x "$script" ]; then
            log_success "Script $(basename $script) is executable"
        else
            log_warning "Script $(basename $script) is not executable. Run 'chmod +x $script'"
        fi
    else
        log_error "Script $(basename $script) does not exist"
    fi
done

echo ""
echo "================================================"
echo "📋 Environment Check Summary"
echo "================================================"
echo -e "${GREEN}✅ Passed: $PASS${NC}"
echo -e "${YELLOW}⚠️  Warnings: $WARN${NC}"
echo -e "${RED}❌ Failed: $FAIL${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}🎉 Environment check completed successfully!${NC}"
    echo -e "${GREEN}   Your system is ready to run Solana Airdrop Automation.${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Configure your settings in config/config.json"
    echo "2. Generate accounts: yarn run generate-accounts"
    echo "3. Start the system: yarn start"
    echo "4. Access web interface: http://localhost:3008"
    exit 0
else
    echo -e "${RED}❌ Environment check failed with $FAIL error(s).${NC}"
    echo -e "${RED}   Please fix the issues above before running the system.${NC}"
    echo ""
    echo "Common fixes:"
    case "$PACKAGE_MANAGER" in
        brew)
            echo "- Install missing tools: brew install node yarn python3 solana coreutils"
            ;;
        apt)
            echo "- Install missing tools: sudo apt update && sudo apt install nodejs npm python3 curl git"
            echo "- Install yarn: npm install -g yarn"
            echo "- Install Solana CLI: sh -c \"\$(curl -sSfL https://release.solana.com/v1.16.0/install)\""
            ;;
        yum)
            echo "- Install missing tools: sudo yum install nodejs npm python3 curl git"
            echo "- Install yarn: npm install -g yarn"
            echo "- Install Solana CLI: sh -c \"\$(curl -sSfL https://release.solana.com/v1.16.0/install)\""
            ;;
        *)
            echo "- Please install the missing tools using your system's package manager"
            ;;
    esac
    exit 1
fi
