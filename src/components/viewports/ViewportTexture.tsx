import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { useMeshDocument, useSceneRevision } from '@/hooks/useSceneRevision';
import type { FaceUvMap } from '@/core/mesh/faceUv';
import { autoLayoutFaceUvs, faceAtTextureCoord } from '@/core/mesh/faceUv';
import {
  createBlankImageData,
  eraseBrushLine,
  floodFill,
  hexToRgba,
  imageDataToTexture,
  paintBrush,
  paintBrushLine,
  samplePixel,
  TEXTURE_BG,
  TEXTURE_DEFAULT_SIZE,
  TEXTURE_SIZE_PRESETS,
  textureFromImageFile,
  textureToImageData,
  trySyncTextureToImageData,
} from '@/core/mesh/textureMap';
import {
  canvasToTextureUv,
  clientToCanvas,
  clientToTextureCoord,
  drawTextureEditor,
  fitTextureView,
  textureEditorViewport,
  textureViewLayout,
  textureZoomPercent,
  zoomTextureViewAtScreen,
  type TextureEditorView,
} from '@/systems/texture/textureEditorDraw';
import {
  applyUvCornerPreview,
  applyUvMovePreview,
  hitTestUvHandles,
  screenDeltaToUvDelta,
  snapshotFaceUvs,
} from '@/systems/texture/uvEdit';
import {
  TEXTURE_TOOL_SHORTCUTS,
  TEXTURE_TOOLS,
  textureToolUsesBrush,
  type TextureEditorToolId,
} from '@/systems/texture/textureTools';
import { isAdditiveSelection } from '@/systems/selection/selectionSystem';
import type { ViewportSlotId } from '@/systems/viewport/viewportLayout';
import { editorEvents } from '@/core/events/EventBus';

export function ViewportTexture({ slotId }: { slotId: ViewportSlotId }) {
  const renderTick = useSceneRevision();
  const mesh = useMeshDocument();
  const activeSlot = useEditorStore((s) => s.activeSlot);
  const maximizedVP = useEditorStore((s) => s.maximizedVP);
  const tool = useEditorStore((s) => s.textureEditorTool);
  const brushSize = useEditorStore((s) => s.textureBrushSize);
  const brushColor = useEditorStore((s) => s.textureBrushColor);
  const selFaces = useEditorStore((s) => s.selFaces);
  const setActiveSlot = useEditorStore((s) => s.setActiveSlot);
  const setTextureEditorTool = useEditorStore((s) => s.setTextureEditorTool);
  const setTextureBrushSize = useEditorStore((s) => s.setTextureBrushSize);
  const setTextureBrushColor = useEditorStore((s) => s.setTextureBrushColor);
  const createMeshTexture = useEditorStore((s) => s.createMeshTexture);
  const resizeMeshTexture = useEditorStore((s) => s.resizeMeshTexture);
  const relayoutMeshFaceUvs = useEditorStore((s) => s.relayoutMeshFaceUvs);
  const selectFaceFromTexture = useEditorStore((s) => s.selectFaceFromTexture);
  const runCommand = useEditorStore((s) => s.runCommand);

  const isActive = activeSlot === slotId || maximizedVP === slotId;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pixelCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageDataRef = useRef<ImageData | null>(null);
  const paintingRef = useRef(false);
  const panningRef = useRef(false);
  const strokeDirtyRef = useRef(false);
  const skipTextureSyncRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const livePreviewRafRef = useRef<number | null>(null);
  const panStartRef = useRef({ x: 0, y: 0 });
  const lastPaintRef = useRef<{ px: number; py: number } | null>(null);
  const uvPreviewRef = useRef<Map<number, FaceUvMap> | null>(null);
  const uvDirtyRef = useRef(false);
  const uvDragRef = useRef({
    active: false,
    mode: 'move' as 'move' | 'corner',
    fi: -1,
    vi: undefined as number | undefined,
    startSx: 0,
    startSy: 0,
    startUvs: new Map<number, FaceUvMap>(),
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<TextureEditorView>({ zoom: 1, panX: 0, panY: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [texW, setTexW] = useState(TEXTURE_DEFAULT_SIZE);
  const [texH, setTexH] = useState(TEXTURE_DEFAULT_SIZE);
  const [hoverPx, setHoverPx] = useState<{ x: number; y: number } | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const viewRef = useRef(view);
  viewRef.current = view;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const spacePanRef = useRef(false);
  const capturePointerRef = useRef<number | null>(null);
  const lastTextureSizeRef = useRef('');
  const interactionRef = useRef({
    brushSize,
    brushColor,
    selFaces,
    slotId,
    setActiveSlot,
    setTextureEditorTool,
    setTextureBrushColor,
    selectFaceFromTexture,
    scheduleRedraw: () => {},
    syncPixelCanvas: () => {},
    flushStrokePreview: (_sync?: boolean) => {},
    runCommand,
  });

  const texture = mesh.texture;
  const textureRef = useRef(texture);
  textureRef.current = texture;
  const meshRef = useRef(mesh);
  meshRef.current = mesh;
  const usesBrush = textureToolUsesBrush(tool);

  useEffect(() => {
    if (texture) {
      setTexW(texture.width);
      setTexH(texture.height);
    }
  }, [texture?.width, texture?.height]);

  const ensurePixelCanvas = useCallback((w: number, h: number): HTMLCanvasElement => {
    if (!pixelCanvasRef.current) pixelCanvasRef.current = document.createElement('canvas');
    const c = pixelCanvasRef.current;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    return c;
  }, []);

  const syncPixelCanvas = useCallback(() => {
    const data = imageDataRef.current;
    if (!data) return;
    ensurePixelCanvas(data.width, data.height).getContext('2d')!.putImageData(data, 0, 0);
  }, [ensurePixelCanvas]);

  const pixelSource = useCallback((): CanvasImageSource | null => {
    const tex = textureRef.current;
    const data = imageDataRef.current;
    if (!tex || !data) return null;
    const canvas = ensurePixelCanvas(tex.width, tex.height);
    canvas.getContext('2d')!.putImageData(data, 0, 0);
    return canvas;
  }, [ensurePixelCanvas]);

  const redrawSyncRef = useRef<() => void>(() => {});

  const redrawSync = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const tex = textureRef.current;
    const meshDoc = meshRef.current;
    if (!canvas || !container || !tex) return;

    const rect = container.getBoundingClientRect();
    const cw = Math.max(1, Math.round(rect.width));
    const ch = Math.max(1, Math.round(rect.height));
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;

    const { w, viewH } = textureEditorViewport(container, canvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0a0f16';
    ctx.fillRect(0, 0, w, canvas.height);

    const pixels = pixelSource();
    const toolNow = toolRef.current;
    const { scale } = textureViewLayout(w, viewH, tex, viewRef.current);
    const hover = hoverPx;
    const brushPreview =
      hover && (toolNow === 'paint' || toolNow === 'eraser')
        ? { px: hover.x, py: hover.y, size: brushSize, eraser: toolNow === 'eraser' }
        : null;

    drawTextureEditor(
      ctx,
      w,
      viewH,
      tex,
      pixels,
      meshDoc,
      interactionRef.current.selFaces,
      viewRef.current,
      uvPreviewRef.current ?? undefined,
      toolNow === 'uv',
      { showPixelGrid: showGrid && scale >= 6, brushPreview },
    );
  }, [brushSize, hoverPx, pixelSource, showGrid]);

  const scheduleRedraw = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      redrawSyncRef.current();
    });
  }, []);

  redrawSyncRef.current = redrawSync;

  const pushLiveTexturePreview = useCallback((sync = false) => {
    const emit = () => {
      const tex = textureRef.current;
      const data = imageDataRef.current;
      if (!tex || !data) return;
      const previewCanvas = ensurePixelCanvas(tex.width, tex.height);
      previewCanvas.getContext('2d')!.putImageData(data, 0, 0);
      editorEvents.emit('texture:live-preview', {
        canvas: previewCanvas,
        width: tex.width,
        height: tex.height,
      });
    };
    if (sync) {
      if (livePreviewRafRef.current !== null) {
        cancelAnimationFrame(livePreviewRafRef.current);
        livePreviewRafRef.current = null;
      }
      emit();
      return;
    }
    if (livePreviewRafRef.current !== null) return;
    livePreviewRafRef.current = requestAnimationFrame(() => {
      livePreviewRafRef.current = null;
      emit();
    });
  }, [ensurePixelCanvas]);

  const flushStrokePreview = useCallback(
    (sync = false) => {
      syncPixelCanvas();
      redrawSyncRef.current();
      pushLiveTexturePreview(sync);
    },
    [pushLiveTexturePreview, syncPixelCanvas],
  );

  const resetViewToFit = useCallback(() => {
    setView({ zoom: 1, panX: 0, panY: 0 });
  }, []);

  const handleNewTexture = useCallback(() => {
    resetViewToFit();
    imageDataRef.current = createBlankImageData(texW, texH);
    syncPixelCanvas();
    createMeshTexture(texW, texH);
    requestAnimationFrame(() => redrawSyncRef.current());
  }, [createMeshTexture, resetViewToFit, syncPixelCanvas, texH, texW]);

  const loadTexturePixels = useCallback(() => {
    const tex = textureRef.current;
    if (!tex || paintingRef.current) return;

    if (skipTextureSyncRef.current) {
      skipTextureSyncRef.current = false;
      scheduleRedraw();
      return;
    }

    const sync = trySyncTextureToImageData(tex);
    if (sync) {
      imageDataRef.current = sync;
      syncPixelCanvas();
      scheduleRedraw();
      return;
    }

    void textureToImageData(tex).then((data) => {
      if (paintingRef.current || textureRef.current !== tex) return;
      imageDataRef.current = data;
      syncPixelCanvas();
      scheduleRedraw();
    });
  }, [scheduleRedraw, syncPixelCanvas]);

  useLayoutEffect(() => {
    if (!texture) {
      imageDataRef.current = null;
      pixelCanvasRef.current = null;
      lastTextureSizeRef.current = '';
      return;
    }

    const sizeKey = `${texture.width}x${texture.height}`;
    if (lastTextureSizeRef.current !== sizeKey) {
      lastTextureSizeRef.current = sizeKey;
      resetViewToFit();
    }

    if (paintingRef.current) {
      redrawSyncRef.current();
      return;
    }

    loadTexturePixels();
    redrawSyncRef.current();
  }, [texture?.dataUrl, texture?.width, texture?.height, loadTexturePixels, resetViewToFit, texture]);

  useEffect(() => {
    scheduleRedraw();
  }, [renderTick, selFaces, view, scheduleRedraw, hoverPx, showGrid, tool, texture != null]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => scheduleRedraw());
    ro.observe(container);
    scheduleRedraw();
    return () => ro.disconnect();
  }, [scheduleRedraw, texture != null]);

  interactionRef.current = {
    brushSize,
    brushColor,
    selFaces,
    slotId,
    setActiveSlot,
    setTextureEditorTool,
    setTextureBrushColor,
    selectFaceFromTexture,
    scheduleRedraw,
    syncPixelCanvas,
    flushStrokePreview,
    runCommand,
  };

  useEffect(() => {
    if (!isActive) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if (e.code === 'Space' && !e.repeat) {
        spacePanRef.current = true;
        e.preventDefault();
        return;
      }

      const key = e.key.toLowerCase();
      const toolKey = TEXTURE_TOOL_SHORTCUTS[key];
      if (toolKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setTextureEditorTool(toolKey);
        e.preventDefault();
        return;
      }

      if (key === '[') {
        setTextureBrushSize(brushSize - 1);
        e.preventDefault();
      } else if (key === ']') {
        setTextureBrushSize(brushSize + 1);
        e.preventDefault();
      } else if (key === '0' && textureRef.current && containerRef.current && canvasRef.current) {
        const { w, viewH } = textureEditorViewport(containerRef.current, canvasRef.current);
        setView(fitTextureView(w, viewH, textureRef.current));
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') spacePanRef.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [isActive, setTextureEditorTool, setTextureBrushSize, brushSize]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const atlasHitFromEvent = (e: PointerEvent) => {
      const tex = textureRef.current;
      if (!tex) return null;
      return clientToTextureCoord(canvas, container, e.clientX, e.clientY, tex, viewRef.current);
    };

    const releaseCapture = () => {
      if (capturePointerRef.current !== null) {
        try {
          container.releasePointerCapture(capturePointerRef.current);
        } catch {
          /* released */
        }
        capturePointerRef.current = null;
      }
    };

    const startPan = (e: PointerEvent) => {
      panningRef.current = true;
      setIsPanning(true);
      const v = viewRef.current;
      panStartRef.current = { x: e.clientX - v.panX, y: e.clientY - v.panY };
      capturePointerRef.current = e.pointerId;
      container.setPointerCapture(e.pointerId);
    };

    const wantsPan = (e: PointerEvent) =>
      e.button === 1 || e.button === 2 || e.altKey || spacePanRef.current;

    const applyPaint = (px: number, py: number, toolNow: TextureEditorToolId) => {
      const data = imageDataRef.current;
      if (!data) return;
      const prev = lastPaintRef.current;
      const size = interactionRef.current.brushSize;
      const bg = hexToRgba(TEXTURE_BG);
      if (prev && paintingRef.current) {
        if (toolNow === 'eraser') eraseBrushLine(data, prev.px, prev.py, px, py, size);
        else
          paintBrushLine(data, prev.px, prev.py, px, py, size, hexToRgba(interactionRef.current.brushColor));
      } else if (toolNow === 'eraser') {
        paintBrush(data, px, py, size, bg);
      } else {
        paintBrush(data, px, py, size, hexToRgba(interactionRef.current.brushColor));
      }
      lastPaintRef.current = { px, py };
      strokeDirtyRef.current = true;
      interactionRef.current.flushStrokePreview();
    };

    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.vp-texture__bar')) return;
      const tex = textureRef.current;
      if (!tex) return;
      e.preventDefault();
      e.stopPropagation();
      const pos = clientToCanvas(canvas, e.clientX, e.clientY);
      if (!pos) return;
      const { w, viewH } = textureEditorViewport(container, canvas);
      const v = viewRef.current;
      const f = e.deltaY > 0 ? 0.85 : 1 / 0.85;
      const zoom = Math.max(0.25, Math.min(16, v.zoom * f));
      setView(zoomTextureViewAtScreen(pos.sx, pos.sy, w, viewH, tex, v, zoom));
    };

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.vp-texture__bar')) return;
      const tex = textureRef.current;
      if (!tex) return;
      e.preventDefault();
      e.stopPropagation();
      interactionRef.current.setActiveSlot(interactionRef.current.slotId);

      if (wantsPan(e)) {
        startPan(e);
        return;
      }
      if (e.button !== 0) return;

      const meshDoc = meshRef.current;
      const toolNow = toolRef.current;
      const atlasHit = atlasHitFromEvent(e);
      const { w, viewH } = textureEditorViewport(container, canvas);

      if (!atlasHit) {
        startPan(e);
        return;
      }

      const { sx, sy } = atlasHit;

      const { selFaces: faces, setTextureEditorTool: setTool, selectFaceFromTexture: selectFace } =
        interactionRef.current;

      if (toolNow === 'uv') {
        const handleHit = hitTestUvHandles(sx, sy, w, viewH, tex, viewRef.current, meshDoc, faces);
        if (handleHit) {
          const editFaces =
            handleHit.kind === 'corner'
              ? new Set([handleHit.fi])
              : faces.has(handleHit.fi) && faces.size > 0
                ? faces
                : new Set([handleHit.fi]);
          if (handleHit.kind === 'move' && !faces.has(handleHit.fi)) selectFace(handleHit.fi, false);
          uvDragRef.current = {
            active: true,
            mode: handleHit.kind === 'corner' ? 'corner' : 'move',
            fi: handleHit.fi,
            vi: handleHit.vi,
            startSx: sx,
            startSy: sy,
            startUvs: snapshotFaceUvs(meshDoc, editFaces),
          };
          capturePointerRef.current = e.pointerId;
          container.setPointerCapture(e.pointerId);
          return;
        }
        const fi = faceAtTextureCoord(meshDoc, atlasHit.u, atlasHit.v);
        if (fi !== null) selectFace(fi, isAdditiveSelection(e.shiftKey, e.ctrlKey));
        return;
      }

      if (toolNow === 'select') {
        const fi = faceAtTextureCoord(meshDoc, atlasHit.u, atlasHit.v);
        if (fi !== null) selectFace(fi, isAdditiveSelection(e.shiftKey, e.ctrlKey));
        return;
      }

      if (toolNow === 'eyedropper') {
        const data = imageDataRef.current;
        if (!data) return;
        interactionRef.current.setTextureBrushColor(samplePixel(data, atlasHit.px, atlasHit.py));
        setTool('paint');
        return;
      }

      if (toolNow === 'fill') {
        const data = imageDataRef.current;
        if (!data) return;
        floodFill(data, atlasHit.px, atlasHit.py, hexToRgba(interactionRef.current.brushColor));
        strokeDirtyRef.current = true;
        const next = imageDataToTexture(data);
        skipTextureSyncRef.current = true;
        interactionRef.current.flushStrokePreview(true);
        interactionRef.current.runCommand('Fill Texture', () => {
          useEditorStore.getState().getActiveMesh().texture = next;
        });
        return;
      }

      paintingRef.current = true;
      lastPaintRef.current = null;
      capturePointerRef.current = e.pointerId;
      container.setPointerCapture(e.pointerId);
      applyPaint(atlasHit.px, atlasHit.py, toolNow);
    };

    const onPointerMove = (e: PointerEvent) => {
      const tex = textureRef.current;
      if (!tex) return;
      const hit = atlasHitFromEvent(e);
      setHoverPx(hit ? { x: hit.px, y: hit.py } : null);

      if (panningRef.current) {
        setView((v) => ({
          ...v,
          panX: e.clientX - panStartRef.current.x,
          panY: e.clientY - panStartRef.current.y,
        }));
        return;
      }

      if (uvDragRef.current.active) {
        const drag = uvDragRef.current;
        const { w, viewH } = textureEditorViewport(container, canvas);
        const pos = clientToCanvas(canvas, e.clientX, e.clientY);
        if (!pos) return;
        const { sx, sy } = pos;
        const { drawW, drawH } = textureViewLayout(w, viewH, tex, viewRef.current);
        if (drag.mode === 'move') {
          const { du, dv } = screenDeltaToUvDelta(sx - drag.startSx, sy - drag.startSy, drawW, drawH);
          uvPreviewRef.current = applyUvMovePreview(drag.startUvs, du, dv);
        } else if (drag.vi !== undefined) {
          const { u, v } = canvasToTextureUv(sx, sy, w, viewH, tex, viewRef.current);
          uvPreviewRef.current = applyUvCornerPreview(drag.startUvs, drag.fi, drag.vi, u, v);
        }
        uvDirtyRef.current = true;
        interactionRef.current.scheduleRedraw();
        return;
      }

      if (!paintingRef.current) return;
      const toolNow = toolRef.current;
      if (toolNow !== 'paint' && toolNow !== 'eraser') return;
      if (!hit) return;
      applyPaint(hit.px, hit.py, toolNow);
    };

    const onPointerUp = () => {
      releaseCapture();
      if (panningRef.current) {
        panningRef.current = false;
        setIsPanning(false);
      }
      if (uvDragRef.current.active) {
        uvDragRef.current.active = false;
        const preview = uvPreviewRef.current;
        if (preview && uvDirtyRef.current) {
          uvDirtyRef.current = false;
          interactionRef.current.runCommand('Edit UVs', () => {
            const m = useEditorStore.getState().getActiveMesh();
            preview.forEach((uv, fi) => {
              m.faceUvs[fi] = uv;
            });
          });
          uvPreviewRef.current = null;
        }
      }
      if (paintingRef.current) {
        paintingRef.current = false;
        lastPaintRef.current = null;
        const data = imageDataRef.current;
        if (data && strokeDirtyRef.current) {
          strokeDirtyRef.current = false;
          const next = imageDataToTexture(data);
          skipTextureSyncRef.current = true;
          const label = toolRef.current === 'eraser' ? 'Erase Texture' : 'Paint Texture';
          interactionRef.current.flushStrokePreview(true);
          interactionRef.current.runCommand(label, () => {
            useEditorStore.getState().getActiveMesh().texture = next;
          });
        }
      }
    };

    container.addEventListener('wheel', onWheel, { passive: false, capture: true });
    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerUp);
    container.addEventListener('contextmenu', (e) => e.preventDefault());

    return () => {
      container.removeEventListener('wheel', onWheel, { capture: true });
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerUp);
    };
  }, [slotId, texture != null]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (livePreviewRafRef.current !== null) cancelAnimationFrame(livePreviewRafRef.current);
    };
  }, []);

  const onImportFile = async (file: File) => {
    const tex = await textureFromImageFile(file);
    resetViewToFit();
    pixelCanvasRef.current = null;
    runCommand('Import Texture', () => {
      const m = useEditorStore.getState().getActiveMesh();
      m.texture = tex;
      autoLayoutFaceUvs(m);
    });
  };

  const exportTexture = () => {
    if (!texture) return;
    const a = document.createElement('a');
    a.href = texture.dataUrl;
    a.download = `${mesh.name || 'texture'}.png`;
    a.click();
  };

  const fitView = () => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas || !texture) return;
    const { w, viewH } = textureEditorViewport(container, canvas);
    setView(fitTextureView(w, viewH, texture));
  };

  const applyPresetSize = (size: number) => {
    setTexW(size);
    setTexH(size);
  };

  const handleResizeTexture = useCallback(() => {
    resetViewToFit();
    resizeMeshTexture(texW, texH);
  }, [resetViewToFit, resizeMeshTexture, texH, texW]);

  const activeTool = TEXTURE_TOOLS.find((t) => t.id === tool);

  const cursor = isPanning
    ? 'grabbing'
    : tool === 'select' || tool === 'uv'
      ? 'default'
      : tool === 'eyedropper'
        ? 'copy'
        : tool === 'fill'
          ? 'cell'
          : 'crosshair';

  return (
    <div
      ref={containerRef}
      className={`vp vp--texture ${isActive ? 'vp-active' : ''}`}
      style={{ cursor }}
    >
      {!texture ? (
        <div className="vp-texture__empty">
          <p className="vp-texture__empty-title">Texture Atlas</p>
          <p className="vp-texture__empty-hint">Paint pixel art and map it to mesh faces</p>
          <div className="vp-texture__empty-actions">
            <button
              type="button"
              className="vp-texture__btn vp-texture__btn--primary"
              onClick={handleNewTexture}
            >
              New {TEXTURE_DEFAULT_SIZE}×{TEXTURE_DEFAULT_SIZE}
            </button>
            <button type="button" className="vp-texture__btn" onClick={() => fileRef.current?.click()}>
              Import Image
            </button>
          </div>
        </div>
      ) : (
        <>
          <canvas ref={canvasRef} className="vp-texture__canvas" />
          <div className="vp-texture__hud">
            <span>{activeTool?.label ?? tool}</span>
            {hoverPx ? <span> · {hoverPx.x},{hoverPx.y}</span> : null}
            <span> · {textureZoomPercent(view)}%</span>
          </div>
        </>
      )}

      <div className="vp-texture__bar" onPointerDown={(e) => e.stopPropagation()}>
        <div className="vp-texture__group vp-texture__tools">
          {TEXTURE_TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`vp-texture__tool ${tool === t.id ? 'active' : ''}`}
              title={t.title}
              onClick={() => setTextureEditorTool(t.id)}
            >
              {t.label}
              <kbd>{t.shortcut}</kbd>
            </button>
          ))}
        </div>

        <span className="vp-texture__sep" aria-hidden />

        {usesBrush ? (
          <div className="vp-texture__group vp-texture__brush-row">
            <label className="vp-texture__brush" title="Brush size ([ ])">
              <span className="vp-texture__label">Size</span>
              <input
                type="range"
                min={1}
                max={32}
                value={brushSize}
                onChange={(e) => setTextureBrushSize(Number(e.target.value))}
              />
              <input
                type="number"
                className="vp-texture__brush-num"
                min={1}
                max={32}
                value={brushSize}
                onChange={(e) => setTextureBrushSize(Number(e.target.value))}
                aria-label="Brush size"
              />
            </label>
            <input
              type="color"
              className="vp-texture__color"
              value={brushColor}
              onChange={(e) => setTextureBrushColor(e.target.value)}
              aria-label="Brush color"
              title="Color"
            />
          </div>
        ) : null}

        <span className="vp-texture__sep" aria-hidden />

        <div className="vp-texture__group">
          <select
            className="vp-texture__size"
            value={
              TEXTURE_SIZE_PRESETS.includes(texW as (typeof TEXTURE_SIZE_PRESETS)[number]) && texW === texH
                ? texW
                : ''
            }
            onChange={(e) => {
              if (e.target.value) applyPresetSize(Number(e.target.value));
            }}
            aria-label="Size preset"
          >
            <option value="" disabled>
              Size
            </option>
            {TEXTURE_SIZE_PRESETS.map((s) => (
              <option key={s} value={s}>
                {s}²
              </option>
            ))}
          </select>
          <label className="vp-texture__dim">
            <input
              type="number"
              min={1}
              max={2048}
              value={texW}
              onChange={(e) => setTexW(Math.max(1, Math.min(2048, Number(e.target.value) || 1)))}
              aria-label="Width"
            />
            <span>×</span>
            <input
              type="number"
              min={1}
              max={2048}
              value={texH}
              onChange={(e) => setTexH(Math.max(1, Math.min(2048, Number(e.target.value) || 1)))}
              aria-label="Height"
            />
          </label>
        </div>

        <span className="vp-texture__sep" aria-hidden />

        <div className="vp-texture__group">
          <button type="button" className="vp-texture__btn" title="New blank atlas" onClick={handleNewTexture}>
            New
          </button>
          {texture ? (
            <button type="button" className="vp-texture__btn" title="Resize atlas" onClick={handleResizeTexture}>
              Resize
            </button>
          ) : null}
          <button type="button" className="vp-texture__btn" onClick={() => fileRef.current?.click()}>
            Import
          </button>
          {texture ? (
            <button type="button" className="vp-texture__btn" onClick={exportTexture}>
              Export
            </button>
          ) : null}
          {texture ? (
            <button type="button" className="vp-texture__btn" title="Auto-pack face UVs" onClick={() => relayoutMeshFaceUvs()}>
              Pack UVs
            </button>
          ) : null}
        </div>

        <span className="vp-texture__sep" aria-hidden />

        <div className="vp-texture__group">
          <button type="button" className="vp-texture__btn" title="Fit view (0)" onClick={fitView}>
            Fit
          </button>
          <label className="vp-texture__check" title="Pixel grid when zoomed in">
            <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
            Grid
          </label>
        </div>

        <span className="vp-texture__meta">
          {texture ? `${texture.width}×${texture.height}` : `${TEXTURE_DEFAULT_SIZE}² default`}
          {selFaces.size > 0 ? ` · ${selFaces.size} face${selFaces.size === 1 ? '' : 's'}` : ''}
        </span>

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onImportFile(file);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
