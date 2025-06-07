// 全局变量
let websocket = null;
let autoScroll = true;
let isConnected = false;
let solanaConnection = null;
let solanaConfig = null;
let systemData = {
    status: 'stopped',
    proxy: '',
    accounts: [],
    stats: {},
    logs: []
};

// 初始化 Solana 连接
function initializeSolanaConnection() {
    try {
        if (typeof solanaWeb3 !== 'undefined' && solanaConfig && solanaConfig.rpcUrl) {
            solanaConnection = new solanaWeb3.Connection(solanaConfig.rpcUrl, 'confirmed');
            console.log('Solana Web3 连接已初始化, RPC URL:', solanaConfig.rpcUrl);
            return true;
        } else {
            console.warn('Solana Web3.js 库未加载或配置未加载');
            return false;
        }
    } catch (error) {
        console.error('初始化 Solana 连接失败:', error);
        return false;
    }
}

// 直接从链上查询主账户余额
async function getMainAccountBalanceFromChain() {
    if (!solanaConnection || !solanaConfig || !solanaConfig.mainAccountAddress) {
        console.warn('Solana 连接未初始化或主账户地址未配置');
        return null;
    }
    
    try {
        const publicKey = new solanaWeb3.PublicKey(solanaConfig.mainAccountAddress);
        const balance = await solanaConnection.getBalance(publicKey);
        // 将 lamports 转换为 SOL
        const solBalance = balance / solanaWeb3.LAMPORTS_PER_SOL;
        
        console.log('链上查询主账户余额成功:', solBalance, 'SOL');
        return {
            success: true,
            balance: solBalance,
            lamports: balance
        };
    } catch (error) {
        console.error('链上查询主账户余额失败:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// 更新Solana网络显示
function updateSolanaNetworkDisplay() {
    const solanaNetwork = document.getElementById('solanaNetwork');
    if (solanaNetwork && solanaConfig && solanaConfig.network) {
        solanaNetwork.textContent = solanaConfig.network;
        solanaNetwork.style.color = '#2563eb';
    } else if (solanaNetwork) {
        solanaNetwork.textContent = '-';
        solanaNetwork.style.color = '#4a5568';
    }
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', async function() {
    console.log('页面DOM加载完成，开始初始化');
    
    // 首先加载 Solana 配置
    const configLoaded = await loadSolanaConfig();
    if (configLoaded) {
        // 配置加载成功后初始化 Solana 连接
        if (initializeSolanaConnection()) {
            // 立即查询一次主账户余额
            setTimeout(updateMainAccountBalanceFromChain, 1000);
            // 每5秒从链上刷新主账户余额
            setInterval(updateMainAccountBalanceFromChain, 5000);
        }
        updateSolanaNetworkDisplay();
    } else {
        console.warn('Solana配置加载失败，将使用API数据');
    }
    
    // 初始化 WebSocket
    initializeWebSocket();
    
    // 立即尝试获取初始数据（不依赖WebSocket）
    refreshData();
    updateUI();
    
    // 加载历史日志
    loadHistoryLogs();
    
    // 每10秒刷新一次数据
    setInterval(refreshData, 10000);
});

// 初始化WebSocket连接
function initializeWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    console.log('正在连接WebSocket:', wsUrl);
    
    try {
        websocket = new WebSocket(wsUrl);
        
        websocket.onopen = function() {
            console.log('WebSocket连接已建立');
            updateConnectionStatus(true);
            // 连接成功后立即刷新数据
            refreshData();
        };
        
        websocket.onmessage = function(event) {
            const data = JSON.parse(event.data);
            handleWebSocketMessage(data);
        };
        
        websocket.onclose = function() {
            console.log('WebSocket连接已断开');
            updateConnectionStatus(false);
            // 5秒后尝试重连
            setTimeout(initializeWebSocket, 5000);
        };
        
        websocket.onerror = function(error) {
            console.error('WebSocket错误:', error);
            updateConnectionStatus(false);
        };
    } catch (error) {
        console.error('无法建立WebSocket连接:', error);
        updateConnectionStatus(false);
    }
}

// 处理WebSocket消息
function handleWebSocketMessage(data) {
    console.log('收到WebSocket消息:', data.type, data);
    
    switch (data.type) {
        case 'connected':
            console.log('收到连接确认消息');
            break;
        case 'init':
            // 初始化时接收完整的系统数据
            console.log('处理初始化数据:', data.data);
            if (data.data) {
                systemData.status = data.data.status;
                systemData.stats = data.data.stats;
                systemData.accounts = data.data.accounts || [];
                systemData.mainAccount = data.data.mainAccount;
                systemData.proxy = data.data.proxy;
                console.log('更新后的systemData:', systemData);
                updateUI();
            }
            break;
        case 'status':
            systemData.status = data.data;
            updateStatusDisplay();
            break;
        case 'stats':
            systemData.stats = data.data;
            updateStatsDisplay();
            break;
        case 'accounts':
            systemData.accounts = data.data;
            updateAccountsDisplay();
            break;
        case 'mainAccount':
            systemData.mainAccount = data.data;
            updateAccountsDisplay();
            break;
        case 'log':
            addLogEntry(data.data);
            break;
        case 'proxy':
            systemData.proxy = data.data;
            updateProxyDisplay();
            break;
        default:
            console.log('未知消息类型:', data.type);
    }
}

// 更新连接状态
function updateConnectionStatus(connected) {
    console.log('更新连接状态:', connected);
    isConnected = connected;
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    
    console.log('DOM元素:', { statusDot, statusText });
    
    if (connected) {
        statusDot.className = 'status-dot';
        statusText.textContent = '已连接';
        console.log('连接状态设置为已连接');
    } else {
        statusDot.className = 'status-dot disconnected';
        statusText.textContent = '连接断开';
        console.log('连接状态设置为断开');
    }
}

// 刷新数据
async function refreshData() {
    console.log('开始刷新数据...');
    
    try {
        // 获取系统状态
        const statusResponse = await fetch('/api/status');
        if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            console.log('状态数据:', statusData);
            if (statusData.success) {
                systemData.status = statusData.status;
                systemData.proxy = statusData.proxy;
                updateStatusDisplay();
                updateProxyDisplay();
            }
        }
        
        // 获取统计信息
        const statsResponse = await fetch('/api/stats');
        if (statsResponse.ok) {
            const statsData = await statsResponse.json();
            console.log('统计数据:', statsData);
            if (statsData.success) {
                systemData.stats = statsData.data;
                updateStatsDisplay();
            }
        }
        
        // 获取账户信息
        const accountsResponse = await fetch('/api/accounts');
        if (accountsResponse.ok) {
            const accountsData = await accountsResponse.json();
            console.log('账户数据:', accountsData);
            if (accountsData.success) {
                systemData.accounts = accountsData.data;
                systemData.mainAccount = accountsData.mainAccount;
                updateAccountsDisplay();
            }
        }
        
        console.log('数据刷新完成');
        
    } catch (error) {
        console.error('刷新数据失败:', error);
    }
}

// 更新UI
function updateUI() {
    updateStatusDisplay();
    updateStatsDisplay();
    updateAccountsDisplay();
    updateProxyDisplay();
}

// 更新状态显示
function updateStatusDisplay() {
    const runningStatus = document.getElementById('runningStatus');
    const failureCount = document.getElementById('failureCount');
    const activeAccounts = document.getElementById('activeAccounts');
    
    if (systemData.status) {
        const isRunning = systemData.status.running;
        runningStatus.textContent = isRunning ? '运行中' : '已停止';
        runningStatus.style.color = isRunning ? '#10b981' : '#ef4444';
        
        failureCount.textContent = systemData.status.failureCount || 0;
        failureCount.style.color = (systemData.status.failureCount || 0) > 5 ? '#ef4444' : '#4a5568';
        
        const activeCount = systemData.accounts.filter(acc => acc.status === 'active').length;
        activeAccounts.textContent = `${activeCount}/${systemData.accounts.length}`;
        
        // 更新按钮状态
        updateButtonStates(isRunning);
    }
}

// 更新按钮状态
function updateButtonStates(isRunning) {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const switchProxyBtn = document.getElementById('switchProxyBtn');
    const resetBtn = document.getElementById('resetBtn');
    const restartBtn = document.getElementById('restartBtn');

    if (startBtn && stopBtn) {
        if (isRunning) {
            startBtn.disabled = true;
            startBtn.classList.add('disabled');
            stopBtn.disabled = false;
            stopBtn.classList.remove('disabled');
        } else {
            startBtn.disabled = false;
            startBtn.classList.remove('disabled');
            stopBtn.disabled = true;
            stopBtn.classList.add('disabled');
        }
    }
    // 允许重启按钮在运行时可用
    if (restartBtn) {
        restartBtn.disabled = false;
        restartBtn.classList.remove('disabled');
    }
    // 代理切换按钮仅在所有代理+账户都被限流时禁用（此处暂时仅根据 isRunning 控制，后续可加后端状态判断）
    if (switchProxyBtn) {
        switchProxyBtn.disabled = false;
        switchProxyBtn.classList.remove('disabled');
    }
    if (resetBtn) {
        resetBtn.disabled = isRunning;
        if (isRunning) {
            resetBtn.classList.add('disabled');
        } else {
            resetBtn.classList.remove('disabled');
        }
    }
}

// 更新统计显示
function updateStatsDisplay() {
    console.log('更新统计显示，数据:', systemData.stats);
    
    const totalAirdrops = document.getElementById('totalAirdrops');
    const totalSol = document.getElementById('totalSol');
    const totalTransfers = document.getElementById('totalTransfers');
    const uptime = document.getElementById('uptime');
    
    if (!totalAirdrops || !totalSol || !totalTransfers || !uptime) {
        console.warn('统计显示元素未找到');
        return;
    }
    
    if (systemData.stats && typeof systemData.stats === 'object') {
        console.log('统计数据详情:', {
            totalAirdrops: systemData.stats.totalAirdrops,
            totalSol: systemData.stats.totalSol,
            totalTransfers: systemData.stats.totalTransfers,
            startTime: systemData.stats.startTime
        });
        
        totalAirdrops.textContent = systemData.stats.totalAirdrops || 0;
        totalSol.textContent = (systemData.stats.totalSol || 0).toFixed(2);
        totalTransfers.textContent = systemData.stats.totalTransfers || 0;
        
        if (systemData.stats.startTime) {
            const startTime = new Date(systemData.stats.startTime);
            const uptimeMs = Date.now() - startTime.getTime();
            const hours = Math.floor(uptimeMs / (1000 * 60 * 60));
            const minutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
            uptime.textContent = `${hours}h ${minutes}m`;
        } else {
            uptime.textContent = '0h 0m';
        }
        
        console.log('统计信息已更新');
    } else {
        console.warn('统计数据格式错误或为空:', systemData.stats);
        // 设置默认值
        totalAirdrops.textContent = '0';
        totalSol.textContent = '0.00';
        totalTransfers.textContent = '0';
        uptime.textContent = '0h 0m';
    }
}

// 从链上更新主账户余额
async function updateMainAccountBalanceFromChain() {
    const mainBalance = document.getElementById('mainBalance');
    const balanceSource = document.getElementById('balanceSource');
    if (!mainBalance) return;
    
    try {
        const balanceResult = await getMainAccountBalanceFromChain();
        if (balanceResult && balanceResult.success) {
            mainBalance.textContent = `${balanceResult.balance.toFixed(4)} SOL`;
            mainBalance.style.color = '#10b981'; // 绿色表示链上数据
            if (balanceSource) {
                balanceSource.textContent = '(链上实时)';
                balanceSource.style.color = '#10b981';
            }
            console.log('主账户余额已从链上更新:', balanceResult.balance, 'SOL');
            
            // 同时更新 systemData
            if (!systemData.mainAccount) {
                systemData.mainAccount = {};
            }
            systemData.mainAccount.balance = balanceResult.balance;
            systemData.mainAccount.address = solanaConfig.mainAccountAddress;
        } else {
            console.warn('链上查询余额失败，使用API数据');
            mainBalance.style.color = '#ef4444'; // 红色表示错误
            if (balanceSource) {
                balanceSource.textContent = '(查询失败)';
                balanceSource.style.color = '#ef4444';
            }
        }
    } catch (error) {
        console.error('更新主账户余额失败:', error);
        mainBalance.style.color = '#ef4444';
        if (balanceSource) {
            balanceSource.textContent = '(查询错误)';
            balanceSource.style.color = '#ef4444';
        }
    }
}

// 修改后的账户显示函数，主账户余额完全由链上查询
function updateAccountsDisplay() {
    console.log('updateAccountsDisplay调用，systemData:', systemData);
    
    const tableBody = document.getElementById('accountsTableBody');
    
    // 主账户余额不再从API获取，完全由链上查询处理
    // 这样简化了数据流，避免了双重查询
    
    // 清空表格
    if (tableBody) {
        tableBody.innerHTML = '';
    }
    
    console.log('账户数组长度:', systemData.accounts.length);
    
    // 添加账户行（只显示子账户）
    systemData.accounts.forEach((account, index) => {
        if (account.isMain) return; // 跳过主账户
        
        console.log(`处理账户 ${index}:`, account);
        
        const row = document.createElement('div');
        row.className = 'table-row';
        
        const statusClass = getStatusClass(account.status);
        const lastActivity = account.lastUsed ? 
            new Date(account.lastUsed).toLocaleString('zh-CN') : '-';
        
        // 处理余额显示 - 确保显示正确的余额数据
        let displayBalance = 0;
        if (account.balance !== undefined && account.balance !== null) {
            if (typeof account.balance === 'object' && account.balance.balance !== undefined) {
                displayBalance = account.balance.balance;
            } else {
                displayBalance = parseFloat(account.balance) || 0;
            }
        }
        
        // 处理地址显示
        const address = account.publicKey || account.address || '';
        const shortAddress = address ? 
            address.substring(0, 8) + '...' + address.substring(address.length - 8) : '-';
        
        row.innerHTML = `
            <div class="table-cell">${index + 1}</div>
            <div class="table-cell">
                <span class="account-address" title="${address}">
                    ${shortAddress}
                </span>
            </div>
            <div class="table-cell">${displayBalance.toFixed(4)} SOL</div>
            <div class="table-cell">
                <span class="account-status ${statusClass}">
                    ${getStatusText(account.status)}
                </span>
            </div>
            <div class="table-cell">${lastActivity}</div>
        `;
        
        if (tableBody) {
            tableBody.appendChild(row);
        }
    });
}

// 获取状态样式类
function getStatusClass(status) {
    switch (status) {
        case 'active': return 'active';
        case 'cooldown': return 'cooldown';
        default: return 'inactive';
    }
}

// 获取状态文本
function getStatusText(status) {
    switch (status) {
        case 'active': return '活跃';
        case 'cooldown': return '冷却中';
        default: return '未激活';
    }
}

// 更新代理显示
function updateProxyDisplay() {
    const currentProxy = document.getElementById('currentProxy');
    let proxyName = '';
    if (systemData.proxy) {
        if (typeof systemData.proxy === 'string') {
            proxyName = systemData.proxy;
        } else if (typeof systemData.proxy === 'object' && systemData.proxy.name) {
            proxyName = systemData.proxy.name;
        }
    }
    if (proxyName) {
        currentProxy.textContent = proxyName;
        currentProxy.style.color = '#10b981';
    } else {
        currentProxy.textContent = '未连接';
        currentProxy.style.color = '#ef4444';
    }
}

// 添加日志条目
function addLogEntry(logData) {
    console.log('添加日志条目:', logData);
    const logsContainer = document.getElementById('logsContainer');
    
    if (!logsContainer) {
        console.warn('日志容器元素未找到');
        return;
    }
    
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${logData.level || 'info'}`;
    
    // 处理时间戳
    let timestamp;
    if (logData.timestamp) {
        timestamp = new Date(logData.timestamp).toLocaleTimeString('zh-CN');
    } else {
        timestamp = new Date().toLocaleTimeString('zh-CN');
    }
    
    // 处理消息内容
    const message = logData.message || logData.msg || logData.text || String(logData);
    
    logEntry.innerHTML = `
        <span class="log-timestamp">[${timestamp}]</span>
        <span class="log-message">${message}</span>
    `;
    
    logsContainer.appendChild(logEntry);
    
    // 保持最多200条日志
    while (logsContainer.children.length > 200) {
        logsContainer.removeChild(logsContainer.firstChild);
    }
    
    // 自动滚动到底部
    if (autoScroll) {
        logsContainer.scrollTop = logsContainer.scrollHeight;
    }
}

// 获取并显示历史日志
async function loadHistoryLogs() {
    try {
        const response = await fetch('/api/logs');
        if (response.ok) {
            const logsData = await response.json();
            console.log('获取历史日志:', logsData);
            
            if (logsData.success && Array.isArray(logsData.logs)) {
                // 清空现有日志
                const logsContainer = document.getElementById('logsContainer');
                if (logsContainer) {
                    logsContainer.innerHTML = '';
                }
                
                // 添加历史日志
                logsData.logs.forEach(log => {
                    addLogEntry(log);
                });
                
                console.log(`已加载 ${logsData.logs.length} 条历史日志`);
            } else {
                console.warn('历史日志格式错误:', logsData);
                addLogEntry({ level: 'info', message: '暂无历史日志' });
            }
        } else {
            console.warn('获取历史日志失败:', response.status);
            addLogEntry({ level: 'warning', message: '获取历史日志失败' });
        }
    } catch (error) {
        console.error('加载历史日志失败:', error);
        addLogEntry({ level: 'error', message: `加载历史日志失败: ${error.message}` });
    }
}

// 控制面板功能
async function startSystem() {
    try {
        const response = await fetch('/api/start', { method: 'POST' });
        const result = await response.json();
        
        if (result.success) {
            addLogEntry({ level: 'success', message: '系统启动成功' });
        } else {
            addLogEntry({ level: 'error', message: `系统启动失败: ${result.error}` });
        }
    } catch (error) {
        addLogEntry({ level: 'error', message: `启动请求失败: ${error.message}` });
    }
}

async function stopSystem() {
    try {
        const response = await fetch('/api/stop', { method: 'POST' });
        const result = await response.json();
        
        if (result.success) {
            addLogEntry({ level: 'warning', message: '系统已停止' });
        } else {
            addLogEntry({ level: 'error', message: `系统停止失败: ${result.error}` });
        }
    } catch (error) {
        addLogEntry({ level: 'error', message: `停止请求失败: ${error.message}` });
    }
}

async function switchProxy() {
    try {
        const response = await fetch('/api/proxy/switch', { method: 'POST' });
        const result = await response.json();
        
        if (result.success) {
            addLogEntry({ level: 'info', message: `代理切换成功: ${result.proxy}` });
            systemData.proxy = result.proxy;
            updateProxyDisplay();
        } else {
            addLogEntry({ level: 'error', message: `代理切换失败: ${result.error}` });
        }
    } catch (error) {
        addLogEntry({ level: 'error', message: `代理切换请求失败: ${error.message}` });
    }
}

async function resetSystem() {
    if (!confirm('确定要重置系统吗？这将清除所有统计数据和账户状态。')) {
        return;
    }
    
    try {
        const response = await fetch('/api/reset', { method: 'POST' });
        const result = await response.json();
        
        if (result.success) {
            addLogEntry({ level: 'warning', message: '系统已重置' });
            // 刷新页面数据
            setTimeout(refreshData, 1000);
        } else {
            addLogEntry({ level: 'error', message: `系统重置失败: ${result.error}` });
        }
    } catch (error) {
        addLogEntry({ level: 'error', message: `重置请求失败: ${error.message}` });
    }
}

async function refreshBalances() {
    const button = event.target.closest('.btn');
    const originalText = button.innerHTML;
    
    button.innerHTML = '<div class="loading"></div> 刷新中...';
    button.disabled = true;
    
    try {
        const response = await fetch('/api/accounts/refresh-balances', { method: 'POST' });
        const result = await response.json();
        
        if (result.success) {
            addLogEntry({ level: 'success', message: '余额刷新成功' });
            // 更新账户数据
            systemData.accounts = result.accounts;
            updateAccountsDisplay();
        } else {
            addLogEntry({ level: 'error', message: `余额刷新失败: ${result.error}` });
        }
    } catch (error) {
        addLogEntry({ level: 'error', message: `余额刷新请求失败: ${error.message}` });
    } finally {
        button.innerHTML = originalText;
        button.disabled = false;
    }
}

async function mergeBalances(event) {
    const button = event.target.closest('.btn');
    const originalText = button.innerHTML;
    button.innerHTML = '<div class="loading"></div> 合并中...';
    button.disabled = true;
    try {
        const response = await fetch('/api/accounts/merge-balances', { method: 'POST' });
        const result = await response.json();
        if (result.success) {
            addLogEntry({ level: 'success', message: '余额合并操作已发起' });
            setTimeout(refreshData, 2000);
        } else {
            addLogEntry({ level: 'error', message: `余额合并失败: ${result.error}` });
        }
    } catch (error) {
        addLogEntry({ level: 'error', message: `余额合并请求失败: ${error.message}` });
    } finally {
        button.innerHTML = originalText;
        button.disabled = false;
    }
}

// 日志控制功能
function clearLogs() {
    const logsContainer = document.getElementById('logsContainer');
    logsContainer.innerHTML = '';
    addLogEntry({ level: 'info', message: '日志已清空' });
}

function toggleAutoScroll() {
    autoScroll = !autoScroll;
    const autoScrollText = document.getElementById('autoScrollText');
    autoScrollText.textContent = autoScroll ? '自动滚动' : '手动滚动';
    
    const button = event.target.closest('.btn');
    button.style.opacity = autoScroll ? '1' : '0.6';
}

// 获取Solana配置
async function loadSolanaConfig() {
    try {
        const response = await fetch('/api/config');
        if (response.ok) {
            const configData = await response.json();
            if (configData.success) {
                solanaConfig = configData.data;
                console.log('Solana配置加载成功:', solanaConfig);
                updateSolanaNetworkDisplay();
                return true;
            } else {
                console.error('获取Solana配置失败:', configData.error);
                return false;
            }
        } else {
            console.error('获取Solana配置请求失败:', response.status);
            return false;
        }
    } catch (error) {
        console.error('加载Solana配置失败:', error);
        return false;
    }
}

// 键盘快捷键
document.addEventListener('keydown', function(event) {
    // Ctrl+R 刷新数据
    if (event.ctrlKey && event.key === 'r') {
        event.preventDefault();
        refreshData();
        addLogEntry({ level: 'info', message: '手动刷新数据' });
    }
    
    // Ctrl+L 清空日志
    if (event.ctrlKey && event.key === 'l') {
        event.preventDefault();
        clearLogs();
    }
    
    // 空格键 切换自动滚动
    if (event.code === 'Space' && event.target === document.body) {
        event.preventDefault();
        toggleAutoScroll();
    }
});

// 错误处理
window.addEventListener('error', function(event) {
    console.error('页面错误:', event.error);
    addLogEntry({ 
        level: 'error', 
        message: `页面错误: ${event.error.message}` 
    });
});

window.addEventListener('unhandledrejection', function(event) {
    console.error('未处理的Promise拒绝:', event.reason);
    addLogEntry({ 
        level: 'error', 
        message: `Promise错误: ${event.reason}` 
    });
});
