# MeshMaker 3D

A modular React + TypeScript 3D mesh editor, refactored from the original single-file HTML app into an extensible architecture for building a full 3D modeling application.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Architecture

```
src/
├── core/                    # Engine layer (framework-agnostic)
│   ├── scene-graph/         # Hierarchical scene nodes (root, mesh, group, bone)
│   ├── mesh/                # MeshDocument data model
│   ├── commands/            # Undo/redo command pattern
│   ├── events/              # Event bus for decoupled systems
│   └── math/                # Vectors, 2D projections
├── systems/                 # Feature systems
│   ├── mesh/                # Primitives, mesh operations
│   ├── viewport/            # 2D canvas + Three.js 3D renderer
│   └── export/              # OBJ / STL exporters
├── store/                   # Zustand editor state
├── hooks/                   # Viewport interaction, keyboard
└── components/              # React UI shell
```

### Scene graph

`SceneGraph` manages a tree of `SceneNode` entries (root, mesh, group, bone, helper). Each node has transform, visibility, and parent/child links. The active mesh is registered as a mesh node — ready for multi-object scenes, instancing, and parenting.

### Command history

All destructive edits go through `runCommand()` or `SnapshotCommand`, enabling undo (Ctrl+Z) with up to 30 steps.

### Extension points

- **New tools**: Add to `ToolId`, implement in `useViewport2D`, wire UI in `LeftPanel`
- **New mesh ops**: Add functions in `systems/mesh/meshOperations.ts`, expose via store + menu
- **New node types**: Extend `SceneNodeType` and `SceneGraph`
- **Plugins**: Subscribe to `editorEvents` (`scene:changed`, `selection:changed`, etc.)

## Original

The legacy `meshmaker3d.html` is preserved for reference.
