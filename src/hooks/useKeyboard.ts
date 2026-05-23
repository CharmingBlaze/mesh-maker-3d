import { useEffect } from 'react';
import { useEditorStore, type ToolId } from '@/store/editorStore';
import { canCommitPrimDraw } from '@/hooks/primDrawHelpers';
import { canCommitKnifeCut, isKnifeActive } from '@/systems/mesh/knifeDraw';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
    return true;
  }
  return target.closest('input, textarea, [contenteditable="true"]') !== null;
}

export function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      const store = useEditorStore.getState();

      if (e.code === 'Space' || e.key === ' ') {
        if (isKnifeActive(store.tool, store.knifeDraw)) return;
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) store.toggleViewportMaximize();
        return;
      }

      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        store.undo();
        return;
      }
      if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
        e.preventDefault();
        store.redo();
        return;
      }
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        store.duplicateSelectedObjects();
        return;
      }
      if (e.ctrlKey && e.key === 'o') {
        e.preventDefault();
        document.getElementById('file-bridge-open')?.click();
        return;
      }
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        void store.saveProject();
        return;
      }
      if (e.ctrlKey && e.key === 'e') {
        e.preventDefault();
        store.exportOBJ();
        return;
      }
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        store.newScene();
        return;
      }
      if (e.ctrlKey && (e.key === ']' || e.code === 'BracketRight')) {
        e.preventDefault();
        store.growSelection();
        return;
      }
      if (e.ctrlKey && (e.key === '[' || e.code === 'BracketLeft')) {
        e.preventDefault();
        store.shrinkSelection();
        return;
      }
      if (e.ctrlKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        store.loopCut();
        return;
      }
      if (e.ctrlKey && e.shiftKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        store.dissolveEdges();
        return;
      }
      if (e.ctrlKey && e.shiftKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        store.edgeSlide();
        return;
      }
      if (e.altKey && (e.key === 'm' || e.key === 'M') && !e.ctrlKey) {
        e.preventDefault();
        store.mergeSelectedVerts();
        return;
      }
      if (e.altKey && e.shiftKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        store.separateSelection();
        return;
      }
      if (e.ctrlKey && e.shiftKey && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        store.ripEdges();
        return;
      }
      if (e.shiftKey && !e.ctrlKey && !e.metaKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        store.duplicateSelection();
        return;
      }

      if (store.mirrorPreview && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === 'x' || e.key === 'X') {
          e.preventDefault();
          store.updateMirrorPreview({ axis: 'x' });
          return;
        }
        if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault();
          store.updateMirrorPreview({ axis: 'y' });
          return;
        }
        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault();
          store.updateMirrorPreview({ axis: 'z' });
          return;
        }
      }

      if (e.key === 'Backspace' && store.knifeDraw && store.knifeDraw.points.length > 0) {
        e.preventDefault();
        store.undoKnifePoint();
        return;
      }

      if (e.code === 'Delete' || e.code === 'NumpadDelete') {
        e.preventDefault();
        store.deleteSelected();
        return;
      }

      const toolMap: Record<string, ToolId> = {
        v: 'vertex',
        f: 'face',
        s: 'select',
        m: 'move',
        g: 'rotate',
        c: 'scale',
        j: 'inset',
      };

      switch (e.key) {
        case 'Tab':
          e.preventDefault();
          store.toggleObjectEditMode();
          break;
        case '1':
          store.setSelectionMode('object');
          break;
        case '2':
          store.setSelectionMode('vertex');
          break;
        case '3':
          store.setSelectionMode('edge');
          break;
        case '4':
          store.setSelectionMode('face');
          break;
        case 'a':
        case 'A':
          store.selectAll();
          break;
        case 'd':
        case 'D':
          store.deselectAll();
          break;
        case 'i':
        case 'I':
          store.invertSelection();
          break;
        case 'l':
        case 'L':
          if (!e.ctrlKey && !e.metaKey) {
            store.selectLinked();
          }
          break;
        case 'w':
        case 'W':
          store.toggleWireframe();
          break;
        case 'f':
        case 'F':
          if (e.shiftKey) {
            store.frameAll();
          } else if (!e.ctrlKey && !e.metaKey) {
            store.setTool('face');
          }
          break;
        case 'Escape':
          if (store.mirrorPreview) {
            store.cancelMirrorPreview();
          } else if (store.edgeSlidePreview) {
            store.cancelEdgeSlidePreview();
          } else if (store.loopCutPreview) {
            store.cancelLoopCutPreview();
          } else if (store.armedModeling) {
            store.clearArmedModeling();
          } else if (store.knifeDraw) {
            store.cancelKnifeDraw();
          } else if (store.primDraw) {
            store.cancelPrimDraw();
          } else {
            store.setWipFace([]);
            store.deselectAll();
          }
          break;
        case 'Enter':
        case 'NumpadEnter':
          if (store.mirrorPreview) {
            e.preventDefault();
            store.commitMirrorPreview();
          } else if (store.edgeSlidePreview) {
            e.preventDefault();
            store.commitEdgeSlidePreview();
          } else if (store.loopCutPreview) {
            e.preventDefault();
            store.commitLoopCutPreview();
          } else if (store.knifeDraw && canCommitKnifeCut(store.knifeDraw)) {
            e.preventDefault();
            store.commitKnifeCut();
          } else if (store.primDraw && canCommitPrimDraw(store.primDraw, store.snapSize)) {
            e.preventDefault();
            store.commitPrimDraw();
          }
          break;
        case 'e':
        case 'E':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            store.armModeling('extrude');
          }
          break;
        case 'b':
        case 'B':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            store.armModeling('bevel');
          }
          break;
        case 'k':
        case 'K':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            store.activateKnifeTool();
          }
          break;
        case 'h':
        case 'H':
          if (e.altKey) {
            e.preventDefault();
            store.fillHole();
          }
          break;
        case 'n':
        case 'N':
          if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            store.flipNormals();
          }
          break;
        default: {
          const t = toolMap[e.key] ?? toolMap[e.key.toLowerCase()];
          if (t) store.setTool(t);
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);
}
