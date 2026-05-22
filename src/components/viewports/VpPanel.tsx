import type { ReactNode } from 'react';
import { Panel, type PanelProps } from 'react-resizable-panels';
import type { ViewportId } from '@/systems/viewport/viewportLayout';
import { ViewportPanel } from './ViewportPanel';

type VpPanelProps = Omit<PanelProps, 'id' | 'children' | 'panelRef'> & {
  id: ViewportId;
  onResize?: PanelProps['onResize'];
};

/** Resizable viewport slot. Maximize (Space) hides siblings via CSS in ViewportArea. */
export function VpPanel({ id, onResize, minSize = 0, ...panelProps }: VpPanelProps) {
  const { collapsed: _collapsed, ...safePanelProps } = panelProps as PanelProps & {
    collapsed?: boolean;
  };

  return (
    <Panel id={id} minSize={minSize} onResize={onResize} {...safePanelProps}>
      <ViewportPanel id={id} />
    </Panel>
  );
}

/** Container row/column in a layout. */
export function VpGroupPanel({
  id,
  children,
  onResize,
  minSize = 0,
  ...panelProps
}: Omit<PanelProps, 'children' | 'panelRef'> & {
  id: string;
  children: ReactNode;
  onResize?: PanelProps['onResize'];
}) {
  const { collapsed: _collapsed, ...safePanelProps } = panelProps as PanelProps & {
    collapsed?: boolean;
  };

  return (
    <Panel id={id} minSize={minSize} onResize={onResize} {...safePanelProps}>
      {children}
    </Panel>
  );
}
