import { useMemo, type CSSProperties } from 'react';
import { useEditorStore } from '@/store/editorStore';
import {
  SNAP_GRID_PRESETS,
  clampSnapSize,
  formatSnapSize,
} from '@/systems/viewport/snapGrid';

export function SnapGridSection() {
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

  return (
    <fieldset className="ms-fieldset snap-grid-section">
      <legend className="snap-grid-legend">
        <span>Grid &amp; Snap</span>
        <button
          type="button"
          className={`snap-toggle ${snapEnabled ? 'on' : ''}`}
          role="switch"
          aria-checked={snapEnabled}
          title={snapEnabled ? 'Snapping on — click to disable' : 'Snapping off — click to enable'}
          onClick={() => setSnapEnabled(!snapEnabled)}
        >
          <span className="snap-toggle-thumb" />
          <span className="snap-toggle-text">{snapEnabled ? 'On' : 'Off'}</span>
        </button>
      </legend>

      <div className="snap-preview" style={previewStyle} aria-hidden>
        <span className="snap-preview-badge">{label} u</span>
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
          Increment
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
            aria-label="Grid size quick adjust"
          />
        </div>
      </div>

      <div className="snap-options">
        <label className="snap-option">
          <input
            type="checkbox"
            checked={showGrid3D}
            onChange={(e) => setShowGrid3D(e.target.checked)}
          />
          <span>Show grid in viewports</span>
        </label>
      </div>

      <div className="snap-actions">
        <button
          type="button"
          className="ms-btn snap-snap-btn"
          onClick={snapToGrid}
          title="Snap selected vertices to the grid (Mesh → Snap to Grid)"
        >
          Snap Selection
        </button>
      </div>

      <p className="snap-hint">
        {snapEnabled
          ? `Moves and draws align to ${label} world units.`
          : 'Snapping disabled — grid is visual only.'}
      </p>
    </fieldset>
  );
}
