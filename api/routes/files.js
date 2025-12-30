import express from 'express';
import path from 'path';
import storageService from '../services/storage.js';
import { Readable } from 'stream';

const router = express.Router();

// 处理 CORS 预检请求
router.options('*', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.status(200).end();
});

const sendPlaceholderSvg = (res, text) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(
    `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg"><rect width="200" height="200" fill="#f0f0f0"/><text x="50%" y="50%" font-family="Arial" font-size="14" fill="#999" text-anchor="middle" dy=".3em">${text}</text></svg>`
  );
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
      return sendPlaceholderSvg(res, 'Image Not Found');
    }

    if (access.type === 'redirect') {
      const shouldProxy = String(req.query.proxy || '') === '1';

      if (!shouldProxy) {
        return res.redirect(302, access.url);
      }

      const upstream = await fetch(access.url);

      if (!upstream.ok) {
        return sendPlaceholderSvg(res, 'Error Loading Image');
      }

      const contentType = upstream.headers.get('content-type') || 'application/octet-stream';

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

      const body = upstream.body;
      if (!body) {
        return sendPlaceholderSvg(res, 'Error Loading Image');
      }

      Readable.fromWeb(body).pipe(res);
      return;
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
    sendPlaceholderSvg(res, 'Error Loading Image');
  }
};

// 文件访问路由
router.get('/images/:filename', (req, res) => handleFileRequest(req, res, 'images', '文件访问失败'));
router.get('/templates/:filename', (req, res) => handleFileRequest(req, res, 'templates', '模板文件访问失败'));
router.get('/designs/:filename', (req, res) => handleFileRequest(req, res, 'designs', '设计文件访问失败'));

export default router;
