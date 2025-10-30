-- First update any invalid statuses to 'pending'
UPDATE orders 
SET status = 'pending' 
WHERE status NOT IN ('pending', 'confirmed', 'production', 'shipped', 'delivered');

-- Now add the check constraint
ALTER TABLE orders 
DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders 
ADD CONSTRAINT orders_status_check 
CHECK (status IN ('pending', 'confirmed', 'production', 'shipped', 'delivered'));

-- Add missing columns to orders table if they don't exist
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS customer_name TEXT,
ADD COLUMN IF NOT EXISTS customer_phone TEXT,
ADD COLUMN IF NOT EXISTS customer_address TEXT,
ADD COLUMN IF NOT EXISTS design_data TEXT,
ADD COLUMN IF NOT EXISTS total_price DECIMAL(10,2);

-- Set default for status
ALTER TABLE orders 
ALTER COLUMN status SET DEFAULT 'pending';

-- Add missing columns to templates table
ALTER TABLE templates 
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS canvas_data TEXT,
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id),
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Add missing columns to designs table  
ALTER TABLE designs
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;