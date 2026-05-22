import type { BoundingBox } from '@/core/math/BoundingBox';
import type { MeshDocument } from '@/core/mesh/MeshDocument';
import { addPrimitiveInBounds } from '@/systems/mesh/primitiveFromBounds';

export type PrimitiveType =
  | 'box'
  | 'sphere'
  | 'cylinder'
  | 'cone'
  | 'plane'
  | 'torus'
  | 'pyramid'
  | 'wedge'
  | 'capsule'
  | 'tube'
  | 'disc'
  | 'hemisphere'
  | 'stairs'
  | 'octahedron';

export const PRIMITIVE_CATALOG: { type: PrimitiveType; label: string }[] = [
  { type: 'box', label: 'Box' },
  { type: 'sphere', label: 'Sphere' },
  { type: 'cylinder', label: 'Cylinder' },
  { type: 'cone', label: 'Cone' },
  { type: 'plane', label: 'Plane' },
  { type: 'torus', label: 'Torus' },
  { type: 'pyramid', label: 'Pyramid' },
  { type: 'wedge', label: 'Wedge' },
  { type: 'capsule', label: 'Capsule' },
  { type: 'tube', label: 'Tube' },
  { type: 'disc', label: 'Disc' },
  { type: 'hemisphere', label: 'Hemisphere' },
  { type: 'stairs', label: 'Stairs' },
  { type: 'octahedron', label: 'Octahedron' },
];

const DEFAULT_BOUNDS: Record<PrimitiveType, BoundingBox> = {
  box: { min: { x: -30, y: -30, z: -30 }, max: { x: 30, y: 30, z: 30 } },
  sphere: { min: { x: -30, y: -30, z: -30 }, max: { x: 30, y: 30, z: 30 } },
  cylinder: { min: { x: -25, y: -25, z: -25 }, max: { x: 25, y: 25, z: 25 } },
  cone: { min: { x: -25, y: 0, z: -25 }, max: { x: 25, y: 60, z: 25 } },
  plane: { min: { x: -50, y: 0, z: -50 }, max: { x: 50, y: 0, z: 50 } },
  torus: { min: { x: -45, y: -10, z: -45 }, max: { x: 45, y: 10, z: 45 } },
  pyramid: { min: { x: -30, y: 0, z: -30 }, max: { x: 30, y: 50, z: 30 } },
  wedge: { min: { x: -40, y: 0, z: -20 }, max: { x: 40, y: 30, z: 40 } },
  capsule: { min: { x: -20, y: -35, z: -20 }, max: { x: 20, y: 35, z: 20 } },
  tube: { min: { x: -30, y: -25, z: -30 }, max: { x: 30, y: 25, z: 30 } },
  disc: { min: { x: -35, y: 0, z: -35 }, max: { x: 35, y: 0, z: 35 } },
  hemisphere: { min: { x: -30, y: 0, z: -30 }, max: { x: 30, y: 30, z: 30 } },
  stairs: { min: { x: -40, y: 0, z: -10 }, max: { x: 40, y: 40, z: 50 } },
  octahedron: { min: { x: -30, y: -30, z: -30 }, max: { x: 30, y: 30, z: 30 } },
};

export function addPrimitive(doc: MeshDocument, type: PrimitiveType, groupIndex: number): void {
  addPrimitiveInBounds(doc, type, DEFAULT_BOUNDS[type], groupIndex);
}

export interface PlacementSize {
  footprint: number;
  height: number;
}

/** Default snap-based size when clicking to place a primitive. */
export function defaultPlacementSize(type: PrimitiveType, snapSize: number): PlacementSize {
  const footprint = snapSize * 2;
  switch (type) {
    case 'plane':
    case 'disc':
      return { footprint, height: Math.max(snapSize * 0.25, 1) };
    case 'stairs':
      return { footprint, height: snapSize * 2 };
    case 'cone':
    case 'pyramid':
    case 'hemisphere':
      return { footprint, height: snapSize * 1.5 };
    default:
      return { footprint, height: snapSize };
  }
}
