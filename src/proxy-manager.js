const axios = require('axios');
const Logger = require('./logger');
const logger = Logger.default;
const { withRetry, sleep, randomBetween } = require('./utils');

class ProxyManager {
  constructor(config) {
    this.clashApi = config.clashApi || 'http://127.0.0.1:9097';
    this.proxyGroup = config.proxyGroup || 'BV用户后台!';
    this.allowedRegions = config.allowedRegions || ['US', 'SG', 'JP', 'KR', 'HK', 'TW'];
    this.switchInterval = config.switchInterval || { min: 5, max: 8 };
    
    this.currentProxy = null;
    this.availableProxies = [];
    this.proxyStats = new Map(); // 代理使用统计
    this.lastSwitchTime = 0;
    this.switchCount = 0;
    
    this.axiosInstance = axios.create({
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * 初始化代理管理器
   */
  async initialize() {
    try {
      await this.loadAvailableProxies();
      await this.selectRandomProxy();
      logger.info('Proxy manager initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize proxy manager', { error: error.message });
      return false;
    }
  }

  /**
   * 加载可用代理列表
   */
  async loadAvailableProxies() {
    try {
      const response = await withRetry(async () => {
        return await this.axiosInstance.get(`${this.clashApi}/proxies/${encodeURIComponent(this.proxyGroup)}`);
      }, 3);

      const proxyGroup = response.data;
      if (!proxyGroup || !proxyGroup.all) {
        throw new Error('Invalid proxy group response');
      }

      // 筛选可用区域的代理
      this.availableProxies = proxyGroup.all.filter(proxyName => {
        // 使用emoji标志匹配地区
        return this.allowedRegions.some(region => {
          const regionEmojis = this.getRegionEmojis(region);
          const regionTexts = this.getRegionAliases(region);
          
          // 检查emoji匹配
          const hasEmojiMatch = regionEmojis.some(emoji => proxyName.includes(emoji));
          
          // 检查文本匹配（作为备选）
          const lowerName = proxyName.toLowerCase();
          const hasTextMatch = regionTexts.some(alias => lowerName.includes(alias.toLowerCase()));
          
          return hasEmojiMatch || hasTextMatch;
        });
      });

      if (this.availableProxies.length === 0) {
        throw new Error(`No proxies found for allowed regions: ${this.allowedRegions.join(', ')}`);
      }

      logger.info(`Loaded ${this.availableProxies.length} available proxies`);
      return this.availableProxies;
    } catch (error) {
      logger.error('Failed to load available proxies', { error: error.message });
      throw error;
    }
  }

  /**
   * 获取地区emoji标志
   */
  getRegionEmojis(region) {
    const emojis = {
      'US': ['🇺🇸'],
      'SG': ['🇸🇬'],
      'JP': ['🇯🇵'],
      'KR': ['🇰🇷'],
      'HK': ['🇭🇰'],
      'TW': ['🇹🇼']
    };
    
    return emojis[region] || [];
  }

  /**
   * 获取地区别名（用于匹配代理名称）
   */
  getRegionAliases(region) {
    const aliases = {
      'US': ['usa', 'america', 'united states', 'phoenix', 'portland', 'los angeles', 'san jose'],
      'SG': ['singapore'],
      'JP': ['japan', 'tokyo', 'osaka'],
      'KR': ['korea', 'seoul'],
      'HK': ['hong kong', 'hongkong'],
      'TW': ['taiwan', 'taipei']
    };
    
    return aliases[region] || [region.toLowerCase()];
  }

  /**
   * 检查当前代理状态
   */
  async getCurrentProxy() {
    try {
      const response = await withRetry(async () => {
        return await this.axiosInstance.get(`${this.clashApi}/proxies/${encodeURIComponent(this.proxyGroup)}`);
      }, 2);

      const proxyGroup = response.data;
      this.currentProxy = proxyGroup.now;
      
      return this.currentProxy;
    } catch (error) {
      logger.error('Failed to get current proxy', { error: error.message });
      return null;
    }
  }

  /**
   * 切换到指定代理
   * @param {string} proxyName 代理名称
   */
  async switchToProxy(proxyName) {
    try {
      if (!this.availableProxies.includes(proxyName)) {
        throw new Error(`Proxy ${proxyName} not available`);
      }

      const oldProxy = this.currentProxy;
      
      const response = await withRetry(async () => {
        return await this.axiosInstance.put(
          `${this.clashApi}/proxies/${encodeURIComponent(this.proxyGroup)}`,
          { name: proxyName }
        );
      }, 3);

      if (response.status === 204 || response.status === 200) {
        this.currentProxy = proxyName;
        this.lastSwitchTime = Date.now();
        this.switchCount++;
        
        // 更新代理统计
        if (!this.proxyStats.has(proxyName)) {
          this.proxyStats.set(proxyName, { uses: 0, lastUsed: null, errors: 0 });
        }
        const stats = this.proxyStats.get(proxyName);
        stats.uses++;
        stats.lastUsed = new Date().toISOString();
        
        logger.logProxySwitch(oldProxy, proxyName, 'success');
        
        // 等待代理切换生效
        await sleep(2000);
        
        return true;
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error) {
      logger.logProxySwitch(this.currentProxy, proxyName, 'failed', { error: error.message });
      
      // 记录代理错误
      if (this.proxyStats.has(proxyName)) {
        this.proxyStats.get(proxyName).errors++;
      }
      
      throw error;
    }
  }

  /**
   * 选择随机代理
   */
  async selectRandomProxy() {
    if (this.availableProxies.length === 0) {
      await this.loadAvailableProxies();
    }

    // 排除当前代理，选择其他代理
    const availableOptions = this.availableProxies.filter(proxy => proxy !== this.currentProxy);
    
    if (availableOptions.length === 0) {
      logger.warn('No alternative proxies available');
      return false;
    }

    // 选择使用次数较少的代理
    const proxyWithStats = availableOptions.map(proxy => {
      const stats = this.proxyStats.get(proxy) || { uses: 0, errors: 0 };
      return { proxy, ...stats };
    });

    // 排序：优先选择使用次数少且错误率低的代理
    proxyWithStats.sort((a, b) => {
      const aScore = a.uses + a.errors * 2;
      const bScore = b.uses + b.errors * 2;
      return aScore - bScore;
    });

    // 从前3个中随机选择
    const topCandidates = proxyWithStats.slice(0, Math.min(3, proxyWithStats.length));
    const selectedProxy = topCandidates[randomBetween(0, topCandidates.length - 1)].proxy;

    return await this.switchToProxy(selectedProxy);
  }

  /**
   * 检查是否需要切换代理
   * @param {number} operationCount 当前操作次数
   */
  shouldSwitchProxy(operationCount) {
    const { min, max } = this.switchInterval;
    const threshold = randomBetween(min, max);
    
    return operationCount > 0 && operationCount % threshold === 0;
  }

  /**
   * 智能切换代理（根据策略）
   * @param {number} operationCount 当前操作次数
   * @param {boolean} forceSwitch 强制切换
   */
  async smartSwitch(operationCount, forceSwitch = false) {
    if (forceSwitch || this.shouldSwitchProxy(operationCount)) {
      try {
        await this.selectRandomProxy();
        logger.info(`Switched proxy after ${operationCount} operations`);
        return true;
      } catch (error) {
        logger.error('Failed to switch proxy', { error: error.message });
        return false;
      }
    }
    return false;
  }

  /**
   * 测试代理连接
   * @param {string} testUrl 测试URL
   */
  async testProxy(testUrl = 'https://api.devnet.solana.com') {
    try {
      const start = Date.now();
      const response = await axios.get(testUrl, {
        timeout: 10000,
        proxy: false // 使用系统代理设置
      });
      
      const latency = Date.now() - start;
      
      if (response.status === 200) {
        logger.debug(`Proxy test successful, latency: ${latency}ms`);
        return { success: true, latency };
      } else {
        return { success: false, error: `HTTP ${response.status}` };
      }
    } catch (error) {
      logger.debug(`Proxy test failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 测试代理连接（简化版本）
   * @param {string} testUrl 测试URL
   */
  async testConnection(testUrl = 'https://api.devnet.solana.com') {
    // 如果没有可用代理，直接返回 false
    if (this.availableProxies.length === 0 || !this.currentProxy) {
      logger.debug('No proxies available, skipping connection test');
      return false;
    }
    
    const result = await this.testProxy(testUrl);
    return result.success;
  }

  /**
   * 获取代理统计信息
   */
  getProxyStats() {
    return {
      current: this.currentProxy,
      available: this.availableProxies.length,
      switchCount: this.switchCount,
      lastSwitchTime: this.lastSwitchTime,
      stats: Object.fromEntries(this.proxyStats)
    };
  }

  /**
   * 重置代理统计
   */
  resetStats() {
    this.proxyStats.clear();
    this.switchCount = 0;
    this.lastSwitchTime = 0;
    logger.info('Proxy statistics reset');
  }

  /**
   * 处理代理错误（切换到新代理）
   */
  async handleProxyError() {
    logger.warn('Handling proxy error, switching to new proxy...');
    try {
      await this.selectRandomProxy();
      return true;
    } catch (error) {
      logger.error('Failed to handle proxy error', { error: error.message });
      return false;
    }
  }

  /**
   * 检查代理是否启用
   */
  isEnabled() {
    return this.availableProxies.length > 0 && this.currentProxy !== null;
  }

  /**
   * 获取当前出口IP（通过本地代理端口请求api.ipify.org）
   */
  async getCurrentIp() {
    try {
      // 默认clash本地代理端口为7897
      const proxyUrl = 'http://127.0.0.1:7897';
      const axios = require('axios');
      const res = await axios.get('https://api.ipify.org', {
        proxy: {
          host: '127.0.0.1',
          port: 7897
        },
        timeout: 5000
      });
      return res.data;
    } catch (e) {
      // 失败时返回null
      return null;
    }
  }
}

module.exports = ProxyManager;
