import { useRef, useEffect, useCallback } from 'react';

const AXIS_LOCK_THRESHOLD = 10;

type AxisLock = 'horizontal' | 'vertical' | null;

/**
 * Hook que aplica "axis lock" em um container com scroll horizontal:
 * - Se o usuário deslizar mais na vertical → scroll da página (vertical) segue normalmente.
 * - Se o usuário deslizar mais na horizontal → só o carrossel/grid horizontal se move.
 * Resolve o bug no mobile em que o scroll vertical trava ao passar por seções com scroll horizontal.
 */
export function useHorizontalScrollAxisLock() {
  const ref = useRef<HTMLDivElement>(null);

  const lock = useRef<AxisLock>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const lastX = useRef(0);
  const lastY = useRef(0);

  const resolveLock = useCallback((deltaX: number, deltaY: number): AxisLock => {
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    if (absX > absY) return 'horizontal';
    return 'vertical';
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      lock.current = null;
      startX.current = e.touches[0].pageX;
      startY.current = e.touches[0].pageY;
      lastX.current = e.touches[0].pageX;
      lastY.current = e.touches[0].pageY;
    };

    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      const deltaX = touch.pageX - lastX.current;
      const deltaY = touch.pageY - lastY.current;
      lastX.current = touch.pageX;
      lastY.current = touch.pageY;

      if (lock.current === null) {
        const totalX = touch.pageX - startX.current;
        const totalY = touch.pageY - startY.current;
        if (Math.abs(totalX) >= AXIS_LOCK_THRESHOLD || Math.abs(totalY) >= AXIS_LOCK_THRESHOLD) {
          lock.current = resolveLock(totalX, totalY);
        }
      }

      if (lock.current === 'horizontal') {
        e.preventDefault();
        const newScrollLeft = el.scrollLeft - deltaX;
        el.scrollLeft = Math.max(0, Math.min(newScrollLeft, el.scrollWidth - el.clientWidth));
      } else if (lock.current === 'vertical') {
        e.preventDefault();
        window.scrollBy(0, deltaY);
      }
    };

    const onTouchEnd = () => {
      lock.current = null;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const target = e.target as HTMLElement;
      if (target.closest('a') || target.closest('button')) return;
      lock.current = null;
      startX.current = e.pageX;
      startY.current = e.pageY;
      lastX.current = e.pageX;
      lastY.current = e.pageY;
      if (e.pointerType === 'mouse') el.setPointerCapture?.(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const deltaX = e.pageX - lastX.current;
      const deltaY = e.pageY - lastY.current;
      lastX.current = e.pageX;
      lastY.current = e.pageY;

      if (lock.current === null) {
        const totalX = e.pageX - startX.current;
        const totalY = e.pageY - startY.current;
        if (Math.abs(totalX) >= AXIS_LOCK_THRESHOLD || Math.abs(totalY) >= AXIS_LOCK_THRESHOLD) {
          lock.current = resolveLock(totalX, totalY);
        }
      }

      if (lock.current === 'horizontal') {
        e.preventDefault();
        const newScrollLeft = el.scrollLeft - deltaX;
        el.scrollLeft = Math.max(0, Math.min(newScrollLeft, el.scrollWidth - el.clientWidth));
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      el.releasePointerCapture?.(e.pointerId);
      lock.current = null;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointerleave', onPointerUp);

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointerleave', onPointerUp);
    };
  }, [resolveLock]);

  return ref;
}
