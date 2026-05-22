import { useState } from 'react';
import { useEditorStore } from '@/store/editorStore';

export function Modal() {
  const modal = useEditorStore((s) => s.modal);
  const closeModal = useEditorStore((s) => s.closeModal);
  const [values, setValues] = useState<Record<string, string>>({});

  if (!modal?.open) return null;

  const fields = modal.fields;
  const currentValues = fields.reduce(
    (acc, f) => ({ ...acc, [f.id]: values[f.id] ?? f.value }),
    {} as Record<string, string>,
  );

  return (
    <div
      className="modal-overlay show"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <div className="modal">
        <div className="modal-hdr">
          <span>{modal.title}</span>
          <button type="button" className="modal-close" onClick={closeModal} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          {fields.map((f) => (
            <div key={f.id} className="modal-row">
              <span className="modal-lbl">{f.label}</span>
              {f.type === 'color' ? (
                <input
                  type="color"
                  id={f.id}
                  value={currentValues[f.id]}
                  onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
                  style={{ width: 50, height: 24, border: 'none', background: 'none' }}
                />
              ) : (
                <input
                  className="modal-input"
                  id={f.id}
                  value={currentValues[f.id]}
                  onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
                />
              )}
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button type="button" className="modal-btn" onClick={closeModal}>
            Cancel
          </button>
          <button
            type="button"
            className="modal-btn primary"
            onClick={() => {
              modal.onConfirm(currentValues);
              closeModal();
              setValues({});
            }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
