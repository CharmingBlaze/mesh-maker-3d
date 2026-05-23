import { useState } from 'react';
import { useEditorStore, type ComponentSelectionMode, type FaceDrawMode, type ToolId } from '@/store/editorStore';
import { meshStats } from '@/core/mesh/MeshDocument';
import { PRIMITIVE_CATALOG } from '@/systems/mesh/primitives';
import { GeometryLayersPanel } from '@/components/panels/GeometryLayersPanel';
import {
  PanelGroupLabel,
  PanelHint,
  PanelPillRow,
  PanelSection,
  PanelToggle,
  TransformFields,
} from '@/components/panels/panelUi';
import { SnapGridSection } from './SnapGridSection';
import { useMeshDocument } from '@/hooks/useSceneRevision';

type SideTab = 'model' | 'layers';

const SELECTION_MODES: { id: ComponentSelectionMode | 'object'; label: string; key: string }[] = [
  { id: 'object', label: 'Object', key: '1' },
  { id: 'vertex', label: 'Vertex', key: '2' },
  { id: 'edge', label: 'Edge', key: '3' },
  { id: 'face', label: 'Face', key: '4' },
];

const TRANSFORM_TOOLS: { id: ToolId; label: string; key: string }[] = [
  { id: 'select', label: 'Select', key: 'S' },
  { id: 'move', label: 'Move', key: 'M' },
  { id: 'rotate', label: 'Rotate', key: 'G' },
  { id: 'scale', label: 'Scale', key: 'C' },
];

const MESH_TOOLS: { id: ToolId; label: string; key: string }[] = [
  { id: 'extrude', label: 'Extrude', key: 'E' },
  { id: 'bevel', label: 'Bevel', key: 'B' },
  { id: 'inset', label: 'Inset', key: 'J' },
  { id: 'knife', label: 'Knife', key: 'K' },
  { id: 'vertex', label: 'Vertex', key: 'V' },
  { id: 'face', label: 'Face', key: 'F' },
];

const FACE_DRAW_MODES: { id: FaceDrawMode; label: string; title?: string }[] = [
  { id: 'none', label: 'Off', title: 'Vertices only — fill faces manually' },
  { id: 'tri', label: 'Tris', title: 'Auto triangle every 3 verts' },
  { id: 'quad', label: 'Quads', title: 'Auto quad every 4 verts' },
];

function SidePanel() {
  const [tab, setTab] = useState<SideTab>('model');

  return (
    <aside className="side-panel studio-panel" aria-label="Model properties">
      <div className="sp-tabs">
        {(
          [
            ['model', 'Model'],
            ['layers', 'Geo Layers'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`sp-tab ${tab === id ? 'active' : ''}`}
            onClick={() => setTab(id)}
            aria-selected={tab === id}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="sp-tab-body">
        {tab === 'model' ? <ModelTab /> : <GeometryLayersPanel tabView />}
      </div>
    </aside>
  );
}

function ToolGrid({
  tools,
  activeTool,
  onPick,
}: {
  tools: { id: ToolId; label: string; key: string }[];
  activeTool: ToolId;
  onPick: (id: ToolId) => void;
}) {
  return (
    <div className="sp-tool-grid">
      {tools.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`sp-tool-btn ${activeTool === t.id ? 'active' : ''}`}
          title={`${t.label} (${t.key})`}
          onClick={() => onPick(t.id)}
        >
          <span className="sp-tool-label">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

function ModelTab() {
  const tool = useEditorStore((s) => s.tool);
  const faceDrawMode = useEditorStore((s) => s.faceDrawMode);
  const setTool = useEditorStore((s) => s.setTool);
  const activateKnifeTool = useEditorStore((s) => s.activateKnifeTool);
  const setSelectionMode = useEditorStore((s) => s.setSelectionMode);
  const enterMeshEditMode = useEditorStore((s) => s.enterMeshEditMode);
  const selectionMode = useEditorStore((s) => s.selectionMode);
  const setFaceDrawMode = useEditorStore((s) => s.setFaceDrawMode);
  const fillHoleDoubleSided = useEditorStore((s) => s.fillHoleDoubleSided);
  const setFillHoleDoubleSided = useEditorStore((s) => s.setFillHoleDoubleSided);
  const primDraw = useEditorStore((s) => s.primDraw);
  const primChainPlace = useEditorStore((s) => s.primChainPlace);
  const setPrimChainPlace = useEditorStore((s) => s.setPrimChainPlace);
  const startPrimDraw = useEditorStore((s) => s.startPrimDraw);
  const cancelPrimDraw = useEditorStore((s) => s.cancelPrimDraw);
  const wireframe = useEditorStore((s) => s.wireframe);
  const flatShading = useEditorStore((s) => s.flatShading);
  const toggleWireframe = useEditorStore((s) => s.toggleWireframe);
  const toggleFlat = useEditorStore((s) => s.toggleFlat);
  const frameAll = useEditorStore((s) => s.frameAll);
  const applyMove = useEditorStore((s) => s.applyMove);
  const applyRotate = useEditorStore((s) => s.applyRotate);
  const applyScale = useEditorStore((s) => s.applyScale);
  const fillHole = useEditorStore((s) => s.fillHole);
  const flipNormals = useEditorStore((s) => s.flipNormals);
  const selectedTransformVerts = useEditorStore((s) => s.selectedTransformVerts);
  const mesh = useMeshDocument();
  const stats = meshStats(mesh);

  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [tz, setTz] = useState(0);

  const readSelectionPivot = () => {
    if (!mesh.vertices.length) return;
    const selectedVerts = selectedTransformVerts();
    if (selectedVerts.size === 0) return;
    const arr = [...selectedVerts].map((i) => mesh.vertices[i]);
    setTx(Math.round(arr.reduce((s, v) => s + v.x, 0) / arr.length));
    setTy(Math.round(arr.reduce((s, v) => s + v.y, 0) / arr.length));
    setTz(Math.round(arr.reduce((s, v) => s + v.z, 0) / arr.length));
  };

  return (
    <div className="sp-model-shell">
      <div className="sp-model-scroll">
        <PanelSection title="Modeling">
          <PanelGroupLabel>Selection · Tab toggles Object/Edit</PanelGroupLabel>
          <div className="sp-mode-grid">
            {SELECTION_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={`sp-mode-btn ${selectionMode === mode.id ? 'active' : ''}`}
                title={`${mode.label} (${mode.key})`}
                onClick={() => {
                  if (mode.id === 'object') {
                    setSelectionMode('object');
                  } else if (selectionMode === 'object') {
                    enterMeshEditMode(mode.id);
                  } else {
                    setSelectionMode(mode.id);
                  }
                }}
              >
                <span className="sp-mode-btn-label">{mode.label}</span>
              </button>
            ))}
          </div>

          <PanelGroupLabel>Transform tools</PanelGroupLabel>
          <ToolGrid tools={TRANSFORM_TOOLS} activeTool={tool} onPick={setTool} />

          <PanelGroupLabel>Mesh tools</PanelGroupLabel>
          <ToolGrid
            tools={MESH_TOOLS}
            activeTool={tool}
            onPick={(id) => (id === 'knife' ? activateKnifeTool() : setTool(id))}
          />
        </PanelSection>

        <PanelSection title="Mesh editing">
          <PanelGroupLabel>Auto face fill (vertex tool)</PanelGroupLabel>
          <PanelPillRow options={FACE_DRAW_MODES} value={faceDrawMode} onChange={setFaceDrawMode} />
          <PanelToggle
            checked={fillHoleDoubleSided}
            onChange={setFillHoleDoubleSided}
            label="Double-sided fill hole"
            title="Adds front and back faces when filling holes"
          />
          <div className="sp-action-row">
            <button type="button" className="sp-action-btn sp-action-btn--primary" onClick={fillHole} title="Fill hole (Alt+H)">
              Fill hole
            </button>
            <button type="button" className="sp-action-btn" onClick={flipNormals} title="Flip normals (Shift+N)">
              Flip normals
            </button>
          </div>
        </PanelSection>

        <PanelSection title="Primitives" defaultOpen>
          <div className="sp-prim-grid">
            {PRIMITIVE_CATALOG.map((p) => (
              <button
                key={p.type}
                type="button"
                className={`sp-prim-btn ${primDraw?.type === p.type ? 'active' : ''}`}
                onClick={() => (primDraw?.type === p.type ? cancelPrimDraw() : startPrimDraw(p.type))}
                title={p.label}
              >
                {p.label}
              </button>
            ))}
          </div>
          {primDraw ? (
            <PanelToggle
              checked={primChainPlace}
              onChange={setPrimChainPlace}
              label="Keep tool active after place"
            />
          ) : (
            <PanelHint>Click a shape, drag in the viewport to draw. Uses Object mode, then Edit.</PanelHint>
          )}
        </PanelSection>

        <PanelSection title="Transform values" defaultOpen={false}>
          <TransformFields x={tx} y={ty} z={tz} onX={setTx} onY={setTy} onZ={setTz} />
          <div className="sp-chip-row">
            <button type="button" className="sp-chip" onClick={() => applyMove(tx, ty, tz)}>
              Apply move
            </button>
            <button type="button" className="sp-chip" onClick={() => applyRotate(tx, ty, tz)}>
              Apply rotate
            </button>
            <button type="button" className="sp-chip" onClick={() => applyScale(tx || 1, ty || 1, tz || 1)}>
              Apply scale
            </button>
            <button type="button" className="sp-chip sp-chip--muted" onClick={readSelectionPivot} title="Read pivot from selection">
              From selection
            </button>
          </div>
        </PanelSection>

        <PanelSection title="View & grid" defaultOpen={false}>
          <PanelGroupLabel>Display</PanelGroupLabel>
          <div className="sp-chip-row">
            <button
              type="button"
              className={`sp-chip ${wireframe ? 'active' : ''}`}
              onClick={toggleWireframe}
              title="Wireframe (W)"
            >
              Wireframe
            </button>
            <button
              type="button"
              className={`sp-chip ${flatShading ? 'active' : ''}`}
              onClick={toggleFlat}
              title="Flat shading"
            >
              Flat shade
            </button>
            <button type="button" className="sp-chip" onClick={frameAll} title="Frame all (Shift+F)">
              Frame all
            </button>
          </div>
          <PanelGroupLabel>Grid & snap</PanelGroupLabel>
          <SnapGridSection embedded />
        </PanelSection>
      </div>

      <footer className="sp-stats-footer">
        <span>{stats.verts} verts</span>
        <span className="sp-stats-sep">·</span>
        <span>{stats.faces} faces</span>
        <span className="sp-stats-sep">·</span>
        <span>{stats.tris} tris</span>
      </footer>
    </div>
  );
}

export { SidePanel };
export default SidePanel;
