import { spawn } from 'node:child_process';
import path from 'node:path';

console.log('启动订单管理设计工具...');

// 启动后端服务器
const backend = spawn('node', ['api/server.js'], {
  stdio: 'inherit',
  shell: true
});

// 等待后端启动后启动前端
setTimeout(() => {
  const frontend = spawn('npm', ['run', 'dev:frontend'], {
    stdio: 'inherit',
    shell: true
  });

  frontend.on('error', (err) => {
    console.error('前端启动失败:', err);
  });
}, 2000);

backend.on('error', (err) => {
  console.error('后端启动失败:', err);
});

process.on('SIGINT', () => {
  console.log('\n正在关闭服务...');
  process.exit(0);
});