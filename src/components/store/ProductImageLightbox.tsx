import { useState, useCallback, useRef, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { resolveImageUrl } from '@/lib/imageUrl';

export interface LightboxImage {
  id: string;
  url: string;
  alt_text?: string | null;
}

interface ProductImageLightboxProps {
  images: LightboxImage[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
  productName: string;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const SCALE_STEP = 0.5;

export function ProductImageLightbox({
  images,
  initialIndex,
  open,
  onClose,
  productName,
}: ProductImageLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, translateX: 0, translateY: 0 });
  const pinchStart = useRef<{ distance: number; scale: number } | null>(null);
  const imageWrapperRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  const currentImage = images[index];
  const hasMultiple = images.length > 1;

  useEffect(() => {
    if (open) {
      setIndex(Math.min(initialIndex, images.length - 1));
      setScale(1);
      setTranslate({ x: 0, y: 0 });
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open, initialIndex, images.length]);

  useEffect(() => {
    if (!open) return;
    const el = imageWrapperRef.current;
    if (!el) return;
    const getDistance = (touches: TouchList) =>
      Math.hypot(touches[1].clientX - touches[0].clientX, touches[1].clientY - touches[0].clientY);
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchStart.current = { distance: getDistance(e.touches), scale: scaleRef.current };
        setIsDragging(false);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchStart.current) {
        e.preventDefault();
        const distance = getDistance(e.touches);
        const ratio = distance / pinchStart.current.distance;
        const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchStart.current.scale * ratio));
        setScale(nextScale);
        if (nextScale <= MIN_SCALE) setTranslate({ x: 0, y: 0 });
      }
    };
    const clearPinch = () => { pinchStart.current = null; };
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', clearPinch, { passive: true });
    el.addEventListener('touchcancel', clearPinch, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', clearPinch);
      el.removeEventListener('touchcancel', clearPinch);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasMultiple) setIndex((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight' && hasMultiple) setIndex((i) => Math.min(images.length - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, hasMultiple, images.length]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, e.deltaY > 0 ? s - SCALE_STEP : s + SCALE_STEP)));
    },
    []
  );

  const zoomIn = useCallback(() => {
    setScale((s) => Math.min(MAX_SCALE, s + SCALE_STEP));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((s) => {
      const next = Math.max(MIN_SCALE, s - SCALE_STEP);
      if (next === MIN_SCALE) setTranslate({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (scale <= 1) return;
      e.preventDefault();
      setIsDragging(true);
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        translateX: translate.x,
        translateY: translate.y,
      };
    },
    [scale, translate]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging || scale <= 1) return;
      setTranslate({
        x: dragStart.current.translateX + (e.clientX - dragStart.current.x),
        y: dragStart.current.translateY + (e.clientY - dragStart.current.y),
      });
    },
    [isDragging, scale]
  );

  const onPointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Visualização ampliada da imagem"
    >
      {/* Close button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 right-4 z-10 rounded-full bg-white/10 text-white hover:bg-white/20 h-10 w-10 pointer-events-auto"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Fechar"
      >
        <X className="h-5 w-5" />
      </Button>

      {/* Zoom controls */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-1 rounded-lg bg-white/10 p-1 pointer-events-auto">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-white hover:bg-white/20"
          onClick={zoomOut}
          disabled={scale <= MIN_SCALE}
          aria-label="Reduzir zoom"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="min-w-[3rem] text-center text-sm text-white tabular-nums">
          {Math.round(scale * 100)}%
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-white hover:bg-white/20"
          onClick={zoomIn}
          disabled={scale >= MAX_SCALE}
          aria-label="Aumentar zoom"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
      </div>

      {/* Prev/Next */}
      {hasMultiple && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/10 text-white hover:bg-white/20 h-12 w-12 pointer-events-auto"
            onClick={(e) => {
              e.stopPropagation();
              setIndex((i) => Math.max(0, i - 1));
              setScale(1);
              setTranslate({ x: 0, y: 0 });
            }}
            disabled={index === 0}
            aria-label="Imagem anterior"
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/10 text-white hover:bg-white/20 h-12 w-12 pointer-events-auto"
            onClick={(e) => {
              e.stopPropagation();
              setIndex((i) => Math.min(images.length - 1, i + 1));
              setScale(1);
              setTranslate({ x: 0, y: 0 });
            }}
            disabled={index === images.length - 1}
            aria-label="Próxima imagem"
          >
            <ChevronRight className="h-6 w-6" />
          </Button>
        </>
      )}

      {/* Image container: area 100% viewport so image always fits (object-contain) */}
      <div
        className="absolute inset-0 flex items-center justify-center overflow-hidden p-4 pointer-events-none"
        onWheel={handleWheel}
      >
        {/* Box that takes 100% of viewport area so content is bounded */}
        <div className="w-full h-full min-w-0 min-h-0 flex items-center justify-center pointer-events-none">
          {currentImage && (
            <div
              ref={imageWrapperRef}
              className="pointer-events-auto w-full h-full flex items-center justify-center overflow-hidden"
              style={{ cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
              onWheel={handleWheel}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={resolveImageUrl(currentImage.url)}
                alt={currentImage.alt_text || `${productName} - ${index + 1}`}
                className="max-w-full max-h-full object-contain select-none"
                style={{
                  transform: `scale(${scale}) translate(${translate.x}px, ${translate.y}px)`,
                  touchAction: 'none',
                }}
                draggable={false}
              />
            </div>
          )}
        </div>
      </div>

      {/* Counter */}
      {hasMultiple && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 rounded-full bg-white/10 px-4 py-2 text-sm text-white pointer-events-none">
          {index + 1} / {images.length}
        </div>
      )}
    </div>
  );
}
