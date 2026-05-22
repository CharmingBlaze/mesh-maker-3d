import { useEffect } from 'react';
import { useEditorStore, type ToolId } from '@/store/editorStore';

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

      if (e.code === 'Delete' || e.code === 'NumpadDelete' || e.key === 'Backspace') {
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
          if (store.primDraw) {
            store.cancelPrimDraw();
          } else {
            store.setWipFace([]);
            store.deselectAll();
          }
          break;
        case 'e':
        case 'E':
          if (!e.ctrlKey && !e.metaKey) {
            store.setTool('extrude');
          }
          break;
        case 'b':
        case 'B':
          if (!e.ctrlKey && !e.metaKey) {
            store.setTool('bevel');
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
