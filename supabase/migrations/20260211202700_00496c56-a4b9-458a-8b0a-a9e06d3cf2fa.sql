
-- Create atomic stock decrement function to prevent race conditions
CREATE OR REPLACE FUNCTION public.decrement_stock(p_variant_id uuid, p_quantity integer)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  current_stock integer;
BEGIN
  -- Lock the row to prevent concurrent updates
  SELECT stock_quantity INTO current_stock
  FROM public.product_variants
  WHERE id = p_variant_id
  FOR UPDATE;
  
  IF current_stock IS NULL THEN
    RETURN false;
  END IF;
  
  IF current_stock < p_quantity THEN
    RETURN false;
  END IF;
  
  UPDATE public.product_variants
  SET stock_quantity = stock_quantity - p_quantity
  WHERE id = p_variant_id;
  
  RETURN true;
END;
$$;

-- Create atomic coupon increment function
CREATE OR REPLACE FUNCTION public.increment_coupon_uses(p_coupon_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  UPDATE public.coupons
  SET uses_count = COALESCE(uses_count, 0) + 1
  WHERE id = p_coupon_id;
END;
$$;

-- Create a view for public store settings (hides sensitive API keys)
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
  created_at, updated_at
FROM public.store_settings;
