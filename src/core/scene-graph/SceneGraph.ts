import { createSceneNode, type SceneNodeData } from './SceneNode';
import { generateId } from '../utils/id';

/**
 * Hierarchical scene graph for organizing mesh objects, groups, bones, and helpers.
 * Designed for future multi-object scenes, parenting, and instancing.
 */
export class SceneGraph {
  readonly rootId: string;
  private nodes = new Map<string, SceneNodeData>();

  constructor() {
    const root = createSceneNode({ name: 'Scene', type: 'root' });
    this.nodes.set(root.id, root);
    this.rootId = root.id;
  }

  getNode(id: string): SceneNodeData | undefined {
    return this.nodes.get(id);
  }

  getAllNodes(): SceneNodeData[] {
    return [...this.nodes.values()];
  }

  getChildren(parentId: string): SceneNodeData[] {
    const parent = this.nodes.get(parentId);
    if (!parent) return [];
    return parent.childIds
      .map((id) => this.nodes.get(id))
      .filter((n): n is SceneNodeData => n !== undefined);
  }

  addNode(node: SceneNodeData, parentId: string = this.rootId): SceneNodeData {
    const parent = this.nodes.get(parentId);
    if (!parent) throw new Error(`Parent ${parentId} not found`);
    node.parentId = parentId;
    this.nodes.set(node.id, node);
    parent.childIds.push(node.id);
    return node;
  }

  removeNode(id: string): void {
    const node = this.nodes.get(id);
    if (!node || id === this.rootId) return;
    node.childIds.forEach((cid) => this.removeNode(cid));
    if (node.parentId) {
      const parent = this.nodes.get(node.parentId);
      if (parent) parent.childIds = parent.childIds.filter((c) => c !== id);
    }
    this.nodes.delete(id);
  }

  /** Register primary editable mesh in the scene graph */
  ensureMeshNode(meshId: string, name = 'Mesh'): SceneNodeData {
    const existing = this.getAllNodes().find((n) => n.type === 'mesh' && n.meshId === meshId);
    if (existing) return existing;
    const meshNode = createSceneNode({ name, type: 'mesh', meshId });
    return this.addNode(meshNode);
  }

  addBoneNode(name: string): SceneNodeData {
    const bone = createSceneNode({
      name,
      type: 'bone',
      boneData: { name },
    });
    return this.addNode(bone);
  }

  traverse(callback: (node: SceneNodeData, depth: number) => void, startId = this.rootId, depth = 0): void {
    const node = this.nodes.get(startId);
    if (!node) return;
    callback(node, depth);
    node.childIds.forEach((cid) => this.traverse(callback, cid, depth + 1));
  }

  clone(): SceneGraph {
    const g = new SceneGraph();
    g.nodes.clear();
    const idMap = new Map<string, string>();
    this.traverse((node) => {
      const newId = node.id === this.rootId ? g.rootId : generateId(node.type);
      idMap.set(node.id, newId);
      const copy = { ...node, id: newId, childIds: [], parentId: null };
      g.nodes.set(newId, copy);
    });
    this.traverse((node) => {
      const newId = idMap.get(node.id)!;
      const copy = g.nodes.get(newId)!;
      if (node.parentId) {
        copy.parentId = idMap.get(node.parentId) ?? null;
        const parent = g.nodes.get(copy.parentId!);
        if (parent) parent.childIds.push(newId);
      }
      copy.childIds = node.childIds.map((c) => idMap.get(c)!);
    });
    return g;
  }

  toJSON(): { nodes: SceneNodeData[]; rootId: string } {
    return { nodes: this.getAllNodes(), rootId: this.rootId };
  }

  static fromJSON(data: { nodes: SceneNodeData[]; rootId: string }): SceneGraph {
    const g = new SceneGraph();
    g.nodes.clear();
    data.nodes.forEach((n) => g.nodes.set(n.id, { ...n, childIds: [...n.childIds] }));
    (g as { rootId: string }).rootId = data.rootId;
    return g;
  }
}
