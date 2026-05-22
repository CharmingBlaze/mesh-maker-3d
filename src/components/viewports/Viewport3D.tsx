import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Viewport3DRenderer } from '@/systems/viewport/Viewport3DRenderer';
import { sceneVisualKey } from '@/systems/viewport/meshVisualKey';
import { useViewport3DInteraction } from '@/hooks/useViewport3DInteraction';
import { useEditorStore } from '@/store/editorStore';
import { editorEvents } from '@/core/events/EventBus';
import { buildSceneRenderEntries } from '@/systems/scene/sceneObjectHelpers';
import { boundsCenter } from '@/core/math/BoundingBox';
import { formatPrimDrawDimensions } from '@/hooks/primDrawHelpers';
import { vertexToScreen } from '@/systems/viewport/pick3D';

function syncRenderer(renderer: Viewport3DRenderer): void {
  const state = useEditorStore.getState();
  const entries = buildSceneRenderEntries(
    state.sceneGraph,
    state.meshes,
    state.activeMeshId,
    state.selectedNodeIds,
  );
  const key = sceneVisualKey(
    entries,
    state.activeMeshId,
    state.selVerts,
    state.selEdges,
    state.selFaces,
    state.wireframe,
    state.flatShading,
    state.renderTick,
    state.selectionMode,
  );
  renderer.setSnapGrid(state.snapSize, state.showGrid3D);
  renderer.rebuildScene(
    entries,
    state.activeMeshId,
    state.selectionMode,
    state.selVerts,
    state.selEdges,
    state.selFaces,
    state.wireframe,
    state.flatShading,
    key,
  );
  if (state.primDraw) {
    renderer.setCadPrimPreview(state.primDraw);
  } else {
    renderer.setCadPrimPreview(null);
  }
  renderer.requestRender();
}

export function Viewport3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Viewport3DRenderer | null>(null);

  const activeVP = useEditorStore((s) => s.activeVP);
  const maximizedVP = useEditorStore((s) => s.maximizedVP);
  const renderTick = useEditorStore((s) => s.renderTick);
  const showGrid3D = useEditorStore((s) => s.showGrid3D);
  const snapSize = useEditorStore((s) => s.snapSize);
  const primDraw = useEditorStore((s) => s.primDraw);
  const [dimLabel, setDimLabel] = useState<{ x: number; y: number; text: string } | null>(null);

  const { selRect } = useViewport3DInteraction(rendererRef, containerRef);

  useEffect(() => {
    const updateDimLabel = () => {
      const renderer = rendererRef.current;
      const canvas = canvasRef.current;
      const draw = useEditorStore.getState().primDraw;
      if (!renderer || !canvas || !draw || draw.phase !== 'extent' || draw.baseView !== '3d') {
        setDimLabel(null);
        return;
      }
      const center = boundsCenter(draw.bounds);
      const pt = vertexToScreen(renderer.camera, canvas, center);
      setDimLabel({ x: pt.x, y: pt.y, text: formatPrimDrawDimensions(draw) });
    };
    updateDimLabel();
    const unsub = editorEvents.on('viewport:render', updateDimLabel);
    return unsub;
  }, [renderTick, primDraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const renderer = new Viewport3DRenderer(canvas);
    rendererRef.current = renderer;
    renderer.setSnapGrid(snapSize, showGrid3D);
    renderer.startLoop(() => ({
      w: container.clientWidth,
      h: container.clientHeight,
    }));

    syncRenderer(renderer);
    const unsubRender = editorEvents.on('viewport:render', () => syncRenderer(renderer));
    const unsubFrame = editorEvents.on('viewport:frame3d', (box) => {
      if (box) {
        renderer.orbitCamera.frameBox(
          new THREE.Vector3(box.min.x, box.min.y, box.min.z),
          new THREE.Vector3(box.max.x, box.max.y, box.max.z),
        );
        renderer.updateCamera();
      } else {
        renderer.orbitCamera.reset();
        renderer.updateCamera();
      }
      renderer.requestRender();
    });

    return () => {
      unsubRender();
      unsubFrame();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    syncRenderer(renderer);
  }, [renderTick, showGrid3D, snapSize, maximizedVP]);

  return (
    <div
      ref={containerRef}
      className={`vp vp--3d ${activeVP === '3d' || maximizedVP === '3d' ? 'vp-active' : ''}`}
    >
      <canvas ref={canvasRef} />
      {selRect && (selRect.w > 2 || selRect.h > 2) && (
        <div
          className="vp-sel-rect"
          style={{
            left: selRect.x,
            top: selRect.y,
            width: selRect.w,
            height: selRect.h,
          }}
        />
      )}
      {dimLabel && (
        <div
          className="vp-prim-dim-label"
          style={{ left: dimLabel.x, top: dimLabel.y - 24 }}
        >
          {dimLabel.text}
        </div>
      )}
    </div>
  );
}
