import { useEditorStore } from '@/store/editorStore';
import { getMeshNodes } from '@/systems/scene/sceneObjectHelpers';
import { useSceneRevision } from '@/hooks/useSceneRevision';

/** Layer scenes — placed objects in the level (formerly the Scene outliner). */
export function LayersPanel() {
  useSceneRevision();
  const sceneGraph = useEditorStore((s) => s.sceneGraph);
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds);
  const activeMeshId = useEditorStore((s) => s.activeMeshId);
  const selectSceneNode = useEditorStore((s) => s.selectSceneNode);
  const setActiveMesh = useEditorStore((s) => s.setActiveMesh);
  const deleteSelectedObjects = useEditorStore((s) => s.deleteSelectedObjects);
  const duplicateSelectedObjects = useEditorStore((s) => s.duplicateSelectedObjects);
  const toggleSceneNodeVisible = useEditorStore((s) => s.toggleSceneNodeVisible);
  const toggleSceneNodeLocked = useEditorStore((s) => s.toggleSceneNodeLocked);
  const renameSceneNode = useEditorStore((s) => s.renameSceneNode);
  const showModal = useEditorStore((s) => s.showModal);

  const layerScenes = getMeshNodes(sceneGraph);

  const handleRename = (nodeId: string, currentName: string) => {
    showModal({
      title: 'Rename Layer Scene',
      fields: [{ id: 'name', label: 'Name', type: 'text', value: currentName }],
      onConfirm: (vals) => renameSceneNode(nodeId, vals.name),
    });
  };

  return (
    <div className="ms-layers-tab">
      <div className="ms-layers-toolbar">
        <button
          type="button"
          className="ms-btn ms-layer-tb-btn"
          onClick={() => duplicateSelectedObjects()}
          disabled={selectedNodeIds.size === 0}
          title="Duplicate selected layer scenes (Ctrl+D)"
        >
          Duplicate
        </button>
        <button
          type="button"
          className="ms-btn ms-layer-tb-btn"
          onClick={() => deleteSelectedObjects()}
          disabled={selectedNodeIds.size === 0}
          title="Delete selected layer scenes"
        >
          Delete
        </button>
      </div>

      <div className="ms-layer-list" role="list">
        {layerScenes.length === 0 ? (
          <div className="ms-empty">No layer scenes — draw a shape to add one</div>
        ) : (
          layerScenes.map((node) => {
            const selected = selectedNodeIds.has(node.id);
            const isActive = node.meshId === activeMeshId;
            return (
              <div
                key={node.id}
                role="listitem"
                className={`ms-layer-row ms-layer-scene-row ${selected ? 'active' : ''} ${isActive ? 'editing' : ''}`}
                onClick={() => selectSceneNode(node.id)}
                onDoubleClick={() => node.meshId && setActiveMesh(node.meshId)}
                title="Click to select · Double-click to edit mesh"
              >
                <div className="ms-layer-main">
                  <span className="ms-layer-name" title={node.name}>
                    {node.name}
                  </span>
                  {isActive && <span className="ms-layer-badge">Editing mesh</span>}
                </div>

                <div className="ms-layer-actions">
                  <button
                    type="button"
                    className={`ms-layer-toggle ${node.visible ? 'on' : ''}`}
                    title={node.visible ? 'Hide layer scene' : 'Show layer scene'}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSceneNodeVisible(node.id);
                    }}
                  >
                    {node.visible ? 'Vis' : 'Off'}
                  </button>

                  <button
                    type="button"
                    className={`ms-layer-toggle ${node.locked ? 'locked' : ''}`}
                    title={node.locked ? 'Unlock layer scene' : 'Lock layer scene'}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSceneNodeLocked(node.id);
                    }}
                  >
                    {node.locked ? 'Lck' : 'Unl'}
                  </button>

                  <button
                    type="button"
                    className="ms-layer-rename"
                    title="Rename layer scene"
                    aria-label="Rename layer scene"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRename(node.id, node.name);
                    }}
                  >
                    ✎
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="ms-layers-footer">
        <span className="ms-layers-footer-label">Layer scenes:</span> {layerScenes.length}
        <span className="ms-layers-hint">
          Draw shapes to add layer scenes. Object mode (1) selects whole layer scenes for move/rotate/scale.
        </span>
      </div>
    </div>
  );
}
