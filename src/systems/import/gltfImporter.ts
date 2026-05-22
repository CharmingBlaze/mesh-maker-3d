import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createMeshDocument, type MeshDocument } from '@/core/mesh/MeshDocument';
import { ensureLayerData } from '@/systems/layers/layerSystem';

const loader = new GLTFLoader();

export async function importGLTF(buffer: ArrayBuffer, name?: string): Promise<MeshDocument> {
  const gltf = await loader.parseAsync(buffer, '');

  const doc = createMeshDocument(name ?? 'Imported GLTF');
  gltf.scene.updateMatrixWorld(true);

  gltf.scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const geo = mesh.geometry as THREE.BufferGeometry;
    const posAttr = geo.getAttribute('position');
    if (!posAttr) return;

    const matrix = mesh.matrixWorld;
    const baseVertex = doc.vertices.length;
    const index = geo.getIndex();

    const pushVertex = (i: number) => {
      const v = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      v.applyMatrix4(matrix);
      doc.vertices.push({ x: v.x, y: v.y, z: v.z });
    };

    if (index) {
      for (let i = 0; i < posAttr.count; i++) pushVertex(i);
      for (let i = 0; i < index.count; i += 3) {
        const fi = doc.faces.length;
        doc.faces.push([
          baseVertex + index.getX(i),
          baseVertex + index.getX(i + 1),
          baseVertex + index.getX(i + 2),
        ]);
        doc.groups[0].faces.push(fi);
      }
    } else {
      for (let i = 0; i < posAttr.count; i += 3) {
        const v0 = doc.vertices.length;
        pushVertex(i);
        pushVertex(i + 1);
        pushVertex(i + 2);
        const fi = doc.faces.length;
        doc.faces.push([v0, v0 + 1, v0 + 2]);
        doc.groups[0].faces.push(fi);
      }
    }
  });

  ensureLayerData(doc);
  return doc;
}
