# Solana 空投自动化系统

一个 Solana devnet 自动空投工具，支持多账户管理、IP 轮换、自动余额转移和 Web 监控界面。

## ✨ 主要功能

- 🪙 **自动空投**: 自动执行 `solana airdrop` 命令，每次 2-5 SOL
- 🌐 **IP 轮换**: 集成 Clash Verge 代理，支持美国/亚洲节点切换
- 👥 **多账户管理**: 管理 50 个账户，支持轮换和冷却机制
- 💰 **自动转账**: 账户余额 ≥2 SOL 时自动转移到主账户
- ⏰ **定时任务**: 支持夜间自动运行模式
- 📊 **Web 监控**: 端口 3008 提供实时监控界面
- 🛡️ **错误处理**: 熔断机制，连续失败 10 次后暂停
- 📝 **日志管理**: 7 天日志滚动保留

## 🚀 快速开始

### 环境要求

- Node.js >= 16.0.0
- Yarn 包管理器
- Solana CLI 工具
- Clash Verge 代理软件（可选）

### 安装步骤

1. **克隆项目**
   ```bash
   git clone https://github.com/vsiryxm/solana-airdrop-automation.git
   cd solana-airdrop-automation
   ```

2. **安装依赖**
   ```bash
   yarn install
   ```

3. **配置系统**
   
   编辑 `config/config.json`：
   ```json
   {
     "solana": {
       "network": "devnet",
       "rpcUrl": "https://api.devnet.solana.com",
       "mainAccount": "你的主账户地址"
     },
     "proxy": {
       "enabled": true,
       "clashApiUrl": "http://127.0.0.1:9097",
       "proxyGroup": "BV用户后台!",
       "allowedRegions": ["🇺🇸", "🇸🇬", "🇯🇵", "🇭🇰"]
     }
   }
   ```

4. **生成账户**
   ```bash
   yarn run generate-accounts [num]
   ```

5. **启动系统**
   ```bash
   yarn start
   ```

### Web 监控界面

启动后访问 http://localhost:3008 查看实时监控界面，包括：

- 系统运行状态
- 账户余额和状态
- 空投统计信息
- 实时日志显示
- 系统控制面板

## 📋 配置说明

### config/config.json

```json
{
  "solana": {
    "network": "devnet",
    "rpcUrl": "https://api.devnet.solana.com",
    "mainAccount": "",
    "airdropAmount": 2,
    "maxAirdropAmount": 5,
    "transferThreshold": 2
  },
  "proxy": {
    "enabled": true,
    "clashApiUrl": "http://127.0.0.1:9097",
    "proxyGroup": "BV用户后台!",
    "allowedRegions": ["🇺🇸", "🇸🇬", "🇯🇵", "🇭🇰"],
    "switchInterval": 300000,
    "timeout": 30000
  },
  "accounts": {
    "count": 50,
    "cooldownTime": 1800000,
    "rotationInterval": 600000
  },
  "scheduler": {
    "mode": "scheduled",
    "timeWindow": {
      "start": "22:00",
      "end": "06:00"
    },
    "interval": 60000,
    "maxConsecutiveFailures": 10
  },
  "web": {
    "port": 3008,
    "cors": true
  },
  "logging": {
    "level": "info",
    "maxFiles": "7d",
    "maxSize": "20m"
  }
}
```

### 配置项说明

- **solana.mainAccount**: 设置主账户地址用于接收转账
- **proxy.enabled**: 是否启用代理功能
- **accounts.count**: 管理的账户数量
- **scheduler.mode**: 运行模式（continuous/scheduled）
- **scheduler.timeWindow**: 定时运行的时间窗口

## 🎮 使用方法

### 命令行启动

```bash
# 正常启动
yarn start

# 开发模式（详细日志）
yarn run dev

# 仅启动 Web 界面
yarn run web

# 生成新账户
yarn run generate-accounts

# 检查所有账户余额
yarn run check-balance
```

### Web 界面控制

访问 http://localhost:3008 使用 Web 界面：

1. **系统状态**: 查看运行状态、代理信息、失败次数
2. **统计信息**: 空投次数、获得 SOL 总量、转账次数
3. **账户管理**: 查看所有账户余额和状态
4. **实时日志**: 查看系统运行日志
5. **控制面板**: 启动/停止系统、切换代理、重置统计

### 系统控制

- **启动系统**: 开始自动空投流程
- **停止系统**: 停止所有操作
- **切换代理**: 手动切换到下一个可用代理
- **重置系统**: 清除统计数据和错误计数

## 📊 监控和日志

### 日志文件

日志文件保存在 `logs/` 目录：

- `application-YYYY-MM-DD.log`: 主应用日志
- `error-YYYY-MM-DD.log`: 错误日志
- 自动滚动，保留 7 天

### Web 监控

实时 Web 界面提供：

- 📈 系统运行状态监控
- 💰 账户余额实时更新  
- 📊 空投统计和趋势
- 🌐 代理连接状态
- 📝 实时日志流

### 关键指标

- **成功率**: 空投成功次数 / 总尝试次数
- **平均余额**: 所有账户的平均余额
- **运行时间**: 系统连续运行时长
- **代理状态**: 当前使用的代理节点

## 🛠️ 故障排除

### 常见问题

1. **Solana CLI 不可用**
   ```bash
   # 安装 Solana CLI
   sh -c "$(curl -sSfL https://release.solana.com/v1.18.18/install)"
   
   # 设置网络
   solana config set --url devnet
   ```

2. **代理连接失败**
   - 确保 Clash Verge 正在运行
   - 验证 API 地址 http://127.0.0.1:9097
   - 检查代理组名称是否正确

3. **账户生成失败**
   ```bash
   # 手动生成账户
   yarn run generate-accounts
   ```

4. **端口占用**
   ```bash
   # 修改 Web 端口
   # 编辑 config/config.json 中的 web.port
   ```

### 调试模式

启用调试模式获取详细日志：

```bash
yarn run dev
```

### 系统重置

完全重置系统状态：

1. 停止系统
2. 删除 `config/accounts.json`
3. 清空 `logs/` 目录
4. 重新生成账户

## 🔧 高级配置

### 自定义空投策略

```json
{
  "solana": {
    "airdropAmount": 2,
    "maxAirdropAmount": 5,
    "transferThreshold": 2,
    "retryAttempts": 3,
    "retryDelay": 5000
  }
}
```

### 代理轮换策略

```json
{
  "proxy": {
    "switchInterval": 300000,
    "healthCheckInterval": 60000,
    "maxFailuresBeforeSwitch": 3,
    "preferredRegions": ["🇺🇸", "🇸🇬"]
  }
}
```

### 调度优化

```json
{
  "scheduler": {
    "maxConcurrentOperations": 1,
    "operationTimeout": 120000,
    "batchSize": 5,
    "batchDelay": 30000
  }
}
```

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## ⚠️ 免责声明

本工具仅用于 Solana devnet 测试环境，请勿用于主网或违法用途。使用者需自行承担风险。

## 📞 支持

如有问题，请通过以下方式联系：

- GitHub Issues
- Email: blockman1024@gmail.com

---

**Happy Coding! 🚀**
