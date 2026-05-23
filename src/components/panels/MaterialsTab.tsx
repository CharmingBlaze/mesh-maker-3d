import { useEffect, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { useMeshDocument, useHasSceneObjects } from '@/hooks/useSceneRevision';
import {
  MATERIAL_PALETTE_GROUPS,
  normalizeHexColor,
} from '@/systems/materials/materialPalette';
import { PanelGroupLabel, PanelHint, PanelSection } from '@/components/panels/panelUi';

function isValidHex(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(normalizeHexColor(value));
}

export function MaterialsTab() {
  const mesh = useMeshDocument();
  const hasSceneObjects = useHasSceneObjects();
  const matSel = useEditorStore((s) => s.matSel);
  const selFaces = useEditorStore((s) => s.selFaces);
  const setMatSel = useEditorStore((s) => s.setMatSel);
  const addMaterial = useEditorStore((s) => s.addMaterial);
  const duplicateMaterial = useEditorStore((s) => s.duplicateMaterial);
  const removeMaterial = useEditorStore((s) => s.removeMaterial);
  const pickPaletteColor = useEditorStore((s) => s.pickPaletteColor);
  const setMaterialName = useEditorStore((s) => s.setMaterialName);
  const setMaterialColor = useEditorStore((s) => s.setMaterialColor);
  const applyMaterialToSelection = useEditorStore((s) => s.applyMaterialToSelection);
  const openTextureEditor = useEditorStore((s) => s.openTextureEditor);

  const active = mesh.materials[matSel];
  const activeColor = active?.color ?? '#6f9df6';
  const selectionCount = selFaces.size;
  const canRemove = mesh.materials.length > 1;

  const [hexDraft, setHexDraft] = useState(activeColor);
  useEffect(() => {
    setHexDraft(activeColor);
  }, [activeColor]);

  const commitHex = () => {
    const normalized = normalizeHexColor(hexDraft);
    if (isValidHex(normalized)) {
      setMaterialColor(normalized);
      setHexDraft(normalized);
    } else {
      setHexDraft(activeColor);
    }
  };

  if (!hasSceneObjects) {
    return (
      <div className="lp-tab lp-materials-tab">
        <div className="lp-mat-empty">
          <span className="lp-mat-empty-icon" aria-hidden>
            ◫
          </span>
          <p>No objects in scene</p>
          <span className="lp-mat-empty-hint">Add a primitive or import a mesh to edit materials.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="lp-tab lp-materials-tab">
      {selectionCount > 0 && (
        <div className="lp-mat-status" role="status">
          <span className="lp-mat-status-dot" aria-hidden />
          <span>
            {selectionCount} face{selectionCount === 1 ? '' : 's'} selected
          </span>
        </div>
      )}

      {active && (
        <PanelSection title="Active material">
          <div className="lp-mat-hero">
            <label className="lp-mat-preview" title="Click to pick color">
              <span className="lp-mat-preview-checker" aria-hidden />
              <span className="lp-mat-preview-color" style={{ background: activeColor }} aria-hidden />
              <input
                type="color"
                className="lp-mat-preview-picker"
                value={activeColor}
                onChange={(e) => setMaterialColor(normalizeHexColor(e.target.value))}
                aria-label="Material color"
              />
            </label>
            <div className="lp-mat-meta">
              <div className="lp-mat-slot">Slot {matSel + 1}</div>
              <label className="lp-mat-field">
                <span className="lp-mat-field-label">Name</span>
                <input
                  type="text"
                  className="lp-mat-name"
                  value={active.name}
                  onChange={(e) => setMaterialName(e.target.value)}
                  aria-label="Material name"
                />
              </label>
              <label className="lp-mat-field">
                <span className="lp-mat-field-label">Hex</span>
                <div className="lp-mat-color-field">
                  <span className="lp-mat-color-chip" style={{ background: activeColor }} aria-hidden />
                  <input
                    type="text"
                    className="lp-mat-hex-input"
                    value={hexDraft}
                    spellCheck={false}
                    aria-label="Hex color"
                    onChange={(e) => setHexDraft(e.target.value)}
                    onBlur={commitHex}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                      }
                      if (e.key === 'Escape') {
                        setHexDraft(activeColor);
                        e.currentTarget.blur();
                      }
                    }}
                  />
                </div>
              </label>
            </div>
          </div>

          <div className="lp-mat-toolbar">
            <button
              type="button"
              className="lp-mat-btn lp-mat-btn--accent"
              onClick={() => openTextureEditor()}
              title="Switch active panel to Texture Editor view"
            >
              Texture Editor
            </button>
            <button
              type="button"
              className="lp-mat-btn lp-mat-btn--primary"
              onClick={() => applyMaterialToSelection()}
              disabled={selectionCount === 0}
              title={
                selectionCount > 0
                  ? `Apply ${active.name} to selected faces`
                  : 'Select faces in face mode first'
              }
            >
              Paint selection{selectionCount > 0 ? ` · ${selectionCount}` : ''}
            </button>
            <button
              type="button"
              className="lp-mat-btn"
              onClick={() => duplicateMaterial()}
              title="Duplicate active material"
            >
              Duplicate
            </button>
            <button
              type="button"
              className="lp-mat-btn lp-mat-btn--danger"
              onClick={() => removeMaterial()}
              disabled={!canRemove}
              title={canRemove ? 'Remove active material' : 'At least one material is required'}
            >
              Remove
            </button>
          </div>
        </PanelSection>
      )}

      <PanelSection title="Quick palette">
        <PanelHint>
          {selectionCount > 0
            ? 'Swatches update the active material and paint selected faces.'
            : 'Swatches update the active material color.'}
        </PanelHint>
        <div className="lp-mat-palette-groups">
          {MATERIAL_PALETTE_GROUPS.map((group) => (
            <div key={group.label} className="lp-mat-palette-group">
              <PanelGroupLabel>{group.label}</PanelGroupLabel>
              <div className="lp-mat-palette" role="listbox" aria-label={`${group.label} colors`}>
                {group.colors.map((entry) => {
                  const isActive = activeColor.toLowerCase() === entry.color.toLowerCase();
                  return (
                    <button
                      key={entry.color}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      aria-label={entry.label}
                      className={`lp-mat-palette-swatch ${isActive ? 'active' : ''}`}
                      style={{ background: entry.color }}
                      title={entry.label}
                      onClick={() => pickPaletteColor(entry.color)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Library">
        <div className="lp-mat-library">
          {mesh.materials.map((m, i) => {
            const selected = i === matSel;
            return (
              <div
                key={i}
                className={`lp-mat-item ${selected ? 'selected' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setMatSel(i);
                  if (selectionCount > 0) applyMaterialToSelection(i);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setMatSel(i);
                    if (selectionCount > 0) applyMaterialToSelection(i);
                  }
                }}
                title={
                  selectionCount > 0
                    ? `${m.name} — select and apply to ${selectionCount} face(s)`
                    : m.name
                }
              >
                <span className="lp-mat-item-index">{i + 1}</span>
                <span className="lp-mat-item-swatch" style={{ background: m.color }} aria-hidden />
                <span className="lp-mat-item-name">{m.name}</span>
                <span className="lp-mat-item-hex">{m.color}</span>
              </div>
            );
          })}
        </div>
        <div className="lp-mat-library-footer">
          <button type="button" className="lp-mat-btn lp-mat-btn--accent" onClick={addMaterial}>
            + New material
          </button>
          <span className="lp-mat-library-count">
            {mesh.materials.length} material{mesh.materials.length === 1 ? '' : 's'}
          </span>
        </div>
      </PanelSection>
    </div>
  );
}
