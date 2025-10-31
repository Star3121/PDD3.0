import app from './server.js';

// Vercel Serverless Function 适配器
export default function handler(req, res) {
  return app(req, res);
}