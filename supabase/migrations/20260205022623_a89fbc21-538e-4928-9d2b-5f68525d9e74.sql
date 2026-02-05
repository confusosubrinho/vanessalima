-- Trigger to make the first registered user an admin automatically
CREATE OR REPLACE FUNCTION public.make_first_user_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count INTEGER;
BEGIN
  -- Count existing users
  SELECT COUNT(*) INTO user_count FROM auth.users;
  
  -- If this is the first user (count = 1 after insert), make them admin
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin');
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop the trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created_make_admin ON auth.users;

-- Create trigger on auth.users to make first user admin
CREATE TRIGGER on_auth_user_created_make_admin
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.make_first_user_admin();

-- Create a reviews table for product ratings
CREATE TABLE public.product_reviews (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title TEXT,
    comment TEXT,
    is_verified_purchase BOOLEAN DEFAULT false,
    is_approved BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on reviews
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

-- Anyone can view approved reviews
CREATE POLICY "Anyone can view approved reviews"
ON public.product_reviews
FOR SELECT
USING (is_approved = true OR is_admin());

-- Authenticated users can create reviews
CREATE POLICY "Authenticated users can create reviews"
ON public.product_reviews
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Admins can manage reviews
CREATE POLICY "Admins can manage reviews"
ON public.product_reviews
FOR ALL
USING (is_admin());

-- Add trigger for updated_at
CREATE TRIGGER update_product_reviews_updated_at
BEFORE UPDATE ON public.product_reviews
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster product review lookups
CREATE INDEX idx_product_reviews_product_id ON public.product_reviews(product_id);