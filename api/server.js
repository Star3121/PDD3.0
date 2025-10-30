import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import ordersRouter, { setDatabase as setOrdersDatabase } from './routes/orders.js';
import templatesRouter, { setDatabase as setTemplatesDatabase } from './routes/templates.js';
import designsRouter, { setDatabase as setDesignsDatabase } from './routes/designs.js';
import uploadRouter, { setDatabase as setUploadDatabase } from './routes/upload.js';
import categoriesRouter, { setDatabase as setCategoriesDatabase } from './routes/categories.js';
import filesRouter from './routes/files.js';
import { Database } from './database.js';
import { db as supabaseDb } from './database.supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
// 新增：检测是否运行在 Vercel Serverless 环境
const isServerless = !!process.env.VERCEL;

// 初始化数据库 - 优先使用Supabase，回退到SQLite
let db;
try {
  if (process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY)) {
    db = supabaseDb;
    console.log('使用Supabase数据库');
  } else {
    if (isServerless) {
      console.error('Vercel Serverless 环境缺少 Supabase 配置，无法使用本地SQLite。');
      // 提供一个占位DB，调用时抛出更清晰的错误
      db = {
        query: async () => { throw new Error('Serverless环境未配置数据库，请在Vercel设置Supabase环境变量'); },
        run: async () => { throw new Error('Serverless环境未配置数据库，请在Vercel设置Supabase环境变量'); }
      };
    } else {
      db = new Database();
      console.log('使用SQLite数据库');
    }
  }
} catch (error) {
  console.error('数据库初始化失败，使用SQLite:', error);
  db = new Database();
}

// 将数据库实例注入到所有路由模块
setOrdersDatabase(db);
setTemplatesDatabase(db);
setDesignsDatabase(db);
setUploadDatabase(db);
setCategoriesDatabase(db);

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 确保必要的目录存在与静态文件服务（仅在非Serverless环境）
import fs from 'fs';
if (!isServerless) {
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
} else {
  console.log('Vercel Serverless 环境：跳过本地uploads/temp目录创建与静态服务');
}

// 路由
app.use('/api/orders', ordersRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/designs', designsRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/files', filesRouter);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: (process.env.SUPABASE_URL ? 'supabase' : (isServerless ? 'unconfigured' : 'sqlite'))
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

// 在本地环境启动监听；在Vercel Serverless中由平台处理请求
if (!isServerless) {
  app.listen(PORT, () => {
    console.log(`服务器运行在端口 ${PORT}`);
    console.log(`API文档: http://localhost:${PORT}/api/health`);
  });
} else {
  console.log('Vercel Serverless 环境：导出 Express 应用，无需 app.listen');
}

export default app;