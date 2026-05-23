export type TextureEditorToolId = 'paint' | 'eraser' | 'fill' | 'uv' | 'eyedropper' | 'select';

export interface TextureToolDef {
  id: TextureEditorToolId;
  label: string;
  shortcut: string;
  title: string;
  /** Show brush size + color controls when active. */
  usesBrush: boolean;
}

export const TEXTURE_TOOLS: readonly TextureToolDef[] = [
  { id: 'paint', label: 'Brush', shortcut: 'B', title: 'Paint pixels (B)', usesBrush: true },
  { id: 'eraser', label: 'Eraser', shortcut: 'E', title: 'Erase to background (E)', usesBrush: true },
  { id: 'fill', label: 'Fill', shortcut: 'G', title: 'Flood fill (G)', usesBrush: true },
  { id: 'eyedropper', label: 'Pick', shortcut: 'I', title: 'Sample color (I)', usesBrush: false },
  { id: 'uv', label: 'UV', shortcut: 'U', title: 'Move UV islands (U)', usesBrush: false },
  { id: 'select', label: 'Face', shortcut: 'F', title: 'Select face UV (F)', usesBrush: false },
] as const;

export const TEXTURE_TOOL_SHORTCUTS: Record<string, TextureEditorToolId> = {
  b: 'paint',
  e: 'eraser',
  g: 'fill',
  i: 'eyedropper',
  u: 'uv',
  f: 'select',
};

export function textureToolUsesBrush(tool: TextureEditorToolId): boolean {
  return TEXTURE_TOOLS.find((t) => t.id === tool)?.usesBrush ?? false;
}
