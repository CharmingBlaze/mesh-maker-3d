/** World-space grid presets and helpers shared by snapping + viewport drawing. */

export const SNAP_GRID_PRESETS = [1, 2, 5, 10, 20] as const;

export const SNAP_GRID_MIN = 0.25;
export const SNAP_GRID_MAX = 100;

/** 3D GridHelper extent (world units); divisions derived from snap size. */
export const VIEWPORT_GRID_EXTENT = 600;

/** Draw a major grid line every N minor cells in orthographic views. */
export const ORTHO_MAJOR_EVERY = 5;

export function clampSnapSize(size: number): number {
  if (!Number.isFinite(size) || size <= 0) return 5;
  return Math.min(SNAP_GRID_MAX, Math.max(SNAP_GRID_MIN, size));
}

export function snapScalar(value: number, gridSize: number, enabled: boolean): number {
  if (!enabled) return value;
  const s = clampSnapSize(gridSize);
  return Math.round(value / s) * s;
}

export function formatSnapSize(size: number): string {
  const s = clampSnapSize(size);
  return Number.isInteger(s) ? String(s) : s.toFixed(2).replace(/\.?0+$/, '');
}

/** Screen pixels between minor grid lines in 2D orthographic views. */
export function orthoGridScreenStep(snapSize: number, zoom: number): number {
  return clampSnapSize(snapSize) * zoom;
}

/** Three.js GridHelper division count for a given snap increment. */
export function gridHelperDivisions(snapSize: number): number {
  const s = clampSnapSize(snapSize);
  const divisions = Math.round(VIEWPORT_GRID_EXTENT / s);
  return Math.max(10, Math.min(200, divisions));
}
