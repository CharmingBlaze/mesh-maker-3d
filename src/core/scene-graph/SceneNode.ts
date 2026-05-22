import { generateId } from '../utils/id';

export type SceneNodeType = 'root' | 'group' | 'mesh' | 'bone' | 'helper';

export interface Transform {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
}

export const DEFAULT_TRANSFORM: Transform = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
};

export interface SceneNodeData {
  id: string;
  name: string;
  type: SceneNodeType;
  parentId: string | null;
  childIds: string[];
  visible: boolean;
  locked: boolean;
  transform: Transform;
  /** Mesh nodes reference mesh document id */
  meshId?: string;
  /** Group nodes may reference face-group index in mesh */
  faceGroupIndex?: number;
  boneData?: { name: string };
}

export function createSceneNode(
  partial: Partial<SceneNodeData> & Pick<SceneNodeData, 'name' | 'type'>,
): SceneNodeData {
  return {
    id: generateId(),
    parentId: null,
    childIds: [],
    visible: true,
    locked: false,
    transform: { ...DEFAULT_TRANSFORM, position: { ...DEFAULT_TRANSFORM.position } },
    ...partial,
  };
}
