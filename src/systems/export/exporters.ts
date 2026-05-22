import type { MeshDocument } from '@/core/mesh/MeshDocument';
import { downloadText } from '@/systems/io/fileAccess';

export function exportOBJ(doc: MeshDocument, filename = 'model.obj'): void {
  let obj = '# MeshMaker 3D - OBJ Export\n# Blender/Unity/Unreal compatible\n\n';
  doc.vertices.forEach((v) => {
    obj += `v ${v.x.toFixed(5)} ${v.y.toFixed(5)} ${v.z.toFixed(5)}\n`;
  });
  obj += '\n';

  const fn = doc.faces.map((f) => {
    if (!f || f.length < 3) return { x: 0, y: 1, z: 0 };
    const v0 = doc.vertices[f[0]],
      v1 = doc.vertices[f[1]],
      v2 = doc.vertices[f[2]];
    const ux = v1.x - v0.x,
      uy = v1.y - v0.y,
      uz = v1.z - v0.z,
      vx = v2.x - v0.x,
      vy = v2.y - v0.y,
      vz = v2.z - v0.z;
    const nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx,
      len = Math.hypot(nx, ny, nz) || 1;
    return { x: nx / len, y: ny / len, z: nz / len };
  });
  fn.forEach((n) => obj += `vn ${n.x.toFixed(5)} ${n.y.toFixed(5)} ${n.z.toFixed(5)}\n`);
  obj += '\n';

  doc.groups.forEach((g) => {
    if (!g.faces.length) return;
    obj += `g ${g.name}\n`;
    g.faces.forEach((fi) => {
      const f = doc.faces[fi];
      if (!f || f.length < 3) return;
      if (f.length === 3) obj += `f ${f[0] + 1}//${fi + 1} ${f[1] + 1}//${fi + 1} ${f[2] + 1}//${fi + 1}\n`;
      else
        for (let i = 1; i < f.length - 1; i++)
          obj += `f ${f[0] + 1}//${fi + 1} ${f[i] + 1}//${fi + 1} ${f[i + 1] + 1}//${fi + 1}\n`;
    });
    obj += '\n';
  });

  const assigned = new Set(doc.groups.flatMap((g) => g.faces));
  const unassigned = doc.faces
    .map((_, fi) => fi)
    .filter((fi) => !assigned.has(fi) && doc.faces[fi] && doc.faces[fi]!.length >= 3);
  if (unassigned.length) {
    obj += 'g default\n';
    unassigned.forEach((fi) => {
      const f = doc.faces[fi]!;
      if (f.length === 3) obj += `f ${f[0] + 1}//${fi + 1} ${f[1] + 1}//${fi + 1} ${f[2] + 1}//${fi + 1}\n`;
      else
        for (let i = 1; i < f.length - 1; i++)
          obj += `f ${f[0] + 1}//${fi + 1} ${f[i] + 1}//${fi + 1} ${f[i + 1] + 1}//${fi + 1}\n`;
    });
  }

  downloadText(obj, filename, 'text/plain');
}

export function exportSTL(doc: MeshDocument, filename = 'model.stl'): void {
  let stl = 'solid meshmaker\n';
  doc.faces.forEach((f) => {
    if (!f || f.length < 3) return;
    const v0 = doc.vertices[f[0]],
      v1 = doc.vertices[f[1]],
      v2 = doc.vertices[f[2]];
    const ux = v1.x - v0.x,
      uy = v1.y - v0.y,
      uz = v1.z - v0.z,
      vx = v2.x - v0.x,
      vy = v2.y - v0.y,
      vz = v2.z - v0.z;
    const nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx,
      len = Math.hypot(nx, ny, nz) || 1;
    for (let i = 1; i < f.length - 1; i++) {
      const a = doc.vertices[f[0]],
        b = doc.vertices[f[i]],
        c = doc.vertices[f[i + 1]];
      stl += `  facet normal ${(nx / len).toFixed(5)} ${(ny / len).toFixed(5)} ${(nz / len).toFixed(5)}\n    outer loop\n`;
      stl += `      vertex ${a.x.toFixed(5)} ${a.y.toFixed(5)} ${a.z.toFixed(5)}\n`;
      stl += `      vertex ${b.x.toFixed(5)} ${b.y.toFixed(5)} ${b.z.toFixed(5)}\n`;
      stl += `      vertex ${c.x.toFixed(5)} ${c.y.toFixed(5)} ${c.z.toFixed(5)}\n`;
      stl += '    endloop\n  endfacet\n';
    }
  });
  stl += 'endsolid meshmaker\n';
  downloadText(stl, filename, 'text/plain');
}

/** Wavefront OBJ with groups (already in exportOBJ). */
export function exportPLY(doc: MeshDocument, filename = 'model.ply'): void {
  const verts = doc.vertices;
  const tris: [number, number, number][] = [];
  doc.faces.forEach((f) => {
    if (!f || f.length < 3) return;
    for (let i = 1; i < f.length - 1; i++) tris.push([f[0], f[i], f[i + 1]]);
  });

  let ply = 'ply\nformat ascii 1.0\n';
  ply += `element vertex ${verts.length}\nproperty float x\nproperty float y\nproperty float z\n`;
  ply += `element face ${tris.length}\nproperty list uchar int vertex_indices\nend_header\n`;
  verts.forEach((v) => {
    ply += `${v.x} ${v.y} ${v.z}\n`;
  });
  tris.forEach(([a, b, c]) => {
    ply += `3 ${a} ${b} ${c}\n`;
  });
  downloadText(ply, filename, 'text/plain');
}

/** GLTF 2.0 JSON (embedded buffers) for modern pipelines. */
export function exportGLTF(doc: MeshDocument, filename = 'model.gltf'): void {
  const positions: number[] = [];
  const indices: number[] = [];
  let base = 0;

  doc.faces.forEach((f) => {
    if (!f || f.length < 3) return;
    for (let i = 1; i < f.length - 1; i++) {
      [f[0], f[i], f[i + 1]].forEach((vi) => {
        const v = doc.vertices[vi];
        positions.push(v.x, v.y, v.z);
      });
      indices.push(base, base + 1, base + 2);
      base += 3;
    }
  });

  const buf = new ArrayBuffer(positions.length * 4 + indices.length * 4);
  const view = new DataView(buf);
  let off = 0;
  positions.forEach((n) => {
    view.setFloat32(off, n, true);
    off += 4;
  });
  indices.forEach((n) => {
    view.setUint32(off, n, true);
    off += 4;
  });

  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]);
    maxX = Math.max(maxX, positions[i]);
    minY = Math.min(minY, positions[i + 1]);
    maxY = Math.max(maxY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]);
    maxZ = Math.max(maxZ, positions[i + 2]);
  }

  const gltf = {
    asset: { version: '2.0', generator: 'MeshMaker3D' },
    scenes: [{ nodes: [0] }],
    scene: 0,
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0 },
            indices: 1,
            mode: 4,
          },
        ],
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: positions.length / 3,
        type: 'VEC3',
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
      },
      {
        bufferView: 0,
        byteOffset: positions.length * 4,
        componentType: 5125,
        count: indices.length,
        type: 'SCALAR',
      },
    ],
    bufferViews: [{ buffer: 0, byteLength: buf.byteLength }],
    buffers: [{ byteLength: buf.byteLength, uri: `data:application/octet-stream;base64,${b64}` }],
  };

  downloadText(JSON.stringify(gltf, null, 2), filename, 'model/gltf+json');
}
