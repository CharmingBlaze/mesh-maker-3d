import { useEditorStore, type ToolId } from '@/store/editorStore';
import type { SelectionMode } from '@/systems/selection/selectionSystem';

const SELECTION_MODES: { id: SelectionMode; label: string; key: string }[] = [
  { id: 'object', label: 'Object', key: '1' },
  { id: 'vertex', label: 'Vertex', key: '2' },
  { id: 'edge', label: 'Edge', key: '3' },
  { id: 'face', label: 'Face', key: '4' },
];

const EDIT_TOOLS: { id: ToolId; label: string; key: string }[] = [
  { id: 'select', label: 'Select', key: 'S' },
  { id: 'move', label: 'Move', key: 'M' },
  { id: 'rotate', label: 'Rotate', key: 'G' },
  { id: 'scale', label: 'Scale', key: 'C' },
  { id: 'extrude', label: 'Extrude', key: 'E' },
  { id: 'bevel', label: 'Bevel', key: 'B' },
  { id: 'inset', label: 'Inset', key: 'J' },
  { id: 'vertex', label: 'Vertex', key: 'V' },
  { id: 'face', label: 'Face', key: 'F' },
];

export function EditorToolbar() {
  const selectionMode = useEditorStore((s) => s.selectionMode);
  const setSelectionMode = useEditorStore((s) => s.setSelectionMode);
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);

  return (
    <div className="menubar-center" role="toolbar" aria-label="Selection and tools">
      <div className="menubar-selection">
        <span className="editor-toolbar-label">Select</span>
        <div className="editor-toolbar-group">
          {SELECTION_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={`editor-tb-btn ${selectionMode === mode.id ? 'active' : ''}`}
              onClick={() => setSelectionMode(mode.id)}
              title={`${mode.label} mode (${mode.key})`}
              aria-pressed={selectionMode === mode.id}
            >
              <span className="editor-tb-btn-label">{mode.label}</span>
              <span className="editor-tb-btn-key">{mode.key}</span>
            </button>
          ))}
        </div>
      </div>
      <span className="menubar-divider" aria-hidden="true" />
      <div className="menubar-tools">
        <span className="editor-toolbar-label">Tools</span>
        <div className="editor-toolbar-group">
          {EDIT_TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`editor-tb-btn ${tool === t.id ? 'active' : ''}`}
              onClick={() => setTool(t.id)}
              title={`${t.label} (${t.key})`}
              aria-pressed={tool === t.id}
            >
              <span className="editor-tb-btn-label">{t.label}</span>
              <span className="editor-tb-btn-key">{t.key}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
