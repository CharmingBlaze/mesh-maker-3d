import { useState } from 'react';
import { LayersPanel } from '@/components/panels/LayersPanel';
import { MaterialsTab } from '@/components/panels/MaterialsTab';

type SceneTab = 'objects' | 'materials';

export function ScenePanel() {
  const [tab, setTab] = useState<SceneTab>('objects');

  return (
    <aside className="scene-panel studio-panel" aria-label="Scene outline">
      <div className="sp-tabs">
        {(
          [
            ['objects', 'Objects'],
            ['materials', 'Materials'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`sp-tab ${tab === id ? 'active' : ''}`}
            onClick={() => setTab(id)}
            aria-selected={tab === id}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="sp-tab-body">
        {tab === 'objects' && <LayersPanel />}
        {tab === 'materials' && <MaterialsTab />}
      </div>
    </aside>
  );
}
