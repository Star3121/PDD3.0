-- Create categories table
CREATE TABLE IF NOT EXISTS categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create templates table
CREATE TABLE IF NOT EXISTS templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  canvas_data TEXT,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create designs table
CREATE TABLE IF NOT EXISTS designs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  canvas_data TEXT NOT NULL,
  thumbnail_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_address TEXT NOT NULL,
  design_data TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  total_price DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'production', 'shipped', 'delivered')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE designs ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Create policies for categories (read for all, write for authenticated)
CREATE POLICY "Categories are viewable by everyone" ON categories FOR SELECT USING (true);
CREATE POLICY "Categories can be created by authenticated users" ON categories FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Categories can be updated by authenticated users" ON categories FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Categories can be deleted by authenticated users" ON categories FOR DELETE USING (auth.role() = 'authenticated');

-- Create policies for templates (read for all, write for authenticated)
CREATE POLICY "Templates are viewable by everyone" ON templates FOR SELECT USING (true);
CREATE POLICY "Templates can be created by authenticated users" ON templates FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Templates can be updated by authenticated users" ON templates FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Templates can be deleted by authenticated users" ON templates FOR DELETE USING (auth.role() = 'authenticated');

-- Create policies for designs (read for all, write for authenticated)
CREATE POLICY "Designs are viewable by everyone" ON designs FOR SELECT USING (true);
CREATE POLICY "Designs can be created by authenticated users" ON designs FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Designs can be updated by authenticated users" ON designs FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Designs can be deleted by authenticated users" ON designs FOR DELETE USING (auth.role() = 'authenticated');

-- Create policies for orders (read/write for authenticated)
CREATE POLICY "Orders are viewable by authenticated users" ON orders FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Orders can be created by authenticated users" ON orders FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Orders can be updated by authenticated users" ON orders FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Orders can be deleted by authenticated users" ON orders FOR DELETE USING (auth.role() = 'authenticated');

-- Grant permissions to anon and authenticated roles
GRANT SELECT ON categories TO anon;
GRANT SELECT ON templates TO anon;
GRANT SELECT ON designs TO anon;
GRANT ALL ON categories TO authenticated;
GRANT ALL ON templates TO authenticated;
GRANT ALL ON designs TO authenticated;
GRANT ALL ON orders TO authenticated;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_designs_updated_at BEFORE UPDATE ON designs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default categories
INSERT INTO categories (name, description) VALUES
  ('简约风格', '简洁现代的设计模板'),
  ('卡通动漫', '可爱卡通动漫风格模板'),
  ('文字艺术', '创意文字艺术设计模板'),
  ('自然风景', '自然风光风景模板'),
  ('抽象艺术', '抽象艺术创意模板')
ON CONFLICT DO NOTHING;