import { MODE_HINTS, useEditorStore, TOOL_HINTS } from '@/store/editorStore';
import { meshStats } from '@/core/mesh/MeshDocument';
import { useMeshDocument } from '@/hooks/useSceneRevision';
import { PRIM_DRAW_HINTS, PRIM_DRAW_HINTS_3D } from '@/systems/mesh/primDraw';
import { formatSnapSize } from '@/systems/viewport/snapGrid';

export function StatusBar() {
  const tool = useEditorStore((s) => s.tool);
  const selectionMode = useEditorStore((s) => s.selectionMode);
  const mesh = useMeshDocument();
  const selVerts = useEditorStore((s) => s.selVerts);
  const selEdges = useEditorStore((s) => s.selEdges);
  const selFaces = useEditorStore((s) => s.selFaces);
  const primDraw = useEditorStore((s) => s.primDraw);
  const activeVP = useEditorStore((s) => s.activeVP);
  const maximizedVP = useEditorStore((s) => s.maximizedVP);
  const stats = meshStats(mesh);
  const projectFileName = useEditorStore((s) => s.projectFileName);
  const projectDirty = useEditorStore((s) => s.projectDirty);
  const snapEnabled = useEditorStore((s) => s.snapEnabled);
  const snapSize = useEditorStore((s) => s.snapSize);

  const viewNames: Record<string, string> = {
    top: 'Top View',
    front: 'Front View',
    side: 'Side View',
    '3d': '3D View',
  };

  const hint = maximizedVP
    ? `${viewNames[maximizedVP]} — fullscreen (Space to restore)`
    : primDraw
    ? `${primDraw.type.toUpperCase()}: ${
        activeVP === '3d' ? PRIM_DRAW_HINTS_3D[primDraw.phase] : PRIM_DRAW_HINTS[primDraw.phase]
      }`
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
        Mode: <span>{selectionMode}</span>
      </div>
      <div className="sb-item sb-snap">
        Grid:{' '}
        <span className={snapEnabled ? 'sb-snap-on' : ''}>
          {snapEnabled ? `${formatSnapSize(snapSize)} snap` : 'off'}
        </span>
      </div>
      <div className="sb-item">
        Selection: <span>{selVerts.size}v {selEdges.size}e {selFaces.size}f</span>
      </div>
      <div className="sb-item">
        Scene: <span>{stats.verts}v {stats.faces}f</span>
      </div>
      <div className="sb-item sb-project">
        {projectFileName ?? 'Untitled'}
        {projectDirty ? ' *' : ''}
      </div>
      <div className="sb-item sb-hint">{hint}</div>
    </div>
  );
}
