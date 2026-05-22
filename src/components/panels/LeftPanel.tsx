import { useState } from 'react';
import { useEditorStore, type ToolId } from '@/store/editorStore';
import { useMeshDocument } from '@/hooks/useSceneRevision';
import { PRIMITIVE_CATALOG } from '@/systems/mesh/primitives';
import type { SelectionMode } from '@/systems/selection/selectionSystem';

const TOOLS: { id: ToolId; icon: string; label: string; short: string }[] = [
  { id: 'select', icon: '↖', label: 'Select', short: 'Select' },
  { id: 'move', icon: '✥', label: 'Move', short: 'Move' },
  { id: 'rotate', icon: '↻', label: 'Rotate', short: 'Rotate' },
  { id: 'scale', icon: '⇲', label: 'Scale', short: 'Scale' },
  { id: 'vertex', icon: '+', label: 'Add vertex', short: 'Vertex' },
  { id: 'face', icon: '▣', label: 'Make face', short: 'Face' },
];

const MODES: { id: SelectionMode; icon: string; label: string }[] = [
  { id: 'object', icon: 'Object', label: 'Object' },
  { id: 'vertex', icon: 'Vertex', label: 'Vertex' },
  { id: 'edge', icon: 'Edge', label: 'Edge' },
  { id: 'face', icon: 'Face', label: 'Face' },
];

export function LeftPanel() {
  const tool = useEditorStore((s) => s.tool);
  const selectionMode = useEditorStore((s) => s.selectionMode);
  const setTool = useEditorStore((s) => s.setTool);
  const setSelectionMode = useEditorStore((s) => s.setSelectionMode);
  const primDraw = useEditorStore((s) => s.primDraw);
  const startPrimDraw = useEditorStore((s) => s.startPrimDraw);
  const cancelPrimDraw = useEditorStore((s) => s.cancelPrimDraw);
  const snapSize = useEditorStore((s) => s.snapSize);
  const snapEnabled = useEditorStore((s) => s.snapEnabled);
  const setSnapSize = useEditorStore((s) => s.setSnapSize);
  const setSnapEnabled = useEditorStore((s) => s.setSnapEnabled);
  const wireframe = useEditorStore((s) => s.wireframe);
  const flatShading = useEditorStore((s) => s.flatShading);
  const toggleWireframe = useEditorStore((s) => s.toggleWireframe);
  const toggleFlat = useEditorStore((s) => s.toggleFlat);
  const frameAll = useEditorStore((s) => s.frameAll);
  const applyMove = useEditorStore((s) => s.applyMove);
  const applyRotate = useEditorStore((s) => s.applyRotate);
  const applyScale = useEditorStore((s) => s.applyScale);
  const selectedTransformVerts = useEditorStore((s) => s.selectedTransformVerts);
  const mesh = useMeshDocument();

  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [tz, setTz] = useState(0);

  const updateTransformFromSelection = () => {
    const selectedVerts = selectedTransformVerts();
    if (selectedVerts.size > 0) {
      const arr = [...selectedVerts].map((i) => mesh.vertices[i]);
      setTx(Math.round(arr.reduce((s, v) => s + v.x, 0) / arr.length));
      setTy(Math.round(arr.reduce((s, v) => s + v.y, 0) / arr.length));
      setTz(Math.round(arr.reduce((s, v) => s + v.z, 0) / arr.length));
    }
  };

  return (
    <div className="left-panel">
      <div className="panel-hdr">Selection Mode</div>
      <div className="mode-group">
        {MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            className={`mode-btn ${selectionMode === mode.id ? 'active' : ''}`}
            onClick={() => setSelectionMode(mode.id)}
            title={mode.label}
          >
            {mode.icon}
          </button>
        ))}
      </div>

      <div className="panel-hdr">Tools</div>
      <div className="tool-group">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tool-btn ${tool === t.id ? 'active' : ''}`}
            onClick={() => setTool(t.id)}
            title={t.label}
          >
            <span className="tool-icon">{t.icon}</span>
            <span className="tool-caption">{t.short}</span>
          </button>
        ))}
      </div>

      <div className="panel-hdr">Primitives</div>
      <div className="prim-group">
        {PRIMITIVE_CATALOG.map((p) => (
          <button
            key={p.type}
            type="button"
            className={`prim-btn ${primDraw?.type === p.type ? 'active' : ''}`}
            onClick={() => (primDraw?.type === p.type ? cancelPrimDraw() : startPrimDraw(p.type))}
            title={`Draw ${p.type}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="panel-hdr">Transform</div>
      <div className="props-block">
        <div className="prop-row">
          <span className="prop-lbl">X</span>
          <input type="number" value={tx} step={5} onChange={(e) => setTx(+e.target.value)} />
        </div>
        <div className="prop-row">
          <span className="prop-lbl">Y</span>
          <input type="number" value={ty} step={5} onChange={(e) => setTy(+e.target.value)} />
        </div>
        <div className="prop-row">
          <span className="prop-lbl">Z</span>
          <input type="number" value={tz} step={5} onChange={(e) => setTz(+e.target.value)} />
        </div>
        <div className="small-btn-row" style={{ marginTop: 4 }}>
          <button type="button" className="small-btn" onClick={() => applyMove(tx, ty, tz)}>
            Move
          </button>
          <button type="button" className="small-btn" onClick={() => applyRotate(tx, ty, tz)}>
            Rot
          </button>
          <button type="button" className="small-btn" onClick={() => applyScale(tx || 1, ty || 1, tz || 1)}>
            Scale
          </button>
          <button type="button" className="small-btn" onClick={updateTransformFromSelection}>
            Sel
          </button>
        </div>
      </div>

      <div className="panel-hdr">Snap</div>
      <div className="props-block">
        <div className="prop-row">
          <span className="prop-lbl">Size</span>
          <input
            type="range"
            min={1}
            max={20}
            value={snapSize}
            onChange={(e) => setSnapSize(parseInt(e.target.value, 10))}
          />
          <span className="prop-val">{snapSize}</span>
        </div>
        <div className="check-row">
          <input
            type="checkbox"
            id="snap-enabled"
            checked={snapEnabled}
            onChange={(e) => setSnapEnabled(e.target.checked)}
          />
          <label className="check-label" htmlFor="snap-enabled">
            Snap
          </label>
        </div>
      </div>

      <div className="panel-hdr">Viewport</div>
      <div className="props-block">
        <div className="small-btn-row">
          <button type="button" className={`small-btn ${wireframe ? 'active' : ''}`} onClick={toggleWireframe}>
            Wire
          </button>
          <button type="button" className={`small-btn ${flatShading ? 'active' : ''}`} onClick={toggleFlat}>
            Flat
          </button>
          <button type="button" className="small-btn" onClick={frameAll}>
            Frame
          </button>
        </div>
      </div>
    </div>
  );
}
