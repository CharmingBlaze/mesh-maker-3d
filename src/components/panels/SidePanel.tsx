import { useState } from 'react';
import { useEditorStore, type FaceDrawMode, type ToolId } from '@/store/editorStore';
import { meshStats } from '@/core/mesh/MeshDocument';
import { PRIMITIVE_CATALOG } from '@/systems/mesh/primitives';
import { LayersPanel } from '@/components/panels/LayersPanel';
import { GeometryLayersPanel } from '@/components/panels/GeometryLayersPanel';
import { SnapGridSection } from './SnapGridSection';
import { MaterialsTab } from './MaterialsTab';
import { useMeshDocument } from '@/hooks/useSceneRevision';

type SideTab = 'model' | 'layers' | 'groups' | 'materials' | 'joints';

const TOOLS: { id: ToolId; label: string }[] = [
  { id: 'select', label: 'Select' },
  { id: 'move', label: 'Move' },
  { id: 'rotate', label: 'Rotate' },
  { id: 'scale', label: 'Scale' },
  { id: 'extrude', label: 'Extrude' },
  { id: 'bevel', label: 'Bevel' },
  { id: 'inset', label: 'Inset' },
  { id: 'vertex', label: 'Vertex' },
  { id: 'face', label: 'Face' },
];

const FACE_DRAW_MODES: { id: FaceDrawMode; label: string; title: string }[] = [
  { id: 'none', label: 'None', title: 'Place vertices only; fill faces later with the Face tool' },
  { id: 'tri', label: 'Tris', title: 'Auto-fill a triangle every 3 vertices' },
  { id: 'quad', label: 'Quads', title: 'Auto-fill a quad every 4 vertices' },
];

function SidePanel() {
  const [tab, setTab] = useState<SideTab>('model');

  return (
    <div className="side-panel">
      <div className="ms-tabs">
        {(
          [
            ['model', 'Model'],
            ['layers', 'Layers'],
            ['groups', 'Groups'],
            ['materials', 'Mats'],
            ['joints', 'Joints'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`ms-tab ${tab === id ? 'active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="ms-tab-body">
        {tab === 'layers' && <LayersPanel />}
        {tab === 'model' && <ModelTab />}
        {tab === 'groups' && <GroupsTab />}
        {tab === 'materials' && <MaterialsTab />}
        {tab === 'joints' && <JointsTab />}
      </div>
    </div>
  );
}

function ModelTab() {
  const tool = useEditorStore((s) => s.tool);
  const faceDrawMode = useEditorStore((s) => s.faceDrawMode);
  const setTool = useEditorStore((s) => s.setTool);
  const setSelectionMode = useEditorStore((s) => s.setSelectionMode);
  const selectionMode = useEditorStore((s) => s.selectionMode);
  const setFaceDrawMode = useEditorStore((s) => s.setFaceDrawMode);
  const fillHoleDoubleSided = useEditorStore((s) => s.fillHoleDoubleSided);
  const setFillHoleDoubleSided = useEditorStore((s) => s.setFillHoleDoubleSided);
  const primDraw = useEditorStore((s) => s.primDraw);
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
    <>
      <fieldset className="ms-fieldset">
        <legend>Tools</legend>
        <div className="ms-tool-grid">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`ms-btn ms-tool-btn ${
                t.id === 'face'
                  ? selectionMode === 'face'
                    ? 'active'
                    : ''
                  : tool === t.id
                    ? 'active'
                    : ''
              }`}
              onClick={() => {
                if (t.id === 'face') setSelectionMode('face');
                else setTool(t.id);
              }}
              title={t.id === 'face' ? 'Face selection mode (key 4)' : undefined}
            >
              {t.id === 'face' ? 'Face Sel' : t.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="ms-fieldset">
        <legend>Shapes</legend>
        <div className="ms-shape-grid">
          {PRIMITIVE_CATALOG.map((p) => (
            <button
              key={p.type}
              type="button"
              className={`ms-btn ms-shape-btn ${primDraw?.type === p.type ? 'active' : ''}`}
              onClick={() => (primDraw?.type === p.type ? cancelPrimDraw() : startPrimDraw(p.type))}
              title={`Draw ${p.type}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {primDraw && (
          <div className="ms-help-line">
            Click viewport to place · drag for custom size
          </div>
        )}
      </fieldset>

      <fieldset className="ms-fieldset">
        <legend>Face Fill</legend>
        <div className="ms-segment-row">
          {FACE_DRAW_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={`ms-btn ms-segment-btn ${faceDrawMode === mode.id ? 'active' : ''}`}
              title={mode.title}
              onClick={() => setFaceDrawMode(mode.id)}
            >
              {mode.label}
            </button>
          ))}
        </div>
        <div className="ms-help-line">
          {faceDrawMode === 'none'
            ? 'Vertex tool creates points only. Face tool can close polygons later.'
            : faceDrawMode === 'tri'
              ? 'Every 3 picked vertices becomes one triangle.'
              : 'Every 4 picked vertices becomes one quad.'}
        </div>
        <label className="ms-check-row ms-fill-hole-opt">
          <input
            type="checkbox"
            checked={fillHoleDoubleSided}
            onChange={(e) => setFillHoleDoubleSided(e.target.checked)}
          />
          Double-sided (front + back face on fill)
        </label>
        <div className="ms-btn-row">
          <button
            type="button"
            className="ms-btn"
            onClick={fillHole}
            title="Create a face across a hole (select boundary vertices or edges first)"
          >
            Fill Hole
          </button>
        </div>
        <div className="ms-help-line">
          Select vertices around a gap, enable double-sided if needed, then Fill Hole.
        </div>
      </fieldset>

      <fieldset className="ms-fieldset">
        <legend>Mesh</legend>
        <div className="ms-btn-row">
          <button
            type="button"
            className="ms-btn"
            onClick={flipNormals}
            title="Reverse selected face winding (Shift+N). No selection = all faces."
          >
            Flip Normals
          </button>
        </div>
      </fieldset>

      <fieldset className="ms-fieldset">
        <legend>Transform</legend>
        <div className="ms-form-row">
          <label>X</label>
          <input type="number" value={tx} step={5} onChange={(e) => setTx(+e.target.value)} />
        </div>
        <div className="ms-form-row">
          <label>Y</label>
          <input type="number" value={ty} step={5} onChange={(e) => setTy(+e.target.value)} />
        </div>
        <div className="ms-form-row">
          <label>Z</label>
          <input type="number" value={tz} step={5} onChange={(e) => setTz(+e.target.value)} />
        </div>
        <div className="ms-btn-row">
          <button type="button" className="ms-btn" onClick={() => applyMove(tx, ty, tz)}>
            Move
          </button>
          <button type="button" className="ms-btn" onClick={() => applyRotate(tx, ty, tz)}>
            Rotate
          </button>
          <button type="button" className="ms-btn" onClick={() => applyScale(tx || 1, ty || 1, tz || 1)}>
            Scale
          </button>
          <button type="button" className="ms-btn" onClick={updateTransformFromSelection}>
            Read
          </button>
        </div>
      </fieldset>

      <fieldset className="ms-fieldset">
        <legend>Display</legend>
        <div className="ms-check-row">
          <label>
            <input type="checkbox" checked={wireframe} onChange={toggleWireframe} />
            Wireframe
          </label>
          <label>
            <input type="checkbox" checked={flatShading} onChange={toggleFlat} />
            Flat shaded
          </label>
        </div>
        <div className="ms-btn-row">
          <button type="button" className="ms-btn" onClick={frameAll}>
            Frame All
          </button>
        </div>
      </fieldset>

      <SnapGridSection />

      <GeometryLayersPanel />

      <div className="ms-stats-line">
        Verts: {stats.verts} · Faces: {stats.faces} · Tris: {stats.tris}
      </div>
    </>
  );
}

function GroupsTab() {
  const mesh = useMeshDocument();
  const groupSel = useEditorStore((s) => s.groupSel);
  const setGroupSel = useEditorStore((s) => s.setGroupSel);
  const addGroup = useEditorStore((s) => s.addGroup);
  const renameGroup = useEditorStore((s) => s.renameGroup);
  const assignGroup = useEditorStore((s) => s.assignGroup);
  const deleteGroup = useEditorStore((s) => s.deleteGroup);

  return (
    <>
      <fieldset className="ms-fieldset">
        <legend>Groups</legend>
        <div className="ms-list">
          {mesh.groups.map((g, i) => (
            <button
              key={i}
              type="button"
              className={`ms-list-item ${i === groupSel ? 'sel' : ''}`}
              onClick={() => setGroupSel(i)}
            >
              <span className="ms-swatch" style={{ background: g.color }} />
              <span className="ms-list-label">
                {g.name} ({g.faces.length})
              </span>
            </button>
          ))}
        </div>
        <div className="ms-btn-row">
          <button type="button" className="ms-btn" onClick={addGroup}>
            New
          </button>
          <button type="button" className="ms-btn" onClick={renameGroup}>
            Rename
          </button>
          <button type="button" className="ms-btn" onClick={assignGroup}>
            Assign
          </button>
          <button type="button" className="ms-btn" onClick={deleteGroup}>
            Delete
          </button>
        </div>
      </fieldset>
    </>
  );
}

function JointsTab() {
  const mesh = useMeshDocument();
  const addBone = useEditorStore((s) => s.addBone);
  const deleteBone = useEditorStore((s) => s.deleteBone);

  return (
    <fieldset className="ms-fieldset">
      <legend>Joints</legend>
      <div className="ms-list">
        {mesh.bones.map((b, i) => (
          <div key={i} className="ms-list-item">
            <span className="ms-list-label">{b.name}</span>
          </div>
        ))}
      </div>
      <div className="ms-btn-row">
        <button type="button" className="ms-btn" onClick={addBone}>
          Add
        </button>
        <button type="button" className="ms-btn" onClick={deleteBone}>
          Delete
        </button>
      </div>
    </fieldset>
  );
}

export { SidePanel };
export default SidePanel;
