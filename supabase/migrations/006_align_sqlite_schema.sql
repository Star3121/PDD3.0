-- Align Supabase schema with local SQLite expectations without dropping data
BEGIN;

-- Ensure update_updated_at_column function exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ORDERS: add missing columns and defaults
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_number TEXT,
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS product_size TEXT,
  ADD COLUMN IF NOT EXISTS product_category TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS product_model TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS product_specs TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS transaction_time TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS order_notes TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS mark TEXT DEFAULT 'pending_design',
  ADD COLUMN IF NOT EXISTS export_status TEXT DEFAULT 'not_exported',
  ADD COLUMN IF NOT EXISTS exported_at TIMESTAMP WITH TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Ensure defaults
ALTER TABLE public.orders ALTER COLUMN mark SET DEFAULT 'pending_design';
ALTER TABLE public.orders ALTER COLUMN export_status SET DEFAULT 'not_exported';
ALTER TABLE public.orders ALTER COLUMN quantity SET DEFAULT 1;
ALTER TABLE public.orders ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE public.orders ALTER COLUMN updated_at SET DEFAULT NOW();

-- Unique index for order_number
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders(order_number);

-- Update trigger for orders
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_orders_updated_at') THEN
    CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- CATEGORIES: add missing columns and defaults
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Backfill display_name and enforce NOT NULL
UPDATE public.categories SET display_name = COALESCE(display_name, name);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='categories' AND column_name='display_name'
  ) THEN
    ALTER TABLE public.categories ALTER COLUMN display_name SET NOT NULL;
  END IF;
END $$;

-- Unique index for category name
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name ON public.categories(name);

-- Update trigger for categories
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_categories_updated_at') THEN
    CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- TEMPLATES: ensure base columns exist to match SQLite
ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS image_path TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- DESIGNS: add missing columns and defaults
ALTER TABLE public.designs
  ADD COLUMN IF NOT EXISTS order_id BIGINT,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS canvas_data TEXT,
  ADD COLUMN IF NOT EXISTS preview_path TEXT,
  ADD COLUMN IF NOT EXISTS width INTEGER DEFAULT 800,
  ADD COLUMN IF NOT EXISTS height INTEGER DEFAULT 600,
  ADD COLUMN IF NOT EXISTS background_type TEXT DEFAULT 'white',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Foreign key constraint for designs.order_id -> orders.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname='designs_order_id_fkey'
  ) THEN
    ALTER TABLE public.designs
    ADD CONSTRAINT designs_order_id_fkey
    FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Update trigger for designs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_designs_updated_at') THEN
    CREATE TRIGGER update_designs_updated_at BEFORE UPDATE ON public.designs
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

COMMIT;