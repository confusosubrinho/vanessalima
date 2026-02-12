
-- Table for stock notification requests (waitlist)
CREATE TABLE public.stock_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE,
  variant_info TEXT,
  email TEXT,
  whatsapp TEXT,
  desired_price NUMERIC,
  status TEXT NOT NULL DEFAULT 'pending',
  is_notified BOOLEAN NOT NULL DEFAULT false,
  notified_at TIMESTAMP WITH TIME ZONE,
  honeypot TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Prevent duplicate registrations
  CONSTRAINT unique_email_product_variant UNIQUE NULLS NOT DISTINCT (email, product_id, variant_id)
);

-- Index for quick lookup when stock changes
CREATE INDEX idx_stock_notifications_product ON public.stock_notifications(product_id, is_notified);
CREATE INDEX idx_stock_notifications_variant ON public.stock_notifications(variant_id, is_notified);

-- Enable RLS
ALTER TABLE public.stock_notifications ENABLE ROW LEVEL SECURITY;

-- Anyone can register interest (public form)
CREATE POLICY "Anyone can register stock interest"
ON public.stock_notifications
FOR INSERT
WITH CHECK (true);

-- Only admins can view all notifications
CREATE POLICY "Admins can manage stock notifications"
ON public.stock_notifications
FOR ALL
USING (is_admin());

-- Users can view their own notifications
CREATE POLICY "Users can view own notifications"
ON public.stock_notifications
FOR SELECT
USING (email IS NOT NULL);

-- Trigger for updated_at
CREATE TRIGGER update_stock_notifications_updated_at
BEFORE UPDATE ON public.stock_notifications
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
