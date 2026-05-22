import { useEditorStore } from '@/store/editorStore';
import { useMeshDocument } from '@/hooks/useSceneRevision';
import { QUICK_MATERIAL_PALETTE, normalizeHexColor } from '@/systems/materials/materialPalette';

export function MaterialsTab() {
  const mesh = useMeshDocument();
  const matSel = useEditorStore((s) => s.matSel);
  const selFaces = useEditorStore((s) => s.selFaces);
  const setMatSel = useEditorStore((s) => s.setMatSel);
  const addMaterial = useEditorStore((s) => s.addMaterial);
  const pickPaletteColor = useEditorStore((s) => s.pickPaletteColor);
  const setMaterialName = useEditorStore((s) => s.setMaterialName);
  const setMaterialColor = useEditorStore((s) => s.setMaterialColor);
  const applyMaterialToSelection = useEditorStore((s) => s.applyMaterialToSelection);

  const active = mesh.materials[matSel];
  const activeColor = active?.color ?? '#6f9df6';
  const selectionCount = selFaces.size;

  return (
    <fieldset className="ms-fieldset mat-panel">
      <legend>Materials</legend>

      {active && (
        <div className="mat-active">
          <div className="mat-active-swatch" style={{ background: activeColor }} title={activeColor} />
          <div className="mat-active-fields">
            <input
              type="text"
              className="mat-name-input"
              value={active.name}
              onChange={(e) => setMaterialName(e.target.value)}
              aria-label="Material name"
            />
            <div className="mat-active-row">
              <input
                type="color"
                className="mat-color-input"
                value={activeColor}
                onChange={(e) => setMaterialColor(normalizeHexColor(e.target.value))}
                aria-label="Custom color"
                title="Fine-tune color"
              />
              <span className="mat-hex">{activeColor}</span>
            </div>
          </div>
        </div>
      )}

      <p className="mat-section-label">Quick colors</p>
      <p className="mat-hint">Click a swatch — updates the active material{selectionCount > 0 ? ' and paints selected faces' : ''}.</p>
      <div className="mat-palette" role="listbox" aria-label="Quick material colors">
        {QUICK_MATERIAL_PALETTE.map((entry) => {
          const isActive = activeColor.toLowerCase() === entry.color.toLowerCase();
          return (
            <button
              key={entry.color}
              type="button"
              role="option"
              aria-selected={isActive}
              className={`mat-palette-swatch ${isActive ? 'active' : ''}`}
              style={{ background: entry.color }}
              title={entry.label}
              onClick={() => pickPaletteColor(entry.color)}
            />
          );
        })}
      </div>

      <button
        type="button"
        className="ms-btn mat-apply-btn"
        onClick={() => applyMaterialToSelection()}
        disabled={selectionCount === 0}
        title={
          selectionCount > 0
            ? `Apply ${active?.name ?? 'material'} to ${selectionCount} selected face(s)`
            : 'Select faces first (face mode), then apply'
        }
      >
        Paint Selection{selectionCount > 0 ? ` (${selectionCount})` : ''}
      </button>

      <p className="mat-section-label">Saved materials</p>
      <div className="mat-saved-list">
        {mesh.materials.map((m, i) => (
          <button
            key={i}
            type="button"
            className={`mat-saved-chip ${i === matSel ? 'sel' : ''}`}
            onClick={() => {
              setMatSel(i);
              if (selectionCount > 0) applyMaterialToSelection(i);
            }}
            title={`${m.name} — click to use${selectionCount > 0 ? ', applies to selection' : ''}`}
          >
            <span className="mat-saved-swatch" style={{ background: m.color }} />
            <span className="mat-saved-name">{m.name}</span>
          </button>
        ))}
      </div>

      <div className="ms-btn-row">
        <button type="button" className="ms-btn" onClick={addMaterial}>
          + New Material
        </button>
      </div>
    </fieldset>
  );
}
