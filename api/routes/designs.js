import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// 检测是否在 Vercel 环境
const isVercel = process.env.VERCEL || process.env.VERCEL_ENV;

// 数据库实例将从服务器注入
let db;

// 配置图片上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = isVercel
      ? '/tmp/designs'
      : path.join(process.cwd(), 'uploads/designs');
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
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB
    fieldSize: 50 * 1024 * 1024 // 50MB for canvas_data field
  }
});

// 获取订单的所有设计
router.get('/order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const designs = await db.query('SELECT * FROM designs WHERE order_id = ? ORDER BY created_at DESC', [orderId]);
    res.json(designs);
  } catch (error) {
    console.error('获取设计失败:', error);
    res.status(500).json({ error: '获取设计失败' });
  }
});

// 获取单个设计
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const designs = await db.query('SELECT * FROM designs WHERE id = ?', [id]);
    
    if (designs.length === 0) {
      return res.status(404).json({ error: '设计不存在' });
    }
    
    res.json(designs[0]);
  } catch (error) {
    console.error('获取设计失败:', error);
    res.status(500).json({ error: '获取设计失败' });
  }
});

// 创建设计
router.post('/', upload.single('preview'), async (req, res) => {
  try {
    const { order_id, name, canvas_data, width, height, background_type } = req.body;
    if (!order_id || !name) {
      return res.status(400).json({ error: '订单ID和设计名称不能为空' });
    }
    let preview_path = null;
    if (req.file) {
      preview_path = isVercel
        ? `/api/files/designs/${req.file.filename}`
        : `/uploads/designs/${req.file.filename}`;
    }
    const result = await db.run(
      'INSERT INTO designs (order_id, name, canvas_data, preview_path, width, height, background_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [order_id, name, canvas_data || '{}', preview_path, width || 800, height || 600, background_type || 'white']
    );
    const newDesign = await db.query('SELECT * FROM designs WHERE id = ?', [result.id]);
    res.status(201).json(newDesign[0]);
  } catch (error) {
    console.error('创建设计失败:', error);
    res.status(500).json({ error: '创建设计失败' });
  }
});

// 更新设计
router.put('/:id', upload.single('preview'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, canvas_data, width, height, background_type } = req.body;
    const existingDesigns = await db.query('SELECT * FROM designs WHERE id = ?', [id]);
    if (existingDesigns.length === 0) {
      return res.status(404).json({ error: '设计不存在' });
    }
    const existingDesign = existingDesigns[0];
    let preview_path = existingDesign.preview_path;
    if (req.file) {
      if (existingDesign.preview_path) {
        const oldFilename = path.basename(existingDesign.preview_path || '');
        const oldPreviewPath = isVercel
          ? path.join('/tmp/designs', oldFilename)
          : path.join(process.cwd(), 'uploads/designs', oldFilename);
        if (oldFilename && fs.existsSync(oldPreviewPath)) {
          fs.unlinkSync(oldPreviewPath);
        }
      }
      preview_path = isVercel
        ? `/api/files/designs/${req.file.filename}`
        : `/uploads/designs/${req.file.filename}`;
    }
    // 生成东八区时间
    const beijingTime = new Date();
    beijingTime.setHours(beijingTime.getHours() + 8);
    const beijingTimeString = beijingTime.toISOString().replace('T', ' ').substring(0, 19);
    await db.run(
      'UPDATE designs SET name = ?, canvas_data = ?, preview_path = ?, width = ?, height = ?, background_type = ?, updated_at = ? WHERE id = ?',
      [name || existingDesign.name, canvas_data || existingDesign.canvas_data, preview_path, width || existingDesign.width, height || existingDesign.height, background_type || existingDesign.background_type, beijingTimeString, id]
    );
    const updatedDesign = await db.query('SELECT * FROM designs WHERE id = ?', [id]);
    res.json(updatedDesign[0]);
  } catch (error) {
    console.error('更新设计失败:', error);
    res.status(500).json({ error: '更新设计失败' });
  }
});

// 删除设计
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const designs = await db.query('SELECT * FROM designs WHERE id = ?', [id]);
    if (designs.length === 0) {
      return res.status(404).json({ error: '设计不存在' });
    }
    const design = designs[0];
    if (design.preview_path) {
      const filename = path.basename(design.preview_path || '');
      const previewPath = isVercel
        ? path.join('/tmp/designs', filename)
        : path.join(process.cwd(), 'uploads/designs', filename);
      if (filename && fs.existsSync(previewPath)) {
        fs.unlinkSync(previewPath);
      }
    }
    await db.run('DELETE FROM designs WHERE id = ?', [id]);
    res.json({ message: '设计删除成功' });
  } catch (error) {
    console.error('删除设计失败:', error);
    res.status(500).json({ error: '删除设计失败' });
  }
});

// 设置数据库实例的函数
export function setDatabase(database) {
  db = database;
}

export default router;