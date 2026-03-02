-- Add soft_descriptor to store_settings
ALTER TABLE public.store_settings
ADD COLUMN IF NOT EXISTS soft_descriptor text;

COMMENT ON COLUMN public.store_settings.soft_descriptor IS 'Nome que aparecerá na fatura do cartão de crédito (máximo 13 caracteres)';

-- Recreate the public view for store settings to include soft_descriptor
CREATE OR REPLACE VIEW public.store_settings_public AS
SELECT
  id, store_name, logo_url, contact_email, contact_phone, contact_whatsapp,
  address, instagram_url, facebook_url, free_shipping_threshold,
  max_installments, pix_discount, installments_without_interest,
  installment_interest_rate, min_installment_value, cash_discount,
  cnpj, full_address, shipping_free_enabled, shipping_free_min_value,
  shipping_free_label, shipping_store_pickup_enabled, shipping_store_pickup_label,
  shipping_store_pickup_address, shipping_regions,
  facebook_pixel_id, google_analytics_id, tiktok_pixel_id,
  head_code, body_code, app_version, appmax_environment,
  soft_descriptor, created_at, updated_at
FROM public.store_settings;
