import { useEditorStore } from '@/store/editorStore';
import { HelpGuideContent } from '@/components/help/HelpGuideContent';
import { triggerImportMeshDialog, triggerOpenProjectDialog } from '@/components/layout/FileBridge';
import { ViewMenu } from '@/components/layout/ViewMenu';

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
          <MenuItem onClick={store.selectLinked}>
            Select Linked <span className="dd-shortcut">L</span>
          </MenuItem>
          <MenuItem onClick={store.growSelection}>
            Grow Selection <span className="dd-shortcut">Ctrl+]</span>
          </MenuItem>
          <MenuItem onClick={store.shrinkSelection}>
            Shrink Selection <span className="dd-shortcut">Ctrl+[</span>
          </MenuItem>
          <MenuItem onClick={store.deselectAll}>
            Deselect <span className="dd-shortcut">D</span>
          </MenuItem>
          <MenuItem onClick={store.duplicateSelection}>
            Duplicate Selection <span className="dd-shortcut">Shift+D</span>
          </MenuItem>
          <div className="dd-sep" />
          <MenuItem className="danger" onClick={store.deleteSelected}>
            Delete <span className="dd-shortcut">Del</span>
          </MenuItem>
        </Dropdown>
        <Dropdown label="Object">
          <MenuItem onClick={store.duplicateSelectedObjects}>
            Duplicate <span className="dd-shortcut">Ctrl+D</span>
          </MenuItem>
          <div className="dd-sep" />
          <MenuItem onClick={store.originToGeometry}>Origin to Geometry</MenuItem>
          <MenuItem onClick={store.geometryToOrigin}>Geometry to Origin</MenuItem>
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
          <MenuItem onClick={store.loopCut}>
            Loop Cut <span className="dd-shortcut">Ctrl+R</span>
          </MenuItem>
          <MenuItem onClick={store.edgeSlide}>
            Edge Slide <span className="dd-shortcut">Ctrl+Shift+E</span>
          </MenuItem>
          <MenuItem onClick={store.dissolveEdges}>
            Dissolve Edges <span className="dd-shortcut">Ctrl+Shift+D</span>
          </MenuItem>
          <MenuItem onClick={store.mergeSelectedVerts}>
            Merge Vertices <span className="dd-shortcut">Alt+M</span>
          </MenuItem>
          <MenuItem onClick={store.separateSelection}>
            Separate <span className="dd-shortcut">Alt+Shift+P</span>
          </MenuItem>
          <MenuItem onClick={store.ripEdges}>
            Rip Edges <span className="dd-shortcut">Ctrl+Shift+V</span>
          </MenuItem>
          <div className="dd-sep" />
          <MenuItem onClick={() => store.mirrorSelection('x')}>Mirror X</MenuItem>
          <MenuItem onClick={() => store.mirrorSelection('y')}>Mirror Y</MenuItem>
          <MenuItem onClick={() => store.mirrorSelection('z')}>Mirror Z</MenuItem>
          <div className="dd-sep" />
          <MenuItem onClick={store.bridgeEdgeLoops}>Bridge Loops</MenuItem>
          <MenuItem onClick={store.mergeCoplanar}>Merge Coplanar</MenuItem>
          <MenuItem onClick={store.triangulateFaces}>Triangulate</MenuItem>
          <MenuItem onClick={() => store.setTool('extrude')}>Extrude Tool (E)</MenuItem>
          <MenuItem onClick={store.extrudeFaces}>Extrude Selection</MenuItem>
          <MenuItem onClick={() => store.setTool('bevel')}>Bevel Tool (B)</MenuItem>
          <MenuItem onClick={store.bevelEdges}>Bevel Selection</MenuItem>
          <MenuItem onClick={() => store.setTool('inset')}>Inset Tool (J)</MenuItem>
          <MenuItem onClick={store.insetFaces}>Inset Selection</MenuItem>
          <MenuItem onClick={() => store.activateKnifeTool()}>Knife Tool (K)</MenuItem>
          <MenuItem onClick={store.smoothMesh}>Smooth</MenuItem>
        </Dropdown>
        <Dropdown label="View" className="dropdown--view">
          <ViewMenu />
        </Dropdown>
        <Dropdown label="Help">
          <HelpGuideContent />
        </Dropdown>
      </div>
    </div>
  );
}

function Dropdown({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`dropdown ${className ?? ''}`}>
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