import { useCallback, useEffect, useRef } from 'react';
import { VIEW2D_DEFS, s2w, type View2DKey } from '@/core/math/projection';
import { drawView2D } from '@/systems/viewport/drawView2D';
import { useEditorStore } from '@/store/editorStore';
import { editorEvents } from '@/core/events/EventBus';
import { SnapshotCommand } from '@/core/commands/Command';
import {
  screenToWorld,
  hasMinBaseSize,
  hasMinExtentSize,
  updatePrimDrag,
} from '@/hooks/primDrawHelpers';
import type { Vec3 } from '@/core/math/Vec3';
import {
  isAdditiveSelection,
  nearestEdge2D,
  nearestFace2D,
  nearestVertex2D,
  supportsSelectionMarquee,
  supportsVertexPickDrag,
  vertexPickSelection,
} from '@/systems/selection/selectionSystem';
import { visibleFaceIndices, visibleVertexIndices } from '@/systems/layers/layerSystem';
import { applyVertexToolPlacement, shouldAutoCommitFace } from '@/systems/mesh/faceDrawing';
import {
  applyTransformDrag2D,
  beginTransformDragFromSelection,
  beginTransformPending,
  createTransformDragState,
  isTransformTool,
  tryStartTransformDrag,
} from '@/hooks/transformDrag';
import {
  applyModelingPreview,
  beginModelingPending,
  canStartModelingDrag,
  createModelingDragState,
  isModelingTool,
  tryStartModelingDrag,
} from '@/hooks/modelingDrag';
import { isMarqueeDone, useMarqueeRect } from '@/hooks/marqueeState';
import { useSceneRevision } from '@/hooks/useSceneRevision';
import type { EdgeKey } from '@/systems/selection/selectionSystem';

export function useViewport2D(vpKey: View2DKey) {
  const renderTick = useSceneRevision();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const {
    selRect,
    beginMarquee,
    updateMarquee,
    endMarquee,
    clearMarquee,
    isMarqueeActive,
    peekMarqueeRect,
  } = useMarqueeRect();
  const primDragRef = useRef<{
    active: boolean;
    anchor: Vec3 | null;
    screen: { x: number; y: number } | null;
  }>({ active: false, anchor: null, screen: null });

  const dragRef = useRef(createTransformDragState());
  const modelingDragRef = useRef(createModelingDragState());

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const state = useEditorStore.getState();
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawView2D(
      ctx,
      canvas.width,
      canvas.height,
      vpKey,
      state.mesh,
      state.vp2d[vpKey],
      state.selVerts,
      state.selEdges,
      state.selFaces,
      visibleVertexIndices(state.mesh),
      visibleFaceIndices(state.mesh),
      state.wipFace,
      selRect,
      state.primDraw,
      {
        snapSize: state.snapSize,
        showGrid: state.showGrid3D,
      },
    );
  }, [vpKey, selRect]);

  useEffect(() => {
    render();
    return editorEvents.on('viewport:render', render);
  }, [render, renderTick]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(render);
    ro.observe(container);
    return () => ro.disconnect();
  }, [render]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const state = useEditorStore.getState();
      const r = container.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      const vp = state.vp2d[vpKey];
      const before = s2w(sx, sy, vp.pan, vp.zoom);
      const f = e.deltaY > 0 ? 0.85 : 1 / 0.85;
      const zoom = Math.max(0.04, Math.min(40, vp.zoom * f));
      const after = s2w(sx, sy, vp.pan, zoom);
      state.setVp2d(vpKey, {
        zoom,
        pan: {
          x: vp.pan.x + (after.x - before.x) * zoom,
          y: vp.pan.y + (after.y - before.y) * zoom,
        },
      });
      state.notifyChange();
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [vpKey]);

  const handleVpClick = useCallback(
    (e: React.MouseEvent, sx: number, sy: number) => {
      const state = useEditorStore.getState();
      const vd = VIEW2D_DEFS[vpKey];
      const vpState = state.vp2d[vpKey];
      const visibleVerts = visibleVertexIndices(state.mesh);
      const wc = s2w(sx, sy, vpState.pan, vpState.zoom);
      const wx = state.snap(wc.x);
      const wy = state.snap(wc.y);
      const wp3 = vd.unproj(wx, wy);
      const commitFace = (verts: number[], label = 'Add Face') => {
        const fresh = useEditorStore.getState();
        fresh.runCommand(label, () => {
          const fi = fresh.mesh.faces.length;
          fresh.mesh.faces.push([...verts]);
          fresh.mesh.faceLayers.push(fresh.mesh.activeLayerId);
          fresh.mesh.groups[fresh.groupSel]?.faces.push(fi);
        });
        fresh.setWipFace([]);
      };

      if (state.tool === 'vertex') {
        let placedVertex = -1;
        state.runCommand('Add Vertex', () => {
          const vi = nearestVertex2D(sx, sy, vpKey, state.mesh, vpState, { visibleVertices: visibleVerts });
          if (vi < 0) {
            placedVertex = state.mesh.vertices.length;
            state.mesh.vertices.push({ x: wp3.x, y: wp3.y, z: wp3.z });
            state.mesh.vertexLayers.push(state.mesh.activeLayerId);
          } else {
            placedVertex = vi;
          }
        });
        if (placedVertex >= 0) {
          const result = applyVertexToolPlacement(placedVertex, state.faceDrawMode, state.wipFace);
          if (result.committed) {
            const label =
              state.faceDrawMode === 'tri'
                ? 'Add Triangle'
                : state.faceDrawMode === 'quad'
                  ? 'Add Quad'
                  : 'Add Face';
            const toCommit = state.faceDrawMode === 'none' ? state.wipFace : result.wipFace;
            commitFace(toCommit, label);
          } else {
            state.setWipFace(result.wipFace);
            state.setSelVerts(new Set(result.wipFace));
            state.notifyChange();
          }
        }
      } else if (state.tool === 'face') {
        const vi = nearestVertex2D(sx, sy, vpKey, state.mesh, vpState, { visibleVertices: visibleVerts });
        if (vi >= 0) {
          const wip = [...state.wipFace];
          if (wip.length >= 3 && wip[0] === vi) {
            commitFace(wip);
          } else if (!wip.includes(vi)) {
            const nextWip = [...wip, vi];
            if (shouldAutoCommitFace(state.faceDrawMode, nextWip.length)) {
              commitFace(nextWip, state.faceDrawMode === 'tri' ? 'Add Triangle' : 'Add Quad');
            } else {
              state.setWipFace(nextWip);
            }
          }
          state.notifyChange();
        }
      } else if (supportsSelectionMarquee(state.tool)) {
        state.applyClickSelection(vpKey, sx, sy, e.shiftKey, e.ctrlKey);
      }
    },
    [vpKey],
  );

  const handlers = {
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onMouseDown: (e: React.MouseEvent) => {
      const state = useEditorStore.getState();
      const el = containerRef.current!;
      const r = el.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      e.preventDefault();
      dragRef.current.mouseDownPos = { x: sx, y: sy };
      dragRef.current.isDragging = false;
      state.setActiveVP(vpKey);

      if (state.primDraw && e.button === 0) {
        const p0 = screenToWorld(vpKey, sx, sy, state.vp2d[vpKey], state.snap);
        primDragRef.current = { active: true, anchor: p0, screen: { x: sx, y: sy } };
        if (state.primDraw.phase === 'base') {
          state.setPrimDraw(updatePrimDrag(state.primDraw, vpKey, p0, p0));
        } else {
          state.setPrimDraw({ ...state.primDraw, anchor: p0, cursor: p0 });
        }
        return;
      }

      if (e.button === 2 || e.button === 1) {
        panningRef.current = true;
        const vp = state.vp2d[vpKey];
        panStartRef.current = { x: e.clientX - vp.pan.x, y: e.clientY - vp.pan.y };
        return;
      }

      const vpState = state.vp2d[vpKey];
      const visibleVerts = visibleVertexIndices(state.mesh);
      const visibleFaces = visibleFaceIndices(state.mesh);
      const viPick = nearestVertex2D(sx, sy, vpKey, state.mesh, vpState, {
        visibleVertices: visibleVerts,
      });

      if (isTransformTool(state.tool)) {
        const transformVerts = state.selectedTransformVerts();
        if (
          beginTransformDragFromSelection(
            dragRef.current,
            state.tool,
            sx,
            sy,
            viPick,
            transformVerts,
            state.mesh.vertices.map((v) => ({ ...v })),
          )
        ) {
          return;
        }
      }

      if (supportsVertexPickDrag(state.tool, state.selectionMode) && viPick >= 0) {
        if (state.tool !== 'vertex') {
          const nextSel = vertexPickSelection(state.selVerts, viPick, e.shiftKey, e.ctrlKey);
          state.setSelVerts(nextSel);
          editorEvents.emit('selection:changed', undefined);
          state.notifyChange();
        }

        beginTransformPending(
          dragRef.current,
          { x: sx, y: sy },
          { vi: viPick },
          state.mesh.vertices.map((v) => ({ ...v })),
        );
        return;
      }

      if (supportsSelectionMarquee(state.tool)) {
        if (isModelingTool(state.tool)) {
          let hitSelected = false;
          if (state.tool === 'extrude' || state.tool === 'inset') {
            const fi = nearestFace2D(sx, sy, vpKey, state.mesh, vpState, { visibleFaces });
            hitSelected = fi >= 0 && state.selFaces.has(fi);
          } else if (state.tool === 'bevel') {
            const edge = nearestEdge2D(sx, sy, vpKey, state.mesh, vpState, {
              visibleVertices: visibleVerts,
              visibleFaces,
            });
            hitSelected = !!edge && state.selEdges.has(edge as EdgeKey);
          }
          if (
            hitSelected &&
            canStartModelingDrag(state.tool) &&
            !isAdditiveSelection(e.shiftKey, e.ctrlKey)
          ) {
            beginModelingPending(modelingDragRef.current, { x: sx, y: sy });
            return;
          }
        }

        beginMarquee(
          sx,
          sy,
          (rect, shiftKey, ctrlKey) => {
            const fresh = useEditorStore.getState();
            if (supportsSelectionMarquee(fresh.tool)) {
              fresh.applyBoxSelection(vpKey, rect, shiftKey, ctrlKey);
            }
          },
          containerRef.current,
        );
      }
    },
    onMouseMove: (e: React.MouseEvent) => {
      const state = useEditorStore.getState();
      const el = containerRef.current!;
      const r = el.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      const vpState = state.vp2d[vpKey];

      if (primDragRef.current.active && state.primDraw && primDragRef.current.anchor) {
        let p1 = screenToWorld(vpKey, sx, sy, vpState, state.snap);
        const anchor = primDragRef.current.anchor;
        if (state.primDraw.phase === 'extent' && primDragRef.current.screen) {
          const axis = state.primDraw.extentAxis;
          const start = primDragRef.current.screen;
          const raw =
            axis === 'y'
              ? -(sy - start.y) / vpState.zoom
              : (sx - start.x) / vpState.zoom;
          p1 = { ...anchor, [axis]: state.snap(anchor[axis] + raw) };
        }
        const updated = updatePrimDrag(state.primDraw, vpKey, anchor, p1);
        state.setPrimDraw(updated);
        return;
      }

      if (panningRef.current) {
        state.setVp2d(vpKey, {
          pan: { x: e.clientX - panStartRef.current.x, y: e.clientY - panStartRef.current.y },
        });
        state.notifyChange();
        return;
      }

      if (isMarqueeActive()) {
        updateMarquee(sx, sy);
        return;
      }

      const drag = dragRef.current;
      if (isTransformTool(state.tool)) {
        tryStartTransformDrag(drag, sx, sy);
        if (drag.isDragging) {
          applyTransformDrag2D(state.tool, drag, vpKey, sx, sy, vpState.pan, vpState.zoom);
        }
      } else if (isModelingTool(state.tool)) {
        const mDrag = modelingDragRef.current;
        tryStartModelingDrag(mDrag, state.tool, sx, sy);
        if (mDrag.isDragging) {
          applyModelingPreview(state.tool, mDrag, sx, sy, {
            kind: '2d',
            vpKey,
            pan: vpState.pan,
            zoom: vpState.zoom,
          });
        }
      } else if (supportsVertexPickDrag(state.tool, state.selectionMode)) {
        if (!isTransformTool(state.tool)) {
          tryStartTransformDrag(drag, sx, sy);
        }
        if (drag.isDragging && isTransformTool(state.tool)) {
          applyTransformDrag2D(state.tool, drag, vpKey, sx, sy, vpState.pan, vpState.zoom);
        } else if (drag.isDragging && drag.mouseDownPos && drag.dragVertBase && 'vi' in drag.dragVertBase) {
          const vd = VIEW2D_DEFS[vpKey];
          const origW = s2w(drag.mouseDownPos.x, drag.mouseDownPos.y, vpState.pan, vpState.zoom);
          const curW = s2w(sx, sy, vpState.pan, vpState.zoom);
          const deltaWorld = vd.unproj(curW.x - origW.x, curW.y - origW.y);
          const moveSet =
            state.tool === 'vertex'
              ? state.wipFace.length > 0
                ? new Set(state.wipFace)
                : drag.dragVertBase && 'vi' in drag.dragVertBase
                  ? new Set([drag.dragVertBase.vi])
                  : state.selectedTransformVerts()
              : state.selectedTransformVerts();
          moveSet.forEach((vi) => {
            state.mesh.vertices[vi].x = drag.dragOrigVerts[vi].x + deltaWorld.x;
            state.mesh.vertices[vi].y = drag.dragOrigVerts[vi].y + deltaWorld.y;
            state.mesh.vertices[vi].z = drag.dragOrigVerts[vi].z + deltaWorld.z;
          });
          state.notifyChange();
        }
      }

    },
    onMouseUp: (e: React.MouseEvent) => {
      const state = useEditorStore.getState();
      const el = containerRef.current!;
      const r = el.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;

      if (panningRef.current) {
        panningRef.current = false;
        if (isMarqueeActive()) endMarquee(e.shiftKey, e.ctrlKey);
        return;
      }

      const liveMarquee = peekMarqueeRect();
      const marqueeApplied = !!liveMarquee && isMarqueeDone(liveMarquee);
      if (isMarqueeActive()) endMarquee(e.shiftKey, e.ctrlKey);

      if (primDragRef.current.active && state.primDraw && primDragRef.current.anchor) {
        const min = state.snapSize;
        const draw = state.primDraw;
        if (draw.phase === 'base' && hasMinBaseSize(draw, min)) {
          state.setPrimDraw({
            ...draw,
            phase: 'extent',
            anchor: null,
            cursor: null,
          });
        } else if (draw.phase === 'extent' && hasMinExtentSize(draw, min)) {
          state.commitPrimDraw();
        }
        primDragRef.current = { active: false, anchor: null, screen: null };
        dragRef.current.mouseDownPos = null;
        return;
      }

      const drag = dragRef.current;
      const mDrag = modelingDragRef.current;
      const moved =
        drag.mouseDownPos &&
        Math.hypot(sx - drag.mouseDownPos.x, sy - drag.mouseDownPos.y) >= 5;

      if (
        !marqueeApplied &&
        !state.primDraw &&
        !drag.isDragging &&
        !mDrag.isDragging &&
        !moved &&
        drag.mouseDownPos
      ) {
        if (isModelingTool(state.tool)) {
          state.applyClickSelection(vpKey, sx, sy, e.shiftKey, e.ctrlKey);
        } else {
          handleVpClick(e, sx, sy);
        }
      }

      if (
        drag.isDragging &&
        drag.beforeSnapshot &&
        supportsVertexPickDrag(state.tool, state.selectionMode) &&
        !isTransformTool(state.tool)
      ) {
        const before = drag.beforeSnapshot;
        const after = state.getSnapshot();
        state.history.execute(
          new SnapshotCommand('Move', before, after, (snap) => {
            state.applySnapshot(snap);
            state.notifyChange();
          }),
        );
        drag.beforeSnapshot = null;
      } else if (drag.isDragging && drag.beforeSnapshot && isTransformTool(state.tool)) {
        const before = drag.beforeSnapshot;
        const after = state.getSnapshot();
        state.history.execute(
          new SnapshotCommand(state.tool, before, after, (snap) => {
            state.applySnapshot(snap);
            state.notifyChange();
          }),
        );
        drag.beforeSnapshot = null;
      }

      if (mDrag.isDragging && mDrag.beforeSnapshot && isModelingTool(state.tool)) {
        const before = mDrag.beforeSnapshot;
        const after = state.getSnapshot();
        const label = state.tool.charAt(0).toUpperCase() + state.tool.slice(1);
        state.history.execute(
          new SnapshotCommand(label, before, after, (snap) => {
            state.applySnapshot(snap);
            state.notifyChange();
          }),
        );
      }
      modelingDragRef.current = createModelingDragState();

      drag.isDragging = false;
      drag.transformPending = false;
      drag.mouseDownPos = null;
      drag.dragVertBase = null;
    },
    onMouseLeave: () => {
      panningRef.current = false;
      clearMarquee();
      primDragRef.current = { active: false, anchor: null, screen: null };
      dragRef.current.transformPending = false;
      dragRef.current.isDragging = false;
    },
  };

  return { canvasRef, containerRef, handlers, selRect };
}
