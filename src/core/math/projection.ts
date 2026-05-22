import type { Vec3 } from './Vec3';

export type View2DKey = 'top' | 'front' | 'side';

export interface View2DDef {
  proj: (v: Vec3) => { x: number; y: number };
  unproj: (x: number, y: number) => Vec3;
  ax: string;
  ay: string;
}

export const VIEW2D_DEFS: Record<View2DKey, View2DDef> = {
  top: {
    proj: (v) => ({ x: v.x, y: -v.z }),
    unproj: (x, y) => ({ x, y: 0, z: -y }),
    ax: 'X',
    ay: 'Z',
  },
  front: {
    proj: (v) => ({ x: v.x, y: -v.y }),
    unproj: (x, y) => ({ x, y: -y, z: 0 }),
    ax: 'X',
    ay: 'Y',
  },
  side: {
    proj: (v) => ({ x: v.z, y: -v.y }),
    unproj: (x, y) => ({ x: 0, y: -y, z: x }),
    ax: 'Z',
    ay: 'Y',
  },
};

export function w2s(vx: number, vy: number, pan: { x: number; y: number }, zoom: number) {
  return { x: vx * zoom + pan.x, y: vy * zoom + pan.y };
}

export function s2w(sx: number, sy: number, pan: { x: number; y: number }, zoom: number) {
  return { x: (sx - pan.x) / zoom, y: (sy - pan.y) / zoom };
}

export function pointInPoly(px: number, py: number, poly: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x,
      yi = poly[i].y,
      xj = poly[j].x,
      yj = poly[j].y;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
