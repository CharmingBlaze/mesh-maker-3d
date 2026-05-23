import { useEffect, useRef, useState } from 'react';
import {
  VIEWPORT_LABELS,
  VIEWPORT_VIEW_IDS,
  type ViewportSlotId,
  type ViewportViewId,
} from '@/systems/viewport/viewportLayout';
import { useEditorStore } from '@/store/editorStore';

export function ViewportViewPicker({
  slotId,
  viewId,
  isActive,
}: {
  slotId: ViewportSlotId;
  viewId: ViewportViewId;
  isActive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const setViewportSlotView = useEditorStore((s) => s.setViewportSlotView);

  useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`vp-view-picker ${open ? 'vp-view-picker--open' : ''} ${isActive ? 'vp-view-picker--active' : ''}`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span
        className="vp-view-label"
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((v) => !v);
          }
          if (e.key === 'Escape') setOpen(false);
        }}
      >
        {VIEWPORT_LABELS[viewId]}
      </span>
      {open && (
        <div className="vp-view-picker__menu" role="menu">
          {VIEWPORT_VIEW_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="menuitemradio"
              aria-checked={id === viewId}
              className={`vp-view-picker__item ${id === viewId ? 'active' : ''}`}
              onClick={() => {
                setViewportSlotView(slotId, id);
                setOpen(false);
              }}
            >
              <span className="vp-view-picker__check">{id === viewId ? '✓' : ''}</span>
              {VIEWPORT_LABELS[id]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
