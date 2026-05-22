import type { ViewportId } from '@/systems/viewport/viewportLayout';
import { VIEWPORT_LABELS } from '@/systems/viewport/viewportLayout';
import { useEditorStore } from '@/store/editorStore';
import { Viewport2D } from './Viewport2D';
import { Viewport3D } from './Viewport3D';

export function ViewportPanel({ id }: { id: ViewportId }) {
  const activeVP = useEditorStore((s) => s.activeVP);
  const maximizedVP = useEditorStore((s) => s.maximizedVP);
  const setActiveVP = useEditorStore((s) => s.setActiveVP);
  const isActive = activeVP === id || maximizedVP === id;

  return (
    <div
      className={`vp-panel ${isActive ? 'vp-panel--active' : ''}`}
      title={VIEWPORT_LABELS[id]}
      onPointerDown={() => setActiveVP(id)}
    >
      <div className="vp-panel-body">
        <span className="vp-view-label">{VIEWPORT_LABELS[id]}</span>
        {id === '3d' ? <Viewport3D /> : <Viewport2D vpKey={id} />}
      </div>
    </div>
  );
}
