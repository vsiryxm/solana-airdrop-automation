#!/usr/bin/env node

const path = require('path');
const fs = require('fs-extra');
const chalk = require('chalk');
const historyPath = path.join(__dirname, '../data/history.json');

function initHistoryJsonIfNeeded() {
  try {
    let needInit = false;
    if (!fs.existsSync(historyPath)) {
      needInit = true;
    } else {
      try {
        const data = fs.readJsonSync(historyPath);
        if (!data || typeof data !== 'object' || !data.stats || !data.logs) {
          needInit = true;
        }
      } catch (e) {
        needInit = true;
      }
    }
    if (needInit) {
      fs.writeJsonSync(historyPath, {
        stats: {
          totalAirdrops: 0,
          successfulAirdrops: 0,
          totalTransfers: 0,
          successfulTransfers: 0,
          totalEarned: 0,
          startTime: null
        },
        logs: []
      }, { spaces: 2 });
    }
  } catch (e) {
    // 忽略
  }
}

// 程序启动时调用
initHistoryJsonIfNeeded();

// 导入所有模块
const Logger = require('./logger');
const AccountManager = require('./account-manager');
const ProxyManager = require('./proxy-manager');
const SolanaClient = require('./solana-client');
const Scheduler = require('./scheduler');
const WebServer = require('./web-server');

/**
 * Solana 空投自动化主程序
 */
class SolanaAirdropBot {
    constructor() {
        this.configPath = path.join(__dirname, '../config/config.json');
        this.config = null;
        this.logger = null;
        this.accountManager = null;
        this.proxyManager = null;
        this.solanaClient = null;
        this.scheduler = null;
        this.webServer = null;
        this.isRunning = false;
        this.startTime = null;
        
        // 统计数据
        this.stats = {
            totalAirdrops: 0,
            totalSol: 0,
            totalTransfers: 0,
            startTime: null,
            errors: []
        };
        
        // 绑定信号处理
        this.bindSignalHandlers();
    }
    
    /**
     * 初始化系统
     */
    async initialize() {
        try {
            console.log(chalk.blue('🚀 初始化 Solana 空投自动化系统...'));
            
            // 加载配置
            await this.loadConfig();
            
            // 初始化日志记录器
            this.logger = new Logger(this.config.logging);
            this.logger.info('系统初始化开始');
            
            // 初始化各个组件
            await this.initializeComponents();
            
            // 验证系统配置
            await this.validateSystem();
            
            this.logger.info('系统初始化完成');
            console.log(chalk.green('✅ 系统初始化完成'));
            
            return true;
        } catch (error) {
            console.error(chalk.red('❌ 系统初始化失败:'), error.message);
            if (this.logger) {
                this.logger.error('系统初始化失败', { error: error.message, stack: error.stack });
            }
            return false;
        }
    }
    
    /**
     * 加载配置文件
     */
    async loadConfig() {
        if (!await fs.pathExists(this.configPath)) {
            throw new Error(`配置文件不存在: ${this.configPath}`);
        }
        
        this.config = await fs.readJson(this.configPath);
        
        // 验证必要的配置项
        const requiredFields = ['solana', 'proxy', 'scheduler', 'web'];
        for (const field of requiredFields) {
            if (!this.config[field]) {
                throw new Error(`配置文件缺少必要字段: ${field}`);
            }
        }
        
        console.log(chalk.green('✅ 配置文件加载成功'));
    }
    
    /**
     * 初始化各个组件
     */
    async initializeComponents() {
        // 初始化账户管理器
        this.accountManager = new AccountManager();
        await this.accountManager.initialize();
        
        // 初始化代理管理器
        this.proxyManager = new ProxyManager(this.config.proxy || {});
        await this.proxyManager.initialize();
        
        // 初始化 Solana 客户端
        this.solanaClient = new SolanaClient(this.config.solana || {});
        await this.solanaClient.initialize();
        
        // 初始化调度器
        this.scheduler = new Scheduler({
            ...this.config,
            accountManager: this.accountManager,
            proxyManager: this.proxyManager,
            solanaClient: this.solanaClient,
            logger: this.logger,
            onStats: (stats) => this.updateStats(stats),
            onError: (error) => this.handleError(error)
        });
        
        // 初始化 Web 服务器
        this.webServer = new WebServer({
            ...this.config.web,
            getSystemData: () => this.getSystemData(),
            controlSystem: (action) => this.controlSystem(action),
            logger: this.logger
        });
        
        console.log(chalk.green('✅ 所有组件初始化完成'));
    }
    
    /**
     * 验证系统配置
     */
    async validateSystem() {
        this.logger.info('开始系统验证');
        
        // 验证 Solana CLI
        if (!await this.solanaClient.checkSolanaCliAvailable()) {
            throw new Error('Solana CLI 不可用，请确保已正确安装');
        }
        
        // 验证代理连接
        if (!await this.proxyManager.testConnection()) {
            this.logger.warn('代理服务器连接失败，将使用直连模式');
        }
        
        // 验证账户
        const accounts = await this.accountManager.getAllAccounts();
        if (accounts.length === 0) {
            this.logger.warn('没有可用账户，将自动生成');
            await this.accountManager.generateAccounts(this.config.accounts.count || 50);
        }
        
        this.logger.info('系统验证完成');
    }
    
    /**
     * 启动系统
     */
    async start() {
        if (this.isRunning) {
            this.logger.warn('系统已在运行中');
            return false;
        }
        
        try {
            this.logger.info('启动系统');
            console.log(chalk.blue('🚀 启动 Solana 空投自动化系统...'));
            
            this.isRunning = true;
            this.startTime = new Date();
            this.stats.startTime = this.startTime;
            
            // 启动 Web 服务器
            await this.webServer.start();
            console.log(chalk.green(`✅ Web 监控界面已启动: http://localhost:${this.config.web.port}`));
            
            // 启动调度器
            await this.scheduler.start();
            console.log(chalk.green('✅ 空投调度器已启动'));
            
            this.logger.info('系统启动完成', {
                webPort: this.config.web.port,
                schedulerMode: this.config.scheduler.mode
            });
            
            // 显示运行信息
            this.displayRunningInfo();
            
            return true;
        } catch (error) {
            this.isRunning = false;
            this.logger.error('系统启动失败', { error: error.message, stack: error.stack });
            console.error(chalk.red('❌ 系统启动失败:'), error.message);
            return false;
        }
    }
    
    /**
     * 停止系统
     */
    async stop() {
        if (!this.isRunning) {
            this.logger.warn('系统未在运行');
            return false;
        }
        
        try {
            this.logger.info('停止系统');
            console.log(chalk.yellow('⏹️  正在停止系统...'));
            
            this.isRunning = false;
            
            // 停止调度器
            if (this.scheduler) {
                await this.scheduler.stop();
                console.log(chalk.yellow('⏹️  调度器已停止'));
            }
            
            // 停止 Web 服务器
            if (this.webServer) {
                await this.webServer.stop();
                console.log(chalk.yellow('⏹️  Web 服务器已停止'));
            }
            
            this.logger.info('系统停止完成');
            console.log(chalk.green('✅ 系统已完全停止'));
            
            return true;
        } catch (error) {
            this.logger.error('系统停止失败', { error: error.message, stack: error.stack });
            console.error(chalk.red('❌ 系统停止失败:'), error.message);
            return false;
        }
    }
    
    /**
     * 重启系统
     */
    async restart() {
        this.logger.info('重启系统');
        console.log(chalk.blue('🔄 重启系统...'));
        
        await this.stop();
        await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒
        return await this.start();
    }
    
    /**
     * 获取系统数据
     */
    async getSystemData() {
        // 每次都强制热加载最新账户数据
        if (this.accountManager) {
            await this.accountManager.loadAccounts();
        }
        const accounts = this.accountManager ? await this.accountManager.getAllAccounts() : [];
        // 统一余额单位为SOL
        const accountsWithSol = accounts.map(acc => ({
            ...acc,
            balance: parseFloat(acc.balance) || 0
        }));
        const proxy = this.proxyManager ? await this.proxyManager.getCurrentProxy() : null;
        
        // 获取最近的错误和操作日志
        const recentLogs = [];
        
        // 优先从调度器的运行时错误中获取
        if (this.scheduler && this.scheduler.stats && this.scheduler.stats.errors) {
            this.scheduler.stats.errors.slice(-30).forEach(error => {
                recentLogs.push({
                    level: 'error',
                    message: `${error.type} failed: ${error.error}`,
                    timestamp: error.timestamp
                });
            });
        }
        
        // 如果运行时日志不足，从文件日志中补充
        if (recentLogs.length < 20) {
            try {
                const fs = require('fs');
                const path = require('path');
                const logDir = path.join(__dirname, '../logs');
                const today = new Date().toISOString().split('T')[0];
                const logFile = path.join(logDir, `application-${today}.log`);
                
                if (fs.existsSync(logFile)) {
                    const logContent = fs.readFileSync(logFile, 'utf8');
                    const logLines = logContent.split('\n').filter(line => line.trim()).slice(-50);
                    
                    logLines.forEach(line => {
                        try {
                            if (line.includes('airdrop failed') || line.includes('error') || line.includes('failed')) {
                                const timestamp = line.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/)?.[1] || new Date().toISOString();
                                let message = line;
                                
                                // 提取有用的错误信息
                                if (line.includes('airdrop failed')) {
                                    message = 'Airdrop operation failed';
                                } else if (line.includes('transfer failed')) {
                                    message = 'Transfer operation failed';
                                } else if (line.includes('Rate limit')) {
                                    message = 'Rate limit encountered';
                                } else {
                                    // 简化日志信息，只保留关键部分
                                    message = line.substring(line.indexOf('message') + 10, line.length).substring(0, 100);
                                }
                                
                                recentLogs.push({
                                    level: 'error',
                                    message: message,
                                    timestamp: timestamp
                                });
                            }
                        } catch (e) {
                            // 忽略解析错误
                        }
                    });
                }
            } catch (error) {
                // 如果读取日志文件失败，添加一个说明性日志
                recentLogs.push({
                    level: 'info',
                    message: 'System started, waiting for operation logs...',
                    timestamp: new Date().toISOString()
                });
            }
        }
        
        // 主账户余额现在由前端直接从链上查询，后端不再查询以提高响应速度
        
        return {
            status: {
                running: this.isRunning,
                startTime: this.startTime,
                uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
                failureCount: this.scheduler ? this.scheduler.getFailureCount() : 0
            },
            stats: this.scheduler ? this.scheduler.stats : this.stats,
            accounts: accountsWithSol,
            proxy: proxy ? { name: proxy } : { name: '' }, // 统一为对象格式
            logs: recentLogs, // 添加日志数据
            mainAccount: {
                address: this.config && this.config.main ? this.config.main.mainAccount : null,
                balance: null // 余额由前端直接查询链上数据
            },
            config: {
                scheduler: this.config.scheduler,
                web: { port: this.config.web.port },
                solana: {
                    rpcUrl: this.config.solana?.rpcUrl || 'https://api.devnet.solana.com',
                    network: this.config.solana?.network || 'devnet'
                }
            }
        };
    }
    
    /**
     * 控制系统
     */
    async controlSystem(action) {
        switch (action) {
            case 'start':
                return await this.start();
            case 'stop':
                return await this.stop();
            case 'restart':
                return await this.restart();
            case 'switch-proxy':
                if (this.proxyManager) {
                    return await this.proxyManager.switchProxy();
                }
                return false;
            case 'reset-stats':
                this.resetStats();
                return true;
            default:
                this.logger.warn('未知的控制命令', { action });
                return false;
        }
    }
    
    /**
     * 更新统计数据
     */
    updateStats(newStats) {
        Object.assign(this.stats, newStats);
        
        // 通过 WebSocket 广播统计更新
        if (this.webServer) {
            this.webServer.broadcast('stats', this.stats);
        }
    }
    
    /**
     * 重置统计数据
     */
    resetStats() {
        this.stats = {
            totalAirdrops: 0,
            totalSol: 0,
            totalTransfers: 0,
            startTime: this.startTime,
            errors: []
        };
        
        this.logger.info('统计数据已重置');
    }
    
    /**
     * 处理错误
     */
    handleError(error) {
        this.stats.errors.push({
            timestamp: new Date(),
            message: error.message,
            stack: error.stack
        });
        
        // 保持最近100个错误
        if (this.stats.errors.length > 100) {
            this.stats.errors = this.stats.errors.slice(-100);
        }
        
        // 通过 WebSocket 广播错误
        if (this.webServer) {
            this.webServer.broadcast('error', {
                timestamp: new Date(),
                message: error.message
            });
        }
    }
    
    /**
     * 显示运行信息
     */
    displayRunningInfo() {
        console.log(chalk.cyan('\n' + '='.repeat(60)));
        console.log(chalk.cyan('📊 系统运行信息'));
        console.log(chalk.cyan('='.repeat(60)));
        console.log(chalk.white(`📱 Web 监控界面: http://localhost:${this.config.web.port}`));
        console.log(chalk.white(`⏰ 调度模式: ${this.config.scheduler.mode}`));
        console.log(chalk.white(`🏦 管理账户数: ${this.accountManager.getAccountCount()}`));
        console.log(chalk.white(`🌐 代理服务: ${this.proxyManager.isEnabled() ? '已启用' : '未启用'}`));
        console.log(chalk.cyan('='.repeat(60)));
        console.log(chalk.green('✨ 系统正在运行，请访问 Web 界面查看详细信息'));
        console.log(chalk.gray('💡 按 Ctrl+C 可安全停止系统\n'));
    }
    
    /**
     * 绑定信号处理器
     */
    bindSignalHandlers() {
        // 优雅关闭
        const gracefulShutdown = async (signal) => {
            console.log(chalk.yellow(`\n收到 ${signal} 信号，正在安全关闭系统...`));
            
            try {
                await this.stop();
                process.exit(0);
            } catch (error) {
                console.error(chalk.red('关闭系统时发生错误:'), error.message);
                process.exit(1);
            }
        };
        
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        
        // 未捕获的异常处理
        process.on('uncaughtException', (error) => {
            console.error(chalk.red('未捕获的异常:'), error);
            if (this.logger) {
                this.logger.error('未捕获的异常', { error: error.message, stack: error.stack });
            }
            process.exit(1);
        });
        
        process.on('unhandledRejection', (reason, promise) => {
            console.error(chalk.red('未处理的 Promise 拒绝:'), reason);
            if (this.logger) {
                this.logger.error('未处理的 Promise 拒绝', { reason: reason.toString() });
            }
        });
    }
}

/**
 * 主函数
 */
async function main() {
    // 解析命令行参数
    const args = process.argv.slice(2);
    const isDev = args.includes('--dev');
    const isHelp = args.includes('--help') || args.includes('-h');
    
    // 显示帮助信息
    if (isHelp) {
        console.log(chalk.cyan(`
Solana 空投自动化系统

使用方法:
  node src/main.js [选项]

选项:
  --dev         开发模式（更详细的日志输出）
  --help, -h    显示此帮助信息

示例:
  node src/main.js          # 正常启动
  node src/main.js --dev    # 开发模式启动

Web 监控界面将在 http://localhost:3008 启动
        `));
        process.exit(0);
    }
    
    // 显示启动横幅
    console.log(chalk.blue(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║           🪙 Solana 空投自动化系统 v1.0.0                      ║
║                                                              ║
║  • 自动空投 SOL 代币到 devnet                                   ║
║  • 智能 IP 轮换和代理管理                                        ║
║  • 50个账户自动管理和余额转移                                     ║
║  • Web 监控界面实时状态查看                                       ║
║  • 定时任务和错误处理机制                                         ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    `));
    
    // 创建并启动系统
    const bot = new SolanaAirdropBot();
    
    // 初始化系统
    const initSuccess = await bot.initialize();
    if (!initSuccess) {
        console.error(chalk.red('❌ 系统初始化失败，程序退出'));
        process.exit(1);
    }
    
    // 启动系统
    const startSuccess = await bot.start();
    if (!startSuccess) {
        console.error(chalk.red('❌ 系统启动失败，程序退出'));
        process.exit(1);
    }
    
    // 保持程序运行
    process.stdin.resume();
}

// 如果这个文件是直接运行的，则执行主函数
if (require.main === module) {
    main().catch(error => {
        console.error(chalk.red('程序启动失败:'), error);
        process.exit(1);
    });
}

module.exports = SolanaAirdropBot;
