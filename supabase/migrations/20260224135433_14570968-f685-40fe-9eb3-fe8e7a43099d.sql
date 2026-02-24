
-- Create catalog_sync_queue table for tracking sync jobs
CREATE TABLE IF NOT EXISTS public.catalog_sync_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE CASCADE,
  action text NOT NULL DEFAULT 'sync', -- sync, create, update, deactivate
  status text NOT NULL DEFAULT 'pending', -- pending, processing, success, error
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  processed_at timestamp with time zone
);

ALTER TABLE public.catalog_sync_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage catalog_sync_queue"
  ON public.catalog_sync_queue FOR ALL USING (is_admin());

CREATE POLICY "Service can insert catalog_sync_queue"
  ON public.catalog_sync_queue FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can update catalog_sync_queue"
  ON public.catalog_sync_queue FOR UPDATE USING (true);

-- Create catalog_sync_runs table for tracking full sync runs
CREATE TABLE IF NOT EXISTS public.catalog_sync_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status text NOT NULL DEFAULT 'running',
  created_products integer DEFAULT 0,
  created_skus integer DEFAULT 0,
  updated_skus integer DEFAULT 0,
  skipped_inactive integer DEFAULT 0,
  errors_count integer DEFAULT 0,
  error_details jsonb DEFAULT '[]'::jsonb,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  finished_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.catalog_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage catalog_sync_runs"
  ON public.catalog_sync_runs FOR ALL USING (is_admin());

CREATE POLICY "Service can insert catalog_sync_runs"
  ON public.catalog_sync_runs FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can update catalog_sync_runs"
  ON public.catalog_sync_runs FOR UPDATE USING (true);
