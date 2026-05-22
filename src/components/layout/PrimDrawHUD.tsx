import { canCommitPrimDraw, formatPrimDrawDimensions } from '@/hooks/primDrawHelpers';
import { useEditorStore } from '@/store/editorStore';

export function PrimDrawHUD() {
  const primDraw = useEditorStore((s) => s.primDraw);
  const snapSize = useEditorStore((s) => s.snapSize);
  const commitPrimDraw = useEditorStore((s) => s.commitPrimDraw);
  const cancelPrimDraw = useEditorStore((s) => s.cancelPrimDraw);

  if (!primDraw) return null;

  const phaseLabel = primDraw.phase === 'base' ? 'draw footprint' : 'adjust height';
  const dims = formatPrimDrawDimensions(primDraw);
  const canPlace = canCommitPrimDraw(primDraw, snapSize);

  return (
    <div className="prim-draw-hud">
      <div className="prim-draw-hud__info">
        <span className="prim-draw-hud__title">
          {primDraw.type.charAt(0).toUpperCase() + primDraw.type.slice(1)} · {phaseLabel}
        </span>
        <span className="prim-draw-hud__dims">{dims}</span>
      </div>
      <div className="prim-draw-hud__actions">
        <button
          type="button"
          className="prim-draw-hud__btn prim-draw-hud__btn--place"
          disabled={!canPlace}
          onClick={() => commitPrimDraw()}
        >
          Place
        </button>
        <button type="button" className="prim-draw-hud__btn" onClick={() => cancelPrimDraw()}>
          Cancel
        </button>
      </div>
    </div>
  );
}
