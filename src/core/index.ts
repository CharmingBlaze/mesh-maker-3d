/** Core engine exports — scene graph, mesh, commands, events */
export { SceneGraph } from './scene-graph/SceneGraph';
export { createSceneNode, type SceneNodeData, type SceneNodeType } from './scene-graph/SceneNode';
export { createMeshDocument, cloneMeshDocument, meshStats, type MeshDocument } from './mesh/MeshDocument';
export { CommandHistory } from './commands/CommandHistory';
export { SnapshotCommand, type Command, type EditorSnapshot } from './commands/Command';
export { editorEvents } from './events/EventBus';
