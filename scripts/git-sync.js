import { execSync } from 'child_process';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🔄 开始同步代码到 GitHub...');

try {
  // 1. 添加所有更改
  console.log('📦 添加文件...');
  execSync('git add .', { stdio: 'inherit' });

  // 2. 检查是否有需要提交的更改
  try {
    execSync('git diff --staged --quiet');
    console.log('✨ 没有需要提交的更改');
  } catch (e) {
    // 3. 提交更改
    const date = new Date().toLocaleString('zh-CN');
    const commitMsg = `update: 自动同步于 ${date}`;
    console.log(`📝 正在提交: "${commitMsg}"`);
    execSync(`git commit -m "${commitMsg}"`, { stdio: 'inherit' });
  }

  // 4. 推送到远程
  console.log('🚀 正在推送到 GitHub...');
  execSync('git push', { stdio: 'inherit' });
  
  console.log('✅ 同步成功！');
} catch (error) {
  console.error('❌ 同步失败:', error.message);
  if (error.message.includes('connect to github.com')) {
    console.error('💡 提示: 看起来是网络连接 GitHub 超时，请检查网络或代理设置。');
  }
} finally {
  rl.close();
}
