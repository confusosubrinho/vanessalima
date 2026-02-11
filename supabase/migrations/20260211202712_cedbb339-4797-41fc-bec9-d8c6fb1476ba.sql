
-- Fix security definer view issue
DROP VIEW IF EXISTS public.store_settings_public;

CREATE VIEW public.store_settings_public 
WITH (security_invoker = true)
AS
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
  created_at, updated_at
FROM public.store_settings;
