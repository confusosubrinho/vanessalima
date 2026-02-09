
-- Add parent_category_id to categories for subcategories support
ALTER TABLE public.categories ADD COLUMN parent_category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;

-- Add CNPJ and full address fields to store_settings
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS cnpj TEXT;
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS full_address TEXT;
