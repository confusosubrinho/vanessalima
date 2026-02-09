import { useRef, useCallback, useEffect } from 'react';

export function useDragScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const isDown = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const onPointerDown = useCallback((e: PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    isDown.current = true;
    el.style.cursor = 'grabbing';
    startX.current = e.pageX - el.offsetLeft;
    scrollLeft.current = el.scrollLeft;
    if (e.pointerType === 'mouse') e.preventDefault();
  }, []);

  const onPointerUp = useCallback(() => {
    isDown.current = false;
    if (ref.current) ref.current.style.cursor = 'grab';
  }, []);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!isDown.current || !ref.current) return;
    if (e.pointerType === 'mouse') e.preventDefault();
    const x = e.pageX - ref.current.offsetLeft;
    const walk = (x - startX.current) * 1.5;
    ref.current.scrollLeft = scrollLeft.current - walk;
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointerleave', onPointerUp);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointermove', onPointerMove);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointerleave', onPointerUp);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointermove', onPointerMove);
    };
  }, [onPointerDown, onPointerUp, onPointerMove]);

  return ref;
}
