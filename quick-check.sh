#!/bin/bash

# 快速诊断脚本 - 简化版
# 检查最关键的系统状态

echo "🩺 快速系统诊断"
echo "===================="

# 检查Web服务器
if pgrep -f "node src/web-server.js" >/dev/null; then
    echo "✅ Web服务器运行中"
else
    echo "❌ Web服务器未运行"
    echo "💡 运行: ./quick-restart.sh"
fi

# 检查端口
if lsof -i:3008 >/dev/null 2>&1; then
    echo "✅ 端口3008正在监听"
else
    echo "❌ 端口3008未监听"
fi

# 检查API
if curl -s http://localhost:3008/api/status >/dev/null 2>&1; then
    echo "✅ API响应正常"
else
    echo "❌ API无响应"
fi

# 检查关键文件
critical_files=("src/web-server.js" "web/index.html" "config/config.json")
missing_files=0

for file in "${critical_files[@]}"; do
    if [ ! -f "$file" ]; then
        echo "❌ 文件缺失: $file"
        missing_files=$((missing_files + 1))
    fi
done

if [ "$missing_files" -eq 0 ]; then
    echo "✅ 关键文件完整"
fi

echo "===================="

# 给出建议
if pgrep -f "node src/web-server.js" >/dev/null && lsof -i:3008 >/dev/null 2>&1; then
    echo "🎉 系统运行正常"
    echo "🌐 访问: http://localhost:3008"
else
    echo "🔧 需要修复，运行: ./diagnose.sh 获取详细信息"
fi
