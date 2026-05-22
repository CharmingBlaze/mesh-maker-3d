import { PROJECT_EXTENSION, parseProject } from '@/systems/io/projectFormat';
import { importOBJ } from './objImporter';
import { importSTL } from './stlImporter';
import { importGLTF } from './gltfImporter';
import type { MeshDocument } from '@/core/mesh/MeshDocument';
import type { ProjectFileV1 } from '@/systems/io/projectFormat';

export type ImportResult =
  | { kind: 'project'; project: ProjectFileV1 }
  | { kind: 'mesh'; mesh: MeshDocument; merge?: boolean };

function extOf(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i >= 0 ? filename.slice(i).toLowerCase() : '';
}

export async function importFile(file: File): Promise<ImportResult> {
  const ext = extOf(file.name);
  const baseName = file.name.replace(/\.[^.]+$/, '');

  if (ext === PROJECT_EXTENSION || ext === '.json') {
    const text = await file.text();
    try {
      const project = parseProject(text);
      return { kind: 'project', project };
    } catch {
      /* fall through if not project json */
    }
  }

  if (ext === '.obj') {
    return { kind: 'mesh', mesh: importOBJ(await file.text(), baseName) };
  }

  if (ext === '.stl') {
    const buf = await file.arrayBuffer();
    const head = new TextDecoder().decode(buf.slice(0, Math.min(256, buf.byteLength)));
    if (head.trim().toLowerCase().startsWith('solid')) {
      return { kind: 'mesh', mesh: importSTL(new TextDecoder().decode(buf), baseName) };
    }
    return { kind: 'mesh', mesh: importSTL(buf, baseName) };
  }

  if (ext === '.gltf' || ext === '.glb') {
    return { kind: 'mesh', mesh: await importGLTF(await file.arrayBuffer(), baseName) };
  }

  throw new Error(`Unsupported file type: ${ext || '(none)'}`);
}
