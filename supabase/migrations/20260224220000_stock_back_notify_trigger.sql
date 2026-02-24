-- When a variant gets stock back (0 -> >0), mark waiting stock_notifications as notified
-- so the admin list reflects it and future email integration can use the same flow.
CREATE OR REPLACE FUNCTION public.mark_stock_notifications_when_back()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stock_quantity > 0 AND (OLD.stock_quantity IS NULL OR OLD.stock_quantity = 0) THEN
    -- Notifications for this specific variant
    UPDATE public.stock_notifications
    SET is_notified = true, notified_at = now(), status = 'notified', updated_at = now()
    WHERE variant_id = NEW.id AND is_notified = false;

    -- Notifications for "any variant" of this product (variant_id IS NULL)
    UPDATE public.stock_notifications
    SET is_notified = true, notified_at = now(), status = 'notified', updated_at = now()
    WHERE product_id = NEW.product_id AND variant_id IS NULL AND is_notified = false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_stock_back_mark_notifications ON public.product_variants;
CREATE TRIGGER on_stock_back_mark_notifications
  AFTER UPDATE OF stock_quantity ON public.product_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.mark_stock_notifications_when_back();

COMMENT ON FUNCTION public.mark_stock_notifications_when_back() IS
  'Marca como notificados os registros de stock_notifications quando a variante volta a ter estoque (0 -> >0).';
