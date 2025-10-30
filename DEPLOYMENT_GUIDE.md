# 抱枕设计系统部署指南

## 概述
本指南将帮助您使用 Vercel 和 Supabase 部署抱枕设计系统。

## 前置要求
- GitHub 账号
- Vercel 账号
- Supabase 账号

## 部署步骤

### 1. Supabase 设置

#### 创建项目
1. 访问 [Supabase](https://supabase.com)
2. 创建新组织（如果还没有）
3. 点击 "New Project"
4. 填写项目信息：
   - 项目名称：pillow-design-system
   - 数据库密码：设置强密码
   - 地区：选择最近的地区（建议选东亚）

#### 获取配置信息
项目创建完成后，进入项目设置页面：
- **项目URL**: `https://[your-project-ref].supabase.co`
- **匿名密钥** (anon key): 在 Settings > API 页面
- **服务角色密钥** (service_role key): 在 Settings > API 页面

### 2. 数据库表结构

我们已经为您创建了必要的数据库表，包括：
- `categories` - 模板分类
- `templates` - 设计模板
- `designs` - 用户设计
- `orders` - 订单信息

### 3. Vercel 部署

#### 连接 GitHub 仓库
1. 访问 [Vercel](https://vercel.com)
2. 点击 "New Project"
3. 导入您的 GitHub 仓库
4. 配置项目：
   - Framework Preset: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`

#### 环境变量配置
在 Vercel 项目设置中，添加以下环境变量：

```env
# Supabase 配置
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_role_key

# 可选：豆包AI配置（用于图像识别）
VITE_DOUBAO_API_KEY=your_doubao_api_key
VITE_DOUBAO_API_BASE=https://ark.cn-beijing.volces.com/api/v3
VITE_DOUBAO_MODEL=ep-20241215115442-6d8r5
```

### 4. 本地测试

在部署前，建议先在本地测试 Supabase 连接：

1. 创建 `.env` 文件：
```bash
cp .env.example .env
```

2. 填写 `.env` 文件中的 Supabase 配置

3. 启动服务：
```bash
npm run dev
```

### 5. 部署验证

部署完成后，验证以下功能：
- ✅ 访问主页
- ✅ 模板分类显示
- ✅ 设计编辑器
- ✅ 文件上传功能
- ✅ 订单提交功能

## 文件结构说明

### 后端适配
- `api/database.js` - SQLite 数据库（本地开发用）
- `api/database.supabase.js` - Supabase 数据库适配器（生产环境）
- `api/server.js` - 服务器主文件，自动选择数据库

### 配置文件
- `vercel.json` - Vercel 部署配置
- `api/index.js` - Vercel serverless 函数入口

## 常见问题

### 数据库连接失败
1. 检查 Supabase URL 和密钥是否正确
2. 确认 Supabase 项目是否正常运行
3. 检查网络连接

### 文件上传失败
1. 检查 Supabase Storage 配置
2. 确认文件大小限制
3. 检查文件类型限制

### 页面加载缓慢
1. 检查 Vercel 部署地区
2. 优化图片大小
3. 使用 CDN 加速

## 技术支持

如果遇到问题，请检查：
1. 浏览器控制台错误信息
2. Vercel 函数日志
3. Supabase 数据库日志

## 安全建议

1. **密钥管理**: 不要在代码中硬编码密钥
2. **访问控制**: 配置 Supabase RLS 策略
3. **文件上传**: 限制文件类型和大小
4. **数据备份**: 定期备份 Supabase 数据库

## 性能优化

1. **图片优化**: 使用 WebP 格式，压缩图片
2. **缓存策略**: 配置浏览器缓存
3. **CDN**: 使用 Vercel Edge Network
4. **数据库索引**: 优化查询性能

---

部署完成后，您的抱枕设计系统将具备：
- 🎨 在线设计编辑器
- 📱 响应式设计
- 💾 云端数据存储
- 📤 文件上传功能
- 📋 订单管理系统
- 🔒 安全认证

祝您使用愉快！