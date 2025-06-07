const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs-extra');

class Logger {
  constructor(config = {}) {
    this.config = {
      level: 'info',
      retentionDays: 7,
      maxFiles: 10,
      maxSize: '20m',
      ...config
    };
    this.logsDir = path.join(__dirname, '../logs');
    this.ensureLogDirectory();
    this.logger = this.createLogger();
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirpSync(this.logsDir);
    }
  }

  createLogger() {
    const logFormat = winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
      }),
      winston.format.errors({ stack: true }),
      winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        const stackStr = stack ? `\n${stack}` : '';
        return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}${stackStr}`;
      })
    );

    return winston.createLogger({
      level: this.config.level,
      format: logFormat,
      transports: [
        // 控制台输出
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            logFormat
          )
        }),
        
        // 每日轮转日志文件
        new DailyRotateFile({
          filename: path.join(this.logsDir, 'application-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: this.config.maxSize,
          maxFiles: `${this.config.retentionDays}d`,
          format: logFormat
        }),
        
        // 错误日志单独文件
        new DailyRotateFile({
          filename: path.join(this.logsDir, 'error-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          level: 'error',
          maxSize: this.config.maxSize,
          maxFiles: `${this.config.retentionDays}d`,
          format: logFormat
        })
      ]
    });
  }

  info(message, meta = {}) {
    this.logger.info(message, meta);
  }

  warn(message, meta = {}) {
    this.logger.warn(message, meta);
  }

  error(message, meta = {}) {
    this.logger.error(message, meta);
  }

  debug(message, meta = {}) {
    this.logger.debug(message, meta);
  }

  logOperation(operation, result, meta = {}) {
    const logData = {
      operation,
      result,
      timestamp: new Date().toISOString(),
      ...meta
    };
    
    if (result === 'success') {
      this.info(`Operation ${operation} completed successfully`, logData);
    } else {
      this.error(`Operation ${operation} failed`, logData);
    }
  }

  logAirdrop(account, amount, result, meta = {}) {
    this.logOperation('airdrop', result, {
      account: account.substring(0, 8) + '...',
      amount,
      ...meta
    });
  }

  logTransfer(from, to, amount, result, meta = {}) {
    this.logOperation('transfer', result, {
      from: from.substring(0, 8) + '...',
      to: to.substring(0, 8) + '...',
      amount,
      ...meta
    });
  }

  logProxySwitch(oldProxy, newProxy, result, meta = {}) {
    this.logOperation('proxy_switch', result, {
      oldProxy,
      newProxy,
      ...meta
    });
  }
}

// 创建默认实例以向后兼容
const defaultLogger = new Logger();

// 导出类和默认实例
module.exports = Logger;
module.exports.default = defaultLogger;
