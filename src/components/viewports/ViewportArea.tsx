import { useEffect, useMemo } from 'react';
import { Group, Separator } from 'react-resizable-panels';
import { useEditorStore } from '@/store/editorStore';
import type { ViewportLayoutId } from '@/systems/viewport/viewportLayout';
import {
  panelsExpandedWhenMaximized,
  panelsHiddenWhenMaximized,
} from '@/systems/viewport/viewportLayout';
import { VpGroupPanel, VpPanel } from './VpPanel';
import { ViewportPanel } from './ViewportPanel';

function notifyViewportResize() {
  useEditorStore.getState().notifyChange({ markDirty: false });
}

function VpSeparator() {
  return <Separator className="vp-resize-handle" />;
}

/** Inner group must fill the panel so nested splits get a real height. */
const nestedGroupStyle = { width: '100%', height: '100%', minHeight: 0, minWidth: 0 } as const;

function QuadLayout() {
  return (
    <Group
      id="meshmaker-quad"
      orientation="vertical"
      className="viewport-panel-group"
      defaultLayout={{ 'quad-top-row': 50, 'quad-bot-row': 50 }}
      onLayoutChanged={notifyViewportResize}
    >
      <VpGroupPanel id="quad-top-row" defaultSize="50%" onResize={notifyViewportResize}>
        <Group
          id="quad-top"
          orientation="horizontal"
          style={nestedGroupStyle}
          defaultLayout={{ top: 50, front: 50 }}
          onLayoutChanged={notifyViewportResize}
        >
          <VpPanel id="top" defaultSize="50%" onResize={notifyViewportResize} />
          <VpSeparator />
          <VpPanel id="front" defaultSize="50%"  onResize={notifyViewportResize} />
        </Group>
      </VpGroupPanel>
      <VpSeparator />
      <VpGroupPanel id="quad-bot-row" defaultSize="50%" onResize={notifyViewportResize}>
        <Group
          id="quad-bot"
          orientation="horizontal"
          style={nestedGroupStyle}
          defaultLayout={{ side: 50, '3d': 50 }}
          onLayoutChanged={notifyViewportResize}
        >
          <VpPanel id="side" defaultSize="50%"  onResize={notifyViewportResize} />
          <VpSeparator />
          <VpPanel id="3d" defaultSize="50%"  onResize={notifyViewportResize} />
        </Group>
      </VpGroupPanel>
    </Group>
  );
}

function HorizontalLayout() {
  return (
    <Group
      id="meshmaker-h"
      orientation="horizontal"
      className="viewport-panel-group"
      defaultLayout={{ top: 25, front: 25, side: 25, '3d': 25 }}
      onLayoutChanged={notifyViewportResize}
    >
      <VpPanel id="top" defaultSize="25%" onResize={notifyViewportResize} />
      <VpSeparator />
      <VpPanel id="front" defaultSize="25%" onResize={notifyViewportResize} />
      <VpSeparator />
      <VpPanel id="side" defaultSize="25%" onResize={notifyViewportResize} />
      <VpSeparator />
      <VpPanel id="3d" defaultSize="25%" onResize={notifyViewportResize} />
    </Group>
  );
}

function VerticalLayout() {
  return (
    <Group
      id="meshmaker-v"
      orientation="vertical"
      className="viewport-panel-group"
      defaultLayout={{ top: 25, front: 25, side: 25, '3d': 25 }}
      onLayoutChanged={notifyViewportResize}
    >
      <VpPanel id="top" defaultSize="25%" onResize={notifyViewportResize} />
      <VpSeparator />
      <VpPanel id="front" defaultSize="25%" onResize={notifyViewportResize} />
      <VpSeparator />
      <VpPanel id="side" defaultSize="25%" onResize={notifyViewportResize} />
      <VpSeparator />
      <VpPanel id="3d" defaultSize="25%" onResize={notifyViewportResize} />
    </Group>
  );
}

function Focus3dLayout() {
  return (
    <Group
      id="meshmaker-focus3d"
      orientation="vertical"
      className="viewport-panel-group"
      defaultLayout={{ '3d-main': 72, 'ortho-strip': 28 }}
      onLayoutChanged={notifyViewportResize}
    >
      <VpGroupPanel id="3d-main" defaultSize="72%" onResize={notifyViewportResize}>
        <ViewportPanel id="3d" />
      </VpGroupPanel>
      <VpSeparator />
      <VpGroupPanel id="ortho-strip" defaultSize="28%" onResize={notifyViewportResize}>
        <Group
          id="meshmaker-focus-ortho"
          orientation="horizontal"
          style={nestedGroupStyle}
          defaultLayout={{ top: 33, front: 33, side: 34 }}
          onLayoutChanged={notifyViewportResize}
        >
          <VpPanel id="top" defaultSize="33%" onResize={notifyViewportResize} />
          <VpSeparator />
          <VpPanel id="front" defaultSize="33%" onResize={notifyViewportResize} />
          <VpSeparator />
          <VpPanel id="side" defaultSize="34%" onResize={notifyViewportResize} />
        </Group>
      </VpGroupPanel>
    </Group>
  );
}

const LAYOUTS: Record<ViewportLayoutId, () => React.ReactElement> = {
  quad: QuadLayout,
  horizontal: HorizontalLayout,
  vertical: VerticalLayout,
  focus3d: Focus3dLayout,
};

export function ViewportArea() {
  const maximizedVP = useEditorStore((s) => s.maximizedVP);
  const viewportLayout = useEditorStore((s) => s.viewportLayout);

  const maximizeStyles = useMemo(() => {
    if (!maximizedVP) return '';
    const hidden = panelsHiddenWhenMaximized(maximizedVP, viewportLayout);
    const expanded = panelsExpandedWhenMaximized(maximizedVP, viewportLayout);
    const hideRules = hidden
      .map(
        (id) =>
          `.viewport-area--maximized #${id}{flex:0 0 0!important;min-height:0!important;min-width:0!important;max-height:0!important;max-width:0!important;overflow:hidden!important;padding:0!important;border-width:0!important;visibility:hidden!important}`,
      )
      .join('');
    const showRules = `.viewport-area--maximized #${maximizedVP}{flex:1 1 100%!important;min-height:0!important;min-width:0!important;height:100%!important;visibility:visible!important}`;
    const ancestorRules = expanded
      .filter((id) => id !== maximizedVP)
      .map(
        (id) =>
          `.viewport-area--maximized #${id}{flex:1 1 100%!important;min-height:0!important;min-width:0!important;height:100%!important;visibility:visible!important}`,
      )
      .join('');
    return `${hideRules}${showRules}${ancestorRules}`;
  }, [maximizedVP, viewportLayout]);

  useEffect(() => {
    const id = window.setTimeout(notifyViewportResize, 50);
    const id2 = window.setTimeout(notifyViewportResize, 200);
    const id3 = window.setTimeout(notifyViewportResize, 400);
    return () => {
      window.clearTimeout(id);
      window.clearTimeout(id2);
      window.clearTimeout(id3);
    };
  }, [maximizedVP, viewportLayout]);

  const Layout = LAYOUTS[viewportLayout] ?? QuadLayout;

  return (
    <div
      className={`viewport-area ${maximizedVP ? 'viewport-area--maximized' : ''}`}
      data-maximized-view={maximizedVP ?? undefined}
    >
      {maximizeStyles ? <style>{maximizeStyles}</style> : null}
      <div className="viewport-panel-group-host">
        <Layout />
      </div>
      {maximizedVP && <div className="vp-maximize-hint">Space — restore views</div>}
    </div>
  );
}
