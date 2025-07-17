const fs = require('fs-extra');
const path = require('path');
const Logger = require('./logger');
const logger = Logger.default;

class SystemState {
  constructor() {
    this.statePath = path.join(__dirname, '../data/system-state.json');
    this.state = {
      isHibernating: false,
      hibernationStartTime: null,
      nextResetTime: null,
      lastOperationTime: null,
      disabledAccountsCount: 0,
      systemStartTime: null,
      lastSavedTime: null
    };
  }

  /**
   * 加载系统状态
   */
  async loadState() {
    try {
      if (await fs.pathExists(this.statePath)) {
        const data = await fs.readJson(this.statePath);
        this.state = { ...this.state, ...data };
        logger.info('System state loaded from disk', this.state);
        return true;
      } else {
        logger.info('No existing system state found, using default state');
        return false;
      }
    } catch (error) {
      logger.error('Failed to load system state', { error: error.message });
      return false;
    }
  }

  /**
   * 保存系统状态
   */
  async saveState() {
    try {
      this.state.lastSavedTime = new Date().toISOString();
      await fs.ensureDir(path.dirname(this.statePath));
      await fs.writeJson(this.statePath, this.state, { spaces: 2 });
      logger.debug('System state saved to disk');
      return true;
    } catch (error) {
      logger.error('Failed to save system state', { error: error.message });
      return false;
    }
  }

  /**
   * 设置休眠状态
   */
  async setHibernationState(isHibernating, nextResetTime = null) {
    this.state.isHibernating = isHibernating;
    this.state.hibernationStartTime = isHibernating ? new Date().toISOString() : null;
    this.state.nextResetTime = nextResetTime;
    await this.saveState();
    logger.info(`Hibernation state updated: ${isHibernating}`, { nextResetTime });
  }

  /**
   * 更新最后操作时间
   */
  async updateLastOperationTime() {
    this.state.lastOperationTime = new Date().toISOString();
    await this.saveState();
  }

  /**
   * 更新停用账户数量
   */
  async updateDisabledAccountsCount(count) {
    this.state.disabledAccountsCount = count;
    await this.saveState();
  }

  /**
   * 设置系统启动时间
   */
  async setSystemStartTime() {
    this.state.systemStartTime = new Date().toISOString();
    await this.saveState();
  }

  /**
   * 获取当前状态
   */
  getState() {
    return { ...this.state };
  }

  /**
   * 检查是否需要恢复休眠状态
   */
  shouldRestoreHibernation() {
    if (!this.state.isHibernating || !this.state.nextResetTime) {
      return false;
    }

    const now = new Date();
    const nextReset = new Date(this.state.nextResetTime);
    
    // 如果下次重置时间还没到，需要恢复休眠状态
    return now < nextReset;
  }

  /**
   * 获取到下次重置的剩余时间（毫秒）
   */
  getTimeUntilReset() {
    if (!this.state.nextResetTime) {
      return 0;
    }

    const now = new Date();
    const nextReset = new Date(this.state.nextResetTime);
    return Math.max(0, nextReset.getTime() - now.getTime());
  }

  /**
   * 清除休眠状态
   */
  async clearHibernationState() {
    this.state.isHibernating = false;
    this.state.hibernationStartTime = null;
    this.state.nextResetTime = null;
    await this.saveState();
    logger.info('Hibernation state cleared');
  }

  /**
   * 检查是否在今天之前停用的账户（用于每日重置检查）
   */
  isHibernationOutdated() {
    if (!this.state.nextResetTime) {
      return false;
    }

    const resetTime = new Date(this.state.nextResetTime);
    const now = new Date();
    
    // 如果重置时间已经过了，说明休眠状态过期了
    return now >= resetTime;
  }
}

module.exports = SystemState;
