import { useRef, useEffect } from 'react';
import { CheckCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AddedToCartToastProps {
  productName: string;
  variantInfo: string;
  imageUrl: string;
  onViewCart: () => void;
  onClose: () => void;
  visible: boolean;
}

export function AddedToCartToast({
  productName,
  variantInfo,
  imageUrl,
  onViewCart,
  onClose,
  visible,
}: AddedToCartToastProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (visible) {
      timerRef.current = setTimeout(onClose, 4500);
      return () => clearTimeout(timerRef.current);
    }
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
      <div className="pointer-events-auto bg-background border border-border rounded-2xl shadow-2xl p-5 w-[340px] max-w-[90vw] animate-in fade-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-primary">
            <CheckCircle className="h-5 w-5" />
            <span className="text-sm font-bold tracking-tight">Adicionado ao carrinho</span>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors rounded-full p-1 hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Product */}
        <div className="flex items-center gap-4 mb-4">
          <img
            src={imageUrl || '/placeholder.svg'}
            alt={productName}
            className="w-16 h-16 object-cover rounded-xl flex-shrink-0 border border-border"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate text-foreground">{productName}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{variantInfo}</p>
          </div>
        </div>

        {/* Action */}
        <Button
          className="w-full h-10 rounded-xl font-semibold text-sm"
          onClick={onViewCart}
        >
          Ver carrinho
        </Button>
      </div>
    </div>
  );
}
