import { useState, useRef, useCallback, useEffect } from "react";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { hslToHex, hexToHsl, getClosestColorName } from "@/lib/colorUtils";
import { cn } from "@/lib/utils";

export interface ColorWheelPickerProps {
  value: string;
  onChange: (hex: string) => void;
  className?: string;
  size?: number;
  showName?: boolean;
}

export function ColorWheelPicker({
  value,
  onChange,
  className,
  size = 200,
  showName = true,
}: ColorWheelPickerProps) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const hexToState = useCallback(() => {
    const { h, s, l } = hexToHsl(value);
    return { h, s, l };
  }, [value]);

  const [state, setState] = useState(() => hexToState());
  const [suggestedName, setSuggestedName] = useState<string | null>(() =>
    getClosestColorName(value)
  );

  useEffect(() => {
    const hex = hslToHex(state.h, state.s, state.l);
    if (hex.toLowerCase() !== value.toLowerCase()) {
      onChange(hex);
    }
    setSuggestedName(getClosestColorName(hex));
  }, [state.h, state.s, state.l]);

  useEffect(() => {
    const currentHex = hslToHex(state.h, state.s, state.l);
    const normalized = value.startsWith("#") ? value : `#${value}`;
    if (normalized.toLowerCase() !== currentHex.toLowerCase()) {
      const { h, s, l } = hexToHsl(normalized);
      setState({ h, s, l });
    }
  }, [value]);

  const updateFromPoint = useCallback(
    (clientX: number, clientY: number) => {
      const el = wheelRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const x = clientX - centerX;
      const y = clientY - centerY;
      const angle = Math.atan2(y, x);
      let deg = (angle * 180) / Math.PI + 90;
      if (deg < 0) deg += 360;
      const radius = Math.sqrt(x * x + y * y);
      const maxR = Math.min(rect.width, rect.height) / 2;
      const sat = Math.min(100, (radius / maxR) * 100);
      setState((prev) => ({ ...prev, h: deg, s: sat }));
    },
    []
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      isDragging.current = true;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      updateFromPoint(e.clientX, e.clientY);
    },
    [updateFromPoint]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return;
      updateFromPoint(e.clientX, e.clientY);
    },
    [updateFromPoint]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    isDragging.current = false;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  }, []);

  const currentHex = hslToHex(state.h, state.s, state.l);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-col items-center gap-2">
        <div
          ref={wheelRef}
          role="slider"
          tabIndex={0}
          aria-valuenow={state.h}
          aria-valuemin={0}
          aria-valuemax={360}
          aria-label="Seletor de matiz e saturação"
          className="relative rounded-full cursor-crosshair touch-none select-none ring-2 ring-border ring-offset-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{
            width: size,
            height: size,
            background: `
              radial-gradient(circle at center, #fff 0%, transparent 70%),
              conic-gradient(from 0deg, #ff0000, #ff8000, #ffff00, #80ff00, #00ff00, #00ff80, #00ffff, #0080ff, #0000ff, #8000ff, #ff0080, #ff0000)
            `,
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {/* Indicador do ponto selecionado */}
          <div
            className="absolute w-4 h-4 rounded-full border-2 border-white shadow-md pointer-events-none"
            style={{
              left: "50%",
              top: "50%",
              transform: `translate(-50%, -50%) translate(
                ${Math.cos(((state.h - 90) * Math.PI) / 180) * (state.s / 100) * (size / 2)}px,
                ${Math.sin(((state.h - 90) * Math.PI) / 180) * (state.s / 100) * (size / 2)}px
              )`,
              backgroundColor: currentHex,
            }}
          />
          {showName && suggestedName && (
            <div
              className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded text-xs font-medium whitespace-nowrap pointer-events-none"
              style={{
                backgroundColor: currentHex,
                color:
                  state.l > 70
                    ? "#1a1a1a"
                    : state.l < 30
                      ? "#e5e5e5"
                      : "#fff",
              }}
            >
              {suggestedName}
            </div>
          )}
        </div>

        <div className="w-full max-w-[220px] space-y-1.5">
          <Label className="text-xs text-muted-foreground">Luminosidade</Label>
          <Slider
            value={[state.l]}
            min={0}
            max={100}
            step={1}
            onValueChange={([l]) => setState((prev) => ({ ...prev, l: l ?? 50 }))}
            className="[&_[data-orientation=horizontal]]:cursor-pointer"
          />
        </div>
      </div>

      <div className="flex items-center justify-center gap-2">
        <div
          className="w-8 h-8 rounded-lg border-2 border-border shrink-0"
          style={{ backgroundColor: currentHex }}
        />
        <span className="text-sm font-mono text-muted-foreground">
          {currentHex.toUpperCase()}
        </span>
      </div>
    </div>
  );
}
