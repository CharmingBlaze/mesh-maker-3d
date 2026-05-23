/** Sci-fi HUD palette shared by the 2D canvases and 3D scene. */
export const MS3D_VIEW = {
  orthoBg: '#0a0f16',
  orthoGrid: '#141e2a',
  orthoGridMajor: '#2a3848',
  /** World-origin cross in orthographic views (matches 3D grid center tone). */
  orthoGridCenter: '#3a5868',
  orthoAxis: '#5eb8c9',
  orthoAxisText: '#9ee4ef',
  faceFill: '#2a4555',
  faceStroke: '#6ec4d0',
  faceSelected: '#e85a1a',
  edgeSelected: '#ff6b20',
  vertex: '#6ec4d0',
  vertexSelected: '#ff6b20',
  selection: '#6ec4d0',

  perspectiveBg: '#0a0f16',
  perspectiveBgHex: 0x0a0f16,
  perspectiveGridLight: '#2a3d4f',
  perspectiveGridDark: '#121c28',

  /** Transform gizmo axes — warm orange / cyan (matches --accent2 / --accent). */
  gizmoAxisX: '#e85a1a',
  gizmoAxisY: '#6ec4d0',
  gizmoAxisZ: '#9ee4ef',
  gizmoCenter: '#e8eef4',
  gizmoActive: '#ffffff',
  gizmoHelper: '#5eb8c9',
  gizmoViewRing: '#3a6270',
} as const;

/** Three.js hex equivalents for MS3D gizmo colors. */
export const MS3D_GIZMO_HEX = {
  axisX: 0xe85a1a,
  axisY: 0x6ec4d0,
  axisZ: 0x9ee4ef,
  center: 0xe8eef4,
  active: 0xffffff,
  helper: 0x5eb8c9,
  viewRing: 0x3a6270,
} as const;
