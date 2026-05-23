import { type ReactNode } from 'react';

/** Collapsible side-panel section — click header to minimize / expand. */
export function PanelSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="sp-section sp-section--collapsible" open={defaultOpen}>
      <summary className="sp-section-head">
        <span className="sp-section-title">{title}</span>
        <span className="sp-section-toggle" aria-hidden />
      </summary>
      <div className="sp-section-body">{children}</div>
    </details>
  );
}

export function PanelGroupLabel({ children }: { children: ReactNode }) {
  return <div className="sp-group-label">{children}</div>;
}

export function PanelHint({ children }: { children: ReactNode }) {
  return <p className="sp-hint">{children}</p>;
}

export function PanelToggle({
  checked,
  onChange,
  label,
  title,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  title?: string;
}) {
  return (
    <label className="sp-toggle-row" title={title}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function PanelPillRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string; title?: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="sp-pill-row" role="tablist">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="tab"
          aria-selected={value === opt.id}
          className={`sp-pill ${value === opt.id ? 'active' : ''}`}
          title={opt.title}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** Compact XYZ numeric inputs with axis color cues. */
export function TransformFields({
  x,
  y,
  z,
  onX,
  onY,
  onZ,
}: {
  x: number;
  y: number;
  z: number;
  onX: (v: number) => void;
  onY: (v: number) => void;
  onZ: (v: number) => void;
}) {
  return (
    <div className="sp-transform-fields">
      {(
        [
          ['x', x, onX, 'X'],
          ['y', y, onY, 'Y'],
          ['z', z, onZ, 'Z'],
        ] as const
      ).map(([axis, val, set, label]) => (
        <label key={axis} className={`sp-axis-field sp-axis-field--${axis}`}>
          <span className="sp-axis-label">{label}</span>
          <input
            type="number"
            value={val}
            step={5}
            onChange={(e) => set(+e.target.value)}
            aria-label={`${label} value`}
          />
        </label>
      ))}
    </div>
  );
}
