# Solana Devnet 自动领取测试币项目 PRD

## 项目概述
开发一个自动化工具，用于在Solana devnet上批量领取测试币SOL，并实现智能的IP轮换和余额管理功能。

## 核心需求

### 1. 自动领取功能
- 通过 `solana airdrop <n>` 命令领取SOL
- 每次领取2-5 SOL
- 处理频率和IP限制问题

### 2. IP轮换管理
- 集成Clash Verge代理切换
- 代理API: http://127.0.0.1:9097/proxies
- 代理组: "BV用户后台!"
- 仅使用美国和亚洲节点

### 3. 账户管理
- 生成并管理50个Solana账户
- 账户信息本地备份存储
- 轮流使用账户进行请求

### 4. 余额合并
- 监控账户余额
- 余额≥2 SOL时自动转账到主账户
- 主账户地址通过配置文件设置

### 5. 定时任务
- 定时任务模式运行
- 适合夜间运行（工作时间外）

### 6. 监控界面
- 简单Web界面查看运行状态
- 实时余额显示
- 运行在3008端口

## 技术规格

### 技术栈
- **后端**: Node.js
- **脚本**: Shell (zsh)
- **前端**: 简单HTML/CSS/JS
- **数据存储**: JSON文件

### 运行策略
- **请求间隔**: 30-120秒随机
- **IP轮换频率**: 每5-8次请求后轮换
- **账户冷却时间**: 30分钟
- **失败阈值**: 连续失败10次后暂停
- **日志保留**: 7天

### 错误处理
- 网络错误: 重试3次，递增间隔
- 频率限制: 立即轮换IP，等待5分钟重试
- 余额不足: 记录日志，跳过转账
- 账户异常: 暂时禁用24小时
- 代理失败: 切换下一个可用代理

## 项目结构
```
solana-airdrop-automation/
├── config/
│   ├── config.json          # 主配置文件
│   └── accounts.json        # 账户信息
├── src/
│   ├── main.js             # 主程序入口
│   ├── account-manager.js   # 账户管理模块
│   ├── proxy-manager.js     # 代理管理模块
│   ├── solana-client.js     # Solana操作封装
│   ├── scheduler.js         # 定时任务调度
│   └── web-server.js        # Web监控服务
├── scripts/
│   ├── solana-airdrop.sh    # airdrop执行脚本
│   ├── solana-transfer.sh   # 转账执行脚本
│   └── solana-balance.sh    # 余额查询脚本
├── web/
│   ├── index.html          # 监控界面
│   ├── style.css           # 样式文件
│   └── script.js           # 前端逻辑
├── logs/                   # 日志目录
├── package.json
├── README.md
└── PRD.md                  # 本文档
```

## 配置参数

### config.json 主要配置
- 主账户地址
- 运行时间窗口
- 请求间隔范围
- 失败重试配置
- Web服务端口
- 日志级别

### 代理配置
- Clash API地址
- 代理组名称
- 节点筛选规则
- 轮换策略

## 成功标准
1. 能够稳定运行定时任务
2. 成功规避Solana airdrop限制
3. IP轮换功能正常工作
4. 余额自动合并到主账户
5. Web界面能够正常显示状态
6. 错误处理机制有效
7. 日志记录完整准确

## 风险和限制
- Solana devnet可能调整airdrop政策
- Clash代理的稳定性依赖
- 网络环境变化影响
- 需要合理控制请求频率避免被封

## 项目时间线
- 阶段1: 基础架构搭建 (1天)
- 阶段2: 核心功能开发 (2天)
- 阶段3: 集成测试和优化 (1天)
- 阶段4: 文档和部署 (0.5天)

总计: 4.5天开发周期

## 近期新增/变更需求（2025年6月）

1. 账户生成保护
   - 仅允许在 accounts.json 为空时生成新账户，否则抛出错误并要求手动清空，防止误覆盖历史账户。
   - 移除了“余额大于1 SOL时禁止生成账户”的旧保护逻辑。

2. 余额合并与UI优化
   - 前端账户管理卡片新增“合并余额”按钮，支持一键将所有子账户余额归集到主账户。
   - “刷新余额”“合并余额”按钮与主账户余额同行显示，提升操作便捷性和美观性。

3. 代理与状态显示
   - 前端支持显示当前代理节点名称，兼容后端返回的对象/字符串格式。
   - 前端显示Solana网络名称。
   - 代理切换按钮、重启按钮逻辑优化：重启按钮始终可用，代理切换按钮运行中不再禁用。

4. 统计与状态同步
   - 后端 /api/stats 保证 totalSol 与 totalEarned 始终同步。
   - /api/status 返回的 proxy 字段统一为对象格式，前端兼容处理。

5. 余额合并安全性
   - 合并余额操作前不再强制要求所有子账户余额先合并。
   - 账户生成、合并等操作不再自动覆盖高余额账户，完全由用户手动控制。

6. 其它
   - 明确禁止对 markAirdropLimitReachedToday 等关键业务逻辑做无关更改。
   - 建议本地开发/运行优先使用 node start.js，便于信号和异常处理。

> 本节内容为开发过程中根据实际需求和用户反馈动态补充，所有变更已在主分支实现并验证。
