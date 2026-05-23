import type { MeshDocument } from '@/core/mesh/MeshDocument';
import type { TextureMap } from '@/core/mesh/textureMap';
import type { FaceUvMap } from '@/core/mesh/faceUv';
import { faceUvPolygons } from '@/core/mesh/faceUv';

export interface TextureEditorView {
  zoom: number;
  panX: number;
  panY: number;
}

export interface TextureViewLayout {
  scale: number;
  drawW: number;
  drawH: number;
  ox: number;
  oy: number;
}

export interface TextureEditorViewport {
  /** Canvas buffer width */
  w: number;
  /** Canvas buffer height */
  h: number;
  /** Drawable height above the toolbar overlay */
  viewH: number;
  /** Toolbar overlay height in canvas pixels */
  barH: number;
}

export function textureEditorViewport(
  container: HTMLElement,
  canvas: HTMLCanvasElement,
): TextureEditorViewport {
  const w = Math.max(1, canvas.width);
  const h = Math.max(1, canvas.height);
  const bar = container.querySelector('.vp-texture__bar');
  const barRect = bar?.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  const scaleY = canvasRect.height > 0 ? h / canvasRect.height : 1;
  const barH = barRect ? Math.max(0, Math.round(barRect.height * scaleY)) : 0;
  const viewH = Math.max(1, h - barH);
  return { w, h, viewH, barH };
}

/** Map a window pointer position to canvas buffer coordinates. */
export function clientToCanvas(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { sx: number; sy: number } | null {
  const r = canvas.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  return {
    sx: ((clientX - r.left) / r.width) * canvas.width,
    sy: ((clientY - r.top) / r.height) * canvas.height,
  };
}

export function textureViewLayout(
  w: number,
  h: number,
  texture: TextureMap,
  view: TextureEditorView,
): TextureViewLayout {
  const texW = Math.max(1, texture.width);
  const texH = Math.max(1, texture.height);
  const pad = Math.min(24, w * 0.08, h * 0.08);
  const fit = Math.max(
    0.05,
    Math.min(Math.max(1, w - pad * 2) / texW, Math.max(1, h - pad * 2) / texH),
  );
  const scale = view.zoom * fit;
  const drawW = texW * scale;
  const drawH = texH * scale;
  const ox = (w - drawW) / 2 + view.panX;
  const oy = (h - drawH) / 2 + view.panY;
  return { scale, drawW, drawH, ox, oy };
}

/** Zoom toward a screen point (same feel as orthographic 2D viewports). */
export function zoomTextureViewAtScreen(
  sx: number,
  sy: number,
  w: number,
  h: number,
  texture: TextureMap,
  view: TextureEditorView,
  newZoom: number,
): TextureEditorView {
  const { drawW, drawH, ox, oy } = textureViewLayout(w, h, texture, view);
  const u = drawW > 0 ? (sx - ox) / drawW : 0.5;
  const v = drawH > 0 ? (sy - oy) / drawH : 0.5;
  const zoomRatio = view.zoom > 0 ? newZoom / view.zoom : newZoom;
  const drawW1 = drawW * zoomRatio;
  const drawH1 = drawH * zoomRatio;
  return {
    zoom: newZoom,
    panX: sx - (w - drawW1) / 2 - u * drawW1,
    panY: sy - (h - drawH1) / 2 - v * drawH1,
  };
}

export function fitTextureView(
  _w: number,
  _h: number,
  _texture: TextureMap,
): TextureEditorView {
  return { zoom: 1, panX: 0, panY: 0 };
}

export function textureZoomPercent(view: TextureEditorView): number {
  return Math.round(view.zoom * 100);
}

export function drawTextureEditor(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  texture: TextureMap,
  pixels: CanvasImageSource | null,
  mesh: MeshDocument,
  selFaces: Set<number>,
  view: TextureEditorView,
  uvOverride?: ReadonlyMap<number, FaceUvMap>,
  showUvHandles = false,
  opts?: {
    showPixelGrid?: boolean;
    brushPreview?: { px: number; py: number; size: number; eraser?: boolean } | null;
  },
): void {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0a0f16';
  ctx.fillRect(0, 0, w, h);

  const { scale, drawW, drawH, ox, oy } = textureViewLayout(w, h, texture, view);

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  const cell = Math.max(4, scale * 4);
  for (let y = oy; y < oy + drawH; y += cell) {
    for (let x = ox; x < ox + drawW; x += cell) {
      const cx = Math.floor((x - ox) / cell);
      const cy = Math.floor((y - oy) / cell);
      ctx.fillStyle = (cx + cy) % 2 === 0 ? '#1a2432' : '#121a24';
      ctx.fillRect(x, y, cell, cell);
    }
  }

  if (pixels) {
    ctx.drawImage(pixels, ox, oy, drawW, drawH);
  }

  if (opts?.showPixelGrid && scale >= 8) {
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= texture.width; x++) {
      const sx = ox + (x / texture.width) * drawW;
      ctx.moveTo(sx + 0.5, oy);
      ctx.lineTo(sx + 0.5, oy + drawH);
    }
    for (let y = 0; y <= texture.height; y++) {
      const sy = oy + (y / texture.height) * drawH;
      ctx.moveTo(ox, sy + 0.5);
      ctx.lineTo(ox + drawW, sy + 0.5);
    }
    ctx.stroke();
  }

  if (opts?.brushPreview) {
    const { px, py, size, eraser } = opts.brushPreview;
    const cx = ox + ((px + 0.5) / texture.width) * drawW;
    const cy = oy + ((py + 0.5) / texture.height) * drawH;
    const r = Math.max(0.5, size * scale);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = eraser ? 'rgba(255,120,80,0.9)' : 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (size <= 1) {
      ctx.fillStyle = eraser ? 'rgba(255,120,80,0.6)' : 'rgba(255,255,255,0.7)';
      ctx.fillRect(cx - 0.5, cy - 0.5, 1, 1);
    }
  }

  ctx.strokeStyle = 'rgba(110, 196, 208, 0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(ox + 0.5, oy + 0.5, drawW - 1, drawH - 1);

  for (const poly of faceUvPolygons(mesh, uvOverride)) {
    const selected = selFaces.has(poly.fi);
    ctx.beginPath();
    poly.points.forEach((p, i) => {
      const x = ox + p.u * drawW;
      const y = oy + p.v * drawH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = selected ? 'rgba(232, 90, 26, 0.22)' : 'rgba(110, 196, 208, 0.06)';
    ctx.fill();
    ctx.strokeStyle = selected ? '#e85a1a' : 'rgba(110, 196, 208, 0.45)';
    ctx.lineWidth = selected ? 1.5 : 1;
    ctx.stroke();

    if (showUvHandles && selected) {
      for (const p of poly.points) {
        const hx = ox + p.u * drawW;
        const hy = oy + p.v * drawH;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(hx - 3, hy - 3, 6, 6);
        ctx.strokeStyle = '#e85a1a';
        ctx.lineWidth = 1;
        ctx.strokeRect(hx - 3.5, hy - 3.5, 7, 7);
      }
    }
  }

  ctx.restore();
}

export function screenToTextureCoord(
  sx: number,
  sy: number,
  w: number,
  h: number,
  texture: TextureMap,
  view: TextureEditorView,
): { u: number; v: number; px: number; py: number } | null {
  const { drawW, drawH, ox, oy } = textureViewLayout(w, h, texture, view);
  if (sx < ox || sy < oy || sx > ox + drawW || sy > oy + drawH) return null;
  const u = (sx - ox) / drawW;
  const v = (sy - oy) / drawH;
  const px = Math.floor(u * texture.width);
  const py = Math.floor(v * texture.height);
  return {
    u,
    v,
    px: Math.max(0, Math.min(texture.width - 1, px)),
    py: Math.max(0, Math.min(texture.height - 1, py)),
  };
}

export function canvasToTextureUv(
  sx: number,
  sy: number,
  w: number,
  h: number,
  texture: TextureMap,
  view: TextureEditorView,
): { u: number; v: number } {
  const { drawW, drawH, ox, oy } = textureViewLayout(w, h, texture, view);
  if (drawW <= 0 || drawH <= 0) return { u: 0, v: 0 };
  return {
    u: (sx - ox) / drawW,
    v: (sy - oy) / drawH,
  };
}

export function clientToTextureCoord(
  canvas: HTMLCanvasElement,
  container: HTMLElement,
  clientX: number,
  clientY: number,
  texture: TextureMap,
  view: TextureEditorView,
): { u: number; v: number; px: number; py: number; sx: number; sy: number } | null {
  const pos = clientToCanvas(canvas, clientX, clientY);
  if (!pos) return null;
  const { w, viewH } = textureEditorViewport(container, canvas);
  if (pos.sy > viewH) return null;
  const hit = screenToTextureCoord(pos.sx, pos.sy, w, viewH, texture, view);
  if (!hit) return null;
  return { ...hit, sx: pos.sx, sy: pos.sy };
}
