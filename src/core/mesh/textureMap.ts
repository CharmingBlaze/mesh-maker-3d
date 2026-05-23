export interface TextureMap {
  width: number;
  height: number;
  /** PNG data URL */
  dataUrl: string;
}

export const TEXTURE_SIZE_PRESETS = [16, 32, 64, 128, 256, 512, 1024] as const;
export const TEXTURE_DEFAULT_SIZE = 128;
export const TEXTURE_BG = '#3a4555';

export function createBlankImageData(width: number, height: number, fill = TEXTURE_BG): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, width, height);
  drawChecker(ctx, width, height, 8);
  return ctx.getImageData(0, 0, width, height);
}

export function createBlankTexture(width: number, height: number, fill = TEXTURE_BG): TextureMap {
  return imageDataToTexture(createBlankImageData(width, height, fill));
}

function drawChecker(ctx: CanvasRenderingContext2D, w: number, h: number, cell: number): void {
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < w; x += cell) {
      if (((x / cell) | 0) % 2 === ((y / cell) | 0) % 2) {
        ctx.fillRect(x, y, cell, cell);
      }
    }
  }
}

export async function textureFromImageFile(file: File, maxSize = 1024): Promise<TextureMap> {
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;
  const scale = Math.min(1, maxSize / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return { width, height, dataUrl: canvas.toDataURL('image/png') };
}


export async function resizeTextureMapAsync(
  texture: TextureMap,
  newW: number,
  newH: number,
): Promise<TextureMap> {
  const w = Math.max(1, Math.min(2048, Math.round(newW)));
  const h = Math.max(1, Math.min(2048, Math.round(newH)));
  const img = await loadTextureImage(texture);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, w, h);
  return { width: w, height: h, dataUrl: canvas.toDataURL('image/png') };
}

export function imageDataToCanvas(data: ImageData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = data.width;
  canvas.height = data.height;
  canvas.getContext('2d')!.putImageData(data, 0, 0);
  return canvas;
}

export async function loadTextureImage(texture: TextureMap): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = texture.dataUrl;
  });
}

export async function textureToImageData(texture: TextureMap): Promise<ImageData> {
  const sync = trySyncTextureToImageData(texture);
  if (sync) return sync;
  const img = await loadTextureImage(texture);
  const canvas = document.createElement('canvas');
  canvas.width = texture.width;
  canvas.height = texture.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, texture.width, texture.height);
}

/** Data URLs from createBlankTexture / local edits often decode synchronously. */
export function trySyncTextureToImageData(texture: TextureMap): ImageData | null {
  const img = new Image();
  img.src = texture.dataUrl;
  if (!img.complete || img.naturalWidth === 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = texture.width;
  canvas.height = texture.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, texture.width, texture.height);
  return ctx.getImageData(0, 0, texture.width, texture.height);
}

/** Draw a texture data URL into a canvas (sync when the browser allows). Returns false if still loading. */
export function drawDataUrlToCanvas(
  dataUrl: string,
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): boolean {
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const img = new Image();
  img.src = dataUrl;
  if (!img.complete || img.naturalWidth === 0) return false;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return true;
}

export function imageDataToTexture(data: ImageData): TextureMap {
  const canvas = document.createElement('canvas');
  canvas.width = data.width;
  canvas.height = data.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(data, 0, 0);
  return { width: data.width, height: data.height, dataUrl: canvas.toDataURL('image/png') };
}

export function paintPixel(
  data: ImageData,
  x: number,
  y: number,
  color: { r: number; g: number; b: number; a: number },
): void {
  const px = Math.max(0, Math.min(data.width - 1, Math.floor(x)));
  const py = Math.max(0, Math.min(data.height - 1, Math.floor(y)));
  const i = (py * data.width + px) * 4;
  const alpha = color.a / 255;
  data.data[i] = Math.round(data.data[i] * (1 - alpha) + color.r * alpha);
  data.data[i + 1] = Math.round(data.data[i + 1] * (1 - alpha) + color.g * alpha);
  data.data[i + 2] = Math.round(data.data[i + 2] * (1 - alpha) + color.b * alpha);
  data.data[i + 3] = 255;
}

export function paintBrushLine(
  data: ImageData,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  size: number,
  color: { r: number; g: number; b: number; a: number },
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.01) {
    paintBrush(data, x0, y0, size, color);
    return;
  }
  const step = Math.max(0.35, size * 0.45);
  const steps = Math.ceil(dist / step);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    paintBrush(data, x0 + dx * t, y0 + dy * t, size, color);
  }
}

export function eraseBrushLine(
  data: ImageData,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  size: number,
): void {
  paintBrushLine(data, x0, y0, x1, y1, size, hexToRgba(TEXTURE_BG));
}

export function paintBrush(
  data: ImageData,
  cx: number,
  cy: number,
  size: number,
  color: { r: number; g: number; b: number; a: number },
): void {
  if (size <= 1) {
    paintPixel(data, cx, cy, color);
    return;
  }
  paintDisk(data, cx, cy, size, color);
}

export function floodFill(
  data: ImageData,
  sx: number,
  sy: number,
  color: { r: number; g: number; b: number; a: number },
): void {
  const w = data.width;
  const h = data.height;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  if (x0 < 0 || y0 < 0 || x0 >= w || y0 >= h) return;
  const start = (y0 * w + x0) * 4;
  const tr = data.data[start];
  const tg = data.data[start + 1];
  const tb = data.data[start + 2];
  if (tr === color.r && tg === color.g && tb === color.b) return;

  const matches = (i: number) =>
    data.data[i] === tr && data.data[i + 1] === tg && data.data[i + 2] === tb;

  const fillPixel = (i: number) => {
    data.data[i] = color.r;
    data.data[i + 1] = color.g;
    data.data[i + 2] = color.b;
    data.data[i + 3] = 255;
  };

  const stack: [number, number, number, number][] = [[x0, x0, y0, 1]];
  while (stack.length > 0) {
    const [xLeft, xRight, y, dir] = stack.pop()!;
    let left = xLeft;
    let right = xRight;
    let idx = (y * w + left) * 4;
    while (left > 0 && matches(idx - 4)) {
      left--;
      idx -= 4;
    }
    idx = (y * w + right) * 4;
    while (right < w - 1 && matches(idx + 4)) {
      right++;
      idx += 4;
    }
    for (let x = left; x <= right; x++) {
      fillPixel((y * w + x) * 4);
    }
    if (y > 0) {
      let span = false;
      for (let x = left; x <= right; x++) {
        const above = ((y - 1) * w + x) * 4;
        if (matches(above)) {
          if (!span) {
            stack.push([x, x, y - 1, -dir]);
            span = true;
          }
        } else {
          span = false;
        }
      }
    }
    if (y < h - 1) {
      let span = false;
      for (let x = left; x <= right; x++) {
        const below = ((y + 1) * w + x) * 4;
        if (matches(below)) {
          if (!span) {
            stack.push([x, x, y + 1, -dir]);
            span = true;
          }
        } else {
          span = false;
        }
      }
    }
  }
}

export function eraseBrush(
  data: ImageData,
  cx: number,
  cy: number,
  size: number,
): void {
  paintBrush(data, cx, cy, size, hexToRgba(TEXTURE_BG));
}

export function paintDisk(
  data: ImageData,
  cx: number,
  cy: number,
  radius: number,
  color: { r: number; g: number; b: number; a: number },
): void {
  const r = Math.max(1, Math.round(radius));
  const x0 = Math.max(0, Math.floor(cx - r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const x1 = Math.min(data.width - 1, Math.ceil(cx + r));
  const y1 = Math.min(data.height - 1, Math.ceil(cy + r));
  const r2 = r * r;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      const i = (y * data.width + x) * 4;
      const alpha = color.a / 255;
      data.data[i] = Math.round(data.data[i] * (1 - alpha) + color.r * alpha);
      data.data[i + 1] = Math.round(data.data[i + 1] * (1 - alpha) + color.g * alpha);
      data.data[i + 2] = Math.round(data.data[i + 2] * (1 - alpha) + color.b * alpha);
      data.data[i + 3] = 255;
    }
  }
}

export function samplePixel(data: ImageData, x: number, y: number): string {
  const px = Math.max(0, Math.min(data.width - 1, Math.floor(x)));
  const py = Math.max(0, Math.min(data.height - 1, Math.floor(y)));
  const i = (py * data.width + px) * 4;
  const r = data.data[i].toString(16).padStart(2, '0');
  const g = data.data[i + 1].toString(16).padStart(2, '0');
  const b = data.data[i + 2].toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

export function hexToRgba(hex: string, alpha = 255): { r: number; g: number; b: number; a: number } {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
    a: alpha,
  };
}
