import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import storageService from '../services/storage.js';

const router = express.Router();

// 数据库实例将从服务器注入
let db;

// 检测是否在 Vercel 环境
const isVercel = process.env.VERCEL || process.env.VERCEL_ENV;

// 配置文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // 在 Vercel 环境使用 /tmp 目录，本地开发使用 uploads 目录
    const uploadPath = isVercel 
      ? '/tmp/templates'
      : path.join(process.cwd(), 'uploads/templates');
    
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只能上传图片文件'), false);
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// 获取所有模板（支持分页、搜索和筛选）
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 20,
      search = '',
      category = '',
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;

    // 参数验证
    const pageNum = Math.max(1, parseInt(page));
    const pageSizeNum = Math.min(100, Math.max(1, parseInt(pageSize))); // 限制最大页面大小为100
    const offset = (pageNum - 1) * pageSizeNum;

    // 构建查询条件
    let whereConditions = [];
    let queryParams = [];

    // 搜索条件（针对模板名称）
    if (search) {
      whereConditions.push('name LIKE ?');
      const searchPattern = `%${search}%`;
      queryParams.push(searchPattern);
    }

    // 分类筛选
    if (category) {
      whereConditions.push('category = ?');
      queryParams.push(category);
    }

    // 构建WHERE子句
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // 验证排序字段
    const allowedSortFields = ['created_at', 'updated_at', 'name', 'category'];
    const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    const validSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // 获取总数（用于分页信息）
    const countQuery = `SELECT COUNT(*) as total FROM templates ${whereClause}`;
    const countResult = await db.query(countQuery, queryParams);
    const total = countResult[0].total;

    // 获取分页数据
    const dataQuery = `
      SELECT * FROM templates 
      ${whereClause} 
      ORDER BY ${validSortBy} ${validSortOrder} 
      LIMIT ? OFFSET ?
    `;
    const templates = await db.query(dataQuery, [...queryParams, pageSizeNum, offset]);

    // 计算分页信息
    const totalPages = Math.ceil(total / pageSizeNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    res.json({
      data: templates,
      pagination: {
        page: pageNum,
        pageSize: pageSizeNum,
        total,
        totalPages,
        hasNextPage,
        hasPrevPage
      },
      filters: {
        search,
        category,
        sortBy: validSortBy,
        sortOrder: validSortOrder
      }
    });
  } catch (error) {
    console.error('获取模板失败:', error);
    res.status(500).json({ error: '获取模板失败' });
  }
});

// 获取单个模板
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const templates = await db.query('SELECT * FROM templates WHERE id = ?', [id]);
    
    if (templates.length === 0) {
      return res.status(404).json({ error: '模板不存在' });
    }
    
    res.json(templates[0]);
  } catch (error) {
    console.error('获取模板失败:', error);
    res.status(500).json({ error: '获取模板失败' });
  }
});

// 创建模板
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const { name, category = 'general' } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: '模板名称不能为空' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: '请上传模板图片' });
    }
    
    // 上传到存储服务（自动处理多级缩略图 + 适配 S3/Supabase/Local）
    await storageService.uploadProcessedImage('templates', req.file.filename, req.file.path, req.file.mimetype);
    
    // 统一使用 /api/files 路径
    const imagePath = `/api/files/templates/${req.file.filename}`;
    
    const result = await db.run(
      'INSERT INTO templates (name, image_path, category) VALUES (?, ?, ?)',
      [name, imagePath, category]
    );
    
    const newTemplate = await db.query('SELECT * FROM templates WHERE id = ?', [result.id]);
    res.status(201).json(newTemplate[0]);
  } catch (error) {
    console.error('创建模板失败:', error);
    res.status(500).json({ error: '创建模板失败' });
  }
});

// 更新模板
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category } = req.body;
    
    // 检查模板是否存在
    const templates = await db.query('SELECT * FROM templates WHERE id = ?', [id]);
    if (templates.length === 0) {
      return res.status(404).json({ error: '模板不存在' });
    }
    
    // 构建更新字段
    const updateFields = [];
    const updateValues = [];
    
    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({ error: '模板名称不能为空' });
      }
      updateFields.push('name = ?');
      updateValues.push(name);
    }
    
    if (category !== undefined) {
      updateFields.push('category = ?');
      updateValues.push(category);
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ error: '没有提供要更新的字段' });
    }
    
    updateValues.push(id);
    
    await db.run(
      `UPDATE templates SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );
    
    const updatedTemplate = await db.query('SELECT * FROM templates WHERE id = ?', [id]);
    res.json(updatedTemplate[0]);
  } catch (error) {
    console.error('更新模板失败:', error);
    res.status(500).json({ error: '更新模板失败' });
  }
});

// 删除模板
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // 获取模板信息
    const templates = await db.query('SELECT * FROM templates WHERE id = ?', [id]);
    if (templates.length === 0) {
      return res.status(404).json({ error: '模板不存在' });
    }
    
    const template = templates[0];
    
    // 删除文件
    if (template.image_path) {
      const filename = path.basename(template.image_path);
      try {
        await storageService.deleteFile('templates', filename);
      } catch (e) {
        console.error('删除模板图片失败:', e);
      }
    }

    // 从数据库删除
    await db.run('DELETE FROM templates WHERE id = ?', [id]);
    res.json({ message: '模板删除成功' });
  } catch (error) {
    console.error('删除模板失败:', error);
    res.status(500).json({ error: '删除模板失败' });
  }
});

// 批量删除模板
router.delete('/', async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: '请提供要删除的模板ID数组' });
    }

    // 过滤无效的ID
    const validIds = ids.filter(id => id != null && !isNaN(id));
    
    if (validIds.length === 0) {
      return res.status(400).json({ error: '没有有效的模板ID' });
    }

    // 查询要删除的模板信息
    const placeholders = validIds.map(() => '?').join(',');
    const templates = await db.query(`SELECT * FROM templates WHERE id IN (${placeholders})`, validIds);
    
    if (templates.length === 0) {
      return res.status(404).json({ error: '未找到要删除的模板' });
    }

    // 删除关联的文件 (并行处理)
    const deleteFilePromises = templates.map(template => {
      if (template.image_path) {
        const filename = path.basename(template.image_path);
        return storageService.deleteFile('templates', filename)
          .catch(error => console.log(`删除图片文件失败: ${filename}`, error.message));
      }
      return Promise.resolve();
    });

    await Promise.all(deleteFilePromises);

    // 删除数据库记录
    await db.query(`DELETE FROM templates WHERE id IN (${placeholders})`, validIds);

    res.json({ 
      message: '批量删除成功',
      deletedCount: templates.length,
      deletedIds: templates.map(t => t.id)
    });
  } catch (error) {
    console.error('批量删除模板失败:', error);
    res.status(500).json({ error: '批量删除模板失败' });
  }
});

// 设置数据库实例的函数
export function setDatabase(database) {
  db = database;
}

export default router;
