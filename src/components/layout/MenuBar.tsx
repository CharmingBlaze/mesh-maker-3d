import { useEditorStore } from '@/store/editorStore';
import { triggerImportMeshDialog, triggerOpenProjectDialog } from '@/components/layout/FileBridge';
import { EditorToolbar } from '@/components/layout/EditorToolbar';

export function MenuBar() {
  const store = useEditorStore();

  return (
    <div className="menubar">
      <div className="menubar-start menu-group">
        <Dropdown label="File">
          <MenuItem onClick={store.newScene}>
            New <span className="dd-shortcut">Ctrl+N</span>
          </MenuItem>
          <MenuItem onClick={() => triggerOpenProjectDialog()}>
            Open… <span className="dd-shortcut">Ctrl+O</span>
          </MenuItem>
          <MenuItem onClick={() => store.saveProject()}>
            Save <span className="dd-shortcut">Ctrl+S</span>
          </MenuItem>
          <MenuItem onClick={() => store.saveProjectAs()}>Save As…</MenuItem>
          <div className="dd-sep" />
          <MenuItem onClick={() => triggerImportMeshDialog()}>Import mesh (OBJ, STL, GLTF)…</MenuItem>
          <div className="dd-sep" />
          <MenuItem onClick={store.exportOBJ}>
            Export OBJ <span className="dd-shortcut">Ctrl+E</span>
          </MenuItem>
          <MenuItem onClick={store.exportSTL}>Export STL</MenuItem>
          <MenuItem onClick={store.exportPLY}>Export PLY</MenuItem>
          <MenuItem onClick={store.exportGLTF}>Export GLTF</MenuItem>
        </Dropdown>
        <Dropdown label="Edit">
          <MenuItem onClick={store.undo}>
            Undo <span className="dd-shortcut">Ctrl+Z</span>
          </MenuItem>
          <MenuItem onClick={store.redo}>
            Redo <span className="dd-shortcut">Ctrl+Y</span>
          </MenuItem>
          <div className="dd-sep" />
          <MenuItem onClick={store.selectAll}>
            Select All <span className="dd-shortcut">A</span>
          </MenuItem>
          <MenuItem onClick={store.invertSelection}>
            Invert <span className="dd-shortcut">I</span>
          </MenuItem>
          <MenuItem onClick={store.deselectAll}>
            Deselect <span className="dd-shortcut">D</span>
          </MenuItem>
          <div className="dd-sep" />
          <MenuItem className="danger" onClick={store.deleteSelected}>
            Delete <span className="dd-shortcut">Del</span>
          </MenuItem>
        </Dropdown>
        <Dropdown label="Mesh">
          <MenuItem onClick={() => store.weldVerts()}>Weld Selected</MenuItem>
          <MenuItem onClick={store.weldAll}>Weld All</MenuItem>
          <MenuItem onClick={store.snapToGrid}>Snap to Grid</MenuItem>
          <MenuItem onClick={store.averageVerts}>Average Position</MenuItem>
          <div className="dd-sep" />
          <MenuItem onClick={store.fillHole}>
            Fill Hole <span className="dd-shortcut">Alt+H</span>
          </MenuItem>
          <MenuItem onClick={store.flipNormals}>
            Flip Normals <span className="dd-shortcut">Shift+N</span>
          </MenuItem>
          <MenuItem onClick={store.subdivide}>Subdivide</MenuItem>
          <MenuItem onClick={store.triangulateFaces}>Triangulate</MenuItem>
          <MenuItem onClick={() => store.setTool('extrude')}>Extrude Tool (E)</MenuItem>
          <MenuItem onClick={store.extrudeFaces}>Extrude Selection</MenuItem>
          <MenuItem onClick={() => store.setTool('bevel')}>Bevel Tool (B)</MenuItem>
          <MenuItem onClick={store.bevelEdges}>Bevel Selection</MenuItem>
          <MenuItem onClick={() => store.setTool('inset')}>Inset Tool (J)</MenuItem>
          <MenuItem onClick={store.insetFaces}>Inset Selection</MenuItem>
          <MenuItem onClick={store.smoothMesh}>Smooth</MenuItem>
        </Dropdown>
        <Dropdown label="View">
          <MenuItem onClick={store.toggleWireframe}>
            Wireframe <span className="dd-shortcut">W</span>
          </MenuItem>
          <MenuItem onClick={store.toggleFlat}>Flat Shading</MenuItem>
          <MenuItem onClick={store.frameAll}>
            Frame All <span className="dd-shortcut">Shift+F</span>
          </MenuItem>
          <MenuItem onClick={store.centerAllViews}>Center All Views</MenuItem>
          <div className="dd-sep" />
          <MenuItem onClick={store.toggleGrid3D}>Viewport Grid</MenuItem>
        </Dropdown>
        <Dropdown label="Window">
          <MenuItem onClick={() => store.setViewportLayout('quad')}>Layout: Four views (2×2)</MenuItem>
          <MenuItem onClick={() => store.setViewportLayout('horizontal')}>Layout: Four in a row</MenuItem>
          <MenuItem onClick={() => store.setViewportLayout('vertical')}>Layout: Four in a column</MenuItem>
          <MenuItem onClick={() => store.setViewportLayout('focus3d')}>Layout: Large 3D + strip</MenuItem>
          <div className="dd-sep" />
          <MenuItem onClick={store.toggleViewportMaximize}>
            Maximize active view <span className="dd-shortcut">Space</span>
          </MenuItem>
          <MenuItem onClick={store.centerAllViews}>Reset & center views</MenuItem>
        </Dropdown>
        <Dropdown label="Help">
          <div className="shortcut-menu">
            <div><span>Ctrl+N</span>New</div>
            <div><span>Ctrl+O</span>Open</div>
            <div><span>Ctrl+S</span>Save</div>
            <div><span>1–4</span>Selection mode</div>
            <div><span>S/M/G/C/E/B/J</span>Edit tools</div>
            <div><span>V/F</span>Vertex / Face draw</div>
            <div><span>F</span>Frame all</div>
            <div><span>Space</span>Maximize view</div>
            <div><span>LMB</span>Edit in all views</div>
            <div><span>RMB</span>3D orbit</div>
            <div><span>MMB</span>3D pan</div>
          </div>
        </Dropdown>
      </div>
      <EditorToolbar />
      <div className="menubar-end" aria-hidden="true" />
    </div>
  );
}

function Dropdown({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="dropdown">
      <button type="button" className="menu-btn">
        <span>{label}</span>
        <span className="menu-chevron">▾</span>
      </button>
      <div className="dropdown-content">{children}</div>
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button type="button" className={`dd-item ${className ?? ''}`} onClick={onClick}>
      {children}
    </button>
  );
}
