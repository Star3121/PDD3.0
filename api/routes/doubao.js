import express from 'express';

const router = express.Router();

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;
const UPSTREAM_TIMEOUT_MS = 45 * 1000;
const requestWindows = new Map();

function isAiEnabled() {
  return process.env.DOUBAO_AI_ENABLED === 'true' && Boolean(process.env.DOUBAO_API_KEY);
}

function getClientId(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string') {
    return forwardedFor.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function rateLimit(req, res, next) {
  const now = Date.now();
  const clientId = getClientId(req);
  const existing = requestWindows.get(clientId);

  if (!existing || now - existing.startedAt >= WINDOW_MS) {
    requestWindows.set(clientId, { startedAt: now, count: 1 });
    return next();
  }

  if (existing.count >= MAX_REQUESTS_PER_WINDOW) {
    const retryAfter = Math.ceil((WINDOW_MS - (now - existing.startedAt)) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }

  existing.count += 1;
  return next();
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 4) {
    return false;
  }

  const serialized = JSON.stringify(messages);
  if (serialized.length > 12 * 1024 * 1024) {
    return false;
  }

  return messages.every((message) => (
    message &&
    ['user', 'system'].includes(message.role) &&
    (typeof message.content === 'string' || Array.isArray(message.content))
  ));
}

router.get('/status', (req, res) => {
  res.json({ enabled: isAiEnabled() });
});

router.post('/chat/completions', rateLimit, async (req, res) => {
  if (!isAiEnabled()) {
    return res.status(503).json({ error: 'AI识别功能暂未启用' });
  }

  const { messages } = req.body || {};
  if (!validateMessages(messages)) {
    return res.status(400).json({ error: 'AI识别请求格式无效或内容过大' });
  }

  const apiBase = process.env.DOUBAO_API_BASE || 'https://ark.cn-beijing.volces.com/api/v3';
  const model = process.env.DOUBAO_MODEL || 'ep-20241016231643-rvmkw';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DOUBAO_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.1,
        max_tokens: 2000,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error('豆包API请求失败:', response.status, response.statusText);
      return res.status(502).json({ error: 'AI识别服务请求失败' });
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      return res.status(502).json({ error: 'AI识别服务返回格式异常' });
    }

    return res.json({ content });
  } catch (error) {
    if (error?.name === 'AbortError') {
      return res.status(504).json({ error: 'AI识别服务响应超时' });
    }
    console.error('豆包API代理异常:', error?.message || error);
    return res.status(502).json({ error: 'AI识别服务暂时不可用' });
  } finally {
    clearTimeout(timeout);
  }
});

export default router;
