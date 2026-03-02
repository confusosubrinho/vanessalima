/**
 * Pressable: wrapper for key actions with press animation and optional haptic/sound feedback.
 * Use only on key actions (add to cart, pay, copy PIX, etc.). Respects prefers-reduced-motion.
 */

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';
import { useFeedback } from '@/hooks/useFeedback';
import type { FeedbackPattern } from '@/lib/feedback';
import { prefersReducedMotion } from '@/lib/feedback';

const PRESS_DURATION_MS = 100;

export interface PressableProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  asChild?: boolean;
  disabled?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** When set, triggers feedback (haptic/sound) on click. Use only for key actions. */
  feedbackPattern?: FeedbackPattern | null;
  className?: string;
  children?: React.ReactNode;
}

const Pressable = React.forwardRef<HTMLButtonElement, PressableProps>(
  (
    {
      asChild = false,
      disabled = false,
      onClick,
      feedbackPattern = null,
      className,
      children,
      onPointerDown,
      onPointerUp,
      onPointerLeave,
      onPointerCancel,
      ...rest
    },
    ref
  ) => {
    const [pressing, setPressing] = React.useState(false);
    const pressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const { feedback } = useFeedback();
    const reducedMotion = React.useMemo(() => prefersReducedMotion(), []);

    const clearPress = React.useCallback(() => {
      if (pressTimerRef.current) {
        clearTimeout(pressTimerRef.current);
        pressTimerRef.current = null;
      }
      setPressing(false);
    }, []);

    const handlePointerDown = React.useCallback(
      (e: React.PointerEvent) => {
        onPointerDown?.(e as unknown as React.PointerEvent<HTMLButtonElement>);
        if (disabled) return;
        setPressing(true);
        if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
        pressTimerRef.current = setTimeout(clearPress, PRESS_DURATION_MS);
      },
      [disabled, clearPress, onPointerDown]
    );

    const handlePointerUp = React.useCallback(
      (e: React.PointerEvent) => {
        onPointerUp?.(e as unknown as React.PointerEvent<HTMLButtonElement>);
        clearPress();
      },
      [clearPress, onPointerUp]
    );

    const handlePointerLeave = React.useCallback(
      (e: React.PointerEvent) => {
        onPointerLeave?.(e as unknown as React.PointerEvent<HTMLButtonElement>);
        clearPress();
      },
      [clearPress, onPointerLeave]
    );

    const handlePointerCancel = React.useCallback(
      (e: React.PointerEvent) => {
        onPointerCancel?.(e as unknown as React.PointerEvent<HTMLButtonElement>);
        clearPress();
      },
      [clearPress, onPointerCancel]
    );

    const handleClick = React.useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        if (feedbackPattern) feedback(feedbackPattern);
        onClick?.(e);
      },
      [feedbackPattern, feedback, onClick]
    );

    React.useEffect(() => () => { if (pressTimerRef.current) clearTimeout(pressTimerRef.current); }, []);

    const pressClass = reducedMotion ? 'pressable--pressing-reduced' : (pressing ? 'pressable--pressing' : '');
    const compClassName = cn('pressable', pressClass, className);

    const props = {
      ref,
      disabled,
      className: compClassName,
      onPointerDown: handlePointerDown,
      onPointerUp: handlePointerUp,
      onPointerLeave: handlePointerLeave,
      onPointerCancel: handlePointerCancel,
      onClick: handleClick,
      ...rest,
    };

    if (asChild) {
      return <Slot {...props}>{children}</Slot>;
    }
    return <button type="button" {...props}>{children}</button>;
  }
);

Pressable.displayName = 'Pressable';

export { Pressable };
