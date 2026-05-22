import type { View2DKey } from '@/core/math/projection';
import { useViewport2D } from '@/hooks/useViewport2D';
import { useEditorStore } from '@/store/editorStore';

export function Viewport2D({ vpKey }: { vpKey: View2DKey }) {
  const activeVP = useEditorStore((s) => s.activeVP);
  const tool = useEditorStore((s) => s.tool);
  const primDraw = useEditorStore((s) => s.primDraw);
  const { canvasRef, containerRef, handlers, selRect } = useViewport2D(vpKey);
  const maximizedVP = useEditorStore((s) => s.maximizedVP);
  const isActive = activeVP === vpKey || maximizedVP === vpKey;
  const cursor = primDraw || tool !== 'select' ? 'crosshair' : 'default';

  return (
    <div
      ref={containerRef}
      className={`vp vp--2d ${isActive ? 'vp-active' : ''}`}
      style={{ cursor }}
      {...handlers}
    >
      <canvas ref={canvasRef} />
      {selRect && (selRect.w > 2 || selRect.h > 2) && (
        <div
          className="vp-sel-rect"
          style={{
            left: selRect.x,
            top: selRect.y,
            width: selRect.w,
            height: selRect.h,
          }}
        />
      )}
    </div>
  );
}
