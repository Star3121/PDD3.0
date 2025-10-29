import express from 'express';
import { Database } from '../database.js';

const router = express.Router();
const db = new Database();

// 获取所有分类
router.get('/', async (req, res) => {
  try {
    const categories = await db.query(
      'SELECT * FROM categories ORDER BY sort_order ASC, created_at ASC'
    );
    res.json(categories);
  } catch (error) {
    console.error('获取分类失败:', error);
    res.status(500).json({ error: '获取分类失败' });
  }
});

// 获取单个分类
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const categories = await db.query('SELECT * FROM categories WHERE id = ?', [id]);
    
    if (categories.length === 0) {
      return res.status(404).json({ error: '分类不存在' });
    }
    
    res.json(categories[0]);
  } catch (error) {
    console.error('获取分类失败:', error);
    res.status(500).json({ error: '获取分类失败' });
  }
});

// 创建分类
router.post('/', async (req, res) => {
  try {
    const { name, display_name, description = '', sort_order = 0 } = req.body;
    
    if (!name || !display_name) {
      return res.status(400).json({ error: '分类名称和显示名称不能为空' });
    }
    
    // 检查分类名称是否已存在
    const existingCategories = await db.query('SELECT * FROM categories WHERE name = ?', [name]);
    if (existingCategories.length > 0) {
      return res.status(400).json({ error: '分类名称已存在' });
    }
    
    const result = await db.run(
      'INSERT INTO categories (name, display_name, description, sort_order, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
      [name, display_name, description, sort_order]
    );
    
    const newCategory = await db.query('SELECT * FROM categories WHERE id = ?', [result.id]);
    res.status(201).json(newCategory[0]);
  } catch (error) {
    console.error('创建分类失败:', error);
    res.status(500).json({ error: '创建分类失败' });
  }
});

// 更新分类
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, display_name, description, sort_order } = req.body;
    
    // 检查分类是否存在
    const existingCategories = await db.query('SELECT * FROM categories WHERE id = ?', [id]);
    if (existingCategories.length === 0) {
      return res.status(404).json({ error: '分类不存在' });
    }
    
    const existingCategory = existingCategories[0];
    
    // 如果修改了name，检查新名称是否已被其他分类使用
    if (name && name !== existingCategory.name) {
      const duplicateCategories = await db.query('SELECT * FROM categories WHERE name = ? AND id != ?', [name, id]);
      if (duplicateCategories.length > 0) {
        return res.status(400).json({ error: '分类名称已存在' });
      }
    }
    
    // 构建更新字段
    const updateFields = [];
    const updateValues = [];
    
    if (name !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(name);
    }
    if (display_name !== undefined) {
      updateFields.push('display_name = ?');
      updateValues.push(display_name);
    }
    if (description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(description);
    }
    if (sort_order !== undefined) {
      updateFields.push('sort_order = ?');
      updateValues.push(sort_order);
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ error: '没有提供要更新的字段' });
    }
    
    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    updateValues.push(id);
    
    await db.run(
      `UPDATE categories SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );
    
    const updatedCategory = await db.query('SELECT * FROM categories WHERE id = ?', [id]);
    res.json(updatedCategory[0]);
  } catch (error) {
    console.error('更新分类失败:', error);
    res.status(500).json({ error: '更新分类失败' });
  }
});

// 删除分类
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // 检查分类是否存在
    const categories = await db.query('SELECT * FROM categories WHERE id = ?', [id]);
    if (categories.length === 0) {
      return res.status(404).json({ error: '分类不存在' });
    }
    
    const category = categories[0];
    
    // 检查是否为默认分类
    if (category.is_default) {
      return res.status(400).json({ error: '不能删除默认分类' });
    }
    
    // 检查该分类下是否有模板
    const templates = await db.query('SELECT COUNT(*) as count FROM templates WHERE category = ?', [category.name]);
    if (templates[0].count > 0) {
      return res.status(400).json({ 
        error: '该分类下还有模板，无法删除',
        templateCount: templates[0].count 
      });
    }
    
    // 删除分类
    await db.run('DELETE FROM categories WHERE id = ?', [id]);
    res.json({ message: '分类删除成功' });
  } catch (error) {
    console.error('删除分类失败:', error);
    res.status(500).json({ error: '删除分类失败' });
  }
});

// 批量更新分类排序
router.patch('/reorder', async (req, res) => {
  try {
    const { categories } = req.body;
    
    if (!Array.isArray(categories)) {
      return res.status(400).json({ error: '分类数据格式错误' });
    }
    
    // 批量更新排序
    for (const category of categories) {
      if (category.id && category.sort_order !== undefined) {
        await db.run(
          'UPDATE categories SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [category.sort_order, category.id]
        );
      }
    }
    
    // 返回更新后的分类列表
    const updatedCategories = await db.query(
      'SELECT * FROM categories ORDER BY sort_order ASC, created_at ASC'
    );
    res.json(updatedCategories);
  } catch (error) {
    console.error('更新分类排序失败:', error);
    res.status(500).json({ error: '更新分类排序失败' });
  }
});

export default router;