import type { View2DKey } from '@/core/math/projection';

/** Fixed layout panel slot (top / front / side / 3d). */
export type ViewportSlotId = View2DKey | '3d';

/** Content any slot can display, including the texture editor. */
export type ViewportViewId = ViewportSlotId | 'texture';

/** Layout panel id — alias for slot ids used in the panel tree. */
export type ViewportId = ViewportSlotId;

export function isView2DKey(view: ViewportViewId): view is View2DKey {
  return view === 'top' || view === 'front' || view === 'side';
}

export type ViewportLayoutId =
  | 'quad'
  | 'horizontal'
  | 'vertical'
  | 'focus3d'
  | 'orthoVertical'
  | 'orthoHorizontal'
  | 'orthoLeft3d'
  | 'single3d';

export const VIEWPORT_LABELS: Record<ViewportViewId, string> = {
  top: 'Top View',
  front: 'Front View',
  side: 'Side View',
  '3d': '3D View',
  texture: 'Texture Editor',
};

/** All views available in the slot dropdown. */
export const VIEWPORT_VIEW_IDS: readonly ViewportViewId[] = ['top', 'front', 'side', '3d', 'texture'];

/** Fixed layout slot ids (panel tree). */
export const VIEWPORT_SLOT_IDS: readonly ViewportSlotId[] = ['top', 'front', 'side', '3d'];

/** @deprecated use VIEWPORT_VIEW_IDS */
export const VIEWPORT_IDS = VIEWPORT_VIEW_IDS;

export const DEFAULT_VIEWPORT_SLOT_VIEWS: Record<ViewportSlotId, ViewportViewId> = {
  top: 'top',
  front: 'front',
  side: 'side',
  '3d': '3d',
};

export const VIEWPORT_LAYOUT_LABELS: Record<ViewportLayoutId, string> = {
  quad: 'Four views (2×2)',
  horizontal: 'Four views (row)',
  vertical: 'Four views (column)',
  focus3d: 'Large 3D + ortho strip',
  orthoVertical: 'Orthographic (column)',
  orthoHorizontal: 'Orthographic (row)',
  orthoLeft3d: 'Orthographic column + 3D',
  single3d: '3D only',
};

/** View menu groupings for layout presets. */
export const VIEWPORT_LAYOUT_MENU_GROUPS: ReadonlyArray<{
  heading: string;
  layouts: ViewportLayoutId[];
}> = [
  {
    heading: 'All views',
    layouts: ['quad', 'horizontal', 'vertical', 'focus3d'],
  },
  {
    heading: 'Orthographic (2D)',
    layouts: ['orthoVertical', 'orthoHorizontal'],
  },
  {
    heading: 'Other',
    layouts: ['orthoLeft3d', 'single3d'],
  },
];

const QUAD_TOP: ReadonlySet<ViewportSlotId> = new Set(['top', 'front']);
const QUAD_BOT: ReadonlySet<ViewportSlotId> = new Set(['side', '3d']);
const ORTHO_STRIP: ReadonlySet<ViewportSlotId> = new Set(['top', 'front', 'side']);
const ORTHO_ONLY: ReadonlySet<ViewportSlotId> = new Set(['top', 'front', 'side']);
const VIEWPORT_SLOT_SET: ReadonlySet<ViewportSlotId> = new Set(['top', 'front', 'side', '3d']);

/** Whether a layout panel should collapse while another viewport is maximized. */
export function isViewportPanelCollapsed(panelId: string, maximized: ViewportSlotId | null): boolean {
  if (!maximized) return false;
  if (panelId === maximized) return false;

  if (panelId === 'quad-top-row') return !QUAD_TOP.has(maximized);
  if (panelId === 'quad-bot-row') return !QUAD_BOT.has(maximized);
  if (panelId === 'ortho-strip') return !ORTHO_STRIP.has(maximized);
  if (panelId === 'ortho-column') return !ORTHO_ONLY.has(maximized);
  if (panelId === '3d-main') return maximized !== '3d';

  if (VIEWPORT_SLOT_SET.has(panelId as ViewportSlotId)) return panelId !== maximized;

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
  'ortho-column',
  '3d-main',
] as const;

/** Panel/group ids to collapse when a viewport is maximized. */
export function panelsToCollapseWhenMaximized(maximized: ViewportSlotId): string[] {
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
    case 'orthoVertical':
      return ['meshmaker-ortho-v', 'top', 'front', 'side'];
    case 'orthoHorizontal':
      return ['meshmaker-ortho-h', 'top', 'front', 'side'];
    case 'orthoLeft3d':
      return ['meshmaker-ortho-left3d', 'ortho-column', 'top', 'front', 'side', '3d'];
    case 'single3d':
      return ['meshmaker-single-3d', '3d'];
    default:
      return ['top', 'front', 'side', '3d'];
  }
}

/** Hidden panel ids for maximize CSS, scoped to the active layout. */
export function panelsHiddenWhenMaximized(
  maximized: ViewportSlotId,
  layout: ViewportLayoutId,
): string[] {
  const inLayout = new Set(panelIdsInLayout(layout));
  return panelsToCollapseWhenMaximized(maximized).filter((id) => inLayout.has(id));
}

/** Ancestor panels to expand so the maximized viewport fills the area. */
export function panelsExpandedWhenMaximized(
  maximized: ViewportSlotId,
  layout: ViewportLayoutId,
): string[] {
  const hidden = new Set(panelsHiddenWhenMaximized(maximized, layout));
  return panelIdsInLayout(layout).filter((id) => !hidden.has(id) && id !== maximized);
}
