-- Add shipping configuration columns to store_settings
ALTER TABLE public.store_settings
ADD COLUMN IF NOT EXISTS shipping_store_pickup_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS shipping_store_pickup_label text DEFAULT 'Retirada na Loja',
ADD COLUMN IF NOT EXISTS shipping_store_pickup_address text,
ADD COLUMN IF NOT EXISTS shipping_free_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS shipping_free_label text DEFAULT 'Frete Grátis',
ADD COLUMN IF NOT EXISTS shipping_free_min_value numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS shipping_regions jsonb DEFAULT '[]'::jsonb;
