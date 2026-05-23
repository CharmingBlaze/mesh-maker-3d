import * as THREE from 'three';
import type { Vec3 } from '@/core/math/Vec3';
import type { BoundingBox } from '@/core/math/BoundingBox';
import { boundsCenter, boundsCorners, boundsSize } from '@/core/math/BoundingBox';
import type { MeshDocument } from '@/core/mesh/MeshDocument';
import { parseEdgeKey, type EdgeKey, type SelectionMode } from '@/systems/selection/selectionSystem';
import { MS3D_VIEW } from '@/systems/viewport/viewportColors';
import {
  VIEWPORT_GRID_EXTENT,
  clampSnapSize,
  gridHelperDivisions,
} from '@/systems/viewport/snapGrid';
import { OrbitCamera } from '@/systems/viewport/orbitCamera';
import type { PrimDrawState } from '@/systems/mesh/primDraw';
import { buildPrimitiveMeshInBounds } from '@/systems/mesh/primitiveFromBounds';
import {
  buildPrimDrawHandles,
  type PrimDrawHandle,
} from '@/systems/mesh/primDrawHandles';
import type { SceneRenderEntry } from '@/systems/scene/sceneObjectHelpers';
import { meshWorldBounds } from '@/systems/scene/sceneObjectHelpers';
import { visibleFaceIndices, visibleVertexIndices } from '@/systems/layers/layerSystem';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import type { GizmoMode } from '@/systems/viewport/transformGizmo3D';
import {
  applyTransformControlsChange,
  beginTransformControlsDrag,
  commitTransformControlsDrag,
  createTransformControlsSession,
  type TransformControlsSession,
} from '@/systems/viewport/transformControlsBridge';
import { applyTransformControlsTheme } from '@/systems/viewport/transformGizmoTheme';
import { ensureFaceUvsArray, uvForThree } from '@/core/mesh/faceUv';
import { drawDataUrlToCanvas } from '@/core/mesh/textureMap';

/** Instanced vertex cube size in the 3D (perspective) viewport — world units. */
const PERSP_VERT_SIZE = 0.65;
const PERSP_VERT_SELECTED_SIZE = 1;

export class Viewport3DRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly meshGroup: THREE.Group;
  readonly vertGroup: THREE.Group;
  readonly previewGroup: THREE.Group;
  readonly pivotObject: THREE.Object3D;
  readonly transformControls: TransformControls;
  private transformSession: TransformControlsSession;
  private grid3d: THREE.GridHelper;
  private gridSnapSize = 5;
  readonly orbitCamera = new OrbitCamera();
  private animId = 0;
  private lastWidth = 0;
  private lastHeight = 0;
  private lastRebuildKey = '';
  private needsRender = true;
  private primActiveHandleId: string | null = null;
  private atlasTexture: THREE.Texture | null = null;
  private atlasTextureKey = '';
  private atlasLiveCanvas: HTMLCanvasElement | null = null;
  /** True when atlasLiveCanvas was updated by live painting (skip async reload on commit). */
  private atlasLiveDirty = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(MS3D_VIEW.perspectiveBgHex);
    this.renderer.shadowMap.enabled = true;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
    this.orbitCamera.applyTo(this.camera);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.85);
    keyLight.position.set(2, 4, 3);
    keyLight.castShadow = true;
    this.scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x3a6878, 0.35);
    fillLight.position.set(-2, -1, -2);
    this.scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0xe85a1a, 0.2);
    rimLight.position.set(0, 3, -4);
    this.scene.add(rimLight);

    this.grid3d = this.createGridHelper(5);
    this.scene.add(this.grid3d);
    this.scene.add(new THREE.AxesHelper(80));

    this.meshGroup = new THREE.Group();
    this.vertGroup = new THREE.Group();
    this.previewGroup = new THREE.Group();
    this.scene.add(this.meshGroup);
    this.scene.add(this.vertGroup);
    this.scene.add(this.previewGroup);

    this.pivotObject = new THREE.Object3D();
    this.scene.add(this.pivotObject);

    this.transformSession = createTransformControlsSession();
    this.transformControls = new TransformControls(this.camera, canvas);
    this.transformControls.space = 'world';
    this.scene.add(this.transformControls.getHelper());

    this.transformControls.addEventListener('mouseDown', () => {
      if (!this.transformControls.object) return;
      beginTransformControlsDrag(
        this.transformSession,
        this.pivotObject,
        this.transformControls.mode as 'translate' | 'rotate' | 'scale',
      );
    });
    this.transformControls.addEventListener('objectChange', () => {
      applyTransformControlsChange(this.transformSession, this.pivotObject);
    });
    this.transformControls.addEventListener('mouseUp', () => {
      commitTransformControlsDrag(this.transformSession);
      this.resetPivotObject();
    });

    applyTransformControlsTheme(this.transformControls);

    this.updateCamera();
  }

  isTransformGizmoDragging(): boolean {
    return this.transformControls.dragging;
  }

  setTransformGizmo(
    mode: GizmoMode | null,
    pivot: Vec3 | null,
    translationSnap: number | null = null,
  ): void {
    if (this.transformControls.dragging) {
      this.needsRender = true;
      return;
    }

    if (!mode || !pivot) {
      this.transformControls.detach();
      this.transformControls.enabled = false;
      this.pivotObject.visible = false;
      this.needsRender = true;
      return;
    }

    this.resetPivotObject(pivot);
    this.pivotObject.visible = true;
    this.transformControls.enabled = true;
    this.transformControls.setMode(
      mode === 'move' ? 'translate' : mode === 'rotate' ? 'rotate' : 'scale',
    );
    this.transformControls.setSize(1);
    this.transformControls.setTranslationSnap(translationSnap);
    this.transformControls.attach(this.pivotObject);
    this.needsRender = true;
  }

  private resetPivotObject(pivot?: Vec3): void {
    if (pivot) {
      this.pivotObject.position.set(pivot.x, pivot.y, pivot.z);
    }
    this.pivotObject.rotation.set(0, 0, 0);
    this.pivotObject.scale.set(1, 1, 1);
    this.pivotObject.updateMatrixWorld(true);
  }

  private addCadBoxToGroup(bounds: BoundingBox): void {
    const size = boundsSize(bounds);
    const center = boundsCenter(bounds);
    if (size.x < 0.01 && size.y < 0.01 && size.z < 0.01) return;

    const geo = new THREE.BoxGeometry(
      Math.max(size.x, 0.01),
      Math.max(size.y, 0.01),
      Math.max(size.z, 0.01),
    );
    const edges = new THREE.EdgesGeometry(geo);
    const lines = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0xe85a1a }),
    );
    lines.position.set(center.x, center.y, center.z);
    this.previewGroup.add(lines);

    const fill = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color: 0xe85a1a,
        transparent: true,
        opacity: 0.05,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    fill.position.set(center.x, center.y, center.z);
    this.previewGroup.add(fill);
  }

  private addPrimitiveInsideBox(draw: PrimDrawState): void {
    const primitive = buildPrimitiveMeshInBounds(draw.type, draw.bounds, draw.baseView, { preview: true });
    if (primitive.vertices.length === 0 || primitive.faces.length === 0) return;

    const pos: number[] = [];
    const norms: number[] = [];
    const indices: number[] = [];
    primitive.faces.forEach((face) => {
      if (face.length < 3) return;
      const v0 = primitive.vertices[face[0]];
      for (let i = 1; i < face.length - 1; i++) {
        const v1 = primitive.vertices[face[i]];
        const v2 = primitive.vertices[face[i + 1]];
        const base = pos.length / 3;
        pos.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
        const n = new THREE.Vector3()
          .crossVectors(
            new THREE.Vector3(v1.x - v0.x, v1.y - v0.y, v1.z - v0.z),
            new THREE.Vector3(v2.x - v0.x, v2.y - v0.y, v2.z - v0.z),
          )
          .normalize();
        norms.push(n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z);
        indices.push(base, base + 1, base + 2);
      }
    });

    if (pos.length === 0) return;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
    geo.setIndex(indices);

    this.previewGroup.add(
      new THREE.Mesh(
        geo,
        new THREE.MeshPhongMaterial({
          color: 0x6ec4d0,
          transparent: true,
          opacity: 0.28,
          depthWrite: false,
          side: THREE.DoubleSide,
          shininess: 60,
        }),
      ),
    );
    this.previewGroup.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(geo, 12),
        new THREE.LineBasicMaterial({
          color: 0x9ee4ef,
          transparent: true,
          opacity: 0.9,
        }),
      ),
    );
  }

  private addPrimDrawHandles(draw: PrimDrawState, activeHandleId: string | null): void {
    const handles = buildPrimDrawHandles(draw.bounds, draw.phase, draw.extentAxis);
    handles.forEach((handle) => {
      this.previewGroup.add(this.createHandleMesh(handle, handle.id === activeHandleId));
    });
  }

  /** World-axis-aligned selection outline (matches orthographic viewport bounds). */
  private addWorldBoundsOutline(bounds: BoundingBox, color: number): void {
    const corners = boundsCorners(bounds).map((c) => new THREE.Vector3(c.x, c.y, c.z));
    const edges: [number, number][] = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 4],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7],
    ];
    const positions: number[] = [];
    edges.forEach(([a, b]) => {
      positions.push(corners[a].x, corners[a].y, corners[a].z, corners[b].x, corners[b].y, corners[b].z);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.meshGroup.add(
      new THREE.LineSegments(
        geo,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }),
      ),
    );
  }

  private createHandleMesh(handle: PrimDrawHandle, active: boolean): THREE.Object3D {
    const { position, kind } = handle;
    const group = new THREE.Group();
    group.position.set(position.x, position.y, position.z);

    if (kind === 'center') {
      const mat = new THREE.MeshBasicMaterial({ color: active ? 0xe85a1a : 0x667a90 });
      group.add(new THREE.Mesh(new THREE.SphereGeometry(active ? 1.6 : 1.2, 10, 10), mat));
      if (active) {
        group.add(
          new THREE.Mesh(
            new THREE.SphereGeometry(2.6, 12, 12),
            new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.7 }),
          ),
        );
      }
      return group;
    }

    const size =
      kind === 'extent' ? (active ? 3.6 : 2.8) : kind === 'corner' ? (active ? 2.8 : 2) : active ? 2.6 : 1.8;
    const color =
      kind === 'extent' ? (active ? 0xb8f4ff : 0x6ec4d0) : active ? 0xff8a4a : 0xe8eef4;
    const geo =
      kind === 'extent' && handle.axis === 'y'
        ? new THREE.BoxGeometry(size, size * 1.75, size)
        : kind === 'extent' && handle.axis === 'x'
          ? new THREE.BoxGeometry(size * 1.75, size, size)
          : kind === 'extent' && handle.axis === 'z'
            ? new THREE.BoxGeometry(size, size, size * 1.75)
            : new THREE.BoxGeometry(size, size, size);
    group.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color })));

    if (active) {
      const haloScale = kind === 'extent' ? 1.55 : 1.45;
      const halo = new THREE.Mesh(
        geo.clone(),
        new THREE.MeshBasicMaterial({
          color: kind === 'extent' ? 0xffffff : 0xe85a1a,
          wireframe: true,
          transparent: true,
          opacity: 0.9,
        }),
      );
      halo.scale.set(haloScale, haloScale, haloScale);
      group.add(halo);
    }

    return group;
  }

  /** CAD construction box with primitive shape visible inside. */
  setCadPrimPreview(draw: PrimDrawState | null, activeHandleId?: string | null): void {
    if (activeHandleId !== undefined) this.primActiveHandleId = activeHandleId;
    this.clearGroup(this.previewGroup);
    if (!draw) {
      this.primActiveHandleId = null;
      this.requestRender();
      return;
    }
    this.addCadBoxToGroup(draw.bounds);
    this.addPrimitiveInsideBox(draw);
    this.addPrimDrawHandles(draw, this.primActiveHandleId);
    this.requestRender();
  }

  setKnifePreview(draw: import('@/systems/mesh/knifeDraw').KnifeDrawState | null): void {
    this.clearGroup(this.previewGroup);
    if (!draw) {
      this.requestRender();
      return;
    }

    const linePts = draw.hover
      ? [...draw.points, draw.hover].map((p) => p.position)
      : draw.points.map((p) => p.position);

    if (linePts.length >= 2) {
      const vecs = linePts.map((p) => new THREE.Vector3(p.x, p.y, p.z));
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(vecs),
        new THREE.LineBasicMaterial({
          color: 0xe85a1a,
          transparent: true,
          opacity: 0.95,
        }),
      );
      this.previewGroup.add(line);
    }

    draw.points.forEach((pt) => {
      const isNode = pt.kind === 'node';
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(isNode ? 0.36 : 0.32, 8, 8),
        new THREE.MeshBasicMaterial({ color: isNode ? 0x38bdf8 : 0x4ade80 }),
      );
      dot.position.set(pt.position.x, pt.position.y, pt.position.z);
      this.previewGroup.add(dot);
    });

    if (draw.hover) {
      const snapColor =
        draw.hover.kind === 'node' || draw.hover.reuseOf !== undefined
          ? 0x38bdf8
          : draw.hover.kind === 'vertex'
            ? 0x93c5fd
            : draw.hover.kind === 'edge'
              ? 0xfbbf24
              : 0xffffff;
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.38, 8, 8),
        new THREE.MeshBasicMaterial({ color: snapColor }),
      );
      dot.position.set(draw.hover.position.x, draw.hover.position.y, draw.hover.position.z);
      this.previewGroup.add(dot);
    }

    this.requestRender();
  }

  setBoundsPreview(bounds: BoundingBox | null): void {
    this.clearGroup(this.previewGroup);
    if (bounds) this.addCadBoxToGroup(bounds);
    this.requestRender();
  }

  /** @deprecated Use setCadPrimPreview */
  setPrimitivePreview(draw: PrimDrawState | null): void {
    this.setCadPrimPreview(draw);
  }

  updateCamera(): void {
    this.orbitCamera.applyTo(this.camera);
    this.transformControls.camera = this.camera;
    this.needsRender = true;
  }

  orbit(deltaX: number, deltaY: number, viewportHeight: number): void {
    this.orbitCamera.rotate(deltaX, deltaY, viewportHeight);
    this.updateCamera();
  }

  pan(deltaX: number, deltaY: number): void {
    this.orbitCamera.pan(deltaX, deltaY, this.camera);
    this.updateCamera();
  }

  zoom(deltaY: number): void {
    this.orbitCamera.zoom(deltaY);
    this.updateCamera();
  }

  private createGridHelper(snapSize: number): THREE.GridHelper {
    return new THREE.GridHelper(
      VIEWPORT_GRID_EXTENT,
      gridHelperDivisions(snapSize),
      MS3D_VIEW.perspectiveGridLight,
      MS3D_VIEW.perspectiveGridDark,
    );
  }

  /** Sync floor grid spacing with editor snap size and visibility. */
  setSnapGrid(snapSize: number, visible: boolean): void {
    const size = clampSnapSize(snapSize);
    if (Math.abs(size - this.gridSnapSize) > 0.001) {
      this.scene.remove(this.grid3d);
      this.grid3d.dispose();
      this.gridSnapSize = size;
      this.grid3d = this.createGridHelper(size);
      this.scene.add(this.grid3d);
    }
    this.grid3d.visible = visible;
    this.needsRender = true;
  }

  setGridVisible(visible: boolean): void {
    this.setSnapGrid(this.gridSnapSize, visible);
  }

  private createAtlasTexture(): THREE.Texture {
    const map = new THREE.Texture();
    map.colorSpace = THREE.SRGBColorSpace;
    map.magFilter = THREE.NearestFilter;
    map.minFilter = THREE.NearestFilter;
    map.wrapS = THREE.ClampToEdgeWrapping;
    map.wrapT = THREE.ClampToEdgeWrapping;
    map.generateMipmaps = false;
    return map;
  }

  private textureCacheKey(tex: NonNullable<MeshDocument['texture']>): string {
    return `${tex.width}x${tex.height}:${tex.dataUrl.length}:${tex.dataUrl.slice(-48)}`;
  }

  private ensureAtlasTexture(mesh: MeshDocument): THREE.Texture | null {
    const tex = mesh.texture;
    if (!tex) return null;
    const key = this.textureCacheKey(tex);
    if (this.atlasTexture && this.atlasTextureKey === key) return this.atlasTexture;

    if (!this.atlasTexture) this.atlasTexture = this.createAtlasTexture();
    if (
      !this.atlasLiveCanvas ||
      this.atlasLiveCanvas.width !== tex.width ||
      this.atlasLiveCanvas.height !== tex.height
    ) {
      this.atlasLiveCanvas = document.createElement('canvas');
      this.atlasLiveCanvas.width = tex.width;
      this.atlasLiveCanvas.height = tex.height;
      this.atlasLiveDirty = false;
    }

    const canvas = this.atlasLiveCanvas;
    this.atlasTexture.image = canvas;

    const finish = () => {
      if (!this.atlasTexture) return;
      this.atlasTexture.needsUpdate = true;
      this.atlasTextureKey = key;
      this.atlasLiveDirty = false;
      this.needsRender = true;
    };

    // Live painting already uploaded pixels — keep them when the mesh rebuilds on commit.
    if (this.atlasLiveDirty) {
      finish();
      return this.atlasTexture;
    }

    if (drawDataUrlToCanvas(tex.dataUrl, canvas, tex.width, tex.height)) {
      finish();
      return this.atlasTexture;
    }

    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, tex.width, tex.height);
      ctx.drawImage(img, 0, 0, tex.width, tex.height);
      finish();
    };
    img.onerror = () => {
      this.needsRender = true;
    };
    img.src = tex.dataUrl;

    return this.atlasTexture;
  }

  /** Push pixel edits to the GPU during texture painting without a full scene rebuild. */
  updateLiveAtlasFromCanvas(source: CanvasImageSource, width: number, height: number): void {
    if (!this.atlasTexture) this.atlasTexture = this.createAtlasTexture();
    if (
      !this.atlasLiveCanvas ||
      this.atlasLiveCanvas.width !== width ||
      this.atlasLiveCanvas.height !== height
    ) {
      this.atlasLiveCanvas = document.createElement('canvas');
      this.atlasLiveCanvas.width = width;
      this.atlasLiveCanvas.height = height;
      this.atlasTexture.image = this.atlasLiveCanvas;
    }
    const ctx = this.atlasLiveCanvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);
    this.atlasLiveDirty = true;
    this.atlasTexture.needsUpdate = true;
    this.needsRender = true;
  }

  private addTexturedMesh(
    mesh: MeshDocument,
    visibleFaces: Set<number>,
    flatShading: boolean,
    targetGroup: THREE.Group = this.meshGroup,
  ): void {
    const map = this.ensureAtlasTexture(mesh);
    if (!map) return;
    ensureFaceUvsArray(mesh);
    const pos: number[] = [];
    const uv: number[] = [];
    const norms: number[] = [];
    const idxArr: number[] = [];
    mesh.faces.forEach((f, fi) => {
      if (!f || f.length < 3 || !visibleFaces.has(fi)) return;
      const uvMap = mesh.faceUvs[fi];
      if (!uvMap) return;
      const verts = f.map((vi) => mesh.vertices[vi]);
      const v0 = new THREE.Vector3(verts[0].x, verts[0].y, verts[0].z);
      for (let i = 1; i < verts.length - 1; i++) {
        const tri = [0, i, i + 1];
        const base = pos.length / 3;
        tri.forEach((ti) => {
          const v = verts[ti];
          pos.push(v.x, v.y, v.z);
          const vi = f[ti];
          const tuv = uvMap[vi] ?? { u: 0, v: 0 };
          const glUv = uvForThree(tuv.u, tuv.v);
          uv.push(glUv.u, glUv.v);
        });
        const v1 = new THREE.Vector3(verts[i].x, verts[i].y, verts[i].z);
        const v2 = new THREE.Vector3(verts[i + 1].x, verts[i + 1].y, verts[i + 1].z);
        const n = new THREE.Vector3()
          .crossVectors(v1.clone().sub(v0), v2.clone().sub(v0))
          .normalize();
        norms.push(n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z);
        idxArr.push(base, base + 1, base + 2);
      }
    });
    if (pos.length === 0) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
    geo.setIndex(idxArr);
    if (flatShading) geo.computeVertexNormals();
    const mat = new THREE.MeshPhongMaterial({
      map,
      side: THREE.DoubleSide,
      transparent: false,
      shininess: 20,
      flatShading,
    });
    targetGroup.add(new THREE.Mesh(geo, mat));
    const edges = new THREE.EdgesGeometry(geo, 15);
    targetGroup.add(
      new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: 0x253545, transparent: true, opacity: 0.45 }),
      ),
    );
  }

  /** Blender-style UV face outlines on the 3D mesh when a texture atlas is active. */
  private addUvWireframeOverlay(
    group: THREE.Group,
    mesh: MeshDocument,
    visibleFaces: Set<number>,
    selFaces: Set<number>,
  ): void {
    if (!mesh.texture) return;
    ensureFaceUvsArray(mesh);
    mesh.faces.forEach((face, fi) => {
      if (!face || face.length < 3 || !visibleFaces.has(fi)) return;
      const uvMap = mesh.faceUvs[fi];
      if (!uvMap || Object.keys(uvMap).length === 0) return;
      const points: number[] = [];
      face.forEach((vi) => {
        const v = mesh.vertices[vi];
        if (!v) return;
        points.push(v.x, v.y, v.z);
      });
      if (points.length < 9) return;
      const v0 = mesh.vertices[face[0]];
      if (v0) points.push(v0.x, v0.y, v0.z);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      const selected = selFaces.has(fi);
      group.add(
        new THREE.Line(
          geo,
          new THREE.LineBasicMaterial({
            color: selected ? 0xe85a1a : 0x6ec4d0,
            transparent: true,
            opacity: selected ? 0.95 : 0.4,
          }),
        ),
      );
    });
  }

  /** Skip GPU rebuild when mesh/selection/display state unchanged (large-scene optimization). */
  rebuild(
    mesh: MeshDocument,
    selVerts: Set<number>,
    selEdges: Set<EdgeKey>,
    selFaces: Set<number>,
    visibleVerts: Set<number>,
    visibleFaces: Set<number>,
    wireframe: boolean,
    flatShading: boolean,
    cacheKey: string,
  ): void {
    if (cacheKey === this.lastRebuildKey) {
      this.needsRender = true;
      return;
    }
    this.lastRebuildKey = cacheKey;
    this.clearGroup(this.meshGroup);
    this.clearGroup(this.vertGroup);

    const buildMeshForFaces = (faceIndices: number[], color: string, highlight = false) => {
      const pos: number[] = [],
        norms: number[] = [],
        idxArr: number[] = [];
      faceIndices.forEach((fi) => {
        if (!visibleFaces.has(fi)) return;
        const f = mesh.faces[fi];
        if (!f || f.length < 3) return;
        const verts = f.map((vi) => mesh.vertices[vi]);
        const v0 = new THREE.Vector3(verts[0].x, verts[0].y, verts[0].z);
        for (let i = 1; i < verts.length - 1; i++) {
          const v1 = new THREE.Vector3(verts[i].x, verts[i].y, verts[i].z);
          const v2 = new THREE.Vector3(verts[i + 1].x, verts[i + 1].y, verts[i + 1].z);
          const base = pos.length / 3;
          pos.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
          const n = new THREE.Vector3()
            .crossVectors(v1.clone().sub(v0), v2.clone().sub(v0))
            .normalize();
          norms.push(n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z);
          idxArr.push(base, base + 1, base + 2);
        }
      });
      if (pos.length === 0) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
      geo.setIndex(idxArr);
      if (flatShading) geo.computeVertexNormals();

      if (highlight) {
        this.meshGroup.add(
          new THREE.Mesh(
            geo,
            new THREE.MeshBasicMaterial({
              color: 0xe85a1a,
              transparent: true,
              opacity: 0.35,
              side: THREE.DoubleSide,
            }),
          ),
        );
        return;
      }

      const mat = new THREE.MeshPhongMaterial({
        color: new THREE.Color(color),
        side: THREE.DoubleSide,
        wireframe,
        transparent: true,
        opacity: wireframe ? 1 : 0.9,
        shininess: 50,
        flatShading,
      });
      this.meshGroup.add(new THREE.Mesh(geo, mat));
      if (!wireframe) {
        const edges = new THREE.EdgesGeometry(geo, 15);
        const lmat = new THREE.LineBasicMaterial({
          color: new THREE.Color(color),
          opacity: 0.35,
          transparent: true,
        });
        this.meshGroup.add(new THREE.LineSegments(edges, lmat));
      }
      const selF = faceIndices.filter((fi) => selFaces.has(fi));
      if (selF.length > 0) buildMeshForFaces(selF, color, true);
    };

    if (mesh.texture && !wireframe) {
      this.addTexturedMesh(mesh, visibleFaces, flatShading);
      this.addUvWireframeOverlay(this.meshGroup, mesh, visibleFaces, selFaces);
      const selF = [...selFaces].filter((fi) => visibleFaces.has(fi));
      if (selF.length > 0) buildMeshForFaces(selF, '#e85a1a', true);
    } else {
      mesh.groups.forEach((g) => {
        const visibleGroupFaces = g.faces.filter((fi) => visibleFaces.has(fi));
        if (visibleGroupFaces.length > 0) buildMeshForFaces(visibleGroupFaces, g.color);
      });
      const assigned = new Set(mesh.groups.flatMap((g) => g.faces));
      const unassigned = mesh.faces
        .map((_, fi) => fi)
        .filter((fi) => visibleFaces.has(fi) && !assigned.has(fi) && mesh.faces[fi] && mesh.faces[fi]!.length >= 3);
      if (unassigned.length > 0) buildMeshForFaces(unassigned, '#888888');
    }

    if (selEdges.size > 0) {
      const points: number[] = [];
      selEdges.forEach((edge) => {
        const [a, b] = parseEdgeKey(edge);
        const va = mesh.vertices[a];
        const vb = mesh.vertices[b];
        if (!visibleVerts.has(a) || !visibleVerts.has(b)) return;
        if (!va || !vb) return;
        points.push(va.x, va.y, va.z, vb.x, vb.y, vb.z);
      });
      if (points.length > 0) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
        this.meshGroup.add(
          new THREE.LineSegments(
            geo,
            new THREE.LineBasicMaterial({ color: 0xff6b20, linewidth: 2 }),
          ),
        );
      }
    }

    const normalVerts: number[] = [];
    const selectedVerts: number[] = [];
    mesh.vertices.forEach((_, vi) => {
      if (!visibleVerts.has(vi)) return;
      if (selVerts.has(vi)) selectedVerts.push(vi);
      else normalVerts.push(vi);
    });

    const addVertexInstances = (indices: number[], size: number, color: number) => {
      if (indices.length === 0) return;
      const geo = new THREE.BoxGeometry(size, size, size);
      const mat = new THREE.MeshBasicMaterial({ color });
      const instanced = new THREE.InstancedMesh(geo, mat, indices.length);
      const matrix = new THREE.Matrix4();
      indices.forEach((vi, index) => {
        const v = mesh.vertices[vi];
        matrix.makeTranslation(v.x, v.y, v.z);
        instanced.setMatrixAt(index, matrix);
      });
      instanced.instanceMatrix.needsUpdate = true;
      this.vertGroup.add(instanced);
    };

    addVertexInstances(selectedVerts, PERSP_VERT_SELECTED_SIZE, 0xff6b20);
    this.needsRender = true;
  }

  /** Rebuild all scene objects with per-node transforms. */
  rebuildScene(
    entries: SceneRenderEntry[],
    activeMeshId: string,
    selectionMode: SelectionMode,
    selVerts: Set<number>,
    selEdges: Set<EdgeKey>,
    selFaces: Set<number>,
    wireframe: boolean,
    flatShading: boolean,
    cacheKey: string,
  ): void {
    if (cacheKey === this.lastRebuildKey) {
      this.needsRender = true;
      return;
    }
    this.lastRebuildKey = cacheKey;
    this.clearGroup(this.meshGroup);
    this.clearGroup(this.vertGroup);

    entries.forEach((entry) => {
      if (!entry.visible) return;
      const objectGroup = new THREE.Group();
      objectGroup.position.set(
        entry.transform.position.x,
        entry.transform.position.y,
        entry.transform.position.z,
      );
      objectGroup.rotation.set(
        (entry.transform.rotation.x * Math.PI) / 180,
        (entry.transform.rotation.y * Math.PI) / 180,
        (entry.transform.rotation.z * Math.PI) / 180,
      );
      objectGroup.scale.set(entry.transform.scale.x, entry.transform.scale.y, entry.transform.scale.z);

      const isActive = entry.mesh.id === activeMeshId;
      const showMeshSelection = isActive && selectionMode !== 'object';
      const meshSelVerts = showMeshSelection ? selVerts : new Set<number>();
      const meshSelEdges = showMeshSelection ? selEdges : new Set<EdgeKey>();
      const meshSelFaces = showMeshSelection ? selFaces : new Set<number>();
      const visibleVerts = visibleVertexIndices(entry.mesh);
      const visibleFaces = visibleFaceIndices(entry.mesh);

      this.buildMeshIntoGroup(
        objectGroup,
        entry.mesh,
        meshSelVerts,
        meshSelEdges,
        meshSelFaces,
        visibleVerts,
        visibleFaces,
        wireframe,
        flatShading,
      );

      this.meshGroup.add(objectGroup);

      if (selectionMode === 'object' && entry.selected) {
        const wb = meshWorldBounds(entry.mesh, entry.transform);
        if (wb) this.addWorldBoundsOutline(wb, 0xe85a1a);
      }

      if (showMeshSelection) {
        const vertGroup = new THREE.Group();
        vertGroup.position.copy(objectGroup.position);
        vertGroup.rotation.copy(objectGroup.rotation);
        vertGroup.scale.copy(objectGroup.scale);
        this.buildVertsIntoGroup(vertGroup, entry.mesh, meshSelVerts, visibleVerts);
        this.vertGroup.add(vertGroup);
      }
    });

    this.needsRender = true;
  }

  private buildMeshIntoGroup(
    group: THREE.Group,
    mesh: MeshDocument,
    _selVerts: Set<number>,
    selEdges: Set<EdgeKey>,
    selFaces: Set<number>,
    visibleVerts: Set<number>,
    visibleFaces: Set<number>,
    wireframe: boolean,
    flatShading: boolean,
  ): void {
    const buildMeshForFaces = (faceIndices: number[], color: string, highlight = false) => {
      const pos: number[] = [],
        norms: number[] = [],
        idxArr: number[] = [];
      faceIndices.forEach((fi) => {
        if (!visibleFaces.has(fi)) return;
        const f = mesh.faces[fi];
        if (!f || f.length < 3) return;
        const verts = f.map((vi) => mesh.vertices[vi]);
        const v0 = new THREE.Vector3(verts[0].x, verts[0].y, verts[0].z);
        for (let i = 1; i < verts.length - 1; i++) {
          const v1 = new THREE.Vector3(verts[i].x, verts[i].y, verts[i].z);
          const v2 = new THREE.Vector3(verts[i + 1].x, verts[i + 1].y, verts[i + 1].z);
          const base = pos.length / 3;
          pos.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
          const n = new THREE.Vector3()
            .crossVectors(v1.clone().sub(v0), v2.clone().sub(v0))
            .normalize();
          norms.push(n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z);
          idxArr.push(base, base + 1, base + 2);
        }
      });
      if (pos.length === 0) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
      geo.setIndex(idxArr);
      if (flatShading) geo.computeVertexNormals();

      if (highlight) {
        group.add(
          new THREE.Mesh(
            geo,
            new THREE.MeshBasicMaterial({
              color: 0xe85a1a,
              transparent: true,
              opacity: 0.35,
              side: THREE.DoubleSide,
            }),
          ),
        );
        return;
      }

      const mat = new THREE.MeshPhongMaterial({
        color: new THREE.Color(color),
        side: THREE.DoubleSide,
        wireframe,
        transparent: true,
        opacity: wireframe ? 1 : 0.9,
        shininess: 50,
        flatShading,
      });
      group.add(new THREE.Mesh(geo, mat));
      if (!wireframe) {
        const edges = new THREE.EdgesGeometry(geo, 15);
        group.add(
          new THREE.LineSegments(
            edges,
            new THREE.LineBasicMaterial({
              color: new THREE.Color(color),
              opacity: 0.35,
              transparent: true,
            }),
          ),
        );
      }
      const selF = faceIndices.filter((fi) => selFaces.has(fi));
      if (selF.length > 0) buildMeshForFaces(selF, color, true);
    };

    if (mesh.texture && !wireframe) {
      this.addTexturedMesh(mesh, visibleFaces, flatShading, group);
      this.addUvWireframeOverlay(group, mesh, visibleFaces, selFaces);
      const selF = [...selFaces].filter((fi) => visibleFaces.has(fi));
      if (selF.length > 0) buildMeshForFaces(selF, '#e85a1a', true);
    } else {
      mesh.groups.forEach((g) => {
        const visibleGroupFaces = g.faces.filter((fi) => visibleFaces.has(fi));
        if (visibleGroupFaces.length > 0) buildMeshForFaces(visibleGroupFaces, g.color);
      });
      const assigned = new Set(mesh.groups.flatMap((g) => g.faces));
      const unassigned = mesh.faces
        .map((_, fi) => fi)
        .filter((fi) => visibleFaces.has(fi) && !assigned.has(fi) && mesh.faces[fi] && mesh.faces[fi]!.length >= 3);
      if (unassigned.length > 0) buildMeshForFaces(unassigned, '#888888');
    }

    if (selEdges.size > 0) {
      const points: number[] = [];
      selEdges.forEach((edge) => {
        const [a, b] = parseEdgeKey(edge);
        const va = mesh.vertices[a];
        const vb = mesh.vertices[b];
        if (!visibleVerts.has(a) || !visibleVerts.has(b)) return;
        if (!va || !vb) return;
        points.push(va.x, va.y, va.z, vb.x, vb.y, vb.z);
      });
      if (points.length > 0) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
        group.add(
          new THREE.LineSegments(
            geo,
            new THREE.LineBasicMaterial({ color: 0xff6b20, linewidth: 2 }),
          ),
        );
      }
    }
  }

  private buildVertsIntoGroup(
    group: THREE.Group,
    mesh: MeshDocument,
    selVerts: Set<number>,
    visibleVerts: Set<number>,
  ): void {
    const normalVerts: number[] = [];
    const selectedVerts: number[] = [];
    mesh.vertices.forEach((_, vi) => {
      if (!visibleVerts.has(vi)) return;
      if (selVerts.has(vi)) selectedVerts.push(vi);
      else normalVerts.push(vi);
    });

    const addVertexInstances = (indices: number[], size: number, color: number) => {
      if (indices.length === 0) return;
      const geo = new THREE.BoxGeometry(size, size, size);
      const mat = new THREE.MeshBasicMaterial({ color });
      const instanced = new THREE.InstancedMesh(geo, mat, indices.length);
      const matrix = new THREE.Matrix4();
      indices.forEach((vi, index) => {
        const v = mesh.vertices[vi];
        matrix.makeTranslation(v.x, v.y, v.z);
        instanced.setMatrixAt(index, matrix);
      });
      instanced.instanceMatrix.needsUpdate = true;
      group.add(instanced);
    };

    addVertexInstances(normalVerts, PERSP_VERT_SIZE, 0x6ec4d0);
    addVertexInstances(selectedVerts, PERSP_VERT_SELECTED_SIZE, 0xff6b20);
  }

  invalidateMesh(): void {
    this.lastRebuildKey = '';
  }

  private clearGroup(group: THREE.Group): void {
    while (group.children.length) {
      const child = group.children[0];
      group.remove(child);
      child.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments || obj instanceof THREE.InstancedMesh) {
          obj.geometry.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
    }
  }

  resize(width: number, height: number): void {
    if (!width || !height) return;
    if (width === this.lastWidth && height === this.lastHeight) return;
    this.lastWidth = width;
    this.lastHeight = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    const gizmoActive =
      this.transformControls.enabled && this.transformControls.object !== undefined;
    if (!this.needsRender && !gizmoActive) return;
    this.needsRender = false;
    if (gizmoActive) {
      this.pivotObject.updateMatrixWorld(true);
    }
    this.renderer.render(this.scene, this.camera);
  }

  requestRender(): void {
    this.needsRender = true;
  }

  startLoop(getSize: () => { w: number; h: number }): void {
    const loop = () => {
      this.animId = requestAnimationFrame(loop);
      const { w, h } = getSize();
      this.resize(w, h);
      this.render();
    };
    loop();
  }

  dispose(): void {
    cancelAnimationFrame(this.animId);
    this.transformControls.dispose();
    if (this.atlasTexture) {
      this.atlasTexture.dispose();
      this.atlasTexture = null;
    }
    this.atlasLiveCanvas = null;
    this.atlasTextureKey = '';
    this.atlasLiveDirty = false;
    this.renderer.dispose();
  }
}
