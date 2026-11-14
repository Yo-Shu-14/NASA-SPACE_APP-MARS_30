import { useRef } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';

export interface MinigameSliderProps {
  ariaLabel: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  theme?: 'light' | 'dark';
  accentColor?: string;
  targetRange?: { min: number; max: number };
  inTarget?: boolean;
  minLabel?: string;
  targetLabel?: string;
  maxLabel?: string;
  leftControl?: ReactNode;
  rightControl?: ReactNode;
}

export function MinigameSlider({
  ariaLabel,
  min,
  max,
  step = 1,
  value,
  onChange,
  theme = 'light',
  accentColor = '#477C9B',
  targetRange,
  inTarget = false,
  minLabel,
  targetLabel,
  maxLabel,
  leftControl,
  rightControl,
}: MinigameSliderProps) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const span = Math.max(0.0001, max - min);
  const clampedValue = Math.min(max, Math.max(min, value));
  const valuePct = ((clampedValue - min) / span) * 100;

  const zoneStartPct = targetRange
    ? Math.max(0, Math.min(100, ((targetRange.min - min) / span) * 100))
    : 0;
  const zoneEndPct = targetRange
    ? Math.max(zoneStartPct, Math.min(100, ((targetRange.max - min) / span) * 100))
    : 0;
  const zoneWidthPct = zoneEndPct - zoneStartPct;

  const snapValue = (rawRatio: number): number => {
    const ratio = Math.max(0, Math.min(1, rawRatio));
    const raw = min + ratio * span;
    const stepped = Math.round((raw - min) / step) * step + min;
    // Avoid floating point drift for fractional steps
    const decimals = step.toString().includes('.')
      ? step.toString().split('.')[1].length
      : 0;
    const fixed = Number(stepped.toFixed(decimals));
    return Math.min(max, Math.max(min, fixed));
  };

  const updateFromClientX = (clientX: number) => {
    const rail = railRef.current;
    if (!rail) return;
    const rect = rail.getBoundingClientRect();
    if (rect.width <= 0) return;
    const next = snapValue((clientX - rect.left) / rect.width);
    if (next !== clampedValue) {
      onChange(next);
    }
  };

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus({ preventScroll: true });
    updateFromClientX(e.clientX);
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    updateFromClientX(e.clientX);
  };

  const handlePointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const bigStep = Math.max(step, Math.round((span / 10) / step) * step);
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = clampedValue + step;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = clampedValue - step;
    else if (e.key === 'PageUp') next = clampedValue + bigStep;
    else if (e.key === 'PageDown') next = clampedValue - bigStep;
    else if (e.key === 'Home') next = min;
    else if (e.key === 'End') next = max;

    if (next !== null) {
      e.preventDefault();
      const clamped = Math.min(max, Math.max(min, next));
      if (clamped !== clampedValue) {
        onChange(clamped);
      }
    }
  };

  const isDark = theme === 'dark';
  const trackBg = isDark ? '#1A2024' : '#E8D5B5';
  const trackBorder = isDark ? 'rgba(250, 240, 220, 0.35)' : '#292C2B';
  const activeColor = inTarget ? '#5A8F69' : accentColor;
  const thumbBg = inTarget ? '#718B78' : accentColor;
  const hasFooter = Boolean(minLabel || targetLabel || maxLabel);

  return (
    <div className="w-full select-none">
      <div className="flex items-center gap-2.5">
        {leftControl && <div className="shrink-0">{leftControl}</div>}

        <div
          role="slider"
          tabIndex={0}
          aria-label={ariaLabel}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={clampedValue}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onKeyDown={handleKeyDown}
          className="relative flex-1 h-12 sm:h-11 flex items-center cursor-pointer touch-none rounded-xl focus-visible:outline-3 focus-visible:outline-[#F4C552] focus-visible:outline-offset-2"
        >
          {/* Inner track inset by exact thumb radius (16px on mobile = mx-4, 14px on sm+ = sm:mx-3.5) so 0%..100% aligns 1:1 with pointer & thumb center */}
          <div
            ref={railRef}
            className="relative w-full mx-4 sm:mx-3.5 h-3.5 rounded-full border-2 overflow-visible pointer-events-none"
            style={{
              backgroundColor: trackBg,
              borderColor: trackBorder,
            }}
          >
            {/* Active fill bar */}
            <div
              className="absolute left-0 top-0 bottom-0 rounded-l-full"
              style={{
                width: `${valuePct}%`,
                backgroundColor: activeColor,
                opacity: isDark ? 0.48 : 0.36,
              }}
            />

            {/* Optional green target zone band cleanly inside the rail */}
            {targetRange && zoneWidthPct > 0 && (
              <div
                className="absolute -top-0.5 -bottom-0.5 rounded-md border-2 transition-colors"
                style={{
                  left: `${zoneStartPct}%`,
                  width: `${zoneWidthPct}%`,
                  borderColor: isDark ? '#9BF08E' : '#396344',
                  backgroundColor: inTarget
                    ? isDark
                      ? 'rgba(155, 240, 142, 0.42)'
                      : 'rgba(113, 139, 120, 0.56)'
                    : isDark
                    ? 'rgba(155, 240, 142, 0.25)'
                    : 'rgba(113, 139, 120, 0.36)',
                }}
              />
            )}

            {/* Comic-ink circular thumb perfectly aligned to valuePct */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 sm:w-7 sm:h-7 rounded-full border-2 border-[#292C2B] shadow-[0_2px_0_#292C2B] flex items-center justify-center transition-colors duration-75"
              style={{
                left: `${valuePct}%`,
                backgroundColor: thumbBg,
              }}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-[#FAF0DC]" />
            </div>
          </div>
        </div>

        {rightControl && <div className="shrink-0">{rightControl}</div>}
      </div>

      {hasFooter && (
        <div
          className={`mt-1 flex items-center justify-between gap-2 text-[10px] font-bold font-mono-tabular px-1 leading-tight ${
            isDark ? 'text-[#FAF0DC]/65' : 'text-[#292C2B]/60'
          }`}
        >
          <span>{minLabel ?? ''}</span>
          {targetLabel && (
            <span className={`font-extrabold ${isDark ? 'text-[#9BF08E]' : 'text-[#396344]'}`}>
              {targetLabel}
            </span>
          )}
          <span>{maxLabel ?? ''}</span>
        </div>
      )}
    </div>
  );
}
