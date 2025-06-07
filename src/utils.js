const fs = require('fs-extra');
const path = require('path');
const moment = require('moment');

/**
 * 延迟函数
 * @param {number} ms 毫秒
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 生成随机数
 * @param {number} min 最小值
 * @param {number} max 最大值
 * @returns {number} 随机数
 */
const randomBetween = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * 生成随机延迟时间
 * @param {number} minSeconds 最小秒数
 * @param {number} maxSeconds 最大秒数
 * @returns {number} 毫秒数
 */
const randomDelay = (minSeconds, maxSeconds) => {
  return randomBetween(minSeconds, maxSeconds) * 1000;
};

/**
 * 检查是否在运行时间窗口内
 * @param {number} startHour 开始小时 (0-23)
 * @param {number} endHour 结束小时 (0-23)
 * @returns {boolean} 是否在时间窗口内
 */
const isInTimeWindow = (startHour, endHour) => {
  const now = moment();
  const currentHour = now.hour();
  
  // 跨天的情况 (如 22:00 - 06:00)
  if (startHour > endHour) {
    return currentHour >= startHour || currentHour < endHour;
  }
  // 同一天的情况 (如 09:00 - 17:00)
  return currentHour >= startHour && currentHour < endHour;
};

/**
 * 格式化SOL金额
 * @param {number} lamports Lamports数量
 * @returns {string} 格式化的SOL金额
 */
const formatSol = (lamports) => {
  const sol = lamports / 1e9;
  return `${sol.toFixed(4)} SOL`;
};

/**
 * SOL转换为lamports
 * @param {number} sol SOL数量
 * @returns {number} Lamports数量
 */
const solToLamports = (sol) => {
  return Math.floor(sol * 1e9);
};

/**
 * Lamports转换为SOL
 * @param {number} lamports Lamports数量
 * @returns {number} SOL数量
 */
const lamportsToSol = (lamports) => {
  return lamports / 1e9;
};

/**
 * 安全读取JSON文件
 * @param {string} filePath 文件路径
 * @param {*} defaultValue 默认值
 * @returns {*} 解析后的JSON或默认值
 */
const safeReadJson = async (filePath, defaultValue = {}) => {
  try {
    if (!await fs.pathExists(filePath)) {
      return defaultValue;
    }
    const content = await fs.readJson(filePath);
    return content;
  } catch (error) {
    console.warn(`Failed to read JSON file ${filePath}:`, error.message);
    return defaultValue;
  }
};

/**
 * 安全写入JSON文件
 * @param {string} filePath 文件路径
 * @param {*} data 要写入的数据
 * @returns {boolean} 是否成功
 */
const safeWriteJson = async (filePath, data) => {
  try {
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeJson(filePath, data, { spaces: 2 });
    return true;
  } catch (error) {
    console.error(`Failed to write JSON file ${filePath}:`, error.message);
    return false;
  }
};

/**
 * 解析Solana地址（简化验证）
 * @param {string} address 地址字符串
 * @returns {boolean} 是否为有效地址
 */
const isValidSolanaAddress = (address) => {
  if (!address || typeof address !== 'string') {
    return false;
  }
  // Solana地址通常是32字节，base58编码后约44个字符
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
};

/**
 * 计算指数退避延迟
 * @param {number} attempt 尝试次数 (从0开始)
 * @param {number} baseDelay 基础延迟秒数
 * @param {number} maxDelay 最大延迟秒数
 * @returns {number} 延迟毫秒数
 */
const exponentialBackoff = (attempt, baseDelay = 1, maxDelay = 300) => {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  // 添加一些随机性避免所有请求同时重试
  const jitter = delay * 0.1 * Math.random();
  return (delay + jitter) * 1000;
};

/**
 * 安全执行异步函数，带重试机制
 * @param {Function} fn 要执行的异步函数
 * @param {number} maxRetries 最大重试次数
 * @param {number} baseDelay 基础延迟秒数
 * @returns {Promise<*>} 执行结果
 */
const withRetry = async (fn, maxRetries = 3, baseDelay = 1) => {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      const delay = exponentialBackoff(attempt, baseDelay);
      console.warn(`Attempt ${attempt + 1} failed, retrying in ${delay/1000}s...`, error.message);
      await sleep(delay);
    }
  }
  
  throw lastError;
};

/**
 * 截断字符串用于日志显示
 * @param {string} str 原字符串
 * @param {number} maxLength 最大长度
 * @returns {string} 截断后的字符串
 */
const truncateString = (str, maxLength = 16) => {
  if (!str || str.length <= maxLength) {
    return str;
  }
  const prefixLength = Math.floor((maxLength - 3) / 2);
  const suffixLength = maxLength - 3 - prefixLength;
  return `${str.substring(0, prefixLength)}...${str.substring(str.length - suffixLength)}`;
};

/**
 * 生成唯一ID
 * @returns {string} 唯一ID
 */
const generateId = () => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * 清理过期日志文件
 * @param {string} logDir 日志目录
 * @param {number} retentionDays 保留天数
 */
const cleanupOldLogs = async (logDir, retentionDays = 7) => {
  try {
    if (!await fs.pathExists(logDir)) {
      return;
    }
    
    const files = await fs.readdir(logDir);
    const cutoffDate = moment().subtract(retentionDays, 'days');
    
    for (const file of files) {
      const filePath = path.join(logDir, file);
      const stats = await fs.stat(filePath);
      
      if (moment(stats.mtime).isBefore(cutoffDate)) {
        await fs.remove(filePath);
        console.log(`Cleaned up old log file: ${file}`);
      }
    }
  } catch (error) {
    console.error('Failed to cleanup old logs:', error.message);
  }
};

module.exports = {
  sleep,
  randomBetween,
  randomDelay,
  isInTimeWindow,
  formatSol,
  solToLamports,
  lamportsToSol,
  safeReadJson,
  safeWriteJson,
  isValidSolanaAddress,
  exponentialBackoff,
  withRetry,
  truncateString,
  generateId,
  cleanupOldLogs
};
