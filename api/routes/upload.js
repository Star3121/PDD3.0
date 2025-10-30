import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import archiver from 'archiver';

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
      ? '/tmp/images'
      : path.join(process.cwd(), 'uploads/images');
    
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
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// 上传图片（兼容字段名 'image' 与 'file'）
router.post('/image', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'file', maxCount: 1 }]), (req, res) => {
  try {
    const files = req.files || {};
    const imageFile = (Array.isArray(files?.image) && files.image[0]) || (Array.isArray(files?.file) && files.file[0]);

    if (!imageFile) {
      return res.status(400).json({ error: '请上传图片文件' });
    }

    // 在 Vercel 环境中，文件存储在 /tmp，但返回相对路径用于前端访问
    const imagePath = isVercel 
      ? `/api/files/images/${imageFile.filename}`  // API 路由访问
      : `/uploads/images/${imageFile.filename}`;   // 本地静态文件访问
    
    res.json({ 
      message: '图片上传成功',
      imagePath: imagePath,
      filename: imageFile.filename
    });
  } catch (error) {
    console.error('图片上传失败:', error);
    res.status(500).json({ error: '图片上传失败' });
  }
});

// 导出单个订单
router.get('/export/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    // 获取订单信息
    const orders = await db.query('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (orders.length === 0) {
      return res.status(404).json({ error: '订单不存在' });
    }
    
    const order = orders[0];
    
    // 获取订单的设计
    const designs = await db.query('SELECT * FROM designs WHERE order_id = ?', [orderId]);
    
    // 创建临时目录
    const tempDir = path.join(process.cwd(), 'temp', `export_${orderId}_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    
    // 创建订单信息文件
    const orderInfo = {
      order_number: order.order_number,
      customer_name: order.customer_name,
      phone: order.phone,
      address: order.address,
      product_size: order.product_size,
      created_at: order.created_at,
      designs: designs.map(design => ({
        name: design.name,
        width: design.width,
        height: design.height,
        created_at: design.created_at
      }))
    };
    
    fs.writeFileSync(
      path.join(tempDir, 'order_info.json'),
      JSON.stringify(orderInfo, null, 2)
    );
    
    // 复制设计预览图
    for (const design of designs) {
      if (design.preview_path && fs.existsSync(path.join(process.cwd(), design.preview_path))) {
        const fileName = path.basename(design.preview_path);
        fs.copyFileSync(
          path.join(process.cwd(), design.preview_path),
          path.join(tempDir, fileName)
        );
      }
    }
    
    // 创建压缩文件
    const zipFileName = `order_${order.order_number}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);
    
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);
    
    // 添加文件到压缩包
    archive.directory(tempDir, false);
    
    // 清理临时目录
    archive.on('end', () => {
      setTimeout(() => {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      }, 5000);
    });
    
    await archive.finalize();
    
  } catch (error) {
    console.error('导出订单失败:', error);
    res.status(500).json({ error: '导出订单失败' });
  }
});

// 批量导出订单
router.post('/export/batch', async (req, res) => {
  try {
    const { orderIds } = req.body;
    
    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ error: '请选择要导出的订单' });
    }
    
    // 创建临时目录
    const tempDir = path.join(process.cwd(), 'temp', `batch_export_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    
    // 处理每个订单
    for (const orderId of orderIds) {
      const orders = await db.query('SELECT * FROM orders WHERE id = ?', [orderId]);
      if (orders.length === 0) continue;
      
      const order = orders[0];
      const designs = await db.query('SELECT * FROM designs WHERE order_id = ?', [orderId]);
      
      // 更新订单标记为已导出
      const beijingTime = new Date();
      beijingTime.setHours(beijingTime.getHours() + 8);
      const beijingTimeString = beijingTime.toISOString().replace('T', ' ').substring(0, 19);
      
      await db.run(
        'UPDATE orders SET mark = ?, updated_at = ? WHERE id = ?',
        ['exported', beijingTimeString, orderId]
      );
      
      // 创建订单目录
      const orderDir = path.join(tempDir, `order_${order.order_number}`);
      fs.mkdirSync(orderDir, { recursive: true });
      
      // 创建订单信息文件
      const orderInfo = {
        order_number: order.order_number,
        customer_name: order.customer_name,
        phone: order.phone,
        address: order.address,
        product_size: order.product_size,
        created_at: order.created_at,
        designs: designs.map(design => ({
          name: design.name,
          width: design.width,
          height: design.height,
          created_at: design.created_at
        }))
      };
      
      fs.writeFileSync(
        path.join(orderDir, 'order_info.json'),
        JSON.stringify(orderInfo, null, 2)
      );
      
      // 复制设计预览图
      for (const design of designs) {
        if (design.preview_path && fs.existsSync(path.join(process.cwd(), design.preview_path))) {
          const fileName = path.basename(design.preview_path);
          fs.copyFileSync(
            path.join(process.cwd(), design.preview_path),
            path.join(orderDir, fileName)
          );
        }
      }
    }
    
    // 创建压缩文件
    const zipFileName = `batch_export_${Date.now()}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);
    
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);
    
    // 添加文件到压缩包
    archive.directory(tempDir, false);
    
    // 清理临时目录
    archive.on('end', () => {
      setTimeout(() => {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      }, 5000);
    });
    
    await archive.finalize();
    
  } catch (error) {
    console.error('批量导出失败:', error);
    res.status(500).json({ error: '批量导出失败' });
  }
});

// 设置数据库实例的函数
export function setDatabase(database) {
  db = database;
}

export default router;