import type { MeshDocument } from '@/core/mesh/MeshDocument';
import type { BoundingBox } from '@/core/math/BoundingBox';
import { meshBounds } from '@/core/mesh/meshBounds';
import { boundsCorners } from '@/core/math/BoundingBox';
import { VIEW2D_DEFS, type View2DKey } from '@/core/math/projection';
import type { Viewport2DState } from '@/store/editorStore';

const DEFAULT_VIEW_SIZE = 480;
const FRAME_PADDING = 1.15;

/** Center orthographic views on mesh bounds (MilkShape-style Frame All). */
export function frame2DViewports(
  mesh: MeshDocument,
  viewWidth = DEFAULT_VIEW_SIZE,
  viewHeight = DEFAULT_VIEW_SIZE,
): Record<View2DKey, Viewport2DState> {
  const box = meshBounds(mesh);
  if (!box) {
    return {
      top: { pan: { x: viewWidth / 2, y: viewHeight / 2 }, zoom: 1 },
      front: { pan: { x: viewWidth / 2, y: viewHeight / 2 }, zoom: 1 },
      side: { pan: { x: viewWidth / 2, y: viewHeight / 2 }, zoom: 1 },
    };
  }

  const corners = boundsCorners(box);
  const out = {} as Record<View2DKey, Viewport2DState>;

  (['top', 'front', 'side'] as const).forEach((key) => {
    const def = VIEW2D_DEFS[key];
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const c of corners) {
      const p = def.proj(c);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);
    const zoom = Math.min(viewWidth / spanX, viewHeight / spanY) / FRAME_PADDING;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    out[key] = {
      zoom,
      pan: {
        x: viewWidth / 2 - cx * zoom,
        y: viewHeight / 2 - cy * zoom,
      },
    };
  });

  return out;
}

/** Frame orthographic views on an arbitrary world-space bounding box. */
export function frame2DViewportsFromBounds(
  box: BoundingBox,
  viewWidth = DEFAULT_VIEW_SIZE,
  viewHeight = DEFAULT_VIEW_SIZE,
): Record<View2DKey, Viewport2DState> {
  const corners = boundsCorners(box);
  const out = {} as Record<View2DKey, Viewport2DState>;

  (['top', 'front', 'side'] as const).forEach((key) => {
    const def = VIEW2D_DEFS[key];
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const c of corners) {
      const p = def.proj(c);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);
    const zoom = Math.min(viewWidth / spanX, viewHeight / spanY) / FRAME_PADDING;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    out[key] = {
      zoom,
      pan: {
        x: viewWidth / 2 - cx * zoom,
        y: viewHeight / 2 - cy * zoom,
      },
    };
  });

  return out;
}
