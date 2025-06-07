// 批量修复子账户余额，链上查询后写入 config/accounts.json
const path = require('path');
const fs = require('fs-extra');
const SolanaClient = require('../src/solana-client');

const ACCOUNTS_PATH = path.join(__dirname, '../config/accounts.json');
const CONFIG_PATH = path.join(__dirname, '../config/config.json');

async function main() {
  // 1. 读取配置和账户
  const config = await fs.readJson(CONFIG_PATH);
  const accountsData = await fs.readJson(ACCOUNTS_PATH);
  const accounts = accountsData.accounts || [];

  // 2. 初始化 SolanaClient
  const solanaClient = new SolanaClient({
    network: config.solana?.network || 'devnet',
    rpcUrl: config.solana?.rpcUrl || undefined
  });

  let updated = 0;
  for (const acc of accounts) {
    // 跳过主账户（假设主账户有特殊标记或用config.mainAccountAddress判断）
    if (config.mainAccountAddress && acc.publicKey === config.mainAccountAddress) continue;
    if (acc.isMain) continue;
    try {
      const result = await solanaClient.getBalance(acc.publicKey);
      if (result.success) {
        acc.balance = result.balance;
        acc.lastBalanceUpdate = new Date().toISOString();
        updated++;
        console.log(`✔ ${acc.publicKey} 余额: ${result.balance} SOL`);
      } else {
        console.warn(`× ${acc.publicKey} 查询失败: ${result.error}`);
      }
    } catch (e) {
      console.warn(`× ${acc.publicKey} 查询异常: ${e.message}`);
    }
    // 防止被限流
    await new Promise(r => setTimeout(r, 500));
  }

  // 3. 写回 accounts.json
  await fs.writeJson(ACCOUNTS_PATH, { ...accountsData, accounts }, { spaces: 2 });
  console.log(`\n已更新 ${updated} 个子账户余额。`);
}

main().catch(e => {
  console.error('执行失败:', e);
  process.exit(1);
});
