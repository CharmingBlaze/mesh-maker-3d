import type { MeshDocument } from '@/core/mesh/MeshDocument';
import type { BoundingBox } from '@/core/math/BoundingBox';
import { meshBounds } from '@/core/mesh/meshBounds';
import { boundsCorners } from '@/core/math/BoundingBox';
import { VIEW2D_DEFS, type View2DKey } from '@/core/math/projection';
import type { Viewport2DState } from '@/store/editorStore';
import { LEGACY_VIEWPORT_SIZE, getViewport2DSizes } from '@/systems/viewport/viewportSizes';

/** Extra margin around framed content (higher = more zoomed out). */
export const VIEWPORT_FRAME_PADDING = 1.55;
const FRAME_PADDING = VIEWPORT_FRAME_PADDING;

type ViewportSize = { w: number; h: number };
type ViewportSizeMap = Record<View2DKey, ViewportSize>;

function resolveSizes(sizes?: ViewportSizeMap): ViewportSizeMap {
  return sizes ?? getViewport2DSizes();
}

/** Center orthographic views on mesh bounds (MilkShape-style Frame All). */
export function frame2DViewports(
  mesh: MeshDocument,
  sizes?: ViewportSizeMap,
): Record<View2DKey, Viewport2DState> {
  const resolved = resolveSizes(sizes);
  const box = meshBounds(mesh);
  if (!box) {
    return {
      top: centerOrigin2D(resolved.top.w, resolved.top.h),
      front: centerOrigin2D(resolved.front.w, resolved.front.h),
      side: centerOrigin2D(resolved.side.w, resolved.side.h),
    };
  }

  return frame2DViewportsFromBounds(box, resolved);
}

/** Frame orthographic views on an arbitrary world-space bounding box. */
export function frame2DViewportsFromBounds(
  box: BoundingBox,
  sizes?: ViewportSizeMap,
): Record<View2DKey, Viewport2DState> {
  const resolved = resolveSizes(sizes);
  const corners = boundsCorners(box);
  const out = {} as Record<View2DKey, Viewport2DState>;

  (['top', 'front', 'side'] as const).forEach((key) => {
    const { w: viewWidth, h: viewHeight } = resolved[key];
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
      viewSize: { w: viewWidth, h: viewHeight },
    };
  });

  return out;
}

export function centerOrigin2D(w: number, h: number, zoom = 1): Viewport2DState {
  return { pan: { x: w / 2, y: h / 2 }, zoom, viewSize: { w, h } };
}

/** Frame one orthographic panel at an explicit pixel size (uses scene bounds when provided). */
export function frame2DViewportAtSize(
  key: View2DKey,
  w: number,
  h: number,
  bounds: BoundingBox | null,
  mesh?: MeshDocument | null,
): Viewport2DState {
  const size = { w: Math.max(1, w), h: Math.max(1, h) };
  const sizes = { ...getViewport2DSizes(), [key]: size };
  if (bounds) return frame2DViewportsFromBounds(bounds, sizes)[key];
  if (mesh) return frame2DViewports(mesh, sizes)[key];
  return centerOrigin2D(size.w, size.h);
}

/** Reconcile pan/zoom when the on-screen panel size differs from viewSize. */
export function syncViewport2DToSize(
  state: Viewport2DState,
  size: { w: number; h: number },
): Viewport2DState {
  const basis = state.viewSize ?? { w: LEGACY_VIEWPORT_SIZE, h: LEGACY_VIEWPORT_SIZE };
  if (basis.w === size.w && basis.h === size.h) {
    return state.viewSize ? state : { ...state, viewSize: size };
  }

  const scale = Math.min(size.w / basis.w, size.h / basis.h);
  const zoom = state.zoom * scale;
  const world = {
    x: (basis.w / 2 - state.pan.x) / state.zoom,
    y: (basis.h / 2 - state.pan.y) / state.zoom,
  };

  return {
    zoom,
    pan: {
      x: size.w / 2 - world.x * zoom,
      y: size.h / 2 - world.y * zoom,
    },
    viewSize: size,
  };
}

/** Remap pan when viewport size changes, preserving the world point at screen center. */
export function remapPanForViewportSize(
  pan: { x: number; y: number },
  zoom: number,
  from: ViewportSize,
  to: ViewportSize,
  fromCenter = { x: from.w / 2, y: from.h / 2 },
): { x: number; y: number } {
  const world = {
    x: (fromCenter.x - pan.x) / zoom,
    y: (fromCenter.y - pan.y) / zoom,
  };
  return {
    x: to.w / 2 - world.x * zoom,
    y: to.h / 2 - world.y * zoom,
  };
}

/** Remap pan from the legacy 480×480 assumption to a panel's actual size. */
export function remapPanFromLegacySize(
  pan: { x: number; y: number },
  zoom: number,
  to: ViewportSize,
): { x: number; y: number } {
  const legacy = { w: LEGACY_VIEWPORT_SIZE, h: LEGACY_VIEWPORT_SIZE };
  return remapPanForViewportSize(pan, zoom, legacy, to);
}
