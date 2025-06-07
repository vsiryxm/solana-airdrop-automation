#!/usr/bin/env node

/**
 * Solana 自动空投系统 - 主启动脚本
 * 
 * 功能：
 * - 自动管理多个 Solana 账户
 * - 定时或连续执行空投操作
 * - Web 监控界面
 * - 代理支持（可选）
 * - 完整的日志和错误处理
 */

const SolanaAirdropBot = require('./src/main');
const chalk = require('chalk');

async function startSystem() {
    console.log(chalk.blue('🚀 启动 Solana 自动空投系统...'));
    console.log(chalk.gray('=' * 60));
    
    let bot;
    
    try {
        // 创建系统实例
        bot = new SolanaAirdropBot();
        
        // 初始化系统
        console.log(chalk.yellow('🔧 正在初始化系统组件...'));
        const initSuccess = await bot.initialize();
        
        if (!initSuccess) {
            console.error(chalk.red('❌ 系统初始化失败'));
            process.exit(1);
        }
        
        console.log(chalk.green('✅ 系统初始化完成'));
        
        // 启动系统
        console.log(chalk.yellow('🚀 正在启动系统服务...'));
        const startSuccess = await bot.start();
        
        if (!startSuccess) {
            console.error(chalk.red('❌ 系统启动失败'));
            process.exit(1);
        }
        
        console.log(chalk.green('✅ 系统启动成功'));
        console.log(chalk.cyan('\n🎉 Solana 自动空投系统已成功启动！'));
        console.log(chalk.white('📱 Web 监控界面: http://localhost:3008'));
        console.log(chalk.white('📋 系统将按配置的时间窗口自动运行'));
        console.log(chalk.gray('💡 按 Ctrl+C 可安全停止系统\n'));
        
        // 绑定优雅退出
        setupGracefulShutdown(bot);
        
        // 保持进程运行
        await new Promise(() => {}); // 永久等待，除非收到退出信号
        
    } catch (error) {
        console.error(chalk.red('❌ 系统启动过程中发生错误:'), error.message);
        console.error(chalk.gray('错误详情:'), error.stack);
        
        if (bot) {
            try {
                await bot.stop();
            } catch (stopError) {
                console.error(chalk.red('停止系统时也发生错误:'), stopError.message);
            }
        }
        
        process.exit(1);
    }
}

/**
 * 设置优雅关闭处理
 */
function setupGracefulShutdown(bot) {
    const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
    
    signals.forEach(signal => {
        process.on(signal, async () => {
            console.log(chalk.yellow(`\n🛑 收到 ${signal} 信号，正在安全关闭系统...`));
            
            try {
                await bot.stop();
                console.log(chalk.green('✅ 系统已安全关闭'));
                process.exit(0);
            } catch (error) {
                console.error(chalk.red('❌ 关闭系统时发生错误:'), error.message);
                process.exit(1);
            }
        });
    });
    
    // 处理未捕获的异常
    process.on('uncaughtException', async (error) => {
        console.error(chalk.red('❌ 未捕获的异常:'), error.message);
        console.error(chalk.gray('错误堆栈:'), error.stack);
        
        try {
            await bot.stop();
        } catch (stopError) {
            console.error(chalk.red('停止系统时发生错误:'), stopError.message);
        }
        
        process.exit(1);
    });
    
    // 处理未处理的 Promise 拒绝
    process.on('unhandledRejection', async (reason, promise) => {
        console.error(chalk.red('❌ 未处理的 Promise 拒绝:'), reason);
        
        try {
            await bot.stop();
        } catch (stopError) {
            console.error(chalk.red('停止系统时发生错误:'), stopError.message);
        }
        
        process.exit(1);
    });
}

// 显示启动横幅
console.log(chalk.blue('┌' + '─'.repeat(58) + '┐'));
console.log(chalk.blue('│') + chalk.bold.white(' Solana 自动空投系统 v1.0.0').padEnd(58) + chalk.blue('│'));
console.log(chalk.blue('│') + chalk.gray(' 自动化 Solana DevNet 空投和账户管理').padEnd(66) + chalk.blue('│'));
console.log(chalk.blue('└' + '─'.repeat(58) + '┘'));
console.log('');

// 启动系统
startSystem();
