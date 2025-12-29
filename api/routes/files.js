import express from 'express';
import path from 'path';
import storageService from '../services/storage.js';
import fetch from 'node-fetch';

const router = express.Router();

// 处理 CORS 预检请求
router.options('*', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.status(200).end();
});

// 辅助函数：发送 SVG 占位图
const sendPlaceholder = (res, text) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'no-cache');
  // 即使是错误图片，也必须带 CORS 头，否则 Canvas 依然报错
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  
  const svg = `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg" style="background:#f0f0f0">
    <text x="50%" y="50%" font-family="Arial" font-size="14" fill="#999" text-anchor="middle" dy=".3em">${text}</text>
  </svg>`;
  res.send(svg);
};

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
      // 返回占位图代替 404 JSON，防止 ORB 错误
      return sendPlaceholder(res, 'Image Not Found');
    }

    // 策略 1: 【修改】由重定向改为代理 (Proxy)
    // 解决 ORB/CORS 问题的核心：由后端转发请求
    if (access.type === 'redirect') {
      try {
        const response = await fetch(access.url);
        
        // 如果上游 (Supabase) 返回非 200 (如 404/403)，抛出错误以触发 fallback
        if (!response.ok) {
           throw new Error(`Upstream ${response.status}`);
        }
        
        // 转发 Content-Type
        const contentType = response.headers.get('content-type');
        res.setHeader('Content-Type', contentType || 'application/octet-stream');
        
        // 强制设置 CORS 头 (关键)
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        
        // 管道转发流
        response.body.pipe(res);
        return;
      } catch (proxyError) {
         console.error(`Proxy failed for ${bucket}/${filename}:`, proxyError);
         // 代理失败时返回占位图，避免浏览器报 ORB 错误
         return sendPlaceholder(res, 'Error Loading Image');
      }
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
    // 出错时也返回占位图
    return sendPlaceholder(res, 'Server Error');
  }
};

// 文件访问路由
router.get('/images/:filename', (req, res) => handleFileRequest(req, res, 'images', '文件访问失败'));
router.get('/templates/:filename', (req, res) => handleFileRequest(req, res, 'templates', '模板文件访问失败'));
router.get('/designs/:filename', (req, res) => handleFileRequest(req, res, 'designs', '设计文件访问失败'));

export default router;
