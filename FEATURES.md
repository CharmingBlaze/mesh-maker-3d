# MeshMaker 3D — Features

MilkShape-inspired low-poly editor with modern file I/O and performance tuned for small and large scenes.

## File I/O

| Action | Format | Notes |
|--------|--------|-------|
| **New** | — | Empty scene (`Ctrl+N`) |
| **Open** | `.mm3d`, `.json` | Native project (mesh, groups, layers, view layout) |
| **Open** | `.obj`, `.stl`, `.gltf`, `.glb` | Replaces scene |
| **Save / Save As** | `.mm3d` | Full project (`Ctrl+S`) |
| **Import mesh** | OBJ, STL, GLTF | Merges into current scene |
| **Export** | OBJ, STL, PLY, GLTF | Modern pipelines |

## Modeling (MilkShape-style)

- Quad viewports: Top, Front, Side, 3D (resizable layouts, Space maximize)
- Tools: Select, Move, Rotate, Scale, Vertex, Face
- Selection: Object / Vertex / Edge / Face
- Primitives: 14 shapes with drag-to-size (2D LMB, 3D MMB)
- Mesh ops: Weld, snap, average, flip normals, subdivide, triangulate, extrude, smooth
- Groups, materials (color), layers (visibility/lock), joints (bone list stub)
- Undo / Redo (`Ctrl+Z` / `Ctrl+Y`)

## View navigation

- **Frame All** (`F`) — center orthographic views + 3D camera on mesh
- **Center All Views** — reset to 2×2 layout and frame mesh
- 3D: RMB orbit, MMB pan, scroll zoom

## Performance

- 3D mesh rebuild skipped when geometry/selection unchanged (visual cache key)
- Render-on-demand for 3D (no redundant GPU work while idle)
- Spatial-hash vertex weld (scales better on dense meshes)
- Undo history depth: 50 snapshots

## Planned (MilkShape parity)

- [ ] Native `.ms3d` import/export
- [ ] UV editor & texture maps
- [ ] Per-face material indices
- [ ] Skeletal hierarchy, weights, animation timeline
- [ ] Mirror modeling, lathe, bevel
- [ ] Copy/paste geometry, redo stack UI
- [ ] Reference images in viewports
- [ ] Multi-object scene (scene graph)
