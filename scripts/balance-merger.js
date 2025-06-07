// 余额合并脚本：将所有子账户余额合并到主账户
// 依赖：src/account-manager.js, src/solana-client.js
const path = require('path');
const fs = require('fs-extra');
const AccountManager = require('../src/account-manager');
const SolanaClient = require('../src/solana-client');

const ACCOUNTS_PATH = path.join(__dirname, '../config/accounts.json');
const CONFIG_PATH = path.join(__dirname, '../config/config.json');

async function main() {
  const config = await fs.readJson(CONFIG_PATH);
  const mainAddress = config.main?.mainAccount;
  if (!mainAddress) {
    throw new Error('主账户地址未配置');
  }
  const accountManager = new AccountManager();
  await accountManager.initialize();
  const solanaClient = new SolanaClient(config.solana || {});
  await solanaClient.initialize();
  const accounts = await accountManager.getAllAccounts();
  let mergedCount = 0;
  for (const acc of accounts) {
    if (acc.address === mainAddress) continue;
    const balance = parseFloat(acc.balance) || 0;
    if (balance > 0.01) {
      console.log(`转移 ${balance} SOL 从 ${acc.address} 到主账户...`);
      try {
        const result = await solanaClient.transfer(acc.privateKey, mainAddress, balance - 0.001); // 留一点手续费
        if (result.success) {
          console.log(`✅ 转账成功: ${result.signature}`);
          mergedCount++;
        } else {
          console.warn(`❌ 转账失败: ${result.error}`);
        }
      } catch (e) {
        console.warn(`❌ 转账异常: ${e.message}`);
      }
    }
  }
  console.log(`合并完成，共转移 ${mergedCount} 个账户余额到主账户。`);
}

if (require.main === module) {
  main().catch(e => {
    console.error('执行失败:', e);
    process.exit(1);
  });
}
