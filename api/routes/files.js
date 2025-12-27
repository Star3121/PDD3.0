import express from 'express';
import path from 'path';
import storageService from '../services/storage.js';

const router = express.Router();

// 处理 CORS 预检请求
router.options('*', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.status(200).end();
});

// 通用文件请求处理函数
const handleFileRequest = async (req, res, bucket, errorMessage) => {
  try {
    const { filename } = req.params;

    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: '无效的文件名' });
    }

    // 获取文件访问方式（重定向 URL 或 本地路径）
    const access = await storageService.getFileAccess(bucket, filename);

    if (!access) {
      return res.status(404).json({ error: '文件不存在' });
    }

    // 策略 1: 重定向到对象存储 (Supabase/S3)
    // 优点: 节省 Vercel 带宽和计算资源，直接利用 CDN
    if (access.type === 'redirect') {
      // 302 临时重定向，让浏览器直接去 CDN 拉取
      return res.redirect(302, access.url);
    }

    // 策略 2: 本地文件流 (Local/Vercel TMP)
    if (access.type === 'file') {
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

      return res.sendFile(access.path);
    }
  } catch (error) {
    console.error(`${errorMessage}:`, error);
    res.status(500).json({ error: errorMessage });
  }
};

// 文件访问路由
router.get('/images/:filename', (req, res) => handleFileRequest(req, res, 'images', '文件访问失败'));
router.get('/templates/:filename', (req, res) => handleFileRequest(req, res, 'templates', '模板文件访问失败'));
router.get('/designs/:filename', (req, res) => handleFileRequest(req, res, 'designs', '设计文件访问失败'));

export default router;
