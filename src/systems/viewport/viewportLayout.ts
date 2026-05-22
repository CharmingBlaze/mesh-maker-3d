import type { View2DKey } from '@/core/math/projection';

export type ViewportId = View2DKey | '3d';

export type ViewportLayoutId = 'quad' | 'horizontal' | 'vertical' | 'focus3d';

export const VIEWPORT_LABELS: Record<ViewportId, string> = {
  top: 'Top View',
  front: 'Front View',
  side: 'Side View',
  '3d': '3D View',
};

export const VIEWPORT_LAYOUT_LABELS: Record<ViewportLayoutId, string> = {
  quad: 'Four views (2×2)',
  horizontal: 'Four views (row)',
  vertical: 'Four views (column)',
  focus3d: 'Large 3D + orthographic strip',
};

const QUAD_TOP: ReadonlySet<ViewportId> = new Set(['top', 'front']);
const QUAD_BOT: ReadonlySet<ViewportId> = new Set(['side', '3d']);
const ORTHO_STRIP: ReadonlySet<ViewportId> = new Set(['top', 'front', 'side']);
const VIEWPORT_IDS: ReadonlySet<ViewportId> = new Set(['top', 'front', 'side', '3d']);

/** Whether a layout panel should collapse while another viewport is maximized. */
export function isViewportPanelCollapsed(panelId: string, maximized: ViewportId | null): boolean {
  if (!maximized) return false;
  if (panelId === maximized) return false;

  if (panelId === 'quad-top-row') return !QUAD_TOP.has(maximized);
  if (panelId === 'quad-bot-row') return !QUAD_BOT.has(maximized);
  if (panelId === 'ortho-strip') return !ORTHO_STRIP.has(maximized);
  if (panelId === '3d-main') return maximized !== '3d';

  if (VIEWPORT_IDS.has(panelId as ViewportId)) return panelId !== maximized;

  return false;
}

const LAYOUT_PANEL_IDS = [
  'top',
  'front',
  'side',
  '3d',
  'quad-top-row',
  'quad-bot-row',
  'ortho-strip',
  '3d-main',
] as const;

/** Panel/group ids to collapse when a viewport is maximized. */
export function panelsToCollapseWhenMaximized(maximized: ViewportId): string[] {
  return LAYOUT_PANEL_IDS.filter((id) => isViewportPanelCollapsed(id, maximized));
}

/** Panel/group ids that exist in the current layout tree (for maximize CSS). */
export function panelIdsInLayout(layout: ViewportLayoutId): readonly string[] {
  switch (layout) {
    case 'quad':
      return [
        'meshmaker-quad',
        'quad-top-row',
        'quad-bot-row',
        'top',
        'front',
        'side',
        '3d',
      ];
    case 'horizontal':
      return ['meshmaker-h', 'top', 'front', 'side', '3d'];
    case 'vertical':
      return ['meshmaker-v', 'top', 'front', 'side', '3d'];
    case 'focus3d':
      return ['meshmaker-focus3d', '3d-main', 'ortho-strip', 'top', 'front', 'side', '3d'];
    default:
      return ['top', 'front', 'side', '3d'];
  }
}

/** Hidden panel ids for maximize CSS, scoped to the active layout. */
export function panelsHiddenWhenMaximized(
  maximized: ViewportId,
  layout: ViewportLayoutId,
): string[] {
  const inLayout = new Set(panelIdsInLayout(layout));
  return panelsToCollapseWhenMaximized(maximized).filter((id) => inLayout.has(id));
}

/** Ancestor panels to expand so the maximized viewport fills the area. */
export function panelsExpandedWhenMaximized(
  maximized: ViewportId,
  layout: ViewportLayoutId,
): string[] {
  const hidden = new Set(panelsHiddenWhenMaximized(maximized, layout));
  return panelIdsInLayout(layout).filter((id) => !hidden.has(id) && id !== maximized);
}
