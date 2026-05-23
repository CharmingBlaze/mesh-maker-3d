import { useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { getMeshNodes } from '@/systems/scene/sceneObjectHelpers';
import { useSceneRevision } from '@/hooks/useSceneRevision';

/** Scene objects — each mesh in the level. */
export function LayersPanel() {
  useSceneRevision();
  const sceneGraph = useEditorStore((s) => s.sceneGraph);
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds);
  const activeMeshId = useEditorStore((s) => s.activeMeshId);
  const selectSceneNode = useEditorStore((s) => s.selectSceneNode);
  const setActiveMesh = useEditorStore((s) => s.setActiveMesh);
  const enterMeshEditMode = useEditorStore((s) => s.enterMeshEditMode);
  const deleteSelectedObjects = useEditorStore((s) => s.deleteSelectedObjects);
  const duplicateSelectedObjects = useEditorStore((s) => s.duplicateSelectedObjects);
  const toggleSceneNodeVisible = useEditorStore((s) => s.toggleSceneNodeVisible);
  const toggleSceneNodeLocked = useEditorStore((s) => s.toggleSceneNodeLocked);
  const renameSceneNode = useEditorStore((s) => s.renameSceneNode);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const objects = getMeshNodes(sceneGraph);
  const hasSelection = selectedNodeIds.size > 0;

  const startRename = (nodeId: string, currentName: string) => {
    setEditingId(nodeId);
    setEditName(currentName);
  };

  const commitRename = (nodeId: string) => {
    const trimmed = editName.trim();
    if (trimmed) renameSceneNode(nodeId, trimmed);
    setEditingId(null);
  };

  const cancelRename = () => setEditingId(null);

  return (
    <div className="lp-tab">
      <div className="lp-toolbar">
        <button
          type="button"
          className="lp-tool-btn"
          onClick={() => duplicateSelectedObjects()}
          disabled={!hasSelection}
          title="Duplicate selected (Ctrl+D)"
        >
          Duplicate
        </button>
        <button
          type="button"
          className="lp-tool-btn lp-tool-btn--danger"
          onClick={() => deleteSelectedObjects()}
          disabled={!hasSelection}
          title="Delete selected"
        >
          Delete
        </button>
      </div>

      <div className="lp-list" role="list">
        {objects.length === 0 ? (
          <div className="lp-empty">No objects yet — add a primitive or import a mesh.</div>
        ) : (
          objects.map((node) => {
            const selected = selectedNodeIds.has(node.id);
            const isActive = node.meshId === activeMeshId;
            return (
              <div
                key={node.id}
                role="listitem"
                className={`lp-row ${selected ? 'selected' : ''} ${isActive ? 'active-mesh' : ''}`}
                onClick={() => selectSceneNode(node.id)}
                onDoubleClick={() => {
                  if (node.meshId) {
                    setActiveMesh(node.meshId);
                    enterMeshEditMode('face');
                  }
                }}
                title="Click to select · Double-click row to edit geometry · Double-click name to rename"
              >
                <span className="lp-row-indicator" aria-hidden />
                {editingId === node.id ? (
                  <input
                    className="lp-row-name-input"
                    value={editName}
                    autoFocus
                    aria-label="Object name"
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(node.id);
                      if (e.key === 'Escape') cancelRename();
                    }}
                    onBlur={() => commitRename(node.id)}
                  />
                ) : (
                  <span
                    className="lp-row-name"
                    title="Double-click to rename"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      startRename(node.id, node.name);
                    }}
                  >
                    {node.name}
                  </span>
                )}
                <div className="lp-row-actions">
                  <button
                    type="button"
                    className={`lp-icon-btn ${node.visible ? 'on' : ''}`}
                    title={node.visible ? 'Hide in viewport' : 'Show in viewport'}
                    aria-label={node.visible ? 'Hide object' : 'Show object'}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSceneNodeVisible(node.id);
                    }}
                  >
                    {node.visible ? '◉' : '○'}
                  </button>
                  <button
                    type="button"
                    className={`lp-icon-btn ${node.locked ? 'locked' : ''}`}
                    title={node.locked ? 'Unlock object' : 'Lock object'}
                    aria-label={node.locked ? 'Unlock object' : 'Lock object'}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSceneNodeLocked(node.id);
                    }}
                  >
                    {node.locked ? 'L' : 'U'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <footer className="lp-footer">
        <span>{objects.length} object{objects.length === 1 ? '' : 's'}</span>
        {objects.length > 0 && (
          <span className="lp-footer-hint">Dbl-click to edit mesh</span>
        )}
      </footer>
    </div>
  );
}
