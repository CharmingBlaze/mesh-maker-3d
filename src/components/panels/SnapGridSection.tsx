import { useMemo, type CSSProperties } from 'react';
import { useEditorStore } from '@/store/editorStore';
import {
  SNAP_GRID_PRESETS,
  clampSnapSize,
  formatSnapSize,
} from '@/systems/viewport/snapGrid';

export function SnapGridSection({ embedded = false }: { embedded?: boolean }) {
  const snapSize = useEditorStore((s) => s.snapSize);
  const snapEnabled = useEditorStore((s) => s.snapEnabled);
  const showGrid3D = useEditorStore((s) => s.showGrid3D);
  const setSnapSize = useEditorStore((s) => s.setSnapSize);
  const setSnapEnabled = useEditorStore((s) => s.setSnapEnabled);
  const setShowGrid3D = useEditorStore((s) => s.setShowGrid3D);
  const snapToGrid = useEditorStore((s) => s.snapToGrid);

  const label = formatSnapSize(snapSize);
  const previewStyle = useMemo(() => {
    const cell = Math.max(5, Math.min(14, (50 * 5) / clampSnapSize(snapSize)));
    const major = cell * 5;
    const minor = '#1a2836';
    const majorColor = '#2d4a62';
    const accent = snapEnabled ? 'rgba(79, 143, 216, 0.35)' : 'rgba(79, 143, 216, 0.12)';
    return {
      backgroundColor: '#0c1118',
      backgroundImage: `
        linear-gradient(${accent} 1px, transparent 1px),
        linear-gradient(90deg, ${accent} 1px, transparent 1px),
        linear-gradient(${majorColor} 1px, transparent 1px),
        linear-gradient(90deg, ${majorColor} 1px, transparent 1px),
        linear-gradient(${minor} 1px, transparent 1px),
        linear-gradient(90deg, ${minor} 1px, transparent 1px)
      `,
      backgroundSize: `${major}px ${major}px, ${major}px ${major}px, ${major}px ${major}px, ${major}px ${major}px, ${cell}px ${cell}px, ${cell}px ${cell}px`,
    } as CSSProperties;
  }, [snapEnabled, snapSize]);

  const applySize = (raw: number) => setSnapSize(clampSnapSize(raw));

  const body = (
    <>
      <div className="snap-grid-head">
        <span className="snap-grid-status">{snapEnabled ? `Snap ${label}` : 'Snap off'}</span>
        <button
          type="button"
          className={`snap-toggle ${snapEnabled ? 'on' : ''}`}
          role="switch"
          aria-checked={snapEnabled}
          title={snapEnabled ? 'Disable snapping' : 'Enable snapping'}
          onClick={() => setSnapEnabled(!snapEnabled)}
        >
          <span className="snap-toggle-thumb" />
          <span className="snap-toggle-text">{snapEnabled ? 'On' : 'Off'}</span>
        </button>
      </div>

      <div className="snap-preview" style={previewStyle} aria-hidden>
        <span className="snap-preview-badge">{label}</span>
      </div>

      <div className="snap-preset-row">
        {SNAP_GRID_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={`snap-preset-btn ${Math.abs(snapSize - preset) < 0.001 ? 'active' : ''}`}
            onClick={() => applySize(preset)}
          >
            {preset}
          </button>
        ))}
      </div>

      <div className="snap-size-control">
        <label className="snap-size-label" htmlFor="snap-size-input">
          Step
        </label>
        <div className="snap-size-inputs">
          <input
            id="snap-size-input"
            type="number"
            className="snap-size-number"
            min={0.25}
            max={100}
            step={0.25}
            value={snapSize}
            onChange={(e) => applySize(parseFloat(e.target.value) || snapSize)}
          />
          <input
            type="range"
            className="snap-size-slider"
            min={1}
            max={20}
            step={1}
            value={Math.min(20, Math.max(1, Math.round(snapSize)))}
            onChange={(e) => applySize(parseInt(e.target.value, 10))}
            aria-label="Grid step"
          />
        </div>
      </div>

      <label className="sp-toggle-row snap-option">
        <input type="checkbox" checked={showGrid3D} onChange={(e) => setShowGrid3D(e.target.checked)} />
        <span>Show grid in viewports</span>
      </label>

      <button
        type="button"
        className="sp-action-btn sp-action-btn--full"
        onClick={snapToGrid}
        title="Snap selected vertices to grid"
      >
        Snap selection to grid
      </button>
    </>
  );

  if (embedded) {
    return <div className="snap-grid-embedded">{body}</div>;
  }

  return (
    <fieldset className="ms-fieldset snap-grid-section">
      <legend className="snap-grid-legend">
        <span>Grid &amp; Snap</span>
      </legend>
      {body}
    </fieldset>
  );
}
