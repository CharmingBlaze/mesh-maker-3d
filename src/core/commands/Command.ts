import type { SceneGraph } from '../scene-graph/SceneGraph';
import type { MeshesRecord } from '@/systems/scene/sceneObjectHelpers';

export interface EditorSnapshot {
  meshes: MeshesRecord;
  activeMeshId: string;
  selectedNodeIds: string[];
  sceneGraph: ReturnType<SceneGraph['toJSON']>;
}

export interface Command {
  readonly name: string;
  execute(): void;
  undo(): void;
}

export class SnapshotCommand implements Command {
  readonly name: string;
  private before: EditorSnapshot;
  private after: EditorSnapshot;
  private apply: (s: EditorSnapshot) => void;

  constructor(
    name: string,
    before: EditorSnapshot,
    after: EditorSnapshot,
    apply: (s: EditorSnapshot) => void,
  ) {
    this.name = name;
    this.before = before;
    this.after = after;
    this.apply = apply;
  }

  execute(): void {
    this.apply(this.after);
  }

  undo(): void {
    this.apply(this.before);
  }
}
