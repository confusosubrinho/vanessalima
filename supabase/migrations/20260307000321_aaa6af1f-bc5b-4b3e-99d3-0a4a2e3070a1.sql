ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_method text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_status text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS yampi_created_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS yampi_order_number text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS checkout_session_id text;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS sku_snapshot text;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS yampi_sku_id bigint;