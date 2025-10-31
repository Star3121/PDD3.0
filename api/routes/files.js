import express from 'express';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// 检测是否在 Vercel 环境
const isVercel = process.env.VERCEL || process.env.VERCEL_ENV;

// 处理 CORS 预检请求
router.options('*', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.status(200).end();
});

// 文件访问路由 - 用于 Vercel 环境访问 /tmp 目录中的文件
router.get('/images/:filename', (req, res) => {
  try {
    const { filename } = req.params;

    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: '无效的文件名' });
    }

    const primaryPath = isVercel
      ? path.join('/tmp/images', filename)
      : path.join(process.cwd(), 'uploads/images', filename);
    const fallbackPath = path.join(process.cwd(), 'uploads/images', filename);
    const filePath = fs.existsSync(primaryPath) ? primaryPath : fallbackPath;

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在' });
    }

    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml'
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    // 设置 CORS 头以防止 ORB 错误
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    res.sendFile(filePath);
  } catch (error) {
    console.error('文件访问失败:', error);
    res.status(500).json({ error: '文件访问失败' });
  }
});

// 模板文件访问路由
router.get('/templates/:filename', (req, res) => {
  try {
    const { filename } = req.params;

    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: '无效的文件名' });
    }

    const primaryPath = isVercel
      ? path.join('/tmp/templates', filename)
      : path.join(process.cwd(), 'uploads/templates', filename);
    const fallbackPath = path.join(process.cwd(), 'uploads/templates', filename);
    const filePath = fs.existsSync(primaryPath) ? primaryPath : fallbackPath;

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在' });
    }

    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml'
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    // 设置 CORS 头以防止 ORB 错误
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    res.sendFile(filePath);
  } catch (error) {
    console.error('模板文件访问失败:', error);
    res.status(500).json({ error: '模板文件访问失败' });
  }
});

// 设计预览文件访问路由
router.get('/designs/:filename', (req, res) => {
  try {
    const { filename } = req.params;

    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: '无效的文件名' });
    }

    const primaryPath = isVercel
      ? path.join('/tmp/designs', filename)
      : path.join(process.cwd(), 'uploads/designs', filename);
    const fallbackPath = path.join(process.cwd(), 'uploads/designs', filename);
    const filePath = fs.existsSync(primaryPath) ? primaryPath : fallbackPath;

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在' });
    }

    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml'
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    // 设置 CORS 头以防止 ORB 错误
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    res.sendFile(filePath);
  } catch (error) {
    console.error('设计文件访问失败:', error);
    res.status(500).json({ error: '设计文件访问失败' });
  }
});

export default router;