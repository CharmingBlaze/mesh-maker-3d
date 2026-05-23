import type { ViewportSlotId } from '@/systems/viewport/viewportLayout';
import { isView2DKey, VIEWPORT_LABELS } from '@/systems/viewport/viewportLayout';import { useEditorStore } from '@/store/editorStore';
import { Viewport2D } from './Viewport2D';
import { Viewport3D } from './Viewport3D';
import { ViewportTexture } from './ViewportTexture';
import { ViewportViewPicker } from './ViewportViewPicker';

export function ViewportPanel({ id: slotId }: { id: ViewportSlotId }) {
  const viewId = useEditorStore((s) => s.viewportSlotViews[slotId]);
  const activeSlot = useEditorStore((s) => s.activeSlot);
  const maximizedVP = useEditorStore((s) => s.maximizedVP);
  const setActiveSlot = useEditorStore((s) => s.setActiveSlot);
  const isActive = activeSlot === slotId || maximizedVP === slotId;

  return (
    <div
      className={`vp-panel ${isActive ? 'vp-panel--active' : ''}`}
      title={VIEWPORT_LABELS[viewId]}
      onPointerDown={() => setActiveSlot(slotId)}
    >
      <div className="vp-panel-body">
        <ViewportViewPicker slotId={slotId} viewId={viewId} isActive={isActive} />
        {viewId === '3d' ? (
          <Viewport3D slotId={slotId} />
        ) : viewId === 'texture' ? (
          <ViewportTexture slotId={slotId} />
        ) : isView2DKey(viewId) ? (
          <Viewport2D vpKey={viewId} slotId={slotId} />
        ) : null}
      </div>
    </div>
  );
}
