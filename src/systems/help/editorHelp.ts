export interface HelpTopic {
  id: string;
  title: string;
  intro?: string;
  lines: readonly string[];
}

/** All help topics — Help menu pulls from here. */
export const EDIT_MODES_HELP: HelpTopic = {
  id: 'edit-modes',
  title: 'Object & Edit modes',
  intro: 'Tab toggles Object ↔ Edit. Keys 1–4 switch component modes.',
  lines: [
    'Object — select whole meshes · Move/Rotate/Scale transforms the object',
    'Object → Origin to Geometry / Geometry to Origin for pivot',
    'Vertex (2) — pick and drag points · V vertex tool',
    'Edge (3) — pick edges · B bevel · Alt+click loop · Alt+Shift ring · Ctrl+Shift+E slide',
    'Face (4) — pick faces · E extrude · J inset',
  ],
};

export const EDGE_LOOP_RING_HELP_TOPIC: HelpTopic = {
  id: 'edge-loop-ring',
  title: 'Edge loop / ring selection',
  intro: 'In Edge mode (press 3 or use the side panel):',
  lines: [
    'Alt + click edge — select full edge loop',
    'Alt + Shift + click edge — select edge ring (parallel edges on quads)',
    'Ctrl + Alt + click — toggle loop/ring on/off',
  ],
};

export const MODAL_MODELING_HELP: HelpTopic = {
  id: 'modal-modeling',
  title: 'Modal extrude & bevel',
  intro: 'Blender-style: arm the tool, then click and drag in the viewport.',
  lines: [
    'E — arm extrude (Face mode) · click and drag to extrude selected faces',
    'B — arm bevel (Edge mode) · click and drag to bevel selected edges',
    'Esc — cancel armed tool · release drag commits to undo history',
    'Or drag directly on selected faces/edges without arming first',
  ],
};

export const TRANSFORM_GIZMO_HELP: HelpTopic = {
  id: 'transform-gizmos',
  title: '3D transform gizmos',
  intro: 'With Move, Rotate, or Scale active in the 3D view:',
  lines: [
    'Colored X / Y / Z handles at the selection pivot',
    'Move (M) — drag arrows · Rotate (G) — drag rings · Scale (C) — drag cube tips',
    'Drag a handle to constrain to that axis',
  ],
};

export const KNIFE_HELP: HelpTopic = {
  id: 'knife',
  title: 'Knife tool',
  intro: 'K activates knife. Draw view-aligned cuts through the mesh like Blender.',
  lines: [
    'Click on the mesh to place cut points — each segment cuts along the current view plane',
    'Enter — apply all cut segments · Esc — cancel · Backspace — undo last point',
    'Shift — snap to face center or edge quarters · Ctrl — snap to grid on face',
    'Green points are confirmed · White point is the hover preview',
    'With faces selected — cuts are limited to those faces only',
    'Works in Top / Front / Side / 3D views (3D locks view orientation when you start)',
  ],
};

export const LOOP_CUT_HELP: HelpTopic = {
  id: 'loop-cut',
  title: 'Loop cut',
  intro: 'Split selected edges and insert a parallel edge loop.',
  lines: [
    'Select edges (Alt+click for full loop) · Ctrl+R — start loop cut',
    'Drag vertically to slide cut position · Enter commit · Esc cancel',
    'One selected edge expands to its full loop automatically',
  ],
};

export const BRIDGE_LOOPS_HELP: HelpTopic = {
  id: 'bridge-loops',
  title: 'Bridge edge loops',
  intro: 'Connect two closed edge loops with quad faces.',
  lines: [
    'Select loop A · Shift+Alt+click loop B (two disjoint edge loops)',
    'Both loops must have the same number of edges',
    'Mesh → Bridge Loops — creates a tube of quads between them',
  ],
};

export const EDGE_SLIDE_HELP: HelpTopic = {
  id: 'edge-slide',
  title: 'Edge slide',
  intro: 'Slide selected edges along adjacent face edges.',
  lines: [
    'Select edges · Ctrl+Shift+E — start edge slide',
    'Drag vertically to move · Enter commit · Esc cancel',
    'One selected edge expands to its full loop automatically',
  ],
};

export const DISSOLVE_EDGES_HELP: HelpTopic = {
  id: 'dissolve-edges',
  title: 'Dissolve edges',
  intro: 'Remove internal edges and merge the two adjacent faces.',
  lines: [
    'Select edges shared by exactly two faces',
    'Ctrl+Shift+D or Mesh → Dissolve Edges',
    'Boundary edges cannot be dissolved',
  ],
};

export const MERGE_VERTS_HELP: HelpTopic = {
  id: 'merge-verts',
  title: 'Merge vertices',
  intro: 'Collapse selected vertices to one point at their average position.',
  lines: [
    'Select 2+ vertices in Vertex mode',
    'Alt+M or Mesh → Merge Vertices',
    'Different from Weld — merges only the current selection',
  ],
};

export const RIP_EDGES_HELP: HelpTopic = {
  id: 'rip-edges',
  title: 'Rip edges',
  intro: 'Split selected edges so adjacent faces can be pulled apart.',
  lines: [
    'Select edges · Ctrl+Shift+V or Mesh → Rip Edges',
    'Duplicates verts on one side of each manifold edge pair',
    'Use Move tool to pull the ripped side away',
  ],
};

export const OBJECT_ORIGIN_HELP: HelpTopic = {
  id: 'object-origin',
  title: 'Object origin',
  intro: 'Adjust the object pivot in Object mode (press 1):',
  lines: [
    'Object → Origin to Geometry — pivot moves to mesh center, geometry stays in place',
    'Object → Geometry to Origin — bake transform into mesh, reset object to world origin',
    'Select one or more mesh objects first',
  ],
};

export const SEPARATE_HELP: HelpTopic = {
  id: 'separate',
  title: 'Separate selection',
  intro: 'Split selected faces at shared boundary verts so they become an independent island.',
  lines: [
    'Select faces to detach · Alt+Shift+P or Mesh → Separate',
    'Duplicates boundary verts only — interior verts stay shared until separated',
    'Use Move tool to reposition the detached piece',
  ],
};

export const MIRROR_HELP: HelpTopic = {
  id: 'mirror',
  title: 'Mirror geometry',
  intro: 'Create a mirrored copy across X, Y, or Z through the selection center.',
  lines: [
    'Select faces to mirror · or mirror whole mesh with nothing selected',
    'Mesh → Mirror X / Y / Z — live preview with draggable gap offset',
    'Drag vertically to adjust gap · X / Y / Z switch axis · Enter commit · Esc cancel',
    'Pivot is the centroid of the mirrored geometry',
  ],
};

export const DUPLICATE_SELECTION_HELP: HelpTopic = {
  id: 'duplicate-selection',
  title: 'Duplicate selection',
  intro: 'Copy the current edit-mode selection offset by one grid step.',
  lines: [
    'Shift+D or Edit → Duplicate Selection',
    'Face mode — duplicates selected faces · Edge — splits edge verts · Vertex — copies verts',
    'New geometry is selected after duplicate',
  ],
};

export const MERGE_COPLANAR_HELP: HelpTopic = {
  id: 'merge-coplanar',
  title: 'Merge coplanar faces',
  intro: 'Combine adjacent selected faces that lie on the same plane.',
  lines: [
    'Select two or more connected coplanar faces',
    'Mesh → Merge Coplanar — outer boundary becomes one n-gon',
    'Useful after knife cuts or manual face building',
  ],
};

export const GROW_SHRINK_HELP: HelpTopic = {
  id: 'grow-shrink',
  title: 'Grow / shrink selection',
  intro: 'Expand or contract the current component selection by one step:',
  lines: [
    'Ctrl + ] — grow (add adjacent faces, edges, or verts)',
    'Ctrl + [ — shrink (remove boundary layer)',
    'Face mode — neighbor faces · Edge — touching edges · Vertex — connected verts',
  ],
};

export const SELECT_LINKED_HELP: HelpTopic = {
  id: 'select-linked',
  title: 'Select linked',
  intro: 'Expand selection to the connected mesh island:',
  lines: [
    'L or double-click — select all faces linked to current selection',
    'In Edge mode — all edges on linked faces',
    'In Vertex mode — all verts on linked faces',
  ],
};

export const SELECTION_HELP: HelpTopic = {
  id: 'selection',
  title: 'Selection',
  lines: [
    'Click — pick · drag box — marquee · Shift/Ctrl+click — add/remove',
    'A — select all · D — deselect · I — invert · Del — delete',
    'L — select linked · Ctrl+] grow · Ctrl+[ shrink',
  ],
};

export const VIEWPORT_HELP: HelpTopic = {
  id: 'viewport',
  title: 'Viewports',
  lines: [
    'View menu — display, camera, grid/snap, active viewport, layout presets',
    'Space — maximize active view · Shift+F — frame all',
    'RMB — 3D orbit · MMB — 3D pan · scroll — zoom · W — wireframe',
  ],
};

export const PRIM_DRAW_HELP: HelpTopic = {
  id: 'prim-draw',
  title: 'CAD primitive draw',
  intro: 'Click a shape, drag footprint, then height. Enter or Place to commit.',
  lines: [
    'Shift + drag footprint — axis lock',
    'Ctrl + drag footprint — square footprint',
    'Shift/Ctrl on handles — constrain resize (see list while drawing)',
  ],
};

/** One-line cheat sheet shown at the top of the Help menu. */
export const QUICK_REFERENCE =
  'Tab toggles Object ↔ Edit · 1–4 switch modes · E extrude · B bevel · J inset · K knife · L / dbl-click linked · Ctrl+R loop cut';

/** Topics shown in Help menu (menu bar), in order. */
export const HELP_MENU_TOPICS: readonly HelpTopic[] = [
  EDIT_MODES_HELP,
  SELECTION_HELP,
  SELECT_LINKED_HELP,
  GROW_SHRINK_HELP,
  EDGE_LOOP_RING_HELP_TOPIC,
  LOOP_CUT_HELP,
  BRIDGE_LOOPS_HELP,
  EDGE_SLIDE_HELP,
  DISSOLVE_EDGES_HELP,
  RIP_EDGES_HELP,
  MERGE_VERTS_HELP,
  SEPARATE_HELP,
  MIRROR_HELP,
  DUPLICATE_SELECTION_HELP,
  OBJECT_ORIGIN_HELP,
  MODAL_MODELING_HELP,
  TRANSFORM_GIZMO_HELP,
  KNIFE_HELP,
  MERGE_COPLANAR_HELP,
  VIEWPORT_HELP,
  PRIM_DRAW_HELP,
];
