import { useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, X } from 'lucide-react';
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
      timerRef.current = setTimeout(onClose, 4000);
      return () => clearTimeout(timerRef.current);
    }
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-32 md:bottom-6 right-4 left-4 md:left-auto md:w-[360px] z-[60] animate-slide-up">
      <div className="bg-background border border-border rounded-lg shadow-xl p-3 flex items-center gap-3">
        <img
          src={imageUrl || '/placeholder.svg'}
          alt={productName}
          className="w-14 h-14 object-cover rounded-md flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-primary mb-0.5">
            <ShoppingBag className="h-3.5 w-3.5" />
            <span className="text-xs font-semibold">Adicionado ao carrinho</span>
          </div>
          <p className="text-sm font-medium truncate">{productName}</p>
          <p className="text-xs text-muted-foreground">{variantInfo}</p>
        </div>
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          <Button size="sm" className="h-8 text-xs rounded-full px-3" onClick={onViewCart}>
            Ver carrinho
          </Button>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors self-center">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
