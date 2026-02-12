
-- Drop old function with boolean return type
DROP FUNCTION IF EXISTS public.decrement_stock(uuid, integer);

-- Recreate with jsonb return type
CREATE OR REPLACE FUNCTION public.decrement_stock(
  p_variant_id uuid, 
  p_quantity integer
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  current_stock integer;
  variant_info jsonb;
BEGIN
  SELECT 
    stock_quantity,
    jsonb_build_object(
      'id', id,
      'size', size,
      'color', color,
      'stock_quantity', stock_quantity,
      'is_active', is_active
    )
  INTO current_stock, variant_info
  FROM public.product_variants
  WHERE id = p_variant_id
  FOR UPDATE;
  
  IF current_stock IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'variant_not_found',
      'message', 'Variante não encontrada'
    );
  END IF;
  
  IF current_stock < p_quantity THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'insufficient_stock',
      'message', format('Estoque insuficiente. Disponível: %s, Solicitado: %s', current_stock, p_quantity),
      'available_stock', current_stock,
      'requested_quantity', p_quantity,
      'variant', variant_info
    );
  END IF;
  
  UPDATE public.product_variants
  SET stock_quantity = stock_quantity - p_quantity
  WHERE id = p_variant_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'previous_stock', current_stock,
    'new_stock', current_stock - p_quantity,
    'variant', variant_info
  );
END;
$$;
