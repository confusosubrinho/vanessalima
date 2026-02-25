-- Add favicon_url to store_settings (personalization panel)
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS favicon_url text DEFAULT NULL;

-- Expose favicon in public view so storefront can apply it
DROP VIEW IF EXISTS public.store_settings_public;

CREATE VIEW public.store_settings_public
WITH (security_invoker = true)
AS
SELECT
  id, store_name, logo_url, favicon_url, contact_email, contact_phone, contact_whatsapp,
  address, full_address, cnpj, instagram_url, facebook_url,
  free_shipping_threshold, max_installments, installments_without_interest,
  installment_interest_rate, min_installment_value, pix_discount, cash_discount,
  google_analytics_id, facebook_pixel_id, tiktok_pixel_id,
  head_code, body_code, app_version, appmax_environment,
  shipping_regions, shipping_free_enabled, shipping_free_min_value, shipping_free_label,
  shipping_store_pickup_enabled, shipping_store_pickup_label, shipping_store_pickup_address,
  header_logo_url, header_subhead_text, header_highlight_text, header_highlight_url, header_highlight_icon,
  header_menu_order,
  created_at, updated_at
FROM public.store_settings;
