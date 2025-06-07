const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const path = require('path');
const fs = require('fs-extra');
const Logger = require('./logger');
const logger = Logger.default;
const { withRetry, randomBetween, formatSol, lamportsToSol, solToLamports, truncateString } = require('./utils');

class SolanaClient {
  constructor(config) {
    this.scriptsDir = path.join(__dirname, '../scripts');
    this.tempDir = path.join(__dirname, '../temp');
    this.config = config;
    
    // 确保临时目录存在
    this.ensureTempDir();
  }

  async ensureTempDir() {
    await fs.ensureDir(this.tempDir);
  }

  /**
   * 初始化客户端
   */
  async initialize() {
    // 确保临时目录存在
    await this.ensureTempDir();
    
    // 检查 Solana CLI 是否可用
    const isAvailable = await this.checkSolanaCliAvailable();
    if (!isAvailable) {
      logger.warn('Solana CLI not available, some operations may fail');
    }
    
    logger.info('Solana client initialized successfully');
    return true;
  }

  /**
   * 检查 Solana CLI 是否可用
   */
  async checkSolanaCliAvailable() {
    try {
      const { stdout } = await execAsync('solana --version');
      logger.info('Solana CLI version', { version: stdout.trim() });
      return true;
    } catch (error) {
      logger.error('Solana CLI not available', { error: error.message });
      return false;
    }
  }

  /**
   * 执行airdrop操作
   * @param {string} recipient 接收地址
   * @param {number} amount SOL数量
   * @param {string} privateKey 私钥（可选，用于指定源账户）
   */
  async requestAirdrop(recipient, amount, privateKey = null) {
    try {
      const scriptPath = path.join(this.scriptsDir, 'solana-airdrop.sh');
      let tempKeyFile = null;
      
      try {
        // 如果提供了私钥，创建临时密钥文件
        if (privateKey) {
          tempKeyFile = path.join(this.tempDir, `temp_key_${Date.now()}.json`);
          await fs.writeFile(tempKeyFile, privateKey);
        }
        
        const cmd = tempKeyFile 
          ? `${scriptPath} ${amount} ${recipient} ${tempKeyFile}`
          : `${scriptPath} ${amount} ${recipient}`;
        
        logger.debug(`Executing airdrop command for ${truncateString(recipient)}`);
        
        const result = await withRetry(async () => {
          const { stdout, stderr } = await execAsync(cmd, {
            timeout: 60000,
            env: { ...process.env, SOLANA_RPC_URL: this.config.rpcUrl }
          });
          
          return { stdout, stderr };
        }, 3, 5);
        
        // 解析输出以确定是否成功
        const output = result.stdout + result.stderr;
        
        if (this.isAirdropSuccessful(output)) {
          logger.logAirdrop(recipient, amount, 'success');
          return { success: true, amount, output };
        } else {
          const error = this.parseAirdropError(output);
          logger.logAirdrop(recipient, amount, 'failed', { error });
          return { success: false, error, output };
        }
        
      } finally {
        // 清理临时密钥文件
        if (tempKeyFile) {
          await fs.remove(tempKeyFile).catch(() => {});
        }
      }
      
    } catch (error) {
      logger.logAirdrop(recipient, amount, 'failed', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * 执行转账操作
   * @param {string} fromPrivateKey 发送方私钥
   * @param {string} toAddress 接收地址
   * @param {number} amount SOL数量
   */
  async transfer(fromPrivateKey, toAddress, amount) {
    let tempKeyFile = null;
    
    try {
      const scriptPath = path.join(this.scriptsDir, 'solana-transfer.sh');
      
      // 创建临时密钥文件
      tempKeyFile = path.join(this.tempDir, `transfer_key_${Date.now()}.json`);
      await fs.writeFile(tempKeyFile, fromPrivateKey);
      
      const cmd = `${scriptPath} ${amount} ${toAddress} ${tempKeyFile}`;
      
      logger.debug(`Executing transfer command: ${amount} SOL to ${truncateString(toAddress)}`);
      
      const result = await withRetry(async () => {
        const { stdout, stderr } = await execAsync(cmd, {
          timeout: 60000,
          env: { ...process.env, SOLANA_RPC_URL: this.config.rpcUrl }
        });
        
        return { stdout, stderr };
      }, 3, 5);
      
      const output = result.stdout + result.stderr;
      
      if (this.isTransferSuccessful(output)) {
        logger.logTransfer('account', toAddress, amount, 'success');
        return { success: true, amount, output };
      } else {
        const error = this.parseTransferError(output);
        logger.logTransfer('account', toAddress, amount, 'failed', { error });
        return { success: false, error, output };
      }
      
    } catch (error) {
      logger.logTransfer('account', toAddress, amount, 'failed', { error: error.message });
      return { success: false, error: error.message };
    } finally {
      // 清理临时密钥文件
      if (tempKeyFile) {
        await fs.remove(tempKeyFile).catch(() => {});
      }
    }
  }

  /**
   * 查询账户余额
   * @param {string} address 地址
   * @param {string} privateKey 私钥（可选）
   */
  async getBalance(address, privateKey = null) {
    let tempKeyFile = null;
    
    try {
      const scriptPath = path.join(this.scriptsDir, 'solana-balance.sh');
      
      // 如果提供了私钥，创建临时密钥文件
      if (privateKey) {
        tempKeyFile = path.join(this.tempDir, `balance_key_${Date.now()}.json`);
        await fs.writeFile(tempKeyFile, privateKey);
      }
      
      const cmd = tempKeyFile 
        ? `${scriptPath} ${address} ${tempKeyFile}`
        : `${scriptPath} ${address}`;
      
      const result = await withRetry(async () => {
        const { stdout, stderr } = await execAsync(cmd, {
          timeout: 30000,
          env: { ...process.env, SOLANA_RPC_URL: this.config.rpcUrl }
        });
        
        return { stdout, stderr };
      }, 2, 3);
      
      // 解析余额（脚本返回的是SOL数量）
      const balanceStr = result.stdout.trim();
      const balance = parseFloat(balanceStr);
      
      if (!isNaN(balance)) {
        return { success: true, balance, lamports: solToLamports(balance) };
      } else {
        return { success: false, error: 'Invalid balance format' };
      }
      
    } catch (error) {
      logger.error(`Failed to get balance for ${truncateString(address)}`, { error: error.message });
      return { success: false, error: error.message };
    } finally {
      // 清理临时密钥文件
      if (tempKeyFile) {
        await fs.remove(tempKeyFile).catch(() => {});
      }
    }
  }

  /**
   * 批量查询账户余额
   * @param {Array} accounts 账户列表
   */
  async getBalances(accounts) {
    const results = [];
    
    for (const account of accounts) {
      try {
        const result = await this.getBalance(account.publicKey, account.privateKey);
        results.push({
          account: account.id,
          publicKey: account.publicKey,
          ...result
        });
        
        // 添加小延迟避免请求过快
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        results.push({
          account: account.id,
          publicKey: account.publicKey,
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * 检查airdrop是否成功
   */
  isAirdropSuccessful(output) {
    const successPatterns = [
      /successfully/i,
      /confirmed/i,
      /signature/i,
      /airdrop.*complete/i
    ];
    
    return successPatterns.some(pattern => pattern.test(output));
  }

  /**
   * 检查转账是否成功
   */
  isTransferSuccessful(output) {
    const successPatterns = [
      /signature/i,
      /confirmed/i,
      /successful/i,
      /transfer.*complete/i
    ];
    
    return successPatterns.some(pattern => pattern.test(output));
  }

  /**
   * 解析airdrop错误信息
   */
  parseAirdropError(output) {
    const errorPatterns = [
      { pattern: /rate.*limit/i, message: 'Rate limited' },
      { pattern: /insufficient.*fund/i, message: 'Insufficient funds' },
      { pattern: /invalid.*address/i, message: 'Invalid address' },
      { pattern: /network.*error/i, message: 'Network error' },
      { pattern: /timeout/i, message: 'Request timeout' },
      { pattern: /too many requests/i, message: 'Too many requests' },
      { pattern: /blocked/i, message: 'Request blocked' }
    ];
    
    for (const { pattern, message } of errorPatterns) {
      if (pattern.test(output)) {
        return message;
      }
    }
    
    return 'Unknown error';
  }

  /**
   * 解析转账错误信息
   */
  parseTransferError(output) {
    const errorPatterns = [
      { pattern: /insufficient.*fund/i, message: 'Insufficient funds' },
      { pattern: /invalid.*address/i, message: 'Invalid address' },
      { pattern: /invalid.*keypair/i, message: 'Invalid keypair' },
      { pattern: /network.*error/i, message: 'Network error' },
      { pattern: /timeout/i, message: 'Request timeout' },
      { pattern: /simulation.*failed/i, message: 'Transaction simulation failed' }
    ];
    
    for (const { pattern, message } of errorPatterns) {
      if (pattern.test(output)) {
        return message;
      }
    }
    
    return 'Unknown error';
  }

  /**
   * 检查是否为速率限制错误
   */
  isRateLimitError(output) {
    const rateLimitPatterns = [
      /rate.*limit/i,
      /too many requests/i,
      /blocked/i,
      /429/
    ];
    
    return rateLimitPatterns.some(pattern => pattern.test(output));
  }

  /**
   * 检查是否为网络错误
   */
  isNetworkError(output) {
    const networkErrorPatterns = [
      /network.*error/i,
      /connection.*failed/i,
      /timeout/i,
      /unreachable/i
    ];
    
    return networkErrorPatterns.some(pattern => pattern.test(output));
  }

  /**
   * 执行完整的领取和转账流程
   * @param {object} account 账户信息
   * @param {string} mainAccount 主账户地址
   * @param {number} airdropAmount 领取数量
   * @param {number} transferThreshold 转账阈值
   */
  async executeAirdropFlow(account, mainAccount, airdropAmount, transferThreshold) {
    const results = {
      airdrop: null,
      transfer: null,
      finalBalance: null
    };
    
    try {
      // 1. 执行airdrop
      const airdropAmount = randomBetween(this.config.amountRange.min, this.config.amountRange.max);
      results.airdrop = await this.requestAirdrop(account.publicKey, airdropAmount);
      
      if (!results.airdrop.success) {
        return results;
      }
      
      // 2. 检查余额
      await new Promise(resolve => setTimeout(resolve, 5000)); // 等待确认
      const balanceResult = await this.getBalance(account.publicKey);
      
      if (balanceResult.success && balanceResult.balance >= transferThreshold) {
        // 3. 转账到主账户，保留少量gas费
        const transferAmount = Math.max(0, balanceResult.balance - 0.01);
        
        if (transferAmount > 0) {
          results.transfer = await this.transfer(account.privateKey, mainAccount, transferAmount);
        }
      }
      
      // 4. 获取最终余额
      const finalBalanceResult = await this.getBalance(account.publicKey);
      if (finalBalanceResult.success) {
        results.finalBalance = finalBalanceResult.balance;
      }
      
      return results;
      
    } catch (error) {
      logger.error(`Airdrop flow failed for account ${account.id}`, { error: error.message });
      return results;
    }
  }
}

// 命令行支持
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--check-all')) {
    // 检查所有账户余额的功能
    const AccountManager = require('./account-manager');
    const config = require('../config/config.json');
    
    const accountManager = new AccountManager();
    const solanaClient = new SolanaClient(config.network);
    
    accountManager.loadAccounts()
      .then(async () => {
        const accounts = accountManager.accounts;
        console.log(`Checking balances for ${accounts.length} accounts...`);
        
        const results = await solanaClient.getBalances(accounts);
        
        let totalBalance = 0;
        results.forEach(result => {
          if (result.success) {
            console.log(`${result.account}: ${result.balance} SOL`);
            totalBalance += result.balance;
          } else {
            console.log(`${result.account}: Error - ${result.error}`);
          }
        });
        
        console.log(`\nTotal balance: ${totalBalance} SOL`);
        process.exit(0);
      })
      .catch(error => {
        console.error('Failed to check balances:', error.message);
        process.exit(1);
      });
  } else {
    console.log('Usage:');
    console.log('  node solana-client.js --check-all    # Check all account balances');
    process.exit(1);
  }
}

module.exports = SolanaClient;
