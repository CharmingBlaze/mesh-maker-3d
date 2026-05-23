/** Preset colors for quick material picking (game / low-poly friendly). */
export interface PaletteColor {
  color: string;
  label: string;
}

export interface PaletteGroup {
  label: string;
  colors: PaletteColor[];
}

export const QUICK_MATERIAL_PALETTE: PaletteColor[] = [
  { color: '#f4f6f8', label: 'White' },
  { color: '#b8c5d0', label: 'Light gray' },
  { color: '#6b7c8f', label: 'Gray' },
  { color: '#2e3640', label: 'Dark gray' },
  { color: '#12161c', label: 'Black' },
  { color: '#e85d4a', label: 'Red' },
  { color: '#ff6b35', label: 'Orange' },
  { color: '#f0a020', label: 'Amber' },
  { color: '#f5d547', label: 'Yellow' },
  { color: '#7ec7a2', label: 'Mint' },
  { color: '#3cb878', label: 'Green' },
  { color: '#2a6e4a', label: 'Forest' },
  { color: '#5dd9c8', label: 'Teal' },
  { color: '#00b4d8', label: 'Cyan' },
  { color: '#6f9df6', label: 'Blue' },
  { color: '#3d5a9e', label: 'Navy' },
  { color: '#9b8cf2', label: 'Purple' },
  { color: '#c98fbf', label: 'Pink' },
  { color: '#e27d7d', label: 'Salmon' },
  { color: '#8d6e63', label: 'Brown' },
  { color: '#d4a76a', label: 'Tan' },
  { color: '#f5e6c8', label: 'Cream' },
  { color: '#c4a882', label: 'Sand' },
  { color: '#7a9e6a', label: 'Olive' },
  { color: '#4a6741', label: 'Moss' },
  { color: '#b87333', label: 'Copper' },
  { color: '#c0c8d8', label: 'Silver' },
  { color: '#ffd700', label: 'Gold' },
  { color: '#84ffff', label: 'Ice' },
  { color: '#ff3e88', label: 'Hot pink' },
  { color: '#a8ff3e', label: 'Lime' },
  { color: '#7f77dd', label: 'Violet' },
];

export const MATERIAL_PALETTE_GROUPS: PaletteGroup[] = [
  {
    label: 'Neutrals',
    colors: [
      { color: '#f4f6f8', label: 'White' },
      { color: '#b8c5d0', label: 'Light gray' },
      { color: '#6b7c8f', label: 'Gray' },
      { color: '#2e3640', label: 'Dark gray' },
      { color: '#12161c', label: 'Black' },
      { color: '#c0c8d8', label: 'Silver' },
    ],
  },
  {
    label: 'Warm',
    colors: [
      { color: '#e85d4a', label: 'Red' },
      { color: '#ff6b35', label: 'Orange' },
      { color: '#f0a020', label: 'Amber' },
      { color: '#f5d547', label: 'Yellow' },
      { color: '#e27d7d', label: 'Salmon' },
      { color: '#d4a76a', label: 'Tan' },
      { color: '#f5e6c8', label: 'Cream' },
      { color: '#b87333', label: 'Copper' },
      { color: '#ffd700', label: 'Gold' },
    ],
  },
  {
    label: 'Cool',
    colors: [
      { color: '#7ec7a2', label: 'Mint' },
      { color: '#3cb878', label: 'Green' },
      { color: '#2a6e4a', label: 'Forest' },
      { color: '#5dd9c8', label: 'Teal' },
      { color: '#00b4d8', label: 'Cyan' },
      { color: '#6f9df6', label: 'Blue' },
      { color: '#3d5a9e', label: 'Navy' },
      { color: '#84ffff', label: 'Ice' },
    ],
  },
  {
    label: 'Earth & accent',
    colors: [
      { color: '#8d6e63', label: 'Brown' },
      { color: '#c4a882', label: 'Sand' },
      { color: '#7a9e6a', label: 'Olive' },
      { color: '#4a6741', label: 'Moss' },
      { color: '#9b8cf2', label: 'Purple' },
      { color: '#7f77dd', label: 'Violet' },
      { color: '#c98fbf', label: 'Pink' },
      { color: '#ff3e88', label: 'Hot pink' },
      { color: '#a8ff3e', label: 'Lime' },
    ],
  },
];

export function normalizeHexColor(input: string): string {
  const raw = input.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    const h = raw.slice(1);
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
  }
  return raw;
}
