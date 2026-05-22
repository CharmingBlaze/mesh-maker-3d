import { useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { meshStats } from '@/core/mesh/MeshDocument';
import { useMeshDocument } from '@/hooks/useSceneRevision';

export function RightPanel() {
  const mesh = useMeshDocument();
  const layers = useEditorStore((s) => s.layers);
  const activeLayer = useEditorStore((s) => s.activeLayer);
  const groupSel = useEditorStore((s) => s.groupSel);
  const matSel = useEditorStore((s) => s.matSel);
  const selVerts = useEditorStore((s) => s.selVerts);
  const selEdges = useEditorStore((s) => s.selEdges);
  const selFaces = useEditorStore((s) => s.selFaces);
  const setGroupSel = useEditorStore((s) => s.setGroupSel);
  const setMatSel = useEditorStore((s) => s.setMatSel);
  const addGroup = useEditorStore((s) => s.addGroup);
  const renameGroup = useEditorStore((s) => s.renameGroup);
  const assignGroup = useEditorStore((s) => s.assignGroup);
  const deleteGroup = useEditorStore((s) => s.deleteGroup);
  const addMaterial = useEditorStore((s) => s.addMaterial);
  const editMaterial = useEditorStore((s) => s.editMaterial);
  const assignMaterial = useEditorStore((s) => s.assignMaterial);
  const addBone = useEditorStore((s) => s.addBone);
  const deleteBone = useEditorStore((s) => s.deleteBone);
  const addLayer = useEditorStore((s) => s.addLayer);
  const renameLayer = useEditorStore((s) => s.renameLayer);
  const deleteLayer = useEditorStore((s) => s.deleteLayer);
  const setActiveLayer = useEditorStore((s) => s.setActiveLayer);
  const toggleLayerVisible = useEditorStore((s) => s.toggleLayerVisible);
  const toggleLayerLocked = useEditorStore((s) => s.toggleLayerLocked);
  const assignSelectionToLayer = useEditorStore((s) => s.assignSelectionToLayer);
  const reorderLayer = useEditorStore((s) => s.reorderLayer);
  const [dragLayer, setDragLayer] = useState<number | null>(null);

  const stats = meshStats(mesh);

  return (
    <div className="right-panel">
      <div className="panel-hdr">Layers</div>
      <div className="layer-list">
        {layers.map((layer, index) => (
          <button
            key={layer.id}
            type="button"
            className={`layer-row ${index === activeLayer ? 'active' : ''} ${dragLayer === index ? 'dragging' : ''}`}
            draggable
            onClick={() => setActiveLayer(index)}
            onDoubleClick={() => renameLayer(index)}
            onDragStart={() => setDragLayer(index)}
            onDragEnd={() => setDragLayer(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (dragLayer !== null) reorderLayer(dragLayer, index);
              setDragLayer(null);
            }}
          >
            <span className="layer-grip">⋮⋮</span>
            <span className="layer-swatch" style={{ background: layer.color }} />
            <span className="layer-name">{layer.name}</span>
            <span className="layer-actions">
              <span
                className={`layer-eye ${layer.visible ? '' : 'muted'}`}
                title={layer.visible ? 'Hide layer' : 'Show layer'}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleLayerVisible(index);
                }}
              >
                {layer.visible ? '●' : '○'}
              </span>
              <span
                className={`layer-lock ${layer.locked ? 'locked' : ''}`}
                title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleLayerLocked(index);
                }}
              >
                {layer.locked ? 'L' : 'U'}
              </span>
            </span>
          </button>
        ))}
      </div>
      <div className="rp-btns">
        <button type="button" className="small-btn" title="New layer" onClick={addLayer}>
          New
        </button>
        <button type="button" className="small-btn" title="Rename layer" onClick={() => renameLayer()}>
          Rename
        </button>
        <button type="button" className="small-btn" title="Assign selection to active layer" onClick={assignSelectionToLayer}>
          Assign
        </button>
        <button type="button" className="small-btn" title="Delete layer" onClick={() => deleteLayer()}>
          Delete
        </button>
      </div>

      <div className="panel-hdr">Groups</div>
      <div className="list-box">
        {mesh.groups.map((g, i) => (
          <div
            key={i}
            className={`list-item ${i === groupSel ? 'sel' : ''}`}
            style={{ borderLeft: `3px solid ${g.color}` }}
            onClick={() => setGroupSel(i)}
          >
            {g.name} <span className="list-item-meta">{g.faces.length}f</span>
          </div>
        ))}
      </div>
      <div className="rp-btns">
        <button type="button" className="small-btn" title="New group" onClick={addGroup}>
          New
        </button>
        <button type="button" className="small-btn" title="Rename group" onClick={renameGroup}>
          Rename
        </button>
        <button type="button" className="small-btn" title="Assign to group" onClick={assignGroup}>
          Assign
        </button>
        <button type="button" className="small-btn" title="Delete group" onClick={deleteGroup}>
          Delete
        </button>
      </div>

      <div className="panel-hdr">Materials</div>
      <div className="list-box">
        {mesh.materials.map((m, i) => (
          <div
            key={i}
            className={`list-item ${i === matSel ? 'sel' : ''}`}
            style={{ borderLeft: `3px solid ${m.color}` }}
            onClick={() => setMatSel(i)}
          >
            {m.name}
          </div>
        ))}
      </div>
      <div className="rp-btns">
        <button type="button" className="small-btn" title="New material" onClick={addMaterial}>
          New
        </button>
        <button type="button" className="small-btn" title="Edit material" onClick={() => editMaterial()}>
          Edit
        </button>
        <button type="button" className="small-btn" title="Assign material" onClick={assignMaterial}>
          Assign
        </button>
      </div>

      <div className="panel-hdr">Rigging</div>
      <div className="list-box">
        {mesh.bones.map((b, i) => (
          <div key={i} className="list-item">
            {b.name}
          </div>
        ))}
      </div>
      <div className="rp-btns">
        <button type="button" className="small-btn" title="Add bone" onClick={addBone}>
          Add
        </button>
        <button type="button" className="small-btn" title="Delete bone" onClick={deleteBone}>
          Delete
        </button>
      </div>

      <div className="panel-hdr">Stats</div>
      <div className="stats-grid">
        <div className="stat-row">
          <span className="stat-lbl">Vertices</span>
          <span className="stat-val">{stats.verts}</span>
        </div>
        <div className="stat-row">
          <span className="stat-lbl">Faces</span>
          <span className="stat-val">{stats.faces}</span>
        </div>
        <div className="stat-row">
          <span className="stat-lbl">Triangles</span>
          <span className="stat-val">{stats.tris}</span>
        </div>
        <div className="stat-row">
          <span className="stat-lbl">Groups</span>
          <span className="stat-val">{stats.groups}</span>
        </div>
        <div className="stat-row">
          <span className="stat-lbl">Sel Vertices</span>
          <span className="stat-val">{selVerts.size}</span>
        </div>
        <div className="stat-row">
          <span className="stat-lbl">Sel Edges</span>
          <span className="stat-val">{selEdges.size}</span>
        </div>
        <div className="stat-row">
          <span className="stat-lbl">Sel Faces</span>
          <span className="stat-val">{selFaces.size}</span>
        </div>
      </div>

    </div>
  );
}
