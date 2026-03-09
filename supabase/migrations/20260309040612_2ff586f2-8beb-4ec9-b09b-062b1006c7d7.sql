-- BUG 1: Restringir INSERT em payments para admins apenas
DROP POLICY IF EXISTS "Service can insert payments" ON public.payments;
CREATE POLICY "Service can insert payments" ON public.payments
  FOR INSERT
  WITH CHECK (is_admin());

-- BUG 6: Restringir INSERT em admin_audit_log para admins apenas
DROP POLICY IF EXISTS "System can insert audit log" ON public.admin_audit_log;
CREATE POLICY "System can insert audit log" ON public.admin_audit_log
  FOR INSERT
  WITH CHECK (is_admin());

-- BUG 3: Converter store_settings_public view para SECURITY INVOKER
-- Nota: A view já está sem SECURITY DEFINER conforme memória técnica,
-- mas vamos garantir recriando-a explicitamente sem essa opção
DROP VIEW IF EXISTS public.store_settings_public;
CREATE VIEW public.store_settings_public
WITH (security_invoker=on) AS
SELECT 
  id,
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
  shipping_store_pickup_enabled,
  header_menu_order,
  show_variants_on_grid,
  created_at,
  updated_at,
  shipping_store_pickup_address,
  header_subhead_text,
  header_highlight_text,
  header_highlight_url,
  header_highlight_icon,
  app_version,
  appmax_environment,
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
  shipping_free_label,
  shipping_store_pickup_label
FROM public.store_settings;