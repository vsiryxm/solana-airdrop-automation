const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

class WebServer {
  constructor(options) {
    this.config = options;
    this.getSystemData = options.getSystemData;
    this.controlSystem = options.controlSystem;
    this.logger = options.logger;
    
    this.app = express();
    this.server = null;
    this.wss = null;
    this.port = options.port || 3008;
    this.clients = new Set();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  setupMiddleware() {
    // 静态文件服务
    this.app.use(express.static(path.join(__dirname, '../web')));
    
    // JSON解析
    this.app.use(express.json());
    
    // 日志中间件
    this.app.use((req, res, next) => {
      if (this.logger) {
        this.logger.debug(`${req.method} ${req.path}`);
      }
      next();
    });
    
    // CORS 支持
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });
  }

  setupWebSocket() {
    // WebSocket 服务器将在 HTTP 服务器启动时初始化
  }

  setupRoutes() {
    // 主页
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../web/index.html'));
    });

    // API: 获取系统状态
    this.app.get('/api/status', async (req, res) => {
      try {
        const systemData = this.getSystemData ? await this.getSystemData() : {};
        res.json({
          success: true,
          status: systemData.status || {},
          proxy: systemData.proxy || {},
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // API: 获取统计信息
    this.app.get('/api/stats', async (req, res) => {
      try {
        let stats = {};
        if (fs.existsSync(historyPath)) {
          const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
          stats = history.stats || {};
        }
        // 兼容前端 totalSol 字段
        stats.totalSol = typeof stats.totalEarned === 'number' ? stats.totalEarned : (parseFloat(stats.totalEarned) || 0);
        res.json({
          success: true,
          data: stats
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // API: 获取账户信息
    this.app.get('/api/accounts', async (req, res) => {
      try {
        const systemData = this.getSystemData ? await this.getSystemData() : {};
        // 只去除privateKey字段，不再处理balance
        const accounts = (systemData.accounts || []).map(acc => {
          const { privateKey, ...rest } = acc;
          return rest;
        });
        res.json({
          success: true,
          data: accounts,
          mainAccount: systemData.mainAccount || null
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // API: 刷新账户余额
    this.app.post('/api/accounts/refresh-balances', async (req, res) => {
      try {
        // 强制热加载最新账户数据
        const systemData = this.getSystemData ? await this.getSystemData() : {};
        const accounts = (systemData.accounts || []).map(acc => ({
          ...acc,
          balance: acc.balance ? (typeof acc.balance === 'number' ? acc.balance / 1e9 : acc.balance) : 0
        }));
        res.json({
          success: true,
          message: '余额刷新成功',
          accounts
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // API: 系统控制
    this.app.post('/api/start', async (req, res) => {
      try {
        const result = this.controlSystem ? await this.controlSystem('start') : false;
        res.json({
          success: result,
          message: result ? '系统启动成功' : '系统启动失败'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    this.app.post('/api/stop', async (req, res) => {
      try {
        const result = this.controlSystem ? await this.controlSystem('stop') : false;
        res.json({
          success: result,
          message: result ? '系统停止成功' : '系统停止失败'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    this.app.post('/api/proxy/switch', async (req, res) => {
      try {
        const result = this.controlSystem ? await this.controlSystem('switch-proxy') : false;
        res.json({
          success: result,
          message: result ? '代理切换成功' : '代理切换失败',
          proxy: result ? 'switched' : null
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    this.app.post('/api/reset', async (req, res) => {
      try {
        const result = this.controlSystem ? await this.controlSystem('reset-stats') : false;
        res.json({
          success: result,
          message: result ? '系统重置成功' : '系统重置失败'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // API: 获取日志
    this.app.get('/api/logs', async (req, res) => {
      try {
        let logs = [];
        if (fs.existsSync(historyPath)) {
          const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
          logs = history.logs || [];
        }
        res.json({
          success: true,
          logs: logs.slice(-100)
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // API: 获取Solana配置
    this.app.get('/api/config', async (req, res) => {
      try {
        const systemData = this.getSystemData ? await this.getSystemData() : {};
        res.json({
          success: true,
          data: {
            rpcUrl: systemData.config?.solana?.rpcUrl || 'https://api.devnet.solana.com',
            mainAccountAddress: systemData.mainAccount?.address || null,
            network: systemData.config?.solana?.network || 'devnet'
          }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // API: 合并余额
    this.app.post('/api/accounts/merge-balances', async (req, res) => {
      try {
        const { exec } = require('child_process');
        const scriptPath = path.join(__dirname, '../bak/scripts/balance-merger.js');
        exec(`node "${scriptPath}"`, { timeout: 120000 }, (error, stdout, stderr) => {
          if (error) {
            res.status(500).json({ success: false, error: stderr || error.message });
          } else {
            res.json({ success: true, message: '余额合并已发起', output: stdout });
          }
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // 404处理
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: 'Not found'
      });
    });

    // 错误处理
    this.app.use((error, req, res, next) => {
      if (this.logger) {
        this.logger.error('Web server error', { error: error.message, path: req.path });
      }
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    });
  }

  async start() {
    try {
      // 创建 HTTP 服务器
      this.server = http.createServer(this.app);
      
      // 创建 WebSocket 服务器
      this.wss = new WebSocket.Server({ 
        server: this.server,
        path: '/ws'
      });
      
      // 处理 WebSocket 连接
      this.wss.on('connection', async (ws, req) => {
        if (this.logger) {
          this.logger.info('WebSocket 客户端连接', { ip: req.socket.remoteAddress });
        }
        
        this.clients.add(ws);
        
        // 发送欢迎消息和初始数据
        ws.send(JSON.stringify({
          type: 'connected',
          message: '连接成功',
          timestamp: new Date().toISOString()
        }));
        
        // 发送当前系统数据
        if (this.getSystemData) {
          try {
            const systemData = await this.getSystemData();
            ws.send(JSON.stringify({
              type: 'init',
              data: systemData
            }));
          } catch (error) {
            if (this.logger) {
              this.logger.error('Failed to get system data for WebSocket', { error: error.message });
            }
          }
        }
        
        // 处理客户端断开
        ws.on('close', () => {
          this.clients.delete(ws);
          if (this.logger) {
            this.logger.info('WebSocket 客户端断开');
          }
        });
        
        // 处理客户端错误
        ws.on('error', (error) => {
          this.clients.delete(ws);
          if (this.logger) {
            this.logger.error('WebSocket 客户端错误', { error: error.message });
          }
        });
      });
      
      // 启动服务器
      await new Promise((resolve, reject) => {
        this.server.listen(this.port, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
      
      if (this.logger) {
        this.logger.info(`Web 服务器启动成功，端口: ${this.port}`);
        this.logger.info(`监控界面: http://localhost:${this.port}`);
      }
      
      // 启动定期更新主账户余额的任务（每30秒更新一次）
      this.balanceUpdateInterval = setInterval(async () => {
        if (this.getSystemData && this.clients.size > 0) {
          try {
            const systemData = await this.getSystemData();
            if (systemData.mainAccount) {
              this.broadcast('mainAccount', systemData.mainAccount);
            }
          } catch (error) {
            if (this.logger) {
              this.logger.warn('定期更新主账户余额失败:', error.message);
            }
          }
        }
      }, 30000);
      
      return true;
    } catch (error) {
      if (this.logger) {
        this.logger.error('Web 服务器启动失败', { error: error.message });
      }
      throw error;
    }
  }

  async stop() {
    try {
      // 清理定时器
      if (this.balanceUpdateInterval) {
        clearInterval(this.balanceUpdateInterval);
        this.balanceUpdateInterval = null;
      }
      
      // 关闭所有 WebSocket 连接
      if (this.wss) {
        this.wss.clients.forEach(ws => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
        });
        this.wss.close();
      }
      
      // 关闭 HTTP 服务器
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(() => {
            resolve();
          });
        });
      }
      
      this.clients.clear();
      
      if (this.logger) {
        this.logger.info('Web 服务器已停止');
      }
      
      return true;
    } catch (error) {
      if (this.logger) {
        this.logger.error('Web 服务器停止失败', { error: error.message });
      }
      throw error;
    }
  }

  // 广播消息给所有连接的客户端
  broadcast(type, data) {
    const message = JSON.stringify({
      type,
      data,
      timestamp: new Date().toISOString()
    });
    
    this.clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(message);
        } catch (error) {
          // 移除失效的连接
          this.clients.delete(ws);
        }
      }
    });
  }

  // 日志广播增强
  sendLog(level, message) {
    this.broadcast('log', {
      level,
      message,
      timestamp: new Date().toISOString()
    });
  }
}

// 独立运行支持
if (require.main === module) {
  const fs = require('fs-extra');
  const path = require('path');
  
  async function main() {
    try {
      const configPath = path.join(__dirname, '../config/config.json');
      
      if (!await fs.pathExists(configPath)) {
        console.error('配置文件不存在:', configPath);
        process.exit(1);
      }
      
      const config = await fs.readJson(configPath);
      
      const webServer = new WebServer({
        port: config.web?.port || 3008,
        getSystemData: () => ({
          status: { running: false },
          stats: {},
          accounts: [],
          proxy: null
        }),
        controlSystem: async (action) => {
          console.log(`控制操作: ${action}`);
          return true;
        },
        logger: {
          info: console.log,
          error: console.error,
          debug: console.log
        }
      });
      
      await webServer.start();
      console.log(`Web 服务器运行在 http://localhost:${config.web?.port || 3008}`);
      
      // 优雅关闭
      process.on('SIGINT', async () => {
        console.log('\n正在关闭 Web 服务器...');
        await webServer.stop();
        process.exit(0);
      });
      
    } catch (error) {
      console.error('启动 Web 服务器失败:', error.message);
      process.exit(1);
    }
  }
  
  main();
}

module.exports = WebServer;
