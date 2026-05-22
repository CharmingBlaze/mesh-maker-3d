import type { Vec3 } from './Vec3';

export interface BoundingBox {
  min: Vec3;
  max: Vec3;
}

export function emptyBounds(): BoundingBox {
  return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
}

export function boundsFromCorners(a: Vec3, b: Vec3): BoundingBox {
  return {
    min: {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      z: Math.min(a.z, b.z),
    },
    max: {
      x: Math.max(a.x, b.x),
      y: Math.max(a.y, b.y),
      z: Math.max(a.z, b.z),
    },
  };
}

export function mergeBounds(b: BoundingBox, a: Vec3, c: Vec3): BoundingBox {
  const corner = boundsFromCorners(a, c);
  return {
    min: {
      x: Math.min(b.min.x, corner.min.x),
      y: Math.min(b.min.y, corner.min.y),
      z: Math.min(b.min.z, corner.min.z),
    },
    max: {
      x: Math.max(b.max.x, corner.max.x),
      y: Math.max(b.max.y, corner.max.y),
      z: Math.max(b.max.z, corner.max.z),
    },
  };
}

export function setAxisRange(b: BoundingBox, axis: 'x' | 'y' | 'z', v0: number, v1: number): BoundingBox {
  const lo = Math.min(v0, v1);
  const hi = Math.max(v0, v1);
  const out = { min: { ...b.min }, max: { ...b.max } };
  out.min[axis] = lo;
  out.max[axis] = hi;
  return out;
}

export function expandAxisFromPoints(
  b: BoundingBox,
  axis: 'x' | 'y' | 'z',
  p0: Vec3,
  p1: Vec3,
): BoundingBox {
  return setAxisRange(b, axis, p0[axis], p1[axis]);
}

export function boundsSize(b: BoundingBox): Vec3 {
  return {
    x: b.max.x - b.min.x,
    y: b.max.y - b.min.y,
    z: b.max.z - b.min.z,
  };
}

export function boundsCenter(b: BoundingBox): Vec3 {
  return {
    x: (b.min.x + b.max.x) / 2,
    y: (b.min.y + b.max.y) / 2,
    z: (b.min.z + b.max.z) / 2,
  };
}

export function enforceMinSize(b: BoundingBox, minSize: number): BoundingBox {
  const size = boundsSize(b);
  const out = { min: { ...b.min }, max: { ...b.max } };
  (['x', 'y', 'z'] as const).forEach((axis) => {
    if (size[axis] < minSize) {
      const mid = (out.min[axis] + out.max[axis]) / 2;
      out.min[axis] = mid - minSize / 2;
      out.max[axis] = mid + minSize / 2;
    }
  });
  return out;
}

/** 8 corners of an AABB */
export function boundsCorners(b: BoundingBox): Vec3[] {
  const { min, max } = b;
  return [
    { x: min.x, y: min.y, z: min.z },
    { x: max.x, y: min.y, z: min.z },
    { x: max.x, y: min.y, z: max.z },
    { x: min.x, y: min.y, z: max.z },
    { x: min.x, y: max.y, z: min.z },
    { x: max.x, y: max.y, z: min.z },
    { x: max.x, y: max.y, z: max.z },
    { x: min.x, y: max.y, z: max.z },
  ];
}
