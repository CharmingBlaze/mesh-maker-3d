import { useRef } from 'react';
import { useEditorStore } from '@/store/editorStore';

/** Hidden file inputs wired to File menu actions. */
export function FileBridge() {
  const openInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const openProject = useEditorStore((s) => s.openProjectFromFile);
  const importMeshFile = useEditorStore((s) => s.importMeshFromFile);

  return (
    <>
      <input
        ref={openInputRef}
        type="file"
        accept=".mm3d,.json,.obj,.stl,.gltf,.glb"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) openProject(file);
          e.target.value = '';
        }}
      />
      <input
        ref={importInputRef}
        type="file"
        accept=".obj,.stl,.gltf,.glb"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) importMeshFile(file);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        id="file-bridge-open"
        hidden
        aria-hidden
        onClick={() => openInputRef.current?.click()}
      />
      <button
        type="button"
        id="file-bridge-import"
        hidden
        aria-hidden
        onClick={() => importInputRef.current?.click()}
      />
    </>
  );
}

export function triggerOpenProjectDialog(): void {
  document.getElementById('file-bridge-open')?.click();
}

export function triggerImportMeshDialog(): void {
  document.getElementById('file-bridge-import')?.click();
}
