import express from 'express';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// 检测是否在 Vercel 环境
const isVercel = process.env.VERCEL || process.env.VERCEL_ENV;

// 文件访问路由 - 用于 Vercel 环境访问 /tmp 目录中的文件
router.get('/images/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    
    // 安全检查：防止路径遍历攻击
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: '无效的文件名' });
    }
    
    const filePath = isVercel 
      ? path.join('/tmp/images', filename)
      : path.join(process.cwd(), 'uploads/images', filename);
    
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在' });
    }
    
    // 获取文件扩展名并设置正确的 Content-Type
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
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // 缓存一年
    
    // 发送文件
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
    
    // 安全检查：防止路径遍历攻击
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: '无效的文件名' });
    }
    
    const filePath = isVercel 
      ? path.join('/tmp/templates', filename)
      : path.join(process.cwd(), 'uploads/templates', filename);
    
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在' });
    }
    
    // 获取文件扩展名并设置正确的 Content-Type
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
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // 缓存一年
    
    // 发送文件
    res.sendFile(filePath);
  } catch (error) {
    console.error('模板文件访问失败:', error);
    res.status(500).json({ error: '模板文件访问失败' });
  }
});

export default router;