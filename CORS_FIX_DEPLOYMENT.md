# 生产环境 CORS 修复部署指南

## 🚨 问题描述
生产环境出现 `net::ERR_BLOCKED_BY_ORB` 错误，导致图片无法正常加载。

## 🔧 修复内容

### 1. API 路由 CORS 头修复
- ✅ 已在 `api/routes/files.js` 中为所有文件访问路由添加完整的 CORS 头
- ✅ 添加了 OPTIONS 预检请求处理

### 2. Vercel 路由配置增强
- ✅ 在 `vercel.json` 中为文件访问路由添加额外的 CORS 头配置
- ✅ 提供双重保障，确保 CORS 头正确设置

### 3. 修复的 CORS 头包括：
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
Cross-Origin-Resource-Policy: cross-origin
```

## 📋 部署步骤

### 方法 1：通过 Git 部署（推荐）
1. 提交所有修改到 Git 仓库：
   ```bash
   git add .
   git commit -m "fix: 修复生产环境图片 CORS 错误"
   git push origin main
   ```

2. Vercel 会自动检测到更改并重新部署

### 方法 2：通过 Vercel CLI 部署
1. 安装 Vercel CLI（如果未安装）：
   ```bash
   npm i -g vercel
   ```

2. 登录并部署：
   ```bash
   vercel login
   vercel --prod
   ```

## 🔍 验证步骤

部署完成后，请验证以下内容：

### 1. 检查 CORS 头
使用 curl 测试生产环境的文件访问：
```bash
curl -I https://your-domain.vercel.app/api/files/designs/filename.png
```

应该看到以下响应头：
```
Access-Control-Allow-Origin: *
Cross-Origin-Resource-Policy: cross-origin
Content-Type: image/png
```

### 2. 浏览器测试
1. 打开生产环境网站
2. 打开浏览器开发者工具的 Network 标签
3. 刷新页面，检查图片请求
4. 确认没有 `net::ERR_BLOCKED_BY_ORB` 错误

### 3. 功能测试
- ✅ 模板库图片正常显示
- ✅ 设计预览图正常显示
- ✅ 上传的图片正常显示

## 🚀 预期结果

修复后，生产环境应该：
- ✅ 所有图片正常加载，无 ORB 错误
- ✅ 跨域资源访问正常工作
- ✅ 浏览器控制台无相关错误

## 📞 故障排除

如果部署后仍有问题：

1. **清除浏览器缓存**：强制刷新页面 (Ctrl+F5 或 Cmd+Shift+R)

2. **检查 Vercel 部署日志**：
   - 登录 Vercel Dashboard
   - 查看最新部署的构建日志
   - 确认没有构建错误

3. **验证环境变量**：
   - 确保 Vercel 中设置了正确的环境变量
   - 特别是 Supabase 相关配置

4. **检查文件路径**：
   - 确认错误的图片文件是否真实存在
   - 检查数据库记录与实际文件的一致性

## 📝 技术说明

### 为什么需要这些修复？
1. **浏览器 ORB 策略**：现代浏览器的 Opaque Response Blocking 策略阻止跨域资源访问
2. **Vercel Serverless**：生产环境使用 Serverless 函数处理文件访问，需要正确的 CORS 头
3. **双重保障**：API 路由 + Vercel 配置确保 CORS 头在所有情况下都正确设置

### 修复的关键点：
- `Cross-Origin-Resource-Policy: cross-origin` 是防止 ORB 错误的关键头
- OPTIONS 预检请求处理确保复杂 CORS 请求正常工作
- Vercel 路由配置提供额外的头部保障