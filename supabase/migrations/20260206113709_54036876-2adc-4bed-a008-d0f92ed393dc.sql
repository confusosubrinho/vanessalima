-- Add mobile image to banners
ALTER TABLE public.banners
ADD COLUMN IF NOT EXISTS mobile_image_url text;

-- Add code injection fields to store_settings
ALTER TABLE public.store_settings
ADD COLUMN IF NOT EXISTS head_code text,
ADD COLUMN IF NOT EXISTS body_code text,
ADD COLUMN IF NOT EXISTS google_analytics_id text,
ADD COLUMN IF NOT EXISTS facebook_pixel_id text,
ADD COLUMN IF NOT EXISTS tiktok_pixel_id text;