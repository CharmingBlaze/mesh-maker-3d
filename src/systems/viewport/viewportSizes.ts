import type { View2DKey } from '@/core/math/projection';

/** Legacy default used when framing 2D views before per-panel sizes are known. */
export const LEGACY_VIEWPORT_SIZE = 480;

const ORTHO_KEYS: View2DKey[] = ['top', 'front', 'side'];

const sizes: Record<View2DKey, { w: number; h: number }> = {
  top: { w: LEGACY_VIEWPORT_SIZE, h: LEGACY_VIEWPORT_SIZE },
  front: { w: LEGACY_VIEWPORT_SIZE, h: LEGACY_VIEWPORT_SIZE },
  side: { w: LEGACY_VIEWPORT_SIZE, h: LEGACY_VIEWPORT_SIZE },
};

const measured: Record<View2DKey, boolean> = {
  top: false,
  front: false,
  side: false,
};

export function setViewport2DSize(key: View2DKey, w: number, h: number): void {
  sizes[key] = { w: Math.max(1, w), h: Math.max(1, h) };
  measured[key] = true;
}

export function getViewport2DSizes(): Record<View2DKey, { w: number; h: number }> {
  return {
    top: { ...sizes.top },
    front: { ...sizes.front },
    side: { ...sizes.side },
  };
}

export function allViewport2DSizesMeasured(): boolean {
  return ORTHO_KEYS.every((key) => measured[key]);
}

export function resetViewport2DSizeTracking(): void {
  for (const key of ORTHO_KEYS) {
    sizes[key] = { w: LEGACY_VIEWPORT_SIZE, h: LEGACY_VIEWPORT_SIZE };
    measured[key] = false;
  }
}
