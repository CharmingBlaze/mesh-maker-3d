import type { MeshDocument } from './MeshDocument';
import type { BoundingBox } from '../math/BoundingBox';
import { emptyBounds, mergeBounds } from '../math/BoundingBox';

export function meshBounds(doc: MeshDocument): BoundingBox | null {
  if (doc.vertices.length === 0) return null;
  let box = emptyBounds();
  let first = true;
  for (const v of doc.vertices) {
    if (first) {
      box = { min: { ...v }, max: { ...v } };
      first = false;
    } else {
      box = mergeBounds(box, v, v);
    }
  }
  return first ? null : box;
}
