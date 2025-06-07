const cron = require('node-cron');
const Logger = require('./logger');
const logger = Logger.default;
const AccountManager = require('./account-manager');
const ProxyManager = require('./proxy-manager');
const SolanaClient = require('./solana-client');
const { 
  sleep, 
  randomDelay, 
  isInTimeWindow, 
  formatSol, 
  lamportsToSol, 
  cleanupOldLogs 
} = require('./utils');
const fs = require('fs-extra');
const path = require('path');
const historyPath = path.join(__dirname, '../data/history.json');

class Scheduler {
  constructor(config) {
    this.config = config;
    
    // 使用传入的组件实例，如果没有则创建新的
    this.accountManager = config.accountManager || new AccountManager();
    this.proxyManager = config.proxyManager || new ProxyManager(config.proxy || {});
    this.solanaClient = config.solanaClient || new SolanaClient(config.network || {});
    this.logger = config.logger || logger;
    
    // 回调函数
    this.onStats = config.onStats || (() => {});
    this.onError = config.onError || (() => {});
    
    this.isRunning = false;
    this.operationCount = 0;
    this.consecutiveFailures = 0;
    this.circuitBreakerTripped = false;
    this.lastOperationTime = null;
    
    this.stats = {
      totalAirdrops: 0,
      successfulAirdrops: 0,
      totalTransfers: 0,
      successfulTransfers: 0,
      totalEarned: 0,
      startTime: null,
      errors: []
    };
  }

  /**
   * 初始化调度器
   */
  async initialize() {
    try {
      this.logger.info('Initializing scheduler...');
      
      // 检查组件是否已经初始化
      if (!this.accountManager.isLoaded) {
        const accountsLoaded = await this.accountManager.loadAccounts();
        if (!accountsLoaded || this.accountManager.accounts.length === 0) {
          throw new Error('No accounts available. Please generate accounts first.');
        }
      }
      
      // 代理管理器初始化失败不阻止系统运行
      try {
        if (!this.proxyManager.isInitialized) {
          await this.proxyManager.initialize();
        }
      } catch (error) {
        this.logger.warn('Proxy manager initialization failed, continuing without proxy', { error: error.message });
      }
      
      // 清理旧日志
      try {
        await cleanupOldLogs(
          require('path').join(__dirname, '../logs'),
          this.config.retentionDays || 7
        );
      } catch (error) {
        this.logger.warn('Failed to cleanup old logs', { error: error.message });
      }
      
      this.logger.info(`Scheduler initialized with ${this.accountManager.accounts.length} accounts`);
      return true;
    } catch (error) {
      this.logger.error('Failed to initialize scheduler', { error: error.message });
      return false;
    }
  }

  /**
   * 启动调度器
   */
  async start() {
    if (!await this.initialize()) {
      throw new Error('Scheduler initialization failed');
    }
    
    if (this.config.main.scheduleEnabled) {
      // 定时任务模式
      this.startScheduledMode();
    } else {
      // 立即运行模式
      await this.startContinuousMode();
    }
  }

  /**
   * 启动定时任务模式
   */
  startScheduledMode() {
    logger.info('Starting scheduled mode...');
    
    // 每分钟检查是否在运行时间窗口内
    cron.schedule('* * * * *', async () => {
      const { start, end } = this.config.main.runTimeWindow;
      
      if (isInTimeWindow(start, end)) {
        if (!this.isRunning) {
          logger.info('Entering run time window, starting operations...');
          this.stats.startTime = new Date();
          this.isRunning = true;
          await this.runOperationLoop();
        }
      } else {
        if (this.isRunning) {
          logger.info('Exiting run time window, stopping operations...');
          this.isRunning = false;
          this.logDailyStats();
        }
      }
    });
    
    // 每小时清理日志
    cron.schedule('0 * * * *', async () => {
      await cleanupOldLogs(
        require('path').join(__dirname, '../logs'),
        this.config.logging.retentionDays
      );
    });
    
    logger.info(`Scheduled mode started. Will run between ${this.config.main.runTimeWindow.start}:00 - ${this.config.main.runTimeWindow.end}:00`);
  }

  /**
   * 启动连续运行模式
   */
  async startContinuousMode() {
    logger.info('Starting continuous mode...');
    this.isRunning = true;
    this.stats.startTime = new Date();
    await this.runOperationLoop();
  }

  /**
   * 主要操作循环
   */
  async runOperationLoop() {
    while (this.isRunning) {
      try {
        // 检查熔断器状态
        if (this.circuitBreakerTripped) {
          logger.warn(`Circuit breaker tripped, waiting ${this.config.retry.circuitBreakerTimeout}s...`);
          await sleep(this.config.retry.circuitBreakerTimeout * 1000);
          this.circuitBreakerTripped = false;
          this.consecutiveFailures = 0;
        }
        
        // 执行单次操作
        const operationResult = await this.executeSingleOperation();
        
        // 更新统计
        this.updateStats(operationResult);
        
        // 检查是否需要切换代理
        await this.proxyManager.smartSwitch(this.operationCount);
        
        // 等待下次操作
        const delay = randomDelay(
          this.config.solana.requestInterval?.min || 30,
          this.config.solana.requestInterval?.max || 120
        );
        
        logger.debug(`Waiting ${delay/1000}s before next operation...`);
        await sleep(delay);
        
      } catch (error) {
        logger.error('Operation loop error', { error: error.message });
        await sleep(30000); // 发生错误时等待30秒
      }
    }
  }

  /**
   * 执行单次操作
   */
  async executeSingleOperation() {
    try {
      // 获取当前出口IP（通过proxyManager）
      let currentIp = null;
      if (this.proxyManager && typeof this.proxyManager.getCurrentIp === 'function') {
        currentIp = await this.proxyManager.getCurrentIp();
      } else if (this.proxyManager && this.proxyManager.currentProxy && this.proxyManager.currentProxy.ip) {
        currentIp = this.proxyManager.currentProxy.ip;
      }
      // 获取下一个可用账户（传入当前IP）
      const account = await this.accountManager.getNextAccount(currentIp);
      const airdropAmount = this.getRandomAirdropAmount();
      const mainAccount = this.config.main.mainAccount;
      const transferThreshold = this.config.solana.transferThreshold || 2;
      logger.info(`Starting operation ${this.operationCount + 1} for account ${account.id}`);
      // 执行完整流程
      const results = await this.solanaClient.executeAirdropFlow(
        account,
        mainAccount,
        airdropAmount,
        transferThreshold
      );
      // 记录账户操作
      await this.accountManager.recordAccountOperation(
        account.publicKey,
        'airdrop',
        results.airdrop?.success || false,
        results.airdrop
      );
      if (results.transfer) {
        await this.accountManager.recordAccountOperation(
          account.publicKey,
          'transfer',
          results.transfer.success,
          results.transfer
        );
      }
      // 更新账户余额
      if (results.finalBalance !== null) {
        await this.accountManager.updateAccountBalance(
          account.publicKey,
          results.finalBalance * 1e9 // 转换为lamports
        );
      }
      this.operationCount++;
      this.lastOperationTime = new Date();
      // 检查连续失败
      if (results.airdrop?.success) {
        this.consecutiveFailures = 0;
      } else {
        this.consecutiveFailures++;
        // 处理特定错误类型
        if (this.solanaClient.isRateLimitError(results.airdrop?.output || '')) {
          logger.warn('Rate limit detected, switching proxy...');
          await this.proxyManager.handleProxyError();
          // 标记该账户今日在当前IP下已达上限
          await this.accountManager.markAirdropLimitReachedToday(account.publicKey, currentIp);
        }
        // 检查是否触发熔断器
        if (this.consecutiveFailures >= this.config.retry.maxConsecutiveFailures) {
          this.circuitBreakerTripped = true;
          logger.error(`Circuit breaker tripped after ${this.consecutiveFailures} consecutive failures`);
        }
      }
      return results;
    } catch (error) {
      logger.error('Single operation failed', { error: error.message });
      this.consecutiveFailures++;
      throw error;
    }
  }

  /**
   * 获取随机airdrop金额
   */
  getRandomAirdropAmount() {
    const { min, max } = this.config.solana.amountRange || { min: 2, max: 5 };
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * 更新统计信息
   */
  updateStats(operationResult) {
    if (operationResult.airdrop) {
      this.stats.totalAirdrops++;
      if (operationResult.airdrop.success) {
        this.stats.successfulAirdrops++;
        this.stats.totalEarned += operationResult.airdrop.amount || 0;
        this._appendHistoryLog({
          level: 'info',
          message: `Airdrop success: +${operationResult.airdrop.amount || 0} SOL`,
          timestamp: new Date().toISOString()
        });
      } else {
        this.stats.errors.push({
          type: 'airdrop',
          error: operationResult.airdrop.error,
          timestamp: new Date().toISOString()
        });
        this._appendHistoryLog({
          level: 'error',
          message: `Airdrop failed: ${operationResult.airdrop.error}`,
          timestamp: new Date().toISOString()
        });
      }
    }
    if (operationResult.transfer) {
      this.stats.totalTransfers++;
      if (operationResult.transfer.success) {
        this.stats.successfulTransfers++;
        this._appendHistoryLog({
          level: 'info',
          message: `Transfer success: +${operationResult.transfer.amount || 0} SOL`,
          timestamp: new Date().toISOString()
        });
      } else {
        this.stats.errors.push({
          type: 'transfer',
          error: operationResult.transfer.error,
          timestamp: new Date().toISOString()
        });
        this._appendHistoryLog({
          level: 'error',
          message: `Transfer failed: ${operationResult.transfer.error}`,
          timestamp: new Date().toISOString()
        });
      }
    }
    // 限制错误历史记录数量
    if (this.stats.errors.length > 100) {
      this.stats.errors = this.stats.errors.slice(-50);
    }
    // 实时写入history.json
    this._syncHistoryJson();
  }

  /**
   * 追加日志到history.json
   */
  _appendHistoryLog(log) {
    try {
      let history = { stats: {}, logs: [] };
      if (fs.existsSync(historyPath)) {
        history = fs.readJsonSync(historyPath);
      }
      history.logs = history.logs || [];
      history.logs.push(log);
      // 只保留最新100条
      if (history.logs.length > 100) {
        history.logs = history.logs.slice(-100);
      }
      fs.writeJsonSync(historyPath, history, { spaces: 2 });
      // 新增：通过webServer广播log事件
      if (this.webServer && typeof this.webServer.broadcast === 'function') {
        this.webServer.broadcast('log', log);
      }
    } catch (e) {}
  }

  /**
   * 同步统计数据到history.json
   */
  _syncHistoryJson() {
    try {
      let history = { stats: {}, logs: [] };
      if (fs.existsSync(historyPath)) {
        history = fs.readJsonSync(historyPath);
      }
      history.stats = {
        totalAirdrops: this.stats.totalAirdrops,
        successfulAirdrops: this.stats.successfulAirdrops,
        totalTransfers: this.stats.totalTransfers,
        successfulTransfers: this.stats.successfulTransfers,
        totalEarned: this.stats.totalEarned,
        startTime: this.stats.startTime || new Date().toISOString()
      };
      fs.writeJsonSync(historyPath, history, { spaces: 2 });
    } catch (e) {}
  }

  /**
   * 记录每日统计
   */
  logDailyStats() {
    const duration = this.stats.startTime ? 
      (Date.now() - this.stats.startTime.getTime()) / 1000 / 60 / 60 : 0;
    
    const airdropSuccessRate = this.stats.totalAirdrops > 0 ? 
      (this.stats.successfulAirdrops / this.stats.totalAirdrops * 100).toFixed(2) : '0.00';
    
    const transferSuccessRate = this.stats.totalTransfers > 0 ? 
      (this.stats.successfulTransfers / this.stats.totalTransfers * 100).toFixed(2) : '0.00';
    
    logger.info('Daily statistics:', {
      runDuration: `${duration.toFixed(2)} hours`,
      totalOperations: this.operationCount,
      airdrops: {
        total: this.stats.totalAirdrops,
        successful: this.stats.successfulAirdrops,
        successRate: `${airdropSuccessRate}%`
      },
      transfers: {
        total: this.stats.totalTransfers,
        successful: this.stats.successfulTransfers,
        successRate: `${transferSuccessRate}%`
      },
      totalEarned: `${this.stats.totalEarned} SOL`,
      proxyStats: this.proxyManager.getProxyStats(),
      accountStats: this.accountManager.getAccountStats()
    });
  }

  /**
   * 停止调度器
   */
  stop() {
    logger.info('Stopping scheduler...');
    this.isRunning = false;
    this.logDailyStats();
  }

  /**
   * 获取失败次数
   */
  getFailureCount() {
    return this.consecutiveFailures;
  }

  /**
   * 获取运行状态
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      operationCount: this.operationCount,
      consecutiveFailures: this.consecutiveFailures,
      circuitBreakerTripped: this.circuitBreakerTripped,
      lastOperationTime: this.lastOperationTime,
      stats: this.stats,
      proxyStats: this.proxyManager.getProxyStats(),
      accountStats: this.accountManager.getAccountStats()
    };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      totalAirdrops: 0,
      successfulAirdrops: 0,
      totalTransfers: 0,
      successfulTransfers: 0,
      totalEarned: 0,
      startTime: new Date(),
      errors: []
    };
    
    this.operationCount = 0;
    this.consecutiveFailures = 0;
    this.circuitBreakerTripped = false;
    
    this.proxyManager.resetStats();
    
    logger.info('Statistics reset');
  }
}

module.exports = Scheduler;
