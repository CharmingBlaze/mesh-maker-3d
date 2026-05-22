import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { useMeshDocument } from '@/hooks/useSceneRevision';
import { layerGeometryCounts } from '@/systems/layers/layerSystem';

/** Per-mesh vertex/face layers for the active layer scene. */
export function GeometryLayersPanel() {
  const mesh = useMeshDocument();
  const layers = useEditorStore((s) => s.layers);
  const activeLayer = useEditorStore((s) => s.activeLayer);
  const addLayer = useEditorStore((s) => s.addLayer);
  const renameLayerInline = useEditorStore((s) => s.renameLayerInline);
  const setLayerColor = useEditorStore((s) => s.setLayerColor);
  const deleteLayer = useEditorStore((s) => s.deleteLayer);
  const setActiveLayer = useEditorStore((s) => s.setActiveLayer);
  const toggleLayerVisible = useEditorStore((s) => s.toggleLayerVisible);
  const toggleLayerLocked = useEditorStore((s) => s.toggleLayerLocked);
  const assignSelectionToLayer = useEditorStore((s) => s.assignSelectionToLayer);
  const reorderLayer = useEditorStore((s) => s.reorderLayer);
  const moveLayerUp = useEditorStore((s) => s.moveLayerUp);
  const moveLayerDown = useEditorStore((s) => s.moveLayerDown);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const counts = useMemo(
    () => layers.map((layer) => layerGeometryCounts(mesh, layer.id)),
    [mesh, layers],
  );

  const startEdit = (index: number) => {
    const layer = layers[index];
    if (!layer) return;
    setEditingId(layer.id);
    setEditName(layer.name);
    setActiveLayer(index);
  };

  const commitEdit = (index: number) => {
    renameLayerInline(index, editName);
    setEditingId(null);
  };

  const cancelEdit = () => setEditingId(null);

  const resolveDropIndex = useCallback((clientY: number): number | null => {
    const list = listRef.current;
    if (!list) return null;
    const rows = list.querySelectorAll<HTMLElement>('[data-geo-layer-index]');
    if (!rows.length) return null;
    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      const idx = Number(row.dataset.geoLayerIndex);
      if (Number.isNaN(idx)) continue;
      const mid = rect.top + rect.height / 2;
      if (clientY < mid) return idx;
    }
    return layers.length - 1;
  }, [layers.length]);

  useEffect(() => {
    if (dragFrom === null) return;
    const from = dragFrom;
    const onMove = (e: PointerEvent) => setDropIndex(resolveDropIndex(e.clientY));
    const onUp = (e: PointerEvent) => {
      const to = resolveDropIndex(e.clientY);
      setDragFrom(null);
      setDropIndex(null);
      if (to !== null && to !== from) reorderLayer(from, to);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
    };
  }, [dragFrom, resolveDropIndex, reorderLayer]);

  const active = layers[activeLayer];

  return (
    <fieldset className="ms-fieldset ms-geo-layers">
      <legend>Geometry Layers</legend>
      <div className="ms-layers-toolbar">
        <button type="button" className="ms-btn ms-layer-tb-btn" onClick={addLayer} title="Add geometry layer">
          + Add
        </button>
        <button
          type="button"
          className="ms-btn ms-layer-tb-btn"
          onClick={moveLayerUp}
          disabled={activeLayer <= 0}
          title="Move layer up"
        >
          ↑
        </button>
        <button
          type="button"
          className="ms-btn ms-layer-tb-btn"
          onClick={moveLayerDown}
          disabled={activeLayer >= layers.length - 1}
          title="Move layer down"
        >
          ↓
        </button>
        <button
          type="button"
          className="ms-btn ms-layer-tb-btn"
          onClick={assignSelectionToLayer}
          title="Assign selection to active geometry layer"
        >
          Assign
        </button>
      </div>

      <div className="ms-layer-list" ref={listRef} role="list">
        {layers.length === 0 ? (
          <div className="ms-empty">No geometry layers</div>
        ) : (
          layers.map((layer, index) => (
            <div
              key={layer.id}
              data-geo-layer-index={index}
              role="listitem"
              className={`ms-layer-row ${index === activeLayer ? 'active' : ''} ${
                dropIndex === index ? 'drop-target' : ''
              } ${dragFrom === index ? 'dragging' : ''}`}
              onClick={() => setActiveLayer(index)}
              onDoubleClick={() => startEdit(index)}
            >
              <button
                type="button"
                className="ms-layer-grip"
                title="Drag to reorder"
                aria-label="Drag to reorder"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setDragFrom(index);
                  setActiveLayer(index);
                  (e.target as HTMLElement).setPointerCapture(e.pointerId);
                }}
              >
                ⋮⋮
              </button>

              <label className="ms-layer-swatch-wrap" title="Layer color" onClick={(e) => e.stopPropagation()}>
                <span className="ms-swatch" style={{ background: layer.color }} />
                <input
                  type="color"
                  className="ms-layer-color-input"
                  value={layer.color}
                  onChange={(e) => setLayerColor(index, e.target.value)}
                />
              </label>

              <div className="ms-layer-main">
                {editingId === layer.id ? (
                  <input
                    className="ms-layer-name-input"
                    value={editName}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEdit(index);
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    onBlur={() => commitEdit(index)}
                  />
                ) : (
                  <span className="ms-layer-name">{layer.name}</span>
                )}
                <span className="ms-layer-meta">
                  {counts[index].verts}v · {counts[index].faces}f
                </span>
              </div>

              <button
                type="button"
                className={`ms-layer-toggle ${layer.visible ? 'on' : ''}`}
                title={layer.visible ? 'Hide layer' : 'Show layer'}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleLayerVisible(index);
                }}
              >
                {layer.visible ? 'Vis' : '—'}
              </button>

              <button
                type="button"
                className={`ms-layer-toggle ${layer.locked ? 'locked' : ''}`}
                title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleLayerLocked(index);
                }}
              >
                {layer.locked ? 'Lck' : 'Unl'}
              </button>

              <button
                type="button"
                className="ms-layer-delete"
                title="Delete geometry layer"
                disabled={layers.length <= 1}
                onClick={(e) => {
                  e.stopPropagation();
                  if (layers.length > 1 && confirm(`Delete geometry layer "${layer.name}"?`)) {
                    deleteLayer(index);
                  }
                }}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      {active && (
        <div className="ms-layers-footer">
          <span className="ms-layers-footer-label">Active:</span> {active.name}
          <span className="ms-layers-footer-meta">
            {counts[activeLayer]?.verts ?? 0} verts · {counts[activeLayer]?.faces ?? 0} faces
          </span>
        </div>
      )}
    </fieldset>
  );
}
