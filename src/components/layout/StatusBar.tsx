import { MODE_HINTS, TOOL_HINTS, useEditorStore, type ComponentSelectionMode } from '@/store/editorStore';
import { KNIFE_DRAW_HINT } from '@/systems/mesh/knifeDraw';
import { meshStats } from '@/core/mesh/MeshDocument';
import { useMeshDocument, useSceneObjectCount } from '@/hooks/useSceneRevision';
import { PRIM_DRAW_HINTS, PRIM_DRAW_HINTS_3D } from '@/systems/mesh/primDraw';
import { formatSnapSize } from '@/systems/viewport/snapGrid';
import { VIEWPORT_LABELS } from '@/systems/viewport/viewportLayout';

const MODE_LABELS: Record<ComponentSelectionMode | 'object', string> = {
  object: 'Object',
  vertex: 'Vertex',
  edge: 'Edge',
  face: 'Face',
};

export function StatusBar() {
  const tool = useEditorStore((s) => s.tool);
  const selectionMode = useEditorStore((s) => s.selectionMode);
  const mesh = useMeshDocument();
  const objectCount = useSceneObjectCount();
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds);
  const selVerts = useEditorStore((s) => s.selVerts);
  const selEdges = useEditorStore((s) => s.selEdges);
  const selFaces = useEditorStore((s) => s.selFaces);
  const primDraw = useEditorStore((s) => s.primDraw);
  const knifeDraw = useEditorStore((s) => s.knifeDraw);
  const armedModeling = useEditorStore((s) => s.armedModeling);
  const loopCutPreview = useEditorStore((s) => s.loopCutPreview);
  const edgeSlidePreview = useEditorStore((s) => s.edgeSlidePreview);
  const mirrorPreview = useEditorStore((s) => s.mirrorPreview);
  const activeVP = useEditorStore((s) => s.activeVP);
  const maximizedVP = useEditorStore((s) => s.maximizedVP);
  const viewportSlotViews = useEditorStore((s) => s.viewportSlotViews);
  const stats = meshStats(mesh);
  const projectFileName = useEditorStore((s) => s.projectFileName);
  const projectDirty = useEditorStore((s) => s.projectDirty);
  const snapEnabled = useEditorStore((s) => s.snapEnabled);
  const snapSize = useEditorStore((s) => s.snapSize);

  const viewNames = VIEWPORT_LABELS;

  const editModeLabel =
    selectionMode === 'object' ? 'Object Mode' : `Edit Mode (${MODE_LABELS[selectionMode]})`;

  const hint = maximizedVP
    ? `${viewNames[viewportSlotViews[maximizedVP]]} — maximized (Space to restore)`
    : primDraw
      ? `${primDraw.type.toUpperCase()}: ${
          primDraw.baseView === '3d'
            ? PRIM_DRAW_HINTS_3D[primDraw.phase]
            : PRIM_DRAW_HINTS[primDraw.phase]
        }`
      : mirrorPreview
        ? `Mirror ${mirrorPreview.axis.toUpperCase()} gap ${mirrorPreview.offset.toFixed(2)} — drag to adjust · X/Y/Z axis · Enter commit · Esc cancel`
        : edgeSlidePreview
        ? `Edge slide — drag to move · Enter commit · Esc cancel`
        : loopCutPreview
        ? `Loop cut ${Math.round(loopCutPreview.t * 100)}% — drag to slide · Enter commit · Esc cancel`
        : armedModeling
        ? armedModeling === 'extrude'
          ? 'Extrude armed — click and drag in viewport (Esc to cancel)'
          : armedModeling === 'bevel'
            ? 'Bevel armed — click and drag in viewport (Esc to cancel)'
            : armedModeling === 'edgeslide'
              ? 'Edge slide armed — click and drag to slide (Esc to cancel)'
              : armedModeling === 'mirror'
                ? 'Mirror armed — drag to set gap · X/Y/Z switch axis (Esc to cancel)'
                : 'Loop cut armed — click and drag to slide (Esc to cancel)'
        : tool === 'knife' || knifeDraw
          ? KNIFE_DRAW_HINT
          : tool === 'select'
          ? MODE_HINTS[selectionMode]
          : TOOL_HINTS[tool];

  return (
    <div className="statusbar">
      <div className="sb-item sb-tool">
        Tool: <span>{primDraw ? `Draw ${primDraw.type}` : tool.charAt(0).toUpperCase() + tool.slice(1)}</span>
      </div>
      <div className="sb-item">
        View: <span>{viewNames[activeVP]}</span>
      </div>
      <div className="sb-item">
        Mode: <span>{editModeLabel}</span>
      </div>
      <div className="sb-item sb-snap">
        Grid:{' '}
        <span className={snapEnabled ? 'sb-snap-on' : ''}>
          {snapEnabled ? `${formatSnapSize(snapSize)} snap` : 'off'}
        </span>
      </div>
      <div className="sb-item">
        Selection:{' '}
        <span>
          {selectionMode === 'object'
            ? `${selectedNodeIds.size} object${selectedNodeIds.size === 1 ? '' : 's'}`
            : `${selVerts.size}v ${selEdges.size}e ${selFaces.size}f`}
        </span>
      </div>
      <div className="sb-item">
        Mesh: <span>{objectCount === 0 ? '—' : mesh.name}</span> · Objects: <span>{objectCount}</span> ·{' '}
        <span>{objectCount === 0 ? '0v 0f' : `${stats.verts}v ${stats.faces}f`}</span>
      </div>
      <div className="sb-item sb-project">
        {projectFileName ?? 'Untitled'}
        {projectDirty ? ' *' : ''}
      </div>
      <div className="sb-item sb-hint">{hint}</div>
    </div>
  );
}
