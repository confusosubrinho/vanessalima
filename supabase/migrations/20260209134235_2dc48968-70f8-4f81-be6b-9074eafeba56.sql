
-- Add SEO fields to categories
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS seo_title text;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS seo_description text;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS seo_keywords text;

-- Add payment settings to store_settings
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS pix_discount numeric DEFAULT 5;
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS cash_discount numeric DEFAULT 5;
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS installment_interest_rate numeric DEFAULT 0;
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS min_installment_value numeric DEFAULT 30;
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS installments_without_interest integer DEFAULT 3;
