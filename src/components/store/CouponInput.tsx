 import { useState, useRef } from 'react';
 import { Tag, Loader2, X, Check } from 'lucide-react';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
import { useCart } from '@/contexts/CartContext';
import { useToast } from '@/hooks/use-toast';
import { useHaptics } from '@/hooks/useHaptics';
import { supabase } from '@/integrations/supabase/client';
import { Coupon } from '@/types/database';
import { hasEligibleItems } from '@/lib/couponDiscount';
 
 interface CouponInputProps {
   compact?: boolean;
 }
 
 export function CouponInput({ compact = false }: CouponInputProps) {
    const { appliedCoupon, applyCoupon, removeCoupon, subtotal, items } = useCart();
    const { toast } = useToast();
    const haptics = useHaptics();
    const [code, setCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [shakeError, setShakeError] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
 
   const formatPrice = (price: number) => {
     return new Intl.NumberFormat('pt-BR', {
       style: 'currency',
       currency: 'BRL',
     }).format(price);
   };
 
   const handleApplyCoupon = async () => {
     if (!code.trim()) return;
 
     setIsLoading(true);
     
     try {
       const { data, error } = await supabase
         .from('coupons')
         .select('*')
         .eq('code', code.toUpperCase())
         .eq('is_active', true)
         .single();
 
       if (error || !data) {
          setShakeError(true); haptics.error();
          setTimeout(() => setShakeError(false), 500);
          toast({
            title: 'Cupom inválido',
            description: 'O código inserido não existe ou está inativo.',
            variant: 'destructive',
          });
          return;
        }
 
       const coupon = data as Coupon;
 
       // Check expiry
       if (coupon.expiry_date && new Date(coupon.expiry_date) < new Date()) {
         toast({
           title: 'Cupom expirado',
           description: 'Este cupom já não está mais válido.',
           variant: 'destructive',
         });
         return;
       }
 
       // Check max uses
       if (coupon.max_uses && coupon.uses_count >= coupon.max_uses) {
         toast({
           title: 'Cupom esgotado',
           description: 'Este cupom atingiu o limite máximo de uso.',
           variant: 'destructive',
         });
         return;
       }
 
       // Check minimum purchase
       if (coupon.min_purchase_amount && subtotal < coupon.min_purchase_amount) {
         toast({
           title: 'Valor mínimo não atingido',
           description: `Este cupom requer compras acima de ${formatPrice(coupon.min_purchase_amount)}.`,
           variant: 'destructive',
         });
         return;
       }

       // Check category/product restriction: cart must have at least one eligible item
       if (!hasEligibleItems(coupon, items)) {
         setShakeError(true);
         haptics.error();
         setTimeout(() => setShakeError(false), 500);
         toast({
           title: 'Cupom não aplicável',
           description: 'Este cupom não se aplica aos produtos do seu carrinho.',
           variant: 'destructive',
         });
         return;
       }
 
       haptics.success();
       applyCoupon(coupon);
       setCode('');
       toast({
         title: 'Cupom aplicado!',
         description: coupon.discount_type === 'percentage' 
           ? `Desconto de ${coupon.discount_value}% aplicado.`
           : `Desconto de ${formatPrice(coupon.discount_value)} aplicado.`,
       });
     } finally {
       setIsLoading(false);
     }
   };
 
   if (appliedCoupon) {
     const discountText = appliedCoupon.discount_type === 'percentage'
       ? `${appliedCoupon.discount_value}% OFF`
       : formatPrice(appliedCoupon.discount_value);
 
     return (
       <div className={`flex items-center justify-between p-3 bg-primary/10 border border-primary/30 rounded-lg ${compact ? 'text-sm' : ''}`}>
         <div className="flex items-center gap-2">
           <Check className="h-4 w-4 text-primary" />
           <span>
             <span className="font-medium">{appliedCoupon.code}</span>
             <span className="text-muted-foreground ml-2">({discountText})</span>
           </span>
         </div>
         <Button
           variant="ghost"
           size="icon"
           className="h-8 w-8 text-muted-foreground hover:text-destructive"
           onClick={removeCoupon}
         >
           <X className="h-4 w-4" />
         </Button>
       </div>
     );
   }
 
   return (
     <div className={`${compact ? 'space-y-2' : 'space-y-3'}`}>
       {!compact && (
         <div className="flex items-center gap-2 text-sm font-medium">
           <Tag className="h-4 w-4 text-primary" />
           <span>Cupom de Desconto</span>
         </div>
       )}
       
       <div className={`flex gap-2 ${shakeError ? 'animate-shake' : ''}`}>
          <Input
            ref={inputRef}
            placeholder="Código do cupom"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className={compact ? 'h-9 text-sm' : ''}
            onKeyDown={(e) => e.key === 'Enter' && handleApplyCoupon()}
          />
         <Button 
           onClick={handleApplyCoupon} 
           disabled={isLoading || !code.trim()}
           size={compact ? 'sm' : 'default'}
           variant="outline"
         >
           {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aplicar'}
         </Button>
       </div>
     </div>
   );
 }