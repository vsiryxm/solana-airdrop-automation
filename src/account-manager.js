const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const Logger = require('./logger');
const logger = Logger.default;
const { safeReadJson, safeWriteJson, isValidSolanaAddress, truncateString } = require('./utils');

class AccountManager {
  constructor() {
    this.configPath = path.join(__dirname, '../config/accounts.json');
    this.accounts = [];
    this.meta = {
      generated: false,
      count: 0,
      lastUsedIndex: -1,
      created: null,
      updated: null
    };
    this.isLoaded = false;
  }

  /**
   * 加载账户数据
   */
  async loadAccounts() {
    try {
      const data = await safeReadJson(this.configPath, { accounts: [], meta: this.meta });
      this.accounts = data.accounts || [];
      this.meta = { ...this.meta, ...data.meta };
      this.isLoaded = true;
      
      logger.info(`Loaded ${this.accounts.length} accounts from storage`);
      return true;
    } catch (error) {
      logger.error('Failed to load accounts', { error: error.message });
      return false;
    }
  }

  /**
   * 保存账户数据
   */
  async saveAccounts() {
    try {
      const data = {
        accounts: this.accounts,
        meta: {
          ...this.meta,
          updated: new Date().toISOString()
        }
      };
      
      const success = await safeWriteJson(this.configPath, data);
      if (success) {
        logger.info(`Saved ${this.accounts.length} accounts to storage`);
      }
      return success;
    } catch (error) {
      logger.error('Failed to save accounts', { error: error.message });
      return false;
    }
  }

  /**
   * 生成新的Solana密钥对
   */
  async generateKeyPair() {
    try {
      const { stdout } = await execAsync('solana-keygen new --no-bip39-passphrase --silent --force --outfile /dev/stdout');
      const lines = stdout.trim().split('\n');
      
      // 查找包含私钥的行
      let privateKey = null;
      for (const line of lines) {
        if (line.includes('[') && line.includes(']')) {
          // 提取私钥数组
          const match = line.match(/\[(.*?)\]/);
          if (match) {
            privateKey = `[${match[1]}]`;
            break;
          }
        }
      }
      
      if (!privateKey) {
        throw new Error('Failed to extract private key from solana-keygen output');
      }

      // 从私钥获取公钥
      const tempKeyFile = `/tmp/temp_key_${Date.now()}.json`;
      await fs.writeFile(tempKeyFile, privateKey);
      
      try {
        const { stdout: pubkeyOutput } = await execAsync(`solana-keygen pubkey ${tempKeyFile}`);
        const publicKey = pubkeyOutput.trim();
        
        if (!isValidSolanaAddress(publicKey)) {
          throw new Error('Generated invalid public key');
        }
        
        return {
          publicKey,
          privateKey,
          generated: new Date().toISOString()
        };
      } finally {
        // 清理临时文件
        await fs.remove(tempKeyFile).catch(() => {});
      }
    } catch (error) {
      logger.error('Failed to generate keypair', { error: error.message });
      throw error;
    }
  }

  /**
   * 生成指定数量的账户
   * @param {number} count 要生成的账户数量
   */
  async generateAccounts(count = 50) {
    if (!this.isLoaded) {
      await this.loadAccounts();
    }

    // 只允许在 accounts.json 为空时生成新账户，否则抛出错误
    if (this.accounts.length > 0) {
      logger.error('accounts.json 非空，禁止生成新账户。请先手动清空 accounts.json。');
      throw new Error('accounts.json 非空，禁止生成新账户。请先手动清空 accounts.json。');
    }

    logger.info(`Starting to generate ${count} accounts...`);
    const newAccounts = [];
    const errors = [];
    for (let i = 0; i < count; i++) {
      try {
        const keyPair = await this.generateKeyPair();
        const account = {
          id: `account_${this.accounts.length + i + 1}`,
          publicKey: keyPair.publicKey,
          privateKey: keyPair.privateKey,
          balance: 0,
          lastUsed: null,
          lastAirdrop: null,
          lastTransfer: null,
          errorCount: 0,
          status: 'active',
          created: keyPair.generated,
          airdropLimitReachedDate: null // 新增字段
        };
        newAccounts.push(account);
        logger.info(`Generated account ${i + 1}/${count}: ${truncateString(account.publicKey)}`);
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        errors.push(`Account ${i + 1}: ${error.message}`);
        logger.error(`Failed to generate account ${i + 1}`, { error: error.message });
      }
    }
    if (newAccounts.length > 0) {
      this.accounts.push(...newAccounts);
      this.meta = {
        generated: true,
        count: this.accounts.length,
        lastUsedIndex: this.meta.lastUsedIndex || -1,
        created: this.meta.created || new Date().toISOString(),
        updated: new Date().toISOString()
      };
      await this.saveAccounts();
      logger.info(`Successfully generated ${newAccounts.length} accounts, total: ${this.accounts.length}`);
    }
    if (errors.length > 0) {
      logger.warn(`Failed to generate ${errors.length} accounts`, { errors });
    }
    return {
      success: newAccounts.length,
      failed: errors.length,
      accounts: newAccounts
    };
  }

  /**
   * 增量生成账户（不清空现有账户）
   * @param {number} count 要生成的账户数量
   */
  async generateAdditionalAccounts(count = 50) {
    if (!this.isLoaded) {
      await this.loadAccounts();
    }

    logger.info(`Starting to generate ${count} additional accounts...`);
    const newAccounts = [];
    const errors = [];
    
    for (let i = 0; i < count; i++) {
      try {
        const keyPair = await this.generateKeyPair();
        const account = {
          id: `account_${this.accounts.length + i + 1}`,
          publicKey: keyPair.publicKey,
          privateKey: keyPair.privateKey,
          balance: 0,
          lastUsed: null,
          lastAirdrop: null,
          lastTransfer: null,
          errorCount: 0,
          status: 'active',
          created: keyPair.generated,
          airdropLimitReachedDate: null
        };
        newAccounts.push(account);
        logger.info(`Generated additional account ${i + 1}/${count}: ${truncateString(account.publicKey)}`);
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        errors.push(`Account ${i + 1}: ${error.message}`);
        logger.error(`Failed to generate additional account ${i + 1}`, { error: error.message });
      }
    }
    
    if (newAccounts.length > 0) {
      this.accounts.push(...newAccounts);
      this.meta = {
        generated: true,
        count: this.accounts.length,
        lastUsedIndex: this.meta.lastUsedIndex || -1,
        created: this.meta.created || new Date().toISOString(),
        updated: new Date().toISOString()
      };
      await this.saveAccounts();
      logger.info(`Successfully generated ${newAccounts.length} additional accounts, total: ${this.accounts.length}`);
    }
    
    if (errors.length > 0) {
      logger.warn(`Failed to generate ${errors.length} additional accounts`, { errors });
    }
    
    return {
      success: newAccounts.length,
      failed: errors.length,
      accounts: newAccounts
    };
  }

  /**
   * 获取下一个可用账户
   */
  async getNextAccount() {
    if (!this.isLoaded) {
      await this.loadAccounts();
    }
    
    if (this.accounts.length === 0) {
      throw new Error('No accounts available. Please generate accounts first.');
    }
    
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    const cooldownMs = 30 * 60 * 1000; // 30分钟冷却时间
    
    // 查找可用账户
    let nextIndex = (this.meta.lastUsedIndex + 1) % this.accounts.length;
    let attempts = 0;
    
    while (attempts < this.accounts.length) {
      const account = this.accounts[nextIndex];
      
      // 跳过今日已达上限的账户
      if (account.status === 'active' && (!account.airdropLimitReachedDate || account.airdropLimitReachedDate !== today)) {
        const lastUsed = account.lastUsed ? new Date(account.lastUsed).getTime() : 0;
        
        // 检查是否已经冷却
        if (now - lastUsed >= cooldownMs) {
          // 更新使用信息
          account.lastUsed = new Date().toISOString();
          this.meta.lastUsedIndex = nextIndex;
          this.meta.updated = new Date().toISOString();
          
          await this.saveAccounts();
          
          logger.debug(`Selected account ${account.id}: ${truncateString(account.publicKey)}`);
          return account;
        }
      }
      
      nextIndex = (nextIndex + 1) % this.accounts.length;
      attempts++;
    }
    
    // 如果所有账户都不可用，返回冷却时间最短且未达上限的
    const todayAvailable = this.accounts.filter(acc => acc.status === 'active' && (!acc.airdropLimitReachedDate || acc.airdropLimitReachedDate !== today));
    if (todayAvailable.length > 0) {
      const availableAccount = todayAvailable.sort((a, b) => {
        const aLastUsed = a.lastUsed ? new Date(a.lastUsed).getTime() : 0;
        const bLastUsed = b.lastUsed ? new Date(b.lastUsed).getTime() : 0;
        return aLastUsed - bLastUsed;
      })[0];
      logger.warn('All available accounts in cooldown or just reached limit.');
      return availableAccount;
    }
    
    throw new Error('No active accounts available (all reached airdrop limit today)');
  }

  /**
   * 更新账户余额
   * @param {string} publicKey 公钥
   * @param {number} balance 余额(lamports)
   */
  async updateAccountBalance(publicKey, balance) {
    const account = this.accounts.find(acc => acc.publicKey === publicKey);
    if (account) {
      // 兼容lamports和sol
      if (balance > 1e6) {
        account.balance = balance / 1e9;
      } else {
        account.balance = balance;
      }
      account.lastBalanceUpdate = new Date().toISOString();
      await this.saveAccounts();
    }
  }

  /**
   * 记录账户操作
   * @param {string} publicKey 公钥
   * @param {string} operation 操作类型
   * @param {boolean} success 是否成功
   * @param {object} metadata 元数据
   */
  async recordAccountOperation(publicKey, operation, success, metadata = {}) {
    const account = this.accounts.find(acc => acc.publicKey === publicKey);
    if (!account) return;
    
    if (success) {
      account.errorCount = 0;
      account[`last${operation.charAt(0).toUpperCase() + operation.slice(1)}`] = new Date().toISOString();
    } else {
      account.errorCount = (account.errorCount || 0) + 1;
      
      // 如果连续失败过多，禁用账户
      if (account.errorCount >= 5) {
        account.status = 'disabled';
        logger.warn(`Account ${account.id} disabled due to too many errors`);
      }
    }
    
    await this.saveAccounts();
  }

  /**
   * 获取账户统计信息
   */
  getAccountStats() {
    const stats = {
      total: this.accounts.length,
      active: 0,
      disabled: 0,
      totalBalance: 0,
      averageBalance: 0
    };
    
    this.accounts.forEach(account => {
      if (account.status === 'active') {
        stats.active++;
      } else if (account.status === 'disabled') {
        stats.disabled++;
      }
      
      stats.totalBalance += account.balance || 0;
    });
    
    stats.averageBalance = stats.total > 0 ? stats.totalBalance / stats.total : 0;
    
    return stats;
  }

  /**
   * 重置所有账户状态
   */
  async resetAllAccounts() {
    this.accounts.forEach(account => {
      account.status = 'active';
      account.errorCount = 0;
      account.lastUsed = null;
    });
    
    this.meta.lastUsedIndex = -1;
    await this.saveAccounts();
    logger.info('Reset all account statuses');
  }

  /**
   * 导出账户信息（不包含私钥）
   */
  exportAccountInfo() {
    return this.accounts.map(account => ({
      id: account.id,
      publicKey: account.publicKey,
      balance: account.balance,
      status: account.status,
      lastUsed: account.lastUsed,
      errorCount: account.errorCount
    }));
  }

  /**
   * 获取账户总数
   */
  getAccountCount() {
    return this.accounts.length;
  }

  /**
   * 获取所有账户
   */
  async getAllAccounts() {
    if (!this.isLoaded) {
      await this.loadAccounts();
    }
    return this.accounts;
  }

  /**
   * 初始化账户管理器
   */
  async initialize() {
    try {
      await this.loadAccounts();
      
      // 检查配置文件中的要求账户数量
      const configPath = path.join(__dirname, '../config/config.json');
      let requiredCount = 50; // 默认值
      
      try {
        const config = await safeReadJson(configPath);
        if (config.accounts && config.accounts.count) {
          requiredCount = config.accounts.count;
        }
      } catch (error) {
        logger.warn('Could not read config file, using default account count of 50');
      }
      
      // 检查是否需要生成更多账户
      const currentCount = this.accounts.length;
      if (currentCount < requiredCount) {
        const needToGenerate = requiredCount - currentCount;
        logger.info(`Current accounts: ${currentCount}, Required: ${requiredCount}. Generating ${needToGenerate} more accounts...`);
        
        // 使用增量生成方法
        const result = await this.generateAdditionalAccounts(needToGenerate);
        if (result.success > 0) {
          logger.info(`Successfully generated ${result.success} additional accounts. Total: ${this.accounts.length}`);
        } else {
          logger.error('Failed to generate required accounts');
        }
      } else {
        logger.info(`Account count sufficient: ${currentCount}/${requiredCount}`);
      }
      
      logger.info('Account manager initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize account manager', { error: error.message });
      return false;
    }
  }

  /**
   * 标记账户今日在指定IP下已达空投上限
   * @param {string} publicKey 公钥
   * @param {string} ip 当前出口IP
   */
  async markAirdropLimitReachedToday(publicKey, ip) {
    const account = this.accounts.find(acc => acc.publicKey === publicKey);
    if (account) {
      const today = new Date().toISOString().slice(0, 10);
      account.airdropLimitReachedDate = today;
      account.lastAirdropLimitIp = ip;
      await this.saveAccounts();
      logger.info(`Account ${account.id} marked as airdrop limit reached for today (${today}) on IP ${ip}`);
    }
  }

  /**
   * 获取下一个可用账户（同一IP+同一钱包当天遇到rate limit才跳过）
   * @param {string} currentIp 当前出口IP
   */
  async getNextAccount(currentIp = null) {
    if (!this.isLoaded) {
      await this.loadAccounts();
    }
    if (this.accounts.length === 0) {
      throw new Error('No accounts available. Please generate accounts first.');
    }
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    const cooldownMs = 30 * 60 * 1000;
    let nextIndex = (this.meta.lastUsedIndex + 1) % this.accounts.length;
    let attempts = 0;
    while (attempts < this.accounts.length) {
      const account = this.accounts[nextIndex];
      // 跳过今日在当前IP下已达上限的账户
      if (account.status === 'active' && (!account.airdropLimitReachedDate || account.airdropLimitReachedDate !== today || account.lastAirdropLimitIp !== currentIp)) {
        const lastUsed = account.lastUsed ? new Date(account.lastUsed).getTime() : 0;
        if (now - lastUsed >= cooldownMs) {
          account.lastUsed = new Date().toISOString();
          this.meta.lastUsedIndex = nextIndex;
          this.meta.updated = new Date().toISOString();
          await this.saveAccounts();
          logger.debug(`Selected account ${account.id}: ${truncateString(account.publicKey)}`);
          return account;
        }
      }
      nextIndex = (nextIndex + 1) % this.accounts.length;
      attempts++;
    }
    // 如果所有账户都不可用，返回冷却时间最短且未达上限的
    const todayAvailable = this.accounts.filter(acc => acc.status === 'active' && (!acc.airdropLimitReachedDate || acc.airdropLimitReachedDate !== today || acc.lastAirdropLimitIp !== currentIp));
    if (todayAvailable.length > 0) {
      const availableAccount = todayAvailable.sort((a, b) => {
        const aLastUsed = a.lastUsed ? new Date(a.lastUsed).getTime() : 0;
        const bLastUsed = b.lastUsed ? new Date(b.lastUsed).getTime() : 0;
        return aLastUsed - bLastUsed;
      })[0];
      logger.warn('All available accounts in cooldown or just reached limit.');
      return availableAccount;
    }
    throw new Error('No active accounts available (all reached airdrop limit today on this IP)');
  }

  /**
   * 停用账户并转移余额
   * @param {string} publicKey 公钥
   * @param {string} reason 停用原因
   */
  async disableAccountAndTransferBalance(publicKey, reason = 'Rate limited') {
    const account = this.accounts.find(acc => acc.publicKey === publicKey);
    if (!account) {
      logger.warn(`Account not found for disabling: ${publicKey}`);
      return { success: false, error: 'Account not found' };
    }

    // 标记账户为停用状态
    account.status = 'disabled';
    account.disabledReason = reason;
    account.disabledAt = new Date().toISOString();

    logger.info(`Account ${account.id} disabled due to: ${reason}`);

    // 如果账户有余额，自动转移到主账户
    if (account.balance && account.balance > 0.01) {
      try {
        const SolanaClient = require('./solana-client');
        const config = await require('fs-extra').readJson(require('path').join(__dirname, '../config/config.json'));
        const solanaClient = new SolanaClient(config.solana || {});
        
        const mainAccount = config.main?.mainAccount;
        if (!mainAccount) {
          logger.error('Main account not configured, cannot transfer balance');
          await this.saveAccounts();
          return { success: true, transferred: false, error: 'Main account not configured' };
        }

        // 转移余额，保留少量手续费
        const transferAmount = Math.max(0, account.balance - 0.001);
        if (transferAmount > 0) {
          const transferResult = await solanaClient.transfer(
            account.privateKey, 
            mainAccount, 
            transferAmount
          );

          if (transferResult.success) {
            logger.info(`Successfully transferred ${transferAmount} SOL from disabled account ${account.id} to main account`);
            account.balance = account.balance - transferAmount; // 更新余额
            account.lastTransfer = new Date().toISOString();
          } else {
            logger.error(`Failed to transfer balance from disabled account ${account.id}: ${transferResult.error}`);
          }

          await this.saveAccounts();
          return { 
            success: true, 
            transferred: transferResult.success, 
            amount: transferResult.success ? transferAmount : 0,
            transferError: transferResult.error 
          };
        }
      } catch (error) {
        logger.error(`Error transferring balance from disabled account ${account.id}:`, error);
        await this.saveAccounts();
        return { success: true, transferred: false, error: error.message };
      }
    }

    await this.saveAccounts();
    return { success: true, transferred: false, amount: 0 };
  }

  /**
   * 检查是否所有账户都已停用
   */
  areAllAccountsDisabled() {
    const activeAccounts = this.accounts.filter(acc => acc.status === 'active');
    return activeAccounts.length === 0;
  }

  /**
   * 重新生成所有子账户（清空旧的）
   */
  async regenerateAllAccounts(count = 50) {
    logger.info('Regenerating all sub-accounts...');
    
    // 清空旧账户
    this.accounts = [];
    this.meta = {
      generated: false,
      count: 0,
      lastUsedIndex: -1,
      created: null,
      updated: null
    };

    // 生成新账户
    const result = await this.generateAccounts(count);
    
    if (result.success > 0) {
      logger.info(`Successfully regenerated ${result.success} new accounts`);
      return { success: true, count: result.success };
    } else {
      logger.error('Failed to regenerate accounts');
      return { success: false, error: 'Failed to generate new accounts' };
    }
  }
}

module.exports = AccountManager;
