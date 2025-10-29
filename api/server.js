import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import ordersRouter from './routes/orders.js';
import templatesRouter from './routes/templates.js';
import designsRouter from './routes/designs.js';
import uploadRouter from './routes/upload.js';
import categoriesRouter from './routes/categories.js';
import { Database } from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// 初始化数据库
const db = new Database();

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 确保必要的目录存在
import fs from 'fs';
const dirs = [
  path.join(process.cwd(), 'uploads'),
  path.join(process.cwd(), 'uploads/templates'),
  path.join(process.cwd(), 'uploads/designs'),
  path.join(process.cwd(), 'uploads/images'),
  path.join(process.cwd(), 'temp')
];

dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// 静态文件服务
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// 路由
app.use('/api/orders', ordersRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/designs', designsRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/categories', categoriesRouter);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: 'connected'
  });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('错误:', err);
  if (err && err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: '文件过大', message: '单个文件不超过10MB' });
    }
    return res.status(400).json({ error: '上传错误', message: err.message });
  }
  if (err && err.message === '只能上传图片文件') {
    return res.status(400).json({ error: '类型错误', message: '只能上传图片文件' });
  }
  res.status(500).json({ 
    error: '服务器内部错误',
    message: err?.message || '未知错误' 
  });
});

// 404处理
app.use('*', (req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
  console.log(`API文档: http://localhost:${PORT}/api/health`);
});

export default app;