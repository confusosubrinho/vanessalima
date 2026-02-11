
-- Add Appmax columns to store_settings
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS appmax_access_token TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS appmax_environment TEXT DEFAULT 'sandbox';
