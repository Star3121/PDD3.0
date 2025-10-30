import { createClient } from '@supabase/supabase-js';

class SupabaseDatabase {
  constructor() {
    this.supabase = null;
    this.initialized = false;
    this.init();
  }

  async init() {
    if (this.initialized) return;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase URL and Key must be provided in environment variables');
      return;
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
    
    // Test connection
    try {
      const { data, error } = await this.supabase.from('categories').select('id').limit(1);
      if (error && error.code !== 'PGRST116') { // PGRST116 = table doesn't exist
        console.error(`Failed to connect to Supabase: ${error.message}`);
        return;
      }
      this.initialized = true;
      console.log('Supabase数据库连接成功');
    } catch (err) {
      console.error('Supabase连接失败:', err);
    }
  }

  // Helper method to ensure initialization
  async ensureInitialized() {
    if (!this.initialized) {
      await this.init();
    }
  }

  // Categories table operations
  async getCategories() {
    await this.ensureInitialized();
    const { data, error } = await this.supabase
      .from('categories')
      .select('*')
      .order('name');
    
    if (error) throw error;
    return data || [];
  }

  async getCategoryById(id) {
    await this.ensureInitialized();
    const { data, error } = await this.supabase
      .from('categories')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data;
  }

  async createCategory(category) {
    await this.ensureInitialized();
    const { data, error } = await this.supabase
      .from('categories')
      .insert([category])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  // Templates table operations
  async getTemplates(categoryId = null) {
    await this.ensureInitialized();
    let query = this.supabase
      .from('templates')
      .select('*')
      .order('name');
    
    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async getTemplateById(id) {
    await this.ensureInitialized();
    const { data, error } = await this.supabase
      .from('templates')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data;
  }

  async createTemplate(template) {
    await this.ensureInitialized();
    const { data, error } = await this.supabase
      .from('templates')
      .insert([template])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  // Designs table operations
  async getDesigns() {
    await this.ensureInitialized();
    const { data, error } = await this.supabase
      .from('designs')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }

  async getDesignById(id) {
    await this.ensureInitialized();
    const { data, error } = await this.supabase
      .from('designs')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data;
  }

  async createDesign(design) {
    await this.ensureInitialized();
    const { data, error } = await this.supabase
      .from('designs')
      .insert([design])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async updateDesign(id, design) {
    await this.ensureInitialized();
    const { data, error } = await this.supabase
      .from('designs')
      .update(design)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async deleteDesign(id) {
    await this.ensureInitialized();
    const { error } = await this.supabase
      .from('designs')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    return true;
  }

  // Orders table operations
  async getOrders() {
    await this.ensureInitialized();
    const { data, error } = await this.supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }

  async getOrderById(id) {
    await this.ensureInitialized();
    const { data, error } = await this.supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data;
  }

  async createOrder(order) {
    await this.ensureInitialized();
    const { data, error } = await this.supabase
      .from('orders')
      .insert([order])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async updateOrder(id, order) {
    await this.ensureInitialized();
    const { data, error } = await this.supabase
      .from('orders')
      .update(order)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async deleteOrder(id) {
    await this.ensureInitialized();
    const { error } = await this.supabase
      .from('orders')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    return true;
  }

  // Migration methods (for initial setup)
  async migrate() {
    await this.ensureInitialized();
    
    // Create tables if they don't exist
    const tables = ['categories', 'templates', 'designs', 'orders'];
    
    for (const table of tables) {
      const { error } = await this.supabase.rpc('create_table_if_not_exists', {
        table_name: table
      });
      
      if (error && error.code !== 'PGRST116') {
        console.warn(`Table ${table} might already exist or error creating:`, error.message);
      }
    }
  }

  async initializeDefaultCategories() {
    await this.ensureInitialized();
    
    const defaultCategories = [
      { name: '简约风格', description: '简洁现代的设计模板' },
      { name: '卡通动漫', description: '可爱卡通动漫风格模板' },
      { name: '文字艺术', description: '创意文字艺术设计模板' },
      { name: '自然风景', description: '自然风光风景模板' },
      { name: '抽象艺术', description: '抽象艺术创意模板' }
    ];

    // Check if categories already exist
    const existingCategories = await this.getCategories();
    
    if (existingCategories.length === 0) {
      for (const category of defaultCategories) {
        await this.createCategory(category);
      }
      console.log('Default categories initialized');
    }
  }

  // SQLite-compatible query method
  async query(sql, params = []) {
    await this.ensureInitialized();
    
    // Parse SQL to determine table and operation
    const lowerSql = sql.toLowerCase().trim();
    
    try {
      if (lowerSql.startsWith('select')) {
        // Handle SELECT queries
        let tableName = '';
        let whereClause = '';
        let orderBy = '';
        let limit = '';
        
        // Extract table name
        const fromMatch = sql.match(/from\s+(\w+)/i);
        if (fromMatch) tableName = fromMatch[1];
        
        // Extract WHERE clause
        const whereMatch = sql.match(/where\s+(.+?)(?:\s+order\s+by|\s+limit|$)/i);
        if (whereMatch) whereClause = whereMatch[1];
        
        // Extract ORDER BY
        const orderMatch = sql.match(/order\s+by\s+(.+?)(?:\s+limit|$)/i);
        if (orderMatch) orderBy = orderMatch[1];
        
        // Extract LIMIT
        const limitMatch = sql.match(/limit\s+(\d+)/i);
        if (limitMatch) limit = limitMatch[1];
        
        // Build Supabase query
        let query = this.supabase.from(tableName).select('*');
        
        // Apply WHERE conditions
        if (whereClause) {
          const conditions = this.parseWhereClause(whereClause, params);
          conditions.forEach(condition => {
            query = query.eq(condition.column, condition.value);
          });
        }
        
        // Apply ORDER BY
        if (orderBy) {
          const [column, direction] = orderBy.trim().split(/\s+/);
          query = query.order(column, { ascending: direction?.toLowerCase() !== 'desc' });
        }
        
        // Apply LIMIT
        if (limit) {
          query = query.limit(parseInt(limit));
        }
        
        const { data, error } = await query;
        if (error) throw error;
        return data || [];
        
      } else if (lowerSql.startsWith('insert')) {
        // Handle INSERT queries
        const tableMatch = sql.match(/insert\s+into\s+(\w+)/i);
        if (!tableMatch) throw new Error('无法解析INSERT语句');
        
        const tableName = tableMatch[1];
        const columnsMatch = sql.match(/\(([^)]+)\)/);
        const valuesMatch = sql.match(/values\s*\(([^)]+)\)/i);
        
        if (!columnsMatch || !valuesMatch) throw new Error('无法解析INSERT语句');
        
        const columns = columnsMatch[1].split(',').map(col => col.trim());
        const record = {};
        columns.forEach((col, index) => {
          record[col] = params[index];
        });
        
        const { data, error } = await this.supabase
          .from(tableName)
          .insert([record])
          .select()
          .single();
          
        if (error) throw error;
        return [{ id: data.id, changes: 1 }];
        
      } else if (lowerSql.startsWith('update')) {
        // Handle UPDATE queries
        const tableMatch = sql.match(/update\s+(\w+)/i);
        const setMatch = sql.match(/set\s+(.+?)\s+where/i);
        const whereMatch = sql.match(/where\s+(.+)$/i);
        
        if (!tableMatch || !setMatch || !whereMatch) throw new Error('无法解析UPDATE语句');
        
        const tableName = tableMatch[1];
        const updates = this.parseSetClause(setMatch[1], params);
        const conditions = this.parseWhereClause(whereMatch[1], params.slice(updates.length));
        
        let query = this.supabase.from(tableName).update(updates);
        conditions.forEach(condition => {
          if (condition.type === 'in') {
            query = query.in(condition.column, condition.values);
          } else {
            query = query.eq(condition.column, condition.value);
          }
        });
        
        const { data, error } = await query.select();
        if (error) throw error;
        return [{ id: data[0]?.id, changes: data.length }];
        
      } else if (lowerSql.startsWith('delete')) {
        // Handle DELETE queries
        const tableMatch = sql.match(/delete\s+from\s+(\w+)/i);
        const whereMatch = sql.match(/where\s+(.+)$/i);
        
        if (!tableMatch || !whereMatch) throw new Error('无法解析DELETE语句');
        
        const tableName = tableMatch[1];
        const conditions = this.parseWhereClause(whereMatch[1], params);
        
        let query = this.supabase.from(tableName).delete();
        conditions.forEach(condition => {
          if (condition.type === 'in') {
            query = query.in(condition.column, condition.values);
          } else {
            query = query.eq(condition.column, condition.value);
          }
        });
        
        const { data, error } = await query;
        if (error) throw error;
        return [{ id: null, changes: data ? data.length : 0 }];
      }
      
      throw new Error(`不支持的SQL操作: ${sql}`);
    } catch (error) {
      console.error('数据库查询失败:', error);
      throw error;
    }
  }
  
  // SQLite-compatible run method
  async run(sql, params = []) {
    const result = await this.query(sql, params);
    return {
      id: result[0]?.id || null,
      changes: result[0]?.changes || 0
    };
  }
  
  // Helper method to parse WHERE clause
  parseWhereClause(whereClause, params) {
    const conditions = [];
    
    // Support IN (...) clause
    const inMatch = whereClause.match(/(\w+)\s+in\s*\(([^)]+)\)/i);
    if (inMatch) {
      conditions.push({
        type: 'in',
        column: inMatch[1],
        values: params
      });
      return conditions;
    }
    
    // Fallback: support equality conditions combined with AND
    const parts = whereClause.split(/\s+and\s+/i);
    
    parts.forEach((part, index) => {
      const match = part.match(/(\w+)\s*=\s*\?/i);
      if (match) {
        conditions.push({
          type: 'eq',
          column: match[1],
          value: params[index]
        });
      }
    });
    
    return conditions;
  }
  
  // Helper method to parse SET clause
  parseSetClause(setClause, params) {
    const updates = {};
    const parts = setClause.split(',');
    
    parts.forEach((part, index) => {
      const match = part.match(/(\w+)\s*=\s*\?/i);
      if (match) {
        updates[match[1]] = params[index];
      }
    });
    
    return updates;
  }

  // Close connection (for cleanup)
  async close() {
    // Supabase client doesn't need explicit closing
    this.initialized = false;
  }
}

// Create and export singleton instance
export const db = new SupabaseDatabase();
export default db;