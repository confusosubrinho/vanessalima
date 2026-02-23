-- Indexes for frequently queried columns (cost optimization)

-- Products: slug lookups (product detail page)
CREATE INDEX IF NOT EXISTS idx_products_slug ON public.products (slug);

-- Products: category filtering
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products (category_id) WHERE is_active = true;

-- Products: featured filtering
CREATE INDEX IF NOT EXISTS idx_products_featured ON public.products (is_featured) WHERE is_active = true AND is_featured = true;

-- Products: new filtering  
CREATE INDEX IF NOT EXISTS idx_products_new ON public.products (is_new) WHERE is_active = true AND is_new = true;

-- Products: sale filtering
CREATE INDEX IF NOT EXISTS idx_products_sale ON public.products (sale_price) WHERE is_active = true AND sale_price IS NOT NULL;

-- Orders: status filtering (admin panel)
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);

-- Orders: user lookup
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders (user_id);

-- Orders: created_at for date range queries
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders (created_at DESC);

-- Product images: product lookup with ordering
CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON public.product_images (product_id, display_order);

-- Product variants: product lookup
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON public.product_variants (product_id) WHERE is_active = true;

-- Categories: slug lookup
CREATE INDEX IF NOT EXISTS idx_categories_slug ON public.categories (slug);

-- Categories: parent lookup
CREATE INDEX IF NOT EXISTS idx_categories_parent ON public.categories (parent_category_id) WHERE is_active = true;

-- Cleanup targets: created_at indexes for faster retention deletes
CREATE INDEX IF NOT EXISTS idx_app_logs_created_at ON public.app_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_appmax_logs_created_at ON public.appmax_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_bling_webhook_logs_created_at ON public.bling_webhook_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON public.error_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_traffic_sessions_created_at ON public.traffic_sessions (created_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_attempted_at ON public.login_attempts (attempted_at);
CREATE INDEX IF NOT EXISTS idx_order_events_received_at ON public.order_events (received_at);
CREATE INDEX IF NOT EXISTS idx_bling_webhook_events_created_at ON public.bling_webhook_events (created_at);