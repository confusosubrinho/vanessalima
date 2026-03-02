
-- Fix: Recreate store_settings_public view WITHOUT security_invoker
-- so anonymous users can read public store data.
-- The view already excludes sensitive fields (API tokens, secrets, etc.)

DROP VIEW IF EXISTS public.store_settings_public;

CREATE VIEW public.store_settings_public AS
  SELECT 
    id,
    store_name,
    logo_url,
    header_logo_url,
    favicon_url,
    contact_email,
    contact_phone,
    contact_whatsapp,
    address,
    full_address,
    cnpj,
    instagram_url,
    facebook_url,
    google_analytics_id,
    facebook_pixel_id,
    tiktok_pixel_id,
    head_code,
    body_code,
    free_shipping_threshold,
    max_installments,
    installments_without_interest,
    installment_interest_rate,
    min_installment_value,
    pix_discount,
    cash_discount,
    shipping_regions,
    shipping_free_enabled,
    shipping_free_min_value,
    shipping_free_label,
    shipping_store_pickup_enabled,
    shipping_store_pickup_label,
    shipping_store_pickup_address,
    header_menu_order,
    header_subhead_text,
    header_highlight_text,
    header_highlight_url,
    header_highlight_icon,
    app_version,
    appmax_environment,
    show_variants_on_grid,
    created_at,
    updated_at
  FROM store_settings;

-- Grant access to anon and authenticated roles
GRANT SELECT ON public.store_settings_public TO anon;
GRANT SELECT ON public.store_settings_public TO authenticated;
