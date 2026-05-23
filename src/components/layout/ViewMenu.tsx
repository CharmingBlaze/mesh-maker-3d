import { useEditorStore } from '@/store/editorStore';
import { SNAP_GRID_PRESETS } from '@/systems/viewport/snapGrid';
import {
  VIEWPORT_LABELS,
  VIEWPORT_LAYOUT_LABELS,
  VIEWPORT_LAYOUT_MENU_GROUPS,
  VIEWPORT_VIEW_IDS,
} from '@/systems/viewport/viewportLayout';

export function ViewMenu() {
  const wireframe = useEditorStore((s) => s.wireframe);
  const flatShading = useEditorStore((s) => s.flatShading);
  const showGrid3D = useEditorStore((s) => s.showGrid3D);
  const snapEnabled = useEditorStore((s) => s.snapEnabled);
  const snapSize = useEditorStore((s) => s.snapSize);
  const activeVP = useEditorStore((s) => s.activeVP);
  const maximizedVP = useEditorStore((s) => s.maximizedVP);
  const viewportLayout = useEditorStore((s) => s.viewportLayout);

  const store = useEditorStore();

  return (
    <div className="view-menu">
      <div className="dd-subheading">Display</div>
      <CheckMenuItem active={wireframe} onSelect={store.toggleWireframe}>
        Wireframe <span className="dd-shortcut">W</span>
      </CheckMenuItem>
      <CheckMenuItem active={flatShading} onSelect={store.toggleFlat}>
        Flat shading
      </CheckMenuItem>

      <div className="dd-sep" />
      <div className="dd-subheading">Camera</div>
      <MenuItem onClick={store.frameAll}>
        Frame all <span className="dd-shortcut">Shift+F</span>
      </MenuItem>
      <MenuItem onClick={store.centerAllViews}>Reset &amp; center views</MenuItem>

      <div className="dd-sep" />
      <div className="dd-subheading">Grid &amp; snap</div>
      <CheckMenuItem active={showGrid3D} onSelect={store.toggleGrid3D}>
        Show grid in viewports
      </CheckMenuItem>
      <CheckMenuItem active={snapEnabled} onSelect={() => store.setSnapEnabled(!snapEnabled)}>
        Snap to grid
      </CheckMenuItem>
      <div className="dd-subheading dd-subheading--nested">Snap step</div>
      {SNAP_GRID_PRESETS.map((preset) => (
        <CheckMenuItem
          key={preset}
          active={Math.abs(snapSize - preset) < 0.001}
          onSelect={() => store.setSnapSize(preset)}
        >
          {preset}
        </CheckMenuItem>
      ))}
      <MenuItem onClick={store.snapToGrid}>Snap selection to grid</MenuItem>

      <div className="dd-sep" />
      <MenuItem onClick={store.openTextureEditor}>Texture Editor view</MenuItem>

      <div className="dd-sep" />
      <div className="dd-subheading">Active viewport</div>
      {VIEWPORT_VIEW_IDS.map((id) => (
        <CheckMenuItem key={id} active={activeVP === id} onSelect={() => store.setActiveVP(id)}>
          {VIEWPORT_LABELS[id]}
        </CheckMenuItem>
      ))}

      <div className="dd-sep" />
      <div className="dd-heading">View layout</div>
      {VIEWPORT_LAYOUT_MENU_GROUPS.map((group, groupIndex) => (
        <div key={group.heading}>
          {groupIndex > 0 && <div className="dd-sep" />}
          <div className="dd-subheading">{group.heading}</div>
          {group.layouts.map((layoutId) => (
            <CheckMenuItem
              key={layoutId}
              active={viewportLayout === layoutId}
              onSelect={() => store.setViewportLayout(layoutId)}
            >
              {VIEWPORT_LAYOUT_LABELS[layoutId]}
            </CheckMenuItem>
          ))}
        </div>
      ))}

      <div className="dd-sep" />
      <CheckMenuItem active={!!maximizedVP} onSelect={store.toggleViewportMaximize}>
        Maximize active view <span className="dd-shortcut">Space</span>
      </CheckMenuItem>
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button type="button" className={`dd-item ${className ?? ''}`} onClick={onClick}>
      {children}
    </button>
  );
}

function CheckMenuItem({
  children,
  active,
  onSelect,
}: {
  children: React.ReactNode;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button type="button" className={`dd-item dd-item--check ${active ? 'active' : ''}`} onClick={onSelect}>
      <span className="dd-check">{active ? '✓' : ''}</span>
      <span className="dd-item-label">{children}</span>
    </button>
  );
}
