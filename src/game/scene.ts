import { creature, animateCreature } from './creatures';
import { bagItems } from '../../shared/loot';
import { CAMERA, clampZoom, clampPitch, wrapYaw, screenMovement } from './camera';
import { bagStyle, LOOT_BAGS, compareGear } from '../../shared/gear';
import { lootBag } from './loot-bags';
import { AttackGuides } from './telegraphs';
import { ProjectileField } from './projectiles';
import { Sparks } from './particles';
import { MovementPrediction } from './prediction';
import { combatStats, weaponShots, hasTrait } from '../../shared/combat';
import { attackPlan } from '../../shared/patterns';
import { isSafe } from '../../shared/content';
import { WARDENS } from '../../shared/progression';
import { threatOfTier, THREAT_COLORS } from '../../shared/places';
import type { Character, Input, BulletState } from '../../shared/types';
import * as THREE from 'three';
import {
  CLASSES,
  DUNGEONS,
  ENEMIES,
  HAVEN,
  LANDMARKS,
  ZONES,
  QUESTS,
  distance,
  zoneAt,
} from '../../shared/content';
import { PROPS, groundHeight, random } from '../../shared/world';
import type {
  ClassId,
  Dimension,
  Effect,
  EnemyState,
  PlayerState,
  Snapshot,
  Vec,
} from '../../shared/types';
import { settings } from '../storage';
import { sound } from './audio';
const matCache = new Map<string, THREE.MeshStandardMaterial>();
function material(color: THREE.ColorRepresentation, emissive = 0) {
  const key = `${new THREE.Color(color).getHexString()}:${emissive}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      flatShading: true,
      roughness: 0.87,
      metalness: 0.08,
      emissive: color,
      emissiveIntensity: emissive,
    });
    matCache.set(key, m);
  }
  return m;
}
function mesh(
  geometry: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
  x = 0,
  y = 0,
  z = 0,
  emissive = 0,
) {
  const m = new THREE.Mesh(geometry, material(color, emissive));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
const BOX = new THREE.BoxGeometry(1, 1, 1),
  ICO = new THREE.IcosahedronGeometry(1, 0),
  OCT = new THREE.OctahedronGeometry(1),
  CONE = new THREE.ConeGeometry(1, 1, 6),
  CYL = new THREE.CylinderGeometry(1, 1, 1, 8);
const SHARED_GEOMETRIES = new Set<THREE.BufferGeometry>([BOX, ICO, OCT, CONE, CYL]);
function disposeObject(root: THREE.Object3D) {
  const cached = new Set(matCache.values());
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      if (obj instanceof THREE.InstancedMesh) obj.dispose();
      if (!SHARED_GEOMETRIES.has(obj.geometry) && !obj.geometry.userData.shared)
        obj.geometry.dispose();
      for (const mat of Array.isArray(obj.material) ? obj.material : [obj.material])
        if (!cached.has(mat as THREE.MeshStandardMaterial) && !mat.userData.shared) mat.dispose();
    }
  });
}
function surfaceHeight(x: number, z: number, dim: Dimension) {
  return dim === 'wilds' && distance({ x, z }, HAVEN) < 9.8 ? 0.72 : groundHeight(x, z, dim);
}
/** Short world text (signposts, portal levels) drawn once into a canvas; no font downloads. */
function textSprite(text: string, color: string, height: number, px = 46) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.font = `600 ${px}px 'Avenir Next', Avenir, 'Segoe UI', system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#0a1a17';
  ctx.shadowBlur = 12;
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 66);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  sprite.scale.set(height * 4, height, 1);
  return sprite;
}
const FOG_BASE = new THREE.Color('#90aaa4'),
  SKY_BASE = new THREE.Color('#789696');
const WARDEN_COLORS: Record<string, string> = {
  rootwarden: '#b2c791',
  duskwarden: '#ad9dc8',
  glasswarden: '#e1bd8c',
  sovereign: '#e3c68c',
};
function box(
  g: THREE.Group,
  color: string,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
) {
  const m = mesh(BOX, color, x, y, z);
  m.scale.set(sx, sy, sz);
  g.add(m);
  return m;
}
function ring(radius: number, color: string, thickness = 0.035) {
  const m = new THREE.Mesh(
    new THREE.TorusGeometry(radius, thickness, 5, 72),
    material(color, 0.25),
  );
  m.rotation.x = -Math.PI / 2;
  return m;
}
function hero(classId: ClassId, self: boolean) {
  const cls = CLASSES[classId],
    g = new THREE.Group();
  const cloak = mesh(new THREE.CylinderGeometry(0.26, 0.49, 0.85, 6), cls.color, 0, 0.85, 0);
  g.add(cloak);
  box(g, '#344747', -0.18, 0.2, 0, 0.24, 0.38, 0.32).name = 'left-foot';
  box(g, '#344747', 0.18, 0.2, 0, 0.24, 0.38, 0.32).name = 'right-foot';
  box(g, '#d2baa0', 0, 1.47, 0.04, 0.43, 0.43, 0.4);
  box(g, '#34484c', 0, 1.65, -0.04, 0.49, 0.2, 0.44);
  box(g, '#233b3c', -0.12, 1.49, 0.253, 0.065, 0.055, 0.01);
  box(g, '#233b3c', 0.12, 1.49, 0.253, 0.065, 0.055, 0.01);
  box(g, cls.color, -0.4, 1.03, 0, 0.23, 0.5, 0.25);
  box(g, cls.color, 0.4, 1.03, 0, 0.23, 0.5, 0.25);
  const cape = mesh(
    new THREE.CylinderGeometry(0.31, 0.44, 0.94, 5, 1, true, Math.PI / 2, Math.PI),
    '#34494c',
    0,
    0.93,
    -0.02,
  );
  cape.material = material('#34494c').clone();
  (cape.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  g.add(cape);
  cape.rotation.x = -0.15;
  cape.name = 'cape';
  box(g, '#e6c38a', 0, 0.73, 0.3, 0.48, 0.1, 0.11);
  if (classId === 'arcanist') {
    const hood = mesh(new THREE.ConeGeometry(0.39, 0.55, 5), '#72abae', 0, 1.95, -0.04);
    hood.rotation.z = -0.15;
    g.add(hood);
    box(g, '#856a4a', 0.56, 1.04, 0.13, 0.07, 1.85, 0.07);
    const gem = mesh(OCT, cls.color, 0.56, 2.1, 0.13, 1.5);
    gem.scale.set(0.19, 0.31, 0.19);
    g.add(gem);
  } else if (classId === 'ranger') {
    const hood = mesh(ICO, '#7e9364', 0, 1.65, -0.08);
    hood.scale.set(0.38, 0.27, 0.32);
    g.add(hood);
    const bow = mesh(
      new THREE.TorusGeometry(0.52, 0.047, 5, 14, Math.PI),
      '#ad8656',
      0.52,
      1.05,
      0.12,
    );
    bow.rotation.z = -Math.PI / 2;
    bow.rotation.y = Math.PI / 2;
    g.add(bow);
    box(g, '#e5d3a4', 0.53, 1.05, 0.12, 0.02, 1, 0.02);
  } else {
    box(g, '#b2bfaf', 0, 1.7, 0, 0.5, 0.3, 0.48);
    box(g, '#dfb278', 0, 1.94, -0.05, 0.1, 0.24, 0.25);
    const shield = mesh(CYL, '#506965', -0.58, 0.95, 0.16);
    shield.rotation.x = Math.PI / 2;
    shield.scale.set(0.4, 0.15, 0.52);
    g.add(shield);
    box(g, '#ebc98c', -0.58, 1.0, 0.27, 0.08, 0.57, 0.03);
    box(g, '#d6ddd0', 0.57, 1.45, 0.2, 0.11, 0.9, 0.06);
    box(g, '#d8b177', 0.57, 1, 0.2, 0.4, 0.07, 0.1);
  }
  if (self) {
    const hitbox = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.39, 32),
      new THREE.MeshBasicMaterial({
        color: '#fff4c9',
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false,
        transparent: true,
        opacity: 0.8,
        toneMapped: false,
      }),
    );
    hitbox.rotation.x = -Math.PI / 2;
    hitbox.position.y = 0.81;
    hitbox.name = 'hurtbox';
    g.add(hitbox);
  }
  const r = ring(0.64, self ? '#f1d39a' : cls.color, self ? 0.04 : 0.025);
  r.name = 'aura';
  r.position.y = 0.05;
  if (!self) g.add(r);
  return g;
}
export class WorldView {
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera();
  renderer: THREE.WebGLRenderer;
  world = new THREE.Group();
  dungeon = new THREE.Group();
  entities = new THREE.Group();
  decorations: THREE.Object3D[] = [];
  dimension: Dimension = 'wilds';
  snapshot?: Snapshot;
  lastSnapshot = 0;
  prediction = new MovementPrediction();
  character?: Character;
  localInput: Input = { x: 0, z: 0, angle: 0, fire: false, seq: 0 };
  latency = 0;
  resolutionScale = 1;
  lastResolutionCheck = 0;
  nextLocalShot = 0;
  localEffects: Record<string, number> = {};
  recoil = 0;
  aimDistance = 10;
  predictedShots: (BulletState & {
    born: number;
    expires: number;
    serverId?: number;
    hidden?: boolean;
  })[] = [];
  knownShots = new Set<number>();
  projectileField: ProjectileField;
  sparks: Sparks;
  reticle = new THREE.Group();
  objective: (Vec & { name: string }) | null = null;
  objectiveMarker = new THREE.Group();
  altarMarker = new THREE.Group();
  target = new THREE.Vector3(0, 0, 20);
  focus = new THREE.Vector3(0, 0, 20);
  playerMeshes = new Map<string, THREE.Group>();
  enemyMeshes = new Map<string, THREE.Group>();
  lootMeshes = new Map<string, THREE.Group>();
  dummy = new THREE.Object3D();
  color = new THREE.Color();
  raycaster = new THREE.Raycaster();
  plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  pointer = new THREE.Vector2();
  effects: { group: THREE.Object3D; start: number; kind: string }[] = [];
  effectIds = new Set<number>();
  labels = new Map<string, HTMLDivElement>();
  playing = false;
  zoom = 1;
  zoomTarget = 1;
  yaw = CAMERA.defaultYaw;
  pitch = settings.cameraTilt;
  guides: AttackGuides;
  hazardMeshes = new Map<number, THREE.Group>();
  beacons: THREE.InstancedMesh;
  beaconSignature = '';
  fogTarget = FOG_BASE.clone();
  skyTarget = SKY_BASE.clone();
  shake = 0;
  frame = 0;
  lastFrame = performance.now();
  fps = 60;
  softwareRenderer = false;
  /** True while C is held: every plate expands into its bestiary line. */
  bestiary = false;
  preview?: THREE.Group;
  onFrame: (dt: number) => void = () => {};
  onFailure: (message: string) => void = () => {};
  constructor(
    public canvas: HTMLCanvasElement,
    public labelLayer: HTMLElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    const gl = this.renderer.getContext(),
      debug = gl.getExtension('WEBGL_debug_renderer_info');
    this.softwareRenderer = !!(
      debug &&
      /swiftshader|llvmpipe|software/i.test(String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)))
    );
    if (this.softwareRenderer) {
      settings.quality = 'low';
      // Start within a CPU renderer's budget instead of stalling at full resolution
      // while the rolling frame-rate estimate slowly catches up. DOM stays crisp.
      this.resolutionScale = 0.5;
      this.fps = 12;
    }
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, settings.quality === 'high' ? 1.5 : 1) * this.resolutionScale,
    );
    this.renderer.shadowMap.enabled = settings.quality === 'high';
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.16;
    this.scene.background = new THREE.Color('#789696');
    this.scene.fog = new THREE.FogExp2('#90aaa4', 0.006);
    this.scene.add(new THREE.HemisphereLight('#e8eee0', '#626e68', 2.4));
    const sun = new THREE.DirectionalLight('#ffe5b9', 3.1);
    sun.position.set(-35, 65, 25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1536, 1536);
    sun.shadow.camera.left = -70;
    sun.shadow.camera.right = 70;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -70;
    sun.shadow.camera.far = 180;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun);
    this.scene.add(this.world, this.dungeon, this.entities);
    this.dungeon.visible = false;
    this.buildWorld();
    // Warden beacons: soft additive light columns readable from across the island.
    const beam = document.createElement('canvas');
    beam.width = 4;
    beam.height = 128;
    const bctx = beam.getContext('2d')!,
      fade = bctx.createLinearGradient(0, 0, 0, 128);
    fade.addColorStop(0, 'rgba(255,255,255,0)');
    fade.addColorStop(0.45, 'rgba(255,255,255,0.5)');
    fade.addColorStop(1, 'rgba(255,255,255,1)');
    bctx.fillStyle = fade;
    bctx.fillRect(0, 0, 4, 128);
    const beamTexture = new THREE.CanvasTexture(beam);
    // Tinted rather than additive: additive light vanishes over this bright ground.
    this.beacons = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.7, 2.3, 90, 16, 1, true),
      new THREE.MeshBasicMaterial({
        map: beamTexture,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
        fog: false,
      }),
      4,
    );
    this.beacons.count = 0;
    this.beacons.frustumCulled = false;
    this.world.add(this.beacons);
    this.projectileField = new ProjectileField(this.scene);
    this.sparks = new Sparks(this.scene);
    this.guides = new AttackGuides(this.scene);
    // Reticle and the small inner ring expose the actual vulnerable area.
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const tick = new THREE.Mesh(
        BOX,
        new THREE.MeshBasicMaterial({ color: '#fff6cf', depthTest: true, toneMapped: false }),
      );
      tick.position.set(Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32);
      tick.scale.set(0.15, 0.025, 0.035);
      tick.rotation.y = -a;
      this.reticle.add(tick);
    }
    this.reticle.visible = false;
    this.scene.add(this.reticle);
    const marker = ring(0.7, '#f4d699', 0.045);
    this.objectiveMarker.add(marker);
    const arrow = mesh(OCT, '#ffe0a2', 0, 1.8, 0, 1);
    arrow.scale.set(0.18, 0.5, 0.18);
    this.objectiveMarker.add(arrow);
    this.objectiveMarker.visible = false;
    this.scene.add(this.objectiveMarker);
    const altarBase = mesh(CYL, '#716a85', 0, 0.2, 0);
    altarBase.scale.set(1, 0.4, 1);
    this.altarMarker.add(altarBase);
    const altarGem = mesh(OCT, '#d7c4ff', 0, 1.15, 0, 0.9);
    altarGem.scale.set(0.32, 0.7, 0.32);
    this.altarMarker.add(altarGem);
    const altarRing = ring(1.45, '#cbb6ee', 0.06);
    altarRing.position.y = 0.1;
    this.altarMarker.add(altarRing);
    this.altarMarker.visible = false;
    this.scene.add(this.altarMarker);
    this.setPreviewClass('arcanist');
    this.resize();
    window.addEventListener('resize', () => this.resize());
    new ResizeObserver(() => this.resize()).observe(canvas);
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.onFailure(
        'The graphics context was lost. Your traveler will return safely after disconnecting. Reload to reconnect.',
      );
    });
    requestAnimationFrame(this.animate);
  }
  buildWorld() {
    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(700, 700),
      new THREE.MeshStandardMaterial({ color: '#668f93', roughness: 0.32, metalness: 0.28 }),
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -3.1;
    this.world.add(ocean);
    const cliff = mesh(new THREE.CylinderGeometry(84.5, 78, 9, 80, 1), '#747f74', 0, -4.9, -8);
    this.world.add(cliff);
    const ground = new THREE.PlaneGeometry(172, 172, 86, 86);
    ground.rotateX(-Math.PI / 2);
    ground.translate(0, 0, -8);
    const position = ground.attributes.position,
      colors: number[] = [],
      rng = random(42);
    const color = new THREE.Color(),
      tint = new THREE.Color();
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i),
        z = position.getZ(i);
      position.setY(i, groundHeight(x, z));
      const safe = distance({ x, z }, HAVEN) < 14;
      const base = safe
        ? '#b8b399'
        : x < -25
          ? '#758f83'
          : x > 25
            ? '#bea27e'
            : z < -44
              ? '#8d8993'
              : '#a0a37a';
      // Each zone's map color grades the ground beneath it, subtly, as atmosphere.
      color
        .set(base)
        .lerp(tint.set(zoneAt(x, z).color), safe ? 0.1 : 0.2)
        .multiplyScalar(0.89 + rng() * 0.2);
      colors.push(color.r, color.g, color.b);
    }
    const index = ground.index!,
      indices: number[] = [];
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i),
        b = index.getX(i + 1),
        c = index.getX(i + 2);
      if ([a, b, c].every((k) => Math.hypot(position.getX(k), position.getZ(k) + 8) < 85.5))
        indices.push(a, b, c);
    }
    ground.setIndex(indices);
    ground.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    ground.computeVertexNormals();
    const terrain = new THREE.Mesh(
      ground,
      new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }),
    );
    terrain.receiveShadow = true;
    this.world.add(terrain);
    const batches = new Map<
      string,
      {
        geo: THREE.BufferGeometry;
        list: {
          x: number;
          y: number;
          z: number;
          sx: number;
          sy: number;
          sz: number;
          rotation: number;
          color: string;
        }[];
      }
    >();
    const instance = (
      key: string,
      geo: THREE.BufferGeometry,
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
      rotation: number,
      color: string,
    ) => {
      if (!batches.has(key)) batches.set(key, { geo, list: [] });
      batches.get(key)!.list.push({ x, y, z, sx, sy, sz, rotation, color });
    };
    for (const p of PROPS) {
      const y = groundHeight(p.x, p.z),
        s = p.scale;
      if (p.kind === 'tree') {
        instance(
          'trunk',
          CYL,
          p.x,
          y + 1.2 * s,
          p.z,
          0.22 * s,
          2.4 * s,
          0.22 * s,
          p.rotation,
          '#746b56',
        );
        instance(
          'canopy',
          ICO,
          p.x,
          y + 3 * s,
          p.z,
          1.6 * s,
          1.7 * s,
          1.5 * s,
          p.rotation,
          p.color,
        );
        instance(
          'canopy',
          ICO,
          p.x + 0.7 * s,
          y + 2.4 * s,
          p.z + 0.3 * s,
          1.1 * s,
          1.2 * s,
          1.1 * s,
          p.rotation,
          p.color,
        );
      } else if (p.kind === 'rock')
        instance(
          'rock',
          ICO,
          p.x,
          y + 0.42 * s,
          p.z,
          0.9 * s,
          0.6 * s,
          0.75 * s,
          p.rotation,
          '#959788',
        );
      else if (p.kind === 'crystal') {
        instance(
          'crystal',
          OCT,
          p.x,
          y + 1.2 * s,
          p.z,
          0.45 * s,
          1.9 * s,
          0.5 * s,
          p.rotation,
          p.color,
        );
        instance(
          'crystal',
          OCT,
          p.x + 0.5 * s,
          y + 0.6 * s,
          p.z,
          0.25 * s,
          0.9 * s,
          0.25 * s,
          p.rotation,
          '#d5c3ae',
        );
      } else if (p.kind === 'ruin') {
        instance(
          'ruin',
          BOX,
          p.x,
          y + 0.95 * s,
          p.z,
          0.8 * s,
          1.9 * s,
          0.8 * s,
          p.rotation,
          '#aea996',
        );
        instance(
          'ruin',
          BOX,
          p.x,
          y + 1.95 * s,
          p.z,
          1.1 * s,
          0.22 * s,
          1.1 * s,
          p.rotation,
          '#c7bda4',
        );
      } else if (p.kind === 'signpost') {
        const sign = new THREE.Group();
        const post = mesh(CYL, '#7b6a52', 0, y + 1.1, 0);
        post.scale.set(0.09, 2.2, 0.09);
        sign.add(post);
        const board = box(sign, p.color, 0, y + 1.8, 0.06, 1.7, 0.42, 0.08);
        board.rotation.z = 0.02;
        box(sign, '#8b7a5c', 0, y + 1.8, 0.11, 1.62, 0.05, 0.02);
        sign.rotation.y = p.rotation;
        const label = textSprite(p.label ?? '', '#f4e6c2', 1.15, 50);
        label.position.set(0, y + 2.75, 0);
        sign.add(label);
        sign.position.set(p.x, 0, p.z);
        this.world.add(sign);
      } else {
        for (let j = 0; j < 3; j++)
          instance(
            'grass',
            CONE,
            p.x + j * 0.19,
            y + 0.24 * s,
            p.z,
            0.055 * s,
            0.48 * s,
            0.12 * s,
            p.rotation + j,
            p.color,
          );
      }
    }
    for (let z = -76; z < 39; z += 2.7)
      for (const x of [-1, 1])
        instance(
          'path',
          BOX,
          x + Math.sin(z) * 0.12,
          groundHeight(x, z) + 0.045,
          z,
          1.7,
          0.1,
          2.5,
          Math.sin(z) * 0.04,
          '#b9b399',
        );
    for (let x = -42; x < 45; x += 2.7)
      for (const z of [19, 21])
        if (Math.abs(x) > 11)
          instance(
            'path',
            BOX,
            x,
            groundHeight(x, z) + 0.045,
            z,
            2.5,
            0.1,
            1.7,
            Math.sin(x) * 0.04,
            '#b9b399',
          );
    for (const { geo, list } of batches.values()) {
      const m = new THREE.InstancedMesh(geo, material('#ffffff'), list.length);
      list.forEach((p, i) => {
        this.dummy.position.set(p.x, p.y, p.z);
        this.dummy.rotation.set(0, p.rotation, 0);
        this.dummy.scale.set(p.sx, p.sy, p.sz);
        this.dummy.updateMatrix();
        m.setMatrixAt(i, this.dummy.matrix);
        m.setColorAt(i, new THREE.Color(p.color));
      });
      m.castShadow = true;
      m.receiveShadow = true;
      this.world.add(m);
    }
    this.buildHearth();
    for (const [id, d] of Object.entries(DUNGEONS)) {
      const g = this.portal(d.color, 1.8);
      g.position.set(d.x, groundHeight(d.x, d.z), d.z);
      this.world.add(g);
      this.decorations.push(g);
      // The recommended level sits on the frame, where the eye lands before the name.
      const level = textSprite(`LV ${d.level}`, d.color, 1.1, 64);
      level.position.set(d.x, groundHeight(d.x, d.z) + 5.2, d.z);
      this.world.add(level);
      const platform = mesh(
        new THREE.CylinderGeometry(3.5, 3.8, 0.4, 12),
        '#a59e88',
        d.x,
        groundHeight(d.x, d.z) - 0.1,
        d.z,
      );
      this.world.add(platform);
    }
    for (const [x, z, c] of [
      [-43, -20, '#b2c791'],
      [42, -25, '#e1bd8c'],
      [0, -35, '#ad9dc8'],
      [0, -66, '#e3c68c'],
    ] as const) {
      const g = new THREE.Group();
      const floor = mesh(new THREE.CylinderGeometry(6, 6.2, 0.3, 24), '#929583');
      g.add(floor);
      const r = ring(5.4, c, 0.055);
      r.position.y = 0.2;
      g.add(r);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const col = mesh(CYL, '#b3aa95', Math.cos(a) * 6.7, 1, Math.sin(a) * 6.7);
        col.scale.set(0.35, 2, 0.35);
        g.add(col);
      }
      g.position.set(x, groundHeight(x, z), z);
      this.world.add(g);
    }
    const motes = new Float32Array(160 * 3),
      mr = random(145);
    for (let i = 0; i < 160; i++) {
      motes[i * 3] = (mr() - 0.5) * 120;
      motes[i * 3 + 1] = mr() * 10 + 1;
      motes[i * 3 + 2] = (mr() - 0.5) * 120;
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(motes, 3));
    const dust = new THREE.Points(
      mg,
      new THREE.PointsMaterial({
        color: '#ffe4a5',
        size: 0.12,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
      }),
    );
    this.world.add(dust);
  }
  buildHearth() {
    const g = new THREE.Group();
    g.position.set(0, 0, 20);
    for (let i = 0; i < 3; i++) {
      const platform = mesh(
        new THREE.CylinderGeometry(10 - i * 0.6, 10.4 - i * 0.6, 0.28, 48),
        '#b9b09a',
        0,
        0.05 + i * 0.22,
        0,
      );
      g.add(platform);
    }
    for (const radius of [2.6, 7.8, 9.1]) {
      const r = ring(radius, '#d5bb88', radius === 7.8 ? 0.07 : 0.035);
      r.position.y = 0.76;
      g.add(r);
    }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const tile = box(g, '#847f6d', Math.cos(a) * 8.4, 0.76, Math.sin(a) * 8.4, 0.08, 0.025, 0.8);
      tile.rotation.y = -a + Math.PI / 2;
    }
    const dais = mesh(new THREE.CylinderGeometry(2.2, 2.5, 0.65, 12), '#797f72', 0, 0.95, 0);
    g.add(dais);
    const goldring = new THREE.Group();
    goldring.position.set(0, 4.4, -1.5);
    goldring.rotation.y = 0.3;
    for (let i = 0; i < 3; i++) {
      const arc = mesh(new THREE.TorusGeometry(3.4, 0.12, 6, 48, Math.PI * 0.6), '#d4b67b');
      arc.rotation.z = (i * Math.PI * 2) / 3;
      goldring.add(arc);
    }
    const inner = mesh(new THREE.TorusGeometry(2.85, 0.045, 5, 64), '#e1c48d');
    goldring.add(inner);
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      const shard = mesh(OCT, '#dfc38c', Math.cos(a) * 3.9, Math.sin(a) * 3.9, 0, 0.12);
      shard.scale.set(0.12, 0.32, 0.1);
      shard.rotation.z = a - Math.PI / 2;
      goldring.add(shard);
    }
    g.add(goldring);
    const fire = mesh(OCT, '#f3c78a', 0, 3.35, 0, 1.8);
    fire.scale.set(0.65, 1.4, 0.65);
    g.add(fire);
    this.decorations.push(fire);
    const core = mesh(OCT, '#fff0c3', 0, 3.35, 0, 1.7);
    core.scale.set(0.3, 0.85, 0.3);
    g.add(core);
    const light = new THREE.PointLight('#f6c58a', 18, 12, 2);
    light.position.set(0, 3, 0);
    g.add(light);
    for (const x of [-9, 9])
      for (const z of [-5, 5]) {
        const col = mesh(new THREE.CylinderGeometry(0.5, 0.65, 4.4, 8), '#bfb69e', x, 2.4, z);
        g.add(col);
        box(g, '#cbc0a4', x, 4.7, z, 1.5, 0.3, 1.5);
        box(g, '#aaa28d', x, 0.8, z, 1.4, 0.3, 1.4);
        const banner = box(g, '#bb8754', x + (x < 0 ? 0.6 : -0.6), 3.25, z + 0.04, 0.95, 2.3, 0.05);
        banner.rotation.z = x < 0 ? -0.035 : 0.035;
        box(g, '#e0c28c', x + (x < 0 ? 0.6 : -0.6), 3.2, z + 0.08, 0.045, 1.9, 0.03);
      }
    const chest = new THREE.Group();
    box(chest, '#77624b', 0, 0.65, 0, 1.5, 1.1, 0.95);
    box(chest, '#d5b87c', 0, 0.66, 0.5, 1.55, 0.12, 0.05);
    for (const x of [-0.55, 0.55]) box(chest, '#d5b87c', x, 0.7, 0, 0.12, 1.2, 1);
    box(chest, '#edcb8b', 0, 0.72, 0.57, 0.2, 0.28, 0.1);
    chest.position.set(6, 0.6, 2);
    g.add(chest);
    const smith = new THREE.Group();
    box(smith, '#787d73', 0, 0.4, 0, 1.1, 0.8, 0.85);
    box(smith, '#6d7771', 0, 1.05, 0, 1.8, 0.45, 0.85);
    box(smith, '#dcaa70', 0, 1.35, 0, 0.6, 0.13, 0.6);
    smith.position.set(-6, 0.6, 2);
    g.add(smith);
    this.world.add(g);
  }
  portal(color: string, radius: number) {
    const g = new THREE.Group();
    const arch = mesh(new THREE.TorusGeometry(radius, 0.22, 6, 32), '#9d9b87', 0, radius + 0.25, 0);
    g.add(arch);
    const glow = mesh(
      new THREE.TorusGeometry(radius - 0.24, 0.06, 6, 40),
      color,
      0,
      radius + 0.25,
      0.02,
      1.6,
    );
    g.add(glow);
    const disk = new THREE.Mesh(
      new THREE.CircleGeometry(radius - 0.32, 48),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    disk.position.set(0, radius + 0.25, 0);
    g.add(disk);
    const gem = mesh(OCT, color, 0, radius * 2 + 0.5, 0, 1);
    gem.scale.set(0.24, 0.36, 0.24);
    g.add(gem);
    for (const x of [-radius, radius]) box(g, '#afac96', x, 0.3, 0, 0.8, 0.6, 1);
    return g;
  }
  buildDungeon(dim: Exclude<Dimension, 'wilds'>) {
    disposeObject(this.dungeon);
    this.dungeon.clear();
    const color = dim === 'eclipse' ? '#565775' : dim === 'hollow' ? '#627d7e' : '#8d7769';
    const floor = mesh(new THREE.BoxGeometry(61, 0.6, 61), color, 0, -0.35, 0);
    this.dungeon.add(floor);
    const rng = random(dim === 'hollow' ? 92 : 11);
    const batches = new Map<
      THREE.BufferGeometry,
      { matrix: THREE.Matrix4; color: THREE.Color }[]
    >();
    const put = (
      geo: THREE.BufferGeometry,
      color: THREE.ColorRepresentation,
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
      rotation = 0,
    ) => {
      this.dummy.position.set(x, y, z);
      this.dummy.scale.set(sx, sy, sz);
      this.dummy.rotation.set(0, rotation, 0);
      this.dummy.updateMatrix();
      if (!batches.has(geo)) batches.set(geo, []);
      batches.get(geo)!.push({ matrix: this.dummy.matrix.clone(), color: new THREE.Color(color) });
    };
    for (let x = -28; x < 30; x += 4)
      for (let z = -28; z < 30; z += 4)
        put(
          BOX,
          new THREE.Color(color).multiplyScalar(0.94 + rng() * 0.12),
          x,
          0.01,
          z,
          3.85,
          0.06,
          3.85,
        );
    for (let i = -30; i <= 30; i += 5)
      for (const side of [-1, 1])
        for (const swap of [false, true])
          put(
            BOX,
            '#7c8379',
            swap ? side * 31 : i,
            1.5,
            swap ? i : side * 31,
            4.8,
            3 + rng() * 2,
            2,
            swap ? Math.PI / 2 : 0,
          );
    for (const x of [-22, 22])
      for (const z of [-22, -10, 2, 14]) {
        put(CYL, '#a9a791', x, 2.5, z, 0.75, 5, 0.75);
        put(OCT, DUNGEONS[dim].color, x, 5.8, z, 0.35, 0.7, 0.35);
      }
    for (const [geo, entries] of batches) {
      const batch = new THREE.InstancedMesh(geo, material('#ffffff'), entries.length);
      entries.forEach((entry, i) => {
        batch.setMatrixAt(i, entry.matrix);
        batch.setColorAt(i, entry.color);
      });
      batch.receiveShadow = true;
      this.dungeon.add(batch);
    }
    const portal = this.portal(DUNGEONS[dim].color, 1.6);
    portal.position.set(0, 0, 25);
    this.dungeon.add(portal);
    for (const z of [17, 3, -8]) {
      const chamber = ring(dim === 'eclipse' ? 12 : 9, DUNGEONS[dim].color, 0.025);
      chamber.position.set(0, 0.065, z);
      this.dungeon.add(chamber);
      for (const x of [-16, 16]) {
        const border = box(this.dungeon, DUNGEONS[dim].color, x, 0.055, z, 5, 0.025, 0.12);
        border.material = material(DUNGEONS[dim].color, 0.2);
      }
    }
    if (dim === 'eclipse') {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const crystal = mesh(OCT, '#b7a4df', Math.cos(a) * 27, 3.5, Math.sin(a) * 27, 0.5);
        crystal.scale.set(0.5, 2.5, 0.5);
        this.dungeon.add(crystal);
      }
    }
    const sigil = ring(6, DUNGEONS[dim].color, 0.08);
    sigil.position.set(0, 0.07, -22);
    this.dungeon.add(sigil);
  }
  setPreviewClass(classId: ClassId) {
    if (this.preview) {
      this.world.remove(this.preview);
      disposeObject(this.preview);
    }
    this.preview = hero(classId, true);
    this.preview.scale.setScalar(1.4);
    this.preview.position.set(2, 0.8, 24);
    this.preview.rotation.y = 0.4;
    this.world.add(this.preview);
  }
  setPlaying(value: boolean) {
    this.playing = value;
    this.prediction.reset();
    this.predictedShots = [];
    this.knownShots.clear();
    this.reticle.visible = value;
    this.objectiveMarker.visible = value;
    if (this.preview) this.preview.visible = !value;
    if (!value) {
      for (const map of [this.playerMeshes, this.enemyMeshes, this.lootMeshes]) {
        for (const g of map.values()) {
          this.entities.remove(g);
          disposeObject(g);
        }
        map.clear();
      }
      for (const e of this.effects) {
        this.scene.remove(e.group);
        disposeObject(e.group);
      }
      this.effects = [];
      this.snapshot = undefined;
      this.switchDimension('wilds');
      this.target.set(0, 0, 20);
      this.entities.visible = false;
      this.projectileField.mesh.count = this.projectileField.glowMesh.count = 0;
      this.sparks.particles = [];
      this.labelLayer.replaceChildren();
      this.labels.clear();
    } else this.entities.visible = true;
  }
  applySettings() {
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, settings.quality === 'high' ? 1.5 : 1) * this.resolutionScale,
    );
    this.renderer.shadowMap.enabled = settings.quality === 'high';
    this.renderer.shadowMap.needsUpdate = true;
    this.resize();
  }
  switchDimension(dim: Dimension) {
    if (this.dimension === dim) return;
    this.dimension = dim;
    this.renderer.shadowMap.needsUpdate = true;
    this.world.visible = dim === 'wilds';
    this.dungeon.visible = dim !== 'wilds';
    if (dim !== 'wilds') this.buildDungeon(dim);
    this.scene.background = new THREE.Color(
      dim === 'wilds'
        ? '#789696'
        : dim === 'hollow'
          ? '#253d42'
          : dim === 'eclipse'
            ? '#242037'
            : '#483b37',
    );
    this.scene.fog = new THREE.FogExp2(
      dim === 'wilds'
        ? '#90aaa4'
        : dim === 'hollow'
          ? '#30494d'
          : dim === 'eclipse'
            ? '#34314f'
            : '#58473e',
      dim === 'wilds' ? 0.006 : 0.016,
    );
    this.fogTarget.copy(FOG_BASE);
    this.skyTarget.copy(SKY_BASE);
    for (const e of this.effects) {
      this.scene.remove(e.group);
      disposeObject(e.group);
    }
    this.effects = [];
  }
  update(s: Snapshot) {
    const changed = s.self.dimension !== this.dimension;
    const teleported = (s.motion?.epoch ?? 0) !== this.prediction.epoch;
    this.prediction.reconcile(s, performance.now() / 1000, this.latency);
    if (changed || teleported) {
      this.predictedShots = [];
      this.knownShots.clear();
      this.sparks.particles = [];
    }
    const now = performance.now() / 1000;
    for (const b of s.bullets) {
      if (b.owner !== s.self.id || this.knownShots.has(b.id)) continue;
      this.knownShots.add(b.id);
      const match = this.predictedShots.find(
        (v) =>
          !v.serverId &&
          b.radius === v.radius &&
          now - v.born < 0.5 &&
          Math.abs(
            Math.atan2(
              Math.sin(Math.atan2(v.vz, v.vx) - Math.atan2(b.vz, b.vx)),
              Math.cos(Math.atan2(v.vz, v.vx) - Math.atan2(b.vz, b.vx)),
            ),
          ) < 0.08,
      );
      if (match) match.serverId = b.id;
    }
    const active = new Set(s.bullets.map((b) => b.id));
    this.predictedShots = this.predictedShots.filter(
      (b) => now < b.expires && (!b.serverId || active.has(b.serverId)),
    );
    for (const id of this.knownShots) if (!active.has(id)) this.knownShots.delete(id);
    this.snapshot = s;
    this.lastSnapshot = performance.now();
    this.switchDimension(s.self.dimension);
    this.updateBeacons(s.realm.seals ?? [], s.realm.crown);
    if (changed || teleported || distance(this.focus, s.self) > 16) {
      this.focus.set(s.self.x, 0, s.self.z);
      this.target.copy(this.focus);
    }
    const players = [s.self, ...s.players],
      ids = new Set(players.map((p) => p.id));
    for (const [id, g] of this.playerMeshes)
      if (!ids.has(id)) {
        this.entities.remove(g);
        disposeObject(g);
        this.playerMeshes.delete(id);
        this.removeLabel(id);
      }
    for (const p of players) {
      let g = this.playerMeshes.get(p.id);
      if (!g) {
        g = hero(p.classId, p.id === s.self.id);
        this.playerMeshes.set(p.id, g);
        this.entities.add(g);
        g.position.set(p.x, groundHeight(p.x, p.z, s.self.dimension), p.z);
      }
      g.userData.state = p;
    }
    const enemies = new Set(s.enemies.map((e) => e.id));
    for (const [id, g] of this.enemyMeshes)
      if (!enemies.has(id)) {
        this.entities.remove(g);
        disposeObject(g);
        this.enemyMeshes.delete(id);
        this.removeLabel(id);
      }
    for (const e of s.enemies) {
      let g = this.enemyMeshes.get(e.id);
      if (!g) {
        g = creature(e);
        this.enemyMeshes.set(e.id, g);
        this.entities.add(g);
        g.position.set(e.x, groundHeight(e.x, e.z, e.dimension), e.z);
      }
      g.userData.state = e;
    }
    const drops = new Set(s.loot.map((e) => e.id));
    for (const [id, g] of this.lootMeshes)
      if (!drops.has(id)) {
        this.entities.remove(g);
        disposeObject(g);
        this.lootMeshes.delete(id);
        this.removeLabel(id);
      }
    for (const d of s.loot) {
      const previous = this.lootMeshes.get(d.id);
      if (previous?.userData.bagStyle === bagStyle(d.item)) continue;
      if (previous) {
        this.entities.remove(previous);
        disposeObject(previous);
      }
      const g = lootBag(d.item);
      g.position.set(d.x, surfaceHeight(d.x, d.z, d.dimension), d.z);
      this.lootMeshes.set(d.id, g);
      this.entities.add(g);
    }
    const hazards = new Set((s.hazards ?? []).map((h) => h.id));
    for (const [id, g] of this.hazardMeshes)
      if (!hazards.has(id)) {
        this.entities.remove(g);
        disposeObject(g);
        this.hazardMeshes.delete(id);
      }
    for (const h of s.hazards ?? []) {
      let g = this.hazardMeshes.get(h.id);
      if (!g) {
        g = new THREE.Group();
        const outer = ring(h.radius, '#ffb295', 0.09);
        outer.position.y = 0.14;
        g.add(outer);
        const fill = new THREE.Mesh(
          new THREE.CircleGeometry(h.radius, 48),
          new THREE.MeshBasicMaterial({
            color: '#ff775b',
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        fill.rotation.x = -Math.PI / 2;
        fill.position.y = 0.12;
        fill.name = 'fill';
        g.add(fill);
        const progress = ring(h.radius, '#ffe3bd', 0.055);
        progress.name = 'countdown';
        progress.position.y = 0.16;
        g.add(progress);
        g.position.set(h.x, groundHeight(h.x, h.z, h.dimension), h.z);
        this.entities.add(g);
        this.hazardMeshes.set(h.id, g);
      }
      g.userData.hazard = h;
    }
    for (const fx of s.effects) {
      if (this.effectIds.has(fx.id)) continue;
      this.effectIds.add(fx.id);
      if (
        fx.player === s.self.id &&
        performance.now() / 1000 - (this.localEffects[fx.kind] ?? -100) < 0.5
      )
        continue;
      this.addEffect(fx);
    }
    if (this.effectIds.size > 1000) this.effectIds = new Set(s.effects.map((e) => e.id));
  }
  addEffect(fx: Effect) {
    if (fx.kind === 'reward' && fx.player !== this.snapshot?.self.id) return;
    if (fx.kind === 'hit' || fx.kind === 'kill') {
      this.sparks.burst(
        fx.x,
        fx.z,
        fx.color,
        fx.kind === 'kill' ? 16 : 5,
        this.dimension,
        fx.kind === 'kill' ? 1.5 : 1,
      );
      for (const g of this.enemyMeshes.values())
        if (distance(g.position, fx) < 2) g.userData.hitAt = performance.now();
      if (fx.kind === 'hit' && !fx.player) sound.play('impact');
    }
    const g = new THREE.Group();
    g.position.set(fx.x, groundHeight(fx.x, fx.z, this.dimension) + 0.12, fx.z);
    const r = ring(0.3, fx.color, fx.kind === 'hit' ? 0.035 : 0.07);
    g.add(r);
    if (!['hit', 'reward'].includes(fx.kind)) {
      this.scene.add(g);
      this.effects.push({ group: g, start: performance.now(), kind: fx.kind });
    } else disposeObject(g);
    if (fx.kind === 'hit' && fx.player === this.snapshot?.self.id) {
      this.canvas.classList.remove('took-hit');
      void this.canvas.offsetWidth;
      this.canvas.classList.add('took-hit');
      if (settings.shake && !settings.reducedMotion) this.shake = 0.2;
      sound.play('hit');
    } else if (distance(fx, this.snapshot!.self) < 15 && fx.kind !== 'hit') sound.play(fx.kind);
    if (fx.value && settings.damageNumbers) {
      const label = document.createElement('div');
      label.className = `float-text ${fx.kind}`;
      label.textContent = fx.value;
      label.style.color = fx.color;
      this.labelLayer.append(label);
      const pos = this.project(
        fx.x,
        groundHeight(fx.x, fx.z, this.dimension) + (fx.kind === 'reward' ? 2.9 : 2),
        fx.z,
      );
      label.style.left = `${pos.x}px`;
      label.style.top = `${pos.y}px`;
      setTimeout(() => label.remove(), 1100);
    }
  }
  removeLabel(id: string) {
    this.labels.get(id)?.remove();
    this.labels.delete(id);
  }
  /** One column per living warden; the open Crown gets one too. Renewal restores them all. */
  updateBeacons(seals: string[], crown?: string) {
    const signature = `${seals.join(',')}|${crown}`;
    if (signature === this.beaconSignature) return;
    this.beaconSignature = signature;
    const posts: { x: number; z: number; kind: string }[] = WARDENS.filter(
      (w) => !seals.includes(w.kind),
    ).map((w) => ({ x: w.x, z: w.z, kind: w.kind }));
    if (crown === 'open') posts.push({ x: 0, z: -66, kind: 'sovereign' });
    posts.forEach((w, i) => {
      this.dummy.position.set(w.x, groundHeight(w.x, w.z) + 45, w.z);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.beacons.setMatrixAt(i, this.dummy.matrix);
      this.beacons.setColorAt(i, this.color.set(WARDEN_COLORS[w.kind] ?? '#e3c68c'));
    });
    this.beacons.count = posts.length;
    this.beacons.instanceMatrix.needsUpdate = true;
    if (this.beacons.instanceColor) this.beacons.instanceColor.needsUpdate = true;
  }
  resize() {
    const w = this.canvas.clientWidth,
      h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    const scale = (this.playing ? 17 : 20) * this.zoom;
    this.camera.left = (-scale * w) / h;
    this.camera.right = (scale * w) / h;
    this.camera.top = scale;
    this.camera.bottom = -scale;
    this.camera.near = 0.1;
    this.camera.far = 400;
    this.camera.updateProjectionMatrix();
  }
  aim(clientX: number, clientY: number): Vec {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((clientX - r.left) / r.width) * 2 - 1,
      (-(clientY - r.top) / r.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const point = new THREE.Vector3();
    this.plane.constant = -(
      groundHeight(this.prediction.position.x, this.prediction.position.z, this.dimension) + 0.8
    );
    this.raycaster.ray.intersectPlane(this.plane, point);
    return { x: point.x, z: point.z };
  }
  project(x: number, y: number, z: number) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return {
      x: ((v.x + 1) / 2) * this.canvas.clientWidth,
      y: ((1 - v.y) / 2) * this.canvas.clientHeight,
    };
  }
  changeZoom(multiplier: number) {
    this.zoomTarget = clampZoom(this.zoomTarget * multiplier);
  }
  orbit(direction: number, dt: number) {
    this.yaw = wrapYaw(this.yaw + direction * CAMERA.rotationSpeed * dt);
    this.syncCamera();
  }
  resetCamera() {
    this.yaw = CAMERA.defaultYaw;
    this.zoomTarget = 1;
    this.setTilt(CAMERA.defaultPitch);
    this.syncCamera();
  }
  setTilt(degrees: number) {
    settings.cameraTilt = clampPitch(degrees);
  }
  screenMove(x: number, z: number) {
    return screenMovement(x, z, this.yaw);
  }
  syncCamera() {
    const scale = (this.playing ? 17 : 21) * this.zoom,
      w = this.canvas.clientWidth,
      h = this.canvas.clientHeight;
    this.camera.left = (-scale * w) / h;
    this.camera.right = (scale * w) / h;
    this.camera.top = scale;
    this.camera.bottom = -scale;
    this.camera.updateProjectionMatrix();
    const offset = this.playing ? 0 : -7;
    const yaw = this.playing ? this.yaw : CAMERA.titleYaw;
    const pitch = ((this.playing ? this.pitch : CAMERA.defaultPitch) * Math.PI) / 180,
      reach = Math.cos(pitch) * 55;
    this.camera.position.set(
      this.focus.x + Math.sin(yaw) * reach + offset,
      Math.sin(pitch) * 55,
      this.focus.z + Math.cos(yaw) * reach,
    );
    this.camera.lookAt(this.focus.x + offset, 0, this.focus.z);
    this.camera.updateMatrixWorld();
  }
  control(input: Input, dt: number, now: number) {
    this.localInput = input;
    if (!this.character || !this.snapshot) return;
    this.prediction.step(input, combatStats(this.character).speed, dt, now);
    if (
      input.fire &&
      !isSafe(this.prediction.position, this.dimension) &&
      now >= this.nextLocalShot &&
      now - this.prediction.lastSnapshotAt < 0.35
    ) {
      const p = this.prediction.position;
      for (const shot of weaponShots(this.character)) {
        const angle = input.angle + shot.angle;
        this.predictedShots.push({
          id: -Math.random(),
          x: p.x + Math.cos(angle) * 0.75,
          z: p.z + Math.sin(angle) * 0.75,
          vx: Math.cos(angle) * shot.speed,
          vz: Math.sin(angle) * shot.speed,
          friendly: true,
          radius: shot.radius,
          color: CLASSES[this.character.classId].color,
          owner: this.snapshot.self.id,
          dimension: this.dimension,
          born: now,
          expires: now + CLASSES[this.character.classId].range / shot.speed,
        });
      }
      this.sparks.burst(
        p.x + Math.cos(input.angle),
        p.z + Math.sin(input.angle),
        CLASSES[this.character.classId].color,
        3,
        this.dimension,
        0.5,
      );
      this.nextLocalShot = now + combatStats(this.character).rate;
      this.recoil = 1;
      sound.play(
        this.character.classId === 'ranger'
          ? 'arrow'
          : this.character.classId === 'sentinel'
            ? 'blade'
            : 'shot',
      );
    }
  }
  animate = (now: number) => {
    requestAnimationFrame(this.animate);
    if (document.hidden) return;
    const targetFps = this.softwareRenderer ? (this.playing ? 30 : 12) : this.playing ? 60 : 24;
    if (now - this.lastFrame < 1000 / targetFps - 1) return;
    const frameTime = (now - this.lastFrame) / 1000;
    const dt = Math.min(0.1, frameTime);
    this.lastFrame = now;
    this.fps = this.fps * 0.97 + (1 / Math.max(frameTime, 0.001)) * 0.03;
    this.frame++;
    this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-dt * 14));
    this.pitch += (settings.cameraTilt - this.pitch) * (1 - Math.exp(-dt * 12));
    this.syncCamera();
    this.onFrame(dt);
    const s = this.snapshot,
      blend = 1 - Math.exp(-dt * 18);
    if (this.playing && s) {
      this.target.set(this.prediction.position.x, 0, this.prediction.position.z);
      this.focus.lerp(this.target, 1 - Math.exp(-dt * 22));
      this.syncCamera();
      for (const [id, g] of this.playerMeshes) {
        const p =
          id === s.self.id
            ? { ...s.self, ...this.prediction.position, angle: this.localInput.angle }
            : (g.userData.state as PlayerState);
        const oldX = g.position.x,
          oldZ = g.position.z;
        const y = surfaceHeight(p.x, p.z, this.dimension);
        g.position.x += (p.x - g.position.x) * (id === s.self.id ? 1 : blend);
        g.position.z += (p.z - g.position.z) * (id === s.self.id ? 1 : blend);
        const walking = Math.min(1, Math.hypot(g.position.x - oldX, g.position.z - oldZ) / dt / 7);
        const stride = settings.reducedMotion ? 0 : Math.sin(now * 0.021) * walking;
        g.position.y = y + Math.abs(stride) * 0.075;
        g.getObjectByName('left-foot')!.rotation.x = stride * 0.6;
        g.getObjectByName('right-foot')!.rotation.x = -stride * 0.6;
        g.getObjectByName('cape')!.rotation.x = -0.15 - walking * 0.25;
        if (id === s.self.id) {
          g.rotation.x = settings.reducedMotion ? 0 : -this.recoil * 0.055;
          this.recoil *= Math.exp(-dt * 25);
        }
        g.rotation.y = Math.PI / 2 - p.angle;
        g.visible = true;
        g.getObjectByName('aura')?.scale.setScalar(p.invulnerable ? 1.3 : 1);
        const hurtbox = g.getObjectByName('hurtbox');
        if (hurtbox) hurtbox.visible = !p.safe;
        if (id === s.self.id) {
          let label = this.labels.get('self-vitals');
          if (!label) {
            label = document.createElement('div');
            label.innerHTML = '<i><b></b></i><i><b></b></i>';
            this.labels.set('self-vitals', label);
            this.labelLayer.append(label);
          }
          label.className = `self-vitals ${p.hp / p.maxHp < 0.3 ? 'danger' : ''}`;
          const bars = label.querySelectorAll<HTMLElement>('b');
          bars[0].style.width = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;
          bars[1].style.width = `${Math.max(0, (p.mp / p.maxMp) * 100)}%`;
          const pos = this.project(g.position.x, y + 0.05, g.position.z);
          label.style.transform = `translate(${pos.x}px,${pos.y + 16}px) translateX(-50%)`;
        }
        if (id !== s.self.id) {
          let label = this.labels.get(id);
          if (!label) {
            label = document.createElement('div');
            label.className = 'player-label';
            this.labels.set(id, label);
            this.labelLayer.append(label);
          }
          label.textContent = `${p.name} · ${p.level}`;
          const pos = this.project(g.position.x, 2.5, g.position.z);
          label.style.transform = `translate(${pos.x}px,${pos.y}px) translate(-50%,-50%)`;
        }
      }
      for (const g of this.enemyMeshes.values()) {
        const e = g.userData.state as EnemyState;
        const speed = (Math.hypot(e.x - g.position.x, e.z - g.position.z) * blend) / dt;
        g.position.x += (e.x - g.position.x) * blend;
        g.position.z += (e.z - g.position.z) * blend;
        g.position.y = groundHeight(e.x, e.z, this.dimension);
        g.rotation.y = Math.PI / 2 - e.angle;
        animateCreature(g, e, now, speed, settings.reducedMotion);
        const tell = g.getObjectByName('telegraph')!;
        tell.visible = e.telegraph > 0;
        tell.scale.setScalar(1 + (1 - e.telegraph) * 0.35);
        const pointer = g.getObjectByName('attack-pointer')!;
        pointer.visible = e.telegraph > 0 && ['aim', 'fan'].includes(attackPlan(e).pattern);
        const hit = Math.max(0, 1 - (now - (g.userData.hitAt ?? -1000)) / 150);
        g.scale.set(1 + hit * 0.12, 1 - hit * 0.1, 1 + hit * 0.12);
        if (e.boss) {
          const scale = 1 + Math.max(0, Math.min(1, e.telegraph)) * 0.09;
          g.scale.setScalar(scale);
        }
        const quest = QUESTS[this.character?.quest ?? 0],
          target =
            e.kind === quest?.kind || (quest?.kind === 'warden' && e.kind.endsWith('warden'));
        // Plate anything close enough to matter; bosses always. Colour says whether it is safe.
        const near = distance(e, s.self);
        if (e.boss || target || e.hp < e.maxHp || near < 20) {
          let label = this.labels.get(e.id);
          if (!label) {
            label = document.createElement('div');
            label.className = 'enemy-label';
            label.innerHTML = '<span></span><i><b></b></i><small></small>';
            this.labels.set(e.id, label);
            this.labelLayer.append(label);
          }
          const def = ENEMIES[e.kind];
          const band = threatOfTier(this.character?.level ?? 1, def.tier, e.boss);
          label.classList.toggle('quest-target', target);
          label.dataset.threat = band;
          label.querySelector('span')!.textContent = `${target ? '◇ ' : ''}${e.name}`;
          label.querySelector<HTMLElement>('span')!.style.color = target
            ? '#f6d698'
            : THREAT_COLORS[band];
          label.querySelector<HTMLElement>('b')!.style.width =
            `${Math.max(0, (e.hp / e.maxHp) * 100)}%`;
          // Holding C turns every plate into the bestiary entry, at the moment it matters.
          const detail = label.querySelector<HTMLElement>('small')!;
          const show = this.bestiary && near < 24;
          detail.hidden = !show;
          if (show) {
            const plan = attackPlan(e);
            detail.textContent = `T${def.tier} · ${plan.name} · ${plan.hint}`;
          }
          const pos = this.project(
            g.position.x,
            g.position.y + (g.userData.height ?? 2) + 0.15,
            g.position.z,
          );
          label.style.transform = `translate(${pos.x}px,${pos.y}px) translate(-50%,-50%)`;
        } else this.removeLabel(e.id);
      }
    } else {
      this.focus.lerp(this.target, 0.04);
      if (!settings.reducedMotion) this.focus.x = Math.sin(now * 0.00008) * 1.2;
    }
    this.syncCamera();
    this.altarMarker.visible = this.playing && s?.dungeon?.status === 'ready';
    if (s?.dungeon) {
      this.altarMarker.position.set(s.dungeon.altar.x, 0.05, s.dungeon.altar.z);
    }
    if (this.playing && s) {
      this.guides.update(s.enemies);
      const serverNow = s.time + Math.min(0.25, (now - this.lastSnapshot) / 1000);
      for (const g of this.hazardMeshes.values()) {
        const hazard = g.userData.hazard;
        const progress = Math.max(
          0.01,
          Math.min(1, (serverNow - hazard.starts) / (hazard.detonates - hazard.starts)),
        );
        g.getObjectByName('countdown')!.scale.setScalar(progress);
        (
          g.getObjectByName('fill') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
        ).material.opacity = progress >= 1 ? 0.65 : 0.1 + progress * 0.16;
      }
      for (const d of s.loot) {
        const near = distance(d, s.self);
        if (near > 5 && bagStyle(d.item) !== 'white') {
          this.removeLabel(d.id);
          continue;
        }
        let label = this.labels.get(d.id);
        if (!label) {
          label = document.createElement('div');
          this.labels.set(d.id, label);
          this.labelLayer.append(label);
        }
        const verdicts = this.character
          ? bagItems(d).map((item) => compareGear(this.character!, item).verdict)
          : [];
        const verdict = verdicts.includes('upgrade')
          ? 'upgrade'
          : verdicts.includes('tradeoff')
            ? 'tradeoff'
            : verdicts.includes('equivalent')
              ? 'equivalent'
              : 'outclassed';
        label.className = `loot-label ${verdict}`;
        label.style.setProperty('--loot-color', LOOT_BAGS[bagStyle(d.item)].color);
        label.dataset.bag = bagStyle(d.item);
        label.textContent = `${bagStyle(d.item) === 'white' ? 'WHITE BAG · ' : ''}${bagItems(d).length} ${bagItems(d).length === 1 ? 'item' : 'items'}${bagItems(d).some((item) => this.character && compareGear(this.character, item).verdict === 'upgrade') ? ' ↑' : ''}`;
        const pos = this.project(d.x, surfaceHeight(d.x, d.z, this.dimension) + 1.1, d.z);
        label.style.transform = `translate(${pos.x}px,${pos.y}px) translate(-50%,-100%)`;
      }
      const seconds = now / 1000;
      const elapsed = Math.min(0.2, (now - this.lastSnapshot) / 1000);
      const matched = new Set(this.predictedShots.map((b) => b.serverId));
      const visible: BulletState[] = s.bullets
        .filter((b) => !matched.has(b.id))
        .map((b) => ({ ...b, x: b.x + b.vx * elapsed, z: b.z + b.vz * elapsed }));
      this.predictedShots = this.predictedShots.filter((b) => seconds < b.expires);
      for (const b of this.predictedShots) {
        const age = seconds - b.born;
        const x = b.x + b.vx * age,
          z = b.z + b.vz * age;
        // A local impact only retires the visual. The server alone decides damage and rewards.
        if (
          !b.hidden &&
          this.character?.classId !== 'ranger' &&
          this.character &&
          !hasTrait(this.character, 'pierce') &&
          s.enemies.some((e) => Math.hypot(e.x - x, e.z - z) < e.radius + b.radius)
        )
          b.hidden = true;
        if (!b.hidden) visible.push({ ...b, x, z });
      }
      this.projectileField.render(
        visible,
        this.camera,
        this.dimension,
        s.self.id,
        settings.allyShots,
      );
      this.reticle.visible = !matchMedia('(pointer: coarse)').matches;
      const aim = this.localInput.angle,
        p = this.prediction.position;
      const length = CLASSES[s.self.classId].range;
      this.reticle.position.set(
        p.x + Math.cos(aim) * Math.min(length, this.aimDistance || 10),
        0.85,
        p.z + Math.sin(aim) * Math.min(length, this.aimDistance || 10),
      );
      this.reticle.position.y =
        groundHeight(this.reticle.position.x, this.reticle.position.z, this.dimension) + 0.82;
      this.objectiveMarker.visible = !!this.objective;
      if (this.objective) {
        this.objectiveMarker.position.set(
          this.objective.x,
          groundHeight(this.objective.x, this.objective.z, this.dimension) + 0.12,
          this.objective.z,
        );
        this.objectiveMarker.children[1].position.y = 1.9 + Math.sin(now * 0.004) * 0.16;
      }
      this.canvas.dataset.cameraYaw = this.yaw.toFixed(4);
      this.canvas.dataset.beacons = String(this.beacons.count);
      this.canvas.dataset.cameraZoom = this.zoom.toFixed(3);
      this.canvas.dataset.cameraPitch = this.pitch.toFixed(2);
      this.canvas.dataset.playerX = p.x.toFixed(3);
      this.canvas.dataset.playerZ = p.z.toFixed(3);
    }
    if (this.dimension === 'wilds') {
      // Fog and sky drift toward the zone underfoot: atmosphere, never a filter.
      const p = this.playing && s ? this.prediction.position : { x: 0, z: 20 };
      const zone = zoneAt(p.x, p.z);
      this.fogTarget.copy(FOG_BASE).lerp(this.color.set(zone.color), 0.26);
      this.skyTarget.copy(SKY_BASE).lerp(this.color, 0.18);
      const ease = 1 - Math.exp(-dt * 1.4);
      (this.scene.fog as THREE.FogExp2).color.lerp(this.fogTarget, ease);
      (this.scene.background as THREE.Color).lerp(this.skyTarget, ease);
      if (this.beacons.count && !settings.reducedMotion)
        (this.beacons.material as THREE.MeshBasicMaterial).opacity =
          0.4 + Math.sin(now * 0.0012) * 0.07;
    }
    this.sparks.step(dt);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.z += (Math.random() - 0.5) * this.shake;
      this.shake *= 0.8;
    }
    if (!settings.reducedMotion)
      for (const obj of this.decorations) {
        if (obj.type === 'Mesh') obj.rotation.y = now * 0.0007;
      }
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i],
        age = (now - fx.start) / 1000;
      if (age > 0.65) {
        this.scene.remove(fx.group);
        disposeObject(fx.group);
        this.effects.splice(i, 1);
        continue;
      }
      fx.group.scale.setScalar(1 + age * (fx.kind === 'ability' ? 18 : 7));
      fx.group.position.y =
        groundHeight(fx.group.position.x, fx.group.position.z, this.dimension) + 0.12 + age * 0.05;
    }
    if (!this.playing) this.guides.update([]);
    if ((this.playing || this.softwareRenderer) && now - this.lastResolutionCheck > 2000) {
      this.lastResolutionCheck = now;
      const minimum = this.softwareRenderer ? 0.35 : 0.65,
        maximum = this.softwareRenderer ? 0.65 : 1,
        slow = this.softwareRenderer ? targetFps * 0.75 : 44,
        fast = this.softwareRenderer ? targetFps * 0.96 : 58;
      const next =
        this.fps < slow
          ? Math.max(minimum, this.resolutionScale - 0.1)
          : this.fps > fast
            ? Math.min(maximum, this.resolutionScale + 0.05)
            : this.resolutionScale;
      if (next !== this.resolutionScale) {
        this.resolutionScale = next;
        this.renderer.setPixelRatio(
          Math.min(devicePixelRatio, settings.quality === 'high' ? 1.5 : 1) * next,
        );
      }
    }
    this.renderer.render(this.scene, this.camera);
    if (this.frame % 30 === 0) {
      this.canvas.dataset.fps = String(Math.round(this.fps));
      this.canvas.dataset.drawCalls = String(this.renderer.info.render.calls);
    }
  };
}
