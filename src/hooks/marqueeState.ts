import { useCallback, useRef, useState } from 'react';
import type { SelRect } from '@/systems/viewport/drawView2D';

export const MARQUEE_MIN_PX = 3;

export function marqueeRectFromDrag(
  start: { x: number; y: number },
  sx: number,
  sy: number,
): SelRect {
  return {
    x: Math.min(sx, start.x),
    y: Math.min(sy, start.y),
    w: Math.abs(sx - start.x),
    h: Math.abs(sy - start.y),
  };
}

export function isMarqueeDone(rect: SelRect | null | undefined): boolean {
  return !!rect && (rect.w >= MARQUEE_MIN_PX || rect.h >= MARQUEE_MIN_PX);
}

/** Local marquee rect + refs; tracks drag on document while active. */
export function useMarqueeRect() {
  const [selRect, setSelRect] = useState<SelRect | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const liveRef = useRef<SelRect | null>(null);
  const onEndRef = useRef<((shiftKey: boolean, ctrlKey: boolean) => void) | null>(null);
  const cleanupDocRef = useRef<(() => void) | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);

  const clearMarquee = useCallback(() => {
    cleanupDocRef.current?.();
    cleanupDocRef.current = null;
    startRef.current = null;
    liveRef.current = null;
    onEndRef.current = null;
    containerRef.current = null;
    setSelRect(null);
  }, []);

  const updateMarquee = useCallback((sx: number, sy: number) => {
    const start = startRef.current;
    if (!start) return;
    const rect = marqueeRectFromDrag(start, sx, sy);
    liveRef.current = rect;
    setSelRect(rect);
  }, []);

  const endMarquee = useCallback((shiftKey: boolean, ctrlKey = false) => {
    if (!startRef.current) return;
    onEndRef.current?.(shiftKey, ctrlKey);
    clearMarquee();
  }, [clearMarquee]);

  const beginMarquee = useCallback(
    (
      x: number,
      y: number,
      onEnd: (rect: SelRect, shiftKey: boolean, ctrlKey: boolean) => void,
      container?: HTMLElement | null,
    ) => {
      clearMarquee();
      containerRef.current = container ?? null;
      startRef.current = { x, y };
      const rect = { x, y, w: 0, h: 0 };
      liveRef.current = rect;
      onEndRef.current = (shiftKey, ctrlKey) => {
        const live = liveRef.current;
        if (live && isMarqueeDone(live)) onEnd(live, shiftKey, ctrlKey);
      };
      setSelRect(rect);

      const toLocal = (clientX: number, clientY: number) => {
        const el = containerRef.current;
        if (!el) return { sx: clientX, sy: clientY };
        const r = el.getBoundingClientRect();
        return { sx: clientX - r.left, sy: clientY - r.top };
      };

      const onDocMove = (e: MouseEvent) => {
        if (!startRef.current) return;
        const { sx, sy } = toLocal(e.clientX, e.clientY);
        updateMarquee(sx, sy);
      };

      const onDocUp = (e: MouseEvent) => {
        if (e.button !== 0) return;
        endMarquee(e.shiftKey, e.ctrlKey);
      };

      const cleanup = () => {
        document.removeEventListener('mousemove', onDocMove);
        document.removeEventListener('mouseup', onDocUp);
        document.removeEventListener('pointerup', onDocUp as EventListener);
        document.removeEventListener('pointercancel', onDocUp as EventListener);
      };
      cleanupDocRef.current = cleanup;
      document.addEventListener('mousemove', onDocMove);
      document.addEventListener('mouseup', onDocUp);
      document.addEventListener('pointerup', onDocUp as EventListener);
      document.addEventListener('pointercancel', onDocUp as EventListener);
    },
    [clearMarquee, endMarquee, updateMarquee],
  );

  const isMarqueeActive = useCallback(() => startRef.current !== null, []);

  const peekMarqueeRect = useCallback(() => liveRef.current, []);

  return {
    selRect,
    beginMarquee,
    updateMarquee,
    endMarquee,
    clearMarquee,
    isMarqueeActive,
    peekMarqueeRect,
  };
}
