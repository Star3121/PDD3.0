-- Add missing columns to templates table
ALTER TABLE templates 
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS canvas_data TEXT,
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id),
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Add missing columns to designs table  
ALTER TABLE designs
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Add missing columns to orders table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS customer_name TEXT,
ADD COLUMN IF NOT EXISTS customer_phone TEXT,
ADD COLUMN IF NOT EXISTS customer_address TEXT,
ADD COLUMN IF NOT EXISTS design_data TEXT,
ADD COLUMN IF NOT EXISTS total_price DECIMAL(10,2);

-- Update existing columns to have proper defaults
ALTER TABLE orders 
ALTER COLUMN status SET DEFAULT 'pending',
ALTER COLUMN status TYPE TEXT USING status::text;

-- Add check constraint for order status
ALTER TABLE orders 
DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders 
ADD CONSTRAINT orders_status_check 
CHECK (status IN ('pending', 'confirmed', 'production', 'shipped', 'delivered'));

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_templates_category_id ON templates(category_id);
CREATE INDEX IF NOT EXISTS idx_designs_order_id ON designs(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);