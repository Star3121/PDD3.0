-- WARNING: 此迁移将删除并重建四张核心表，以与本地 SQLite 完全对齐
-- 在新项目上执行即可（若已有同名表，将被替换）

BEGIN;

-- 删除旧表（如果存在）
DROP TABLE IF EXISTS public.designs CASCADE;
DROP TABLE IF EXISTS public.templates CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;

-- 创建 orders 表（与 SQLite 对齐）
CREATE TABLE public.orders (
  id BIGSERIAL PRIMARY KEY,
  order_number TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  product_size TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- 迁移新增字段
  product_category TEXT DEFAULT '',
  product_model TEXT DEFAULT '',
  product_specs TEXT DEFAULT '',
  quantity INTEGER DEFAULT 1,
  transaction_time TEXT DEFAULT '',
  order_notes TEXT DEFAULT '',
  mark TEXT DEFAULT 'pending_design',
  export_status TEXT DEFAULT 'not_exported',
  exported_at TIMESTAMP WITH TIME ZONE NULL
);

-- 创建 templates 表（与 SQLite 对齐）
CREATE TABLE public.templates (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  image_path TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建 categories 表（与 SQLite 对齐）
CREATE TABLE public.categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建 designs 表（与 SQLite 对齐）
CREATE TABLE public.designs (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  canvas_data TEXT,
  preview_path TEXT,
  width INTEGER DEFAULT 800,
  height INTEGER DEFAULT 600,
  background_type TEXT DEFAULT 'white',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 更新时间戳触发器（update_updated_at_column）
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_designs_updated_at BEFORE UPDATE ON public.designs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 初始化默认分类（与 SQLite 对齐）
INSERT INTO public.categories (name, display_name, description, is_default, sort_order)
VALUES
  ('default', '默认', '默认分类', TRUE, 1),
  ('pattern', '图案', '图案类模板', TRUE, 2),
  ('text', '文字', '文字类模板', TRUE, 3),
  ('shape', '形状', '形状类模板', TRUE, 4)
ON CONFLICT (name) DO NOTHING;

COMMIT;