import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Viewport3DRenderer } from '@/systems/viewport/Viewport3DRenderer';
import { meshVisualKey } from '@/systems/viewport/meshVisualKey';
import { useViewport3DInteraction } from '@/hooks/useViewport3DInteraction';
import { useEditorStore } from '@/store/editorStore';
import { editorEvents } from '@/core/events/EventBus';
import { visibleFaceIndices, visibleVertexIndices } from '@/systems/layers/layerSystem';

function syncRenderer(renderer: Viewport3DRenderer): void {
  const state = useEditorStore.getState();
  const key = meshVisualKey(
    state.mesh,
    state.selVerts,
    state.selEdges,
    state.selFaces,
    state.wireframe,
    state.flatShading,
    state.renderTick,
  );
  renderer.setSnapGrid(state.snapSize, state.showGrid3D);
  renderer.rebuild(
    state.mesh,
    state.selVerts,
    state.selEdges,
    state.selFaces,
    visibleVertexIndices(state.mesh),
    visibleFaceIndices(state.mesh),
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

  const { selRect } = useViewport3DInteraction(rendererRef, containerRef);

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
      {selRect && selRect.w > 2 && selRect.h > 2 && (
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
    </div>
  );
}
