import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { EnemyState } from '../../shared/types';
import { ENEMIES } from '../../shared/content';

// Original sculpted silhouettes. Each rigid part is merged into two material batches;
// animation moves those parts, never allocates geometry in the frame loop.
const prototypes = new Map<string, THREE.Group>();
const stone = new THREE.MeshStandardMaterial({
  vertexColors: true,
  flatShading: true,
  roughness: 0.72,
  metalness: 0.16,
});
const light = new THREE.MeshStandardMaterial({
  vertexColors: true,
  flatShading: true,
  roughness: 0.36,
  metalness: 0.3,
  emissive: '#ffffff',
  emissiveIntensity: 0.28,
});
stone.userData.shared = light.userData.shared = true;
const cube = new THREE.BoxGeometry(1, 1, 1),
  ico = new THREE.IcosahedronGeometry(1, 0),
  crystal = new THREE.OctahedronGeometry(1),
  cone = new THREE.ConeGeometry(1, 1, 5);
type V3 = [number, number, number];
class Sculpt {
  solid: THREE.BufferGeometry[] = [];
  glow: THREE.BufferGeometry[] = [];
  add(
    base: THREE.BufferGeometry,
    color: string,
    at: V3,
    size: V3,
    rotation: V3 = [0, 0, 0],
    glow = false,
  ) {
    const geo = base.index ? base.toNonIndexed() : base.clone();
    geo.deleteAttribute('uv');
    geo.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(...at),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
        new THREE.Vector3(...size),
      ),
    );
    const c = new THREE.Color(color),
      colors = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = c.r;
      colors[i + 1] = c.g;
      colors[i + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    (glow ? this.glow : this.solid).push(geo);
  }
  box(c: string, p: V3, s: V3, r?: V3, glow = false) {
    this.add(cube, c, p, s, r, glow);
  }
  orb(c: string, p: V3, s: V3, glow = false) {
    this.add(ico, c, p, s, [0, 0, 0], glow);
  }
  gem(c: string, p: V3, s: V3, r?: V3, glow = false) {
    this.add(crystal, c, p, s, r, glow);
  }
  spike(c: string, p: V3, s: V3, r?: V3, glow = false) {
    this.add(cone, c, p, s, r, glow);
  }
  link(c: string, a: V3, b: V3, width: number, taper = 0.7) {
    const from = new THREE.Vector3(...a),
      to = new THREE.Vector3(...b),
      delta = to.clone().sub(from);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.clone().normalize(),
    );
    const r = new THREE.Euler().setFromQuaternion(q);
    const geo = new THREE.CylinderGeometry(width * taper, width, 1, 5);
    this.add(
      geo,
      c,
      from.add(to).multiplyScalar(0.5).toArray() as V3,
      [1, delta.length(), 1],
      [r.x, r.y, r.z],
    );
    geo.dispose();
  }
  arc(
    c: string,
    p: V3,
    radius: number,
    tube: number,
    arc = Math.PI * 2,
    rotation: V3 = [0, 0, 0],
    glow = false,
  ) {
    const geo = new THREE.TorusGeometry(radius, tube, 4, 28, arc);
    this.add(geo, c, p, [1, 1, 1], rotation, glow);
    geo.dispose();
  }
  finish(parent: THREE.Group) {
    for (const [pieces, mat] of [
      [this.solid, stone],
      [this.glow, light],
    ] as const) {
      if (!pieces.length) continue;
      const geometry = mergeGeometries(pieces)!;
      geometry.userData.shared = true;
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.receiveShadow = true;
      parent.add(mesh);
      pieces.forEach((piece) => piece.dispose());
    }
  }
}
function part(root: THREE.Group, name: string, build: (s: Sculpt) => void, at: V3 = [0, 0, 0]) {
  const group = new THREE.Group(),
    sculpt = new Sculpt();
  group.name = name;
  group.position.set(...at);
  group.userData.rest = [...at];
  build(sculpt);
  sculpt.finish(group);
  root.add(group);
  return group;
}
function eyes(s: Sculpt, y: number, z: number, gap: number, color: string) {
  for (const side of [-1, 1])
    s.gem(color, [side * gap, y, z], [0.075, 0.075, 0.035], undefined, true);
}
function crown(s: Sculpt, color: string, y: number, radius: number, count = 5) {
  s.arc('#d0a570', [0, y, 0], radius, 0.045, Math.PI * 2, [Math.PI / 2, 0, 0]);
  for (let i = 0; i < count; i++) {
    const a = (i * Math.PI * 2) / count;
    s.gem(
      color,
      [Math.sin(a) * radius, y + 0.25, Math.cos(a) * radius],
      [0.1, 0.38, 0.1],
      [0, a, 0],
      true,
    );
  }
}
/**
 * The outer ring's roster, as forms rather than one hand-written block each. Every entry
 * is a silhouette you can name at a glance — a prowler is low and forward, a strider is
 * all legs, a monolith does not move — and the numbers below make each kind its own.
 */
type Form = 'prowler' | 'drifter' | 'strider' | 'bulwark' | 'bloom' | 'orb' | 'monolith' | 'titan';
interface Shape {
  form: Form;
  core: string;
  accent: string;
  dark: string;
  size: number;
  /** Limb pairs, crown points, or ring count, depending on the form. */
  count?: number;
  wings?: boolean;
  horns?: boolean;
}
const SHAPES: Record<string, Shape> = {
  brineclaw: {
    form: 'prowler',
    core: '#7fbfc0',
    accent: '#cdece8',
    dark: '#37585e',
    size: 1,
    count: 2,
    horns: true,
  },
  glasshound: {
    form: 'prowler',
    core: '#b6dde5',
    accent: '#e7f7fa',
    dark: '#4a6b74',
    size: 1.1,
    count: 2,
  },
  bogfiend: {
    form: 'prowler',
    core: '#7d9273',
    accent: '#c6d9a8',
    dark: '#33422f',
    size: 1.15,
    count: 3,
    horns: true,
  },
  voidmoth: {
    form: 'drifter',
    core: '#8d93bb',
    accent: '#ded9f4',
    dark: '#3b3a55',
    size: 1.1,
    wings: true,
    count: 2,
  },
  tidewisp: {
    form: 'drifter',
    core: '#9fd9d4',
    accent: '#e2fbf4',
    dark: '#3d6a70',
    size: 0.9,
    wings: true,
    count: 3,
  },
  prismsliver: {
    form: 'drifter',
    core: '#e0f5f8',
    accent: '#ffffff',
    dark: '#5d8b95',
    size: 0.75,
    count: 2,
  },
  miragesliver: {
    form: 'drifter',
    core: '#efe3c2',
    accent: '#fff6de',
    dark: '#7d7154',
    size: 0.75,
    count: 2,
  },
  saltstrider: {
    form: 'strider',
    core: '#e2d6b4',
    accent: '#fff4d6',
    dark: '#6d654c',
    size: 1.05,
    count: 3,
  },
  emberkite: {
    form: 'strider',
    core: '#e8a271',
    accent: '#ffd9ab',
    dark: '#6b4230',
    size: 1.1,
    count: 2,
    wings: true,
  },
  stonebark: { form: 'bulwark', core: '#a29b7c', accent: '#d6cda6', dark: '#4c4738', size: 1.1 },
  thornmother: {
    form: 'bloom',
    core: '#b3a86f',
    accent: '#e2d79c',
    dark: '#4d4630',
    size: 1.1,
    count: 6,
  },
  marshlantern: {
    form: 'bloom',
    core: '#c8d79a',
    accent: '#f2ffc9',
    dark: '#3f4a32',
    size: 1,
    count: 5,
  },
  orrery: { form: 'orb', core: '#b6c1de', accent: '#e8eeff', dark: '#414a68', size: 1, count: 3 },
  prismshard: {
    form: 'orb',
    core: '#c9ecf1',
    accent: '#ffffff',
    dark: '#4e737c',
    size: 1.05,
    count: 2,
  },
  mirage: { form: 'orb', core: '#d8c69c', accent: '#fff3d4', dark: '#6a6047', size: 1, count: 2 },
  ashanchor: {
    form: 'monolith',
    core: '#c08a6d',
    accent: '#ffcfa6',
    dark: '#4b3227',
    size: 1.3,
    count: 4,
  },
  tidechoir: {
    form: 'titan',
    core: '#8fd0cf',
    accent: '#dcfbf5',
    dark: '#2f545a',
    size: 1,
    count: 6,
    horns: true,
  },
  orchardmother: {
    form: 'titan',
    core: '#b6ac83',
    accent: '#e7dcae',
    dark: '#4a4331',
    size: 1,
    count: 7,
  },
  saltking: {
    form: 'titan',
    core: '#eee2c1',
    accent: '#fff8e2',
    dark: '#6d6349',
    size: 1,
    count: 5,
    horns: true,
  },
  orrerywarden: {
    form: 'titan',
    core: '#a9b5d6',
    accent: '#e6ecff',
    dark: '#3c445f',
    size: 1,
    count: 8,
  },
  marrowherald: {
    form: 'titan',
    core: '#94ab89',
    accent: '#d9e9c6',
    dark: '#33402e',
    size: 1,
    count: 6,
    horns: true,
  },
  fusedtitan: {
    form: 'titan',
    core: '#bfe6ee',
    accent: '#ffffff',
    dark: '#48696f',
    size: 1.05,
    count: 7,
  },
  stormremembers: {
    form: 'titan',
    core: '#e0a181',
    accent: '#ffd8b6',
    dark: '#5b3729',
    size: 1.1,
    count: 9,
    horns: true,
  },
};
function buildShape(root: THREE.Group, shape: Shape) {
  const { core, accent, dark, size } = shape;
  const n = shape.count ?? 3;
  if (shape.form === 'prowler') {
    // Low, forward, and clearly about to close the distance.
    part(root, 'body', (s) => {
      s.orb(dark, [0, 0.62 * size, -0.1], [0.5 * size, 0.36 * size, 0.78 * size]);
      s.gem(core, [0, 0.82 * size, -0.16], [0.42 * size, 0.3 * size, 0.66 * size], [0.25, 0, 0]);
      s.orb(dark, [0, 0.6 * size, 0.62 * size], [0.32 * size, 0.28 * size, 0.34 * size]);
      eyes(s, 0.72 * size, 0.86 * size, 0.16 * size, accent);
      for (const side of [-1, 1]) {
        s.spike(
          accent,
          [side * 0.2 * size, 0.5 * size, 0.92 * size],
          [0.09, 0.4 * size, 0.1],
          [1.25, 0, side * -0.3],
          true,
        );
        if (shape.horns)
          s.spike(
            core,
            [side * 0.24 * size, 1 * size, 0.22 * size],
            [0.1, 0.5 * size, 0.11],
            [-0.3, 0, side * 0.4],
          );
      }
      s.link(core, [0, 0.66 * size, -0.7 * size], [0, 0.95 * size, -1.25 * size], 0.13 * size);
      s.gem(accent, [0, 1 * size, -1.3 * size], [0.14, 0.24, 0.16], [0.5, 0, 0], true);
    });
    for (const side of [-1, 1])
      part(root, side < 0 ? 'legs-left' : 'legs-right', (s) => {
        for (let i = 0; i < n; i++) {
          const z = (i - (n - 1) / 2) * 0.52 * size;
          s.link(
            dark,
            [side * 0.34 * size, 0.6 * size, z * 0.6],
            [side * 0.78 * size, 0.34 * size, z],
            0.085 * size,
          );
          s.link(
            core,
            [side * 0.78 * size, 0.34 * size, z],
            [side * 0.74 * size, 0.05, z + 0.15],
            0.055 * size,
          );
        }
      });
    return 1.5 * size;
  }
  if (shape.form === 'drifter') {
    part(root, 'body', (s) => {
      s.gem(dark, [0, 1 * size, 0], [0.3 * size, 0.62 * size, 0.3 * size]);
      s.gem(
        accent,
        [0, 1.06 * size, 0.1 * size],
        [0.15 * size, 0.3 * size, 0.16 * size],
        undefined,
        true,
      );
      for (let i = 0; i < n; i++)
        s.arc(core, [0, 1 * size, 0], (0.34 + i * 0.14) * size, 0.026, Math.PI * 1.6, [
          Math.PI / 2,
          (i * Math.PI) / n,
          0,
        ]);
      s.spike(core, [0, 1.6 * size, 0], [0.22 * size, 0.28 * size, 0.22 * size]);
    });
    for (const side of [-1, 1])
      part(
        root,
        side < 0 ? 'wing-left' : 'wing-right',
        (s) => {
          if (shape.wings) {
            s.gem(
              core,
              [side * 0.5 * size, 0.24 * size, -0.06],
              [0.56 * size, 0.4 * size, 0.06],
              [0, side * 0.28, side * -0.46],
            );
            s.gem(
              accent,
              [side * 0.4 * size, -0.16 * size, -0.08],
              [0.36 * size, 0.36 * size, 0.04],
              [0, 0, side * 0.5],
              true,
            );
          } else {
            s.gem(
              core,
              [side * 0.42 * size, 0.1 * size, 0],
              [0.2 * size, 0.5 * size, 0.14 * size],
              [0, 0, side * 0.5],
            );
          }
          s.link(
            dark,
            [side * 0.14 * size, -0.24 * size, 0],
            [side * 0.24 * size, -0.66 * size, -0.18],
            0.032 * size,
          );
        },
        [0, 1 * size, 0],
      );
    return 1.9 * size;
  }
  if (shape.form === 'strider') {
    // All legs. It is already backing away before you have decided anything.
    part(root, 'body', (s) => {
      s.gem(core, [0, 1.75 * size, 0], [0.34 * size, 0.42 * size, 0.5 * size], [0.2, 0, 0]);
      s.orb(dark, [0, 1.7 * size, 0.34 * size], [0.24 * size, 0.2 * size, 0.26 * size]);
      eyes(s, 1.78 * size, 0.5 * size, 0.12 * size, accent);
      s.link(dark, [0, 1.55 * size, -0.2 * size], [0, 2.15 * size, -0.5 * size], 0.07 * size);
      s.gem(accent, [0, 2.24 * size, -0.55 * size], [0.12, 0.22, 0.12], [0.5, 0, 0], true);
      if (shape.wings)
        for (const side of [-1, 1])
          s.gem(
            core,
            [side * 0.5 * size, 1.95 * size, -0.2 * size],
            [0.44 * size, 0.5 * size, 0.05],
            [0, 0, side * -0.5],
          );
    });
    for (const side of [-1, 1])
      part(root, side < 0 ? 'legs-left' : 'legs-right', (s) => {
        for (let i = 0; i < n; i++) {
          const spread = 0.55 + i * 0.32;
          s.link(
            dark,
            [side * 0.2 * size, 1.6 * size, (i - 1) * 0.2 * size],
            [side * spread * size, 1.05 * size, (i - 1) * 0.5 * size],
            0.06 * size,
          );
          s.link(
            core,
            [side * spread * size, 1.05 * size, (i - 1) * 0.5 * size],
            [side * (spread + 0.2) * size, 0.04, (i - 1) * 0.65 * size],
            0.042 * size,
          );
        }
      });
    return 2.5 * size;
  }
  if (shape.form === 'bulwark') {
    // A wall with a creature behind it. The plate is the point.
    part(root, 'body', (s) => {
      s.box(dark, [0, 0.9 * size, -0.2 * size], [0.9 * size, 1.5 * size, 0.7 * size]);
      s.box(core, [0, 1 * size, 0.42 * size], [1.5 * size, 1.8 * size, 0.36 * size]);
      s.box(accent, [0, 1.72 * size, 0.5 * size], [1.62 * size, 0.2 * size, 0.3 * size]);
      for (let i = 0; i < 3; i++)
        s.gem(
          accent,
          [(i - 1) * 0.45 * size, 0.9 * size, 0.62 * size],
          [0.1, 0.28, 0.06],
          undefined,
          true,
        );
      s.orb(dark, [0, 1.55 * size, -0.3 * size], [0.34 * size, 0.3 * size, 0.34 * size]);
      eyes(s, 1.58 * size, -0.02, 0.14 * size, accent);
    });
    for (const side of [-1, 1])
      part(root, side < 0 ? 'legs-left' : 'legs-right', (s) => {
        s.box(
          dark,
          [side * 0.42 * size, 0.28 * size, -0.2 * size],
          [0.28 * size, 0.6 * size, 0.5 * size],
        );
        s.box(
          core,
          [side * 0.44 * size, 0.06 * size, -0.12 * size],
          [0.36 * size, 0.14 * size, 0.62 * size],
        );
      });
    return 2 * size;
  }
  if (shape.form === 'bloom') {
    // Rooted, crowned, and busy. It is doing something, and it is not to you.
    part(root, 'body', (s) => {
      s.orb(dark, [0, 0.7 * size, 0], [0.62 * size, 0.6 * size, 0.58 * size]);
      for (let i = 0; i < n; i++) {
        const a = (i * Math.PI * 2) / n;
        s.gem(
          core,
          [Math.sin(a) * 0.42 * size, 1.15 * size, Math.cos(a) * 0.42 * size],
          [0.2 * size, 0.72 * size, 0.15 * size],
          [Math.cos(a) * 0.5, a, -Math.sin(a) * 0.5],
        );
      }
      s.gem(accent, [0, 1.35 * size, 0], [0.24 * size, 0.44 * size, 0.24 * size], undefined, true);
      eyes(s, 0.78 * size, 0.56 * size, 0.14 * size, accent);
    });
    for (const side of [-1, 1])
      part(
        root,
        side < 0 ? 'arm-left' : 'arm-right',
        (s) => {
          s.link(core, [0, 0, 0], [side * 0.5 * size, -0.42 * size, 0.2 * size], 0.075 * size);
          s.gem(
            accent,
            [side * 0.56 * size, -0.5 * size, 0.24 * size],
            [0.13, 0.2, 0.11],
            undefined,
            true,
          );
        },
        [side * 0.3 * size, 1.05 * size, 0],
      );
    for (const side of [-1, 1])
      part(root, side < 0 ? 'legs-left' : 'legs-right', (s) => {
        for (let i = -1; i <= 1; i++)
          s.link(
            dark,
            [side * 0.3 * size, 0.55 * size, i * 0.2 * size],
            [side * 0.66 * size, 0.03, i * 0.4 * size],
            0.07 * size,
          );
      });
    return 2 * size;
  }
  if (shape.form === 'orb') {
    // A core inside rings that are not quite attached to it.
    part(root, 'body', (s) => {
      s.gem(accent, [0, 1.05 * size, 0], [0.3 * size, 0.5 * size, 0.3 * size], undefined, true);
      s.gem(dark, [0, 1.05 * size, 0], [0.46 * size, 0.36 * size, 0.46 * size]);
      for (let i = 0; i < n; i++)
        s.arc(core, [0, 1.05 * size, 0], (0.62 + i * 0.2) * size, 0.05 * size, Math.PI * 2, [
          Math.PI / 2 + i * 0.5,
          i * 0.7,
          i * 0.3,
        ]);
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        s.gem(
          core,
          [Math.sin(a) * 0.5 * size, 0.5 * size, Math.cos(a) * 0.5 * size],
          [0.12 * size, 0.34 * size, 0.12 * size],
          [0, a, 0.4],
        );
      }
    });
    part(root, 'tail', (s) => {
      s.link(dark, [0, 0.5 * size, 0], [0, 0.06, 0], 0.1 * size);
      s.gem(core, [0, 0.1, 0], [0.44 * size, 0.12 * size, 0.44 * size]);
    });
    return 2.1 * size;
  }
  if (shape.form === 'monolith') {
    // It does not chase. It makes the ground the problem.
    part(root, 'body', (s) => {
      s.box(dark, [0, 1.2 * size, 0], [1.1 * size, 2.4 * size, 1.1 * size], [0, 0.4, 0]);
      s.box(core, [0, 1.5 * size, 0], [1.3 * size, 0.9 * size, 1.3 * size], [0, 0.4, 0]);
      for (let i = 0; i < n; i++) {
        const a = (i * Math.PI * 2) / n + 0.4;
        s.gem(
          accent,
          [Math.sin(a) * 0.72 * size, 1.5 * size, Math.cos(a) * 0.72 * size],
          [0.14 * size, 0.5 * size, 0.14 * size],
          [0, a, 0],
          true,
        );
      }
      s.gem(accent, [0, 2.55 * size, 0], [0.28 * size, 0.6 * size, 0.28 * size], undefined, true);
      s.box(dark, [0, 0.16 * size, 0], [1.6 * size, 0.32 * size, 1.6 * size], [0, 0.4, 0]);
    });
    return 3 * size;
  }
  // titan: a boss stage. Broad shoulders, a crown, and arms that wind up where you can see.
  part(root, 'body', (s) => {
    s.orb(dark, [0, 1.5 * size, 0], [1.05 * size, 1.2 * size, 0.9 * size]);
    s.gem(core, [0, 2.15 * size, 0.1 * size], [0.95 * size, 0.8 * size, 0.8 * size], [0.2, 0, 0]);
    s.orb(dark, [0, 2.75 * size, 0.18 * size], [0.46 * size, 0.44 * size, 0.46 * size]);
    eyes(s, 2.8 * size, 0.56 * size, 0.2 * size, accent);
    crown(s, accent, 3.15 * size, 0.5 * size, n);
    for (let i = 0; i < n; i++) {
      const a = (i * Math.PI * 2) / n;
      s.gem(
        core,
        [Math.sin(a) * 1.05 * size, 1.6 * size, Math.cos(a) * 0.85 * size],
        [0.18 * size, 0.62 * size, 0.16 * size],
        [Math.cos(a) * 0.4, a, -Math.sin(a) * 0.4],
      );
    }
    if (shape.horns)
      for (const side of [-1, 1])
        s.spike(
          accent,
          [side * 0.42 * size, 3 * size, 0.1 * size],
          [0.14 * size, 0.8 * size, 0.14 * size],
          [-0.2, 0, side * 0.5],
        );
    s.box(dark, [0, 0.45 * size, 0], [1.3 * size, 0.9 * size, 1.1 * size]);
  });
  for (const side of [-1, 1])
    part(
      root,
      side < 0 ? 'arm-left' : 'arm-right',
      (s) => {
        s.link(dark, [0, 0, 0], [side * 0.55 * size, -0.9 * size, 0.15 * size], 0.19 * size);
        s.gem(
          core,
          [side * 0.66 * size, -1.15 * size, 0.2 * size],
          [0.3 * size, 0.42 * size, 0.3 * size],
        );
        s.gem(
          accent,
          [side * 0.72 * size, -1.45 * size, 0.28 * size],
          [0.16, 0.3, 0.16],
          undefined,
          true,
        );
      },
      [side * 0.95 * size, 2.2 * size, 0],
    );
  for (const side of [-1, 1])
    part(root, side < 0 ? 'legs-left' : 'legs-right', (s) => {
      s.box(dark, [side * 0.45 * size, 0.5 * size, 0], [0.42 * size, 1 * size, 0.5 * size]);
      s.box(
        core,
        [side * 0.47 * size, 0.09 * size, 0.1 * size],
        [0.52 * size, 0.2 * size, 0.72 * size],
      );
    });
  return 3.9 * size;
}
function build(kind: string) {
  const root = new THREE.Group(),
    def = ENEMIES[kind];
  const core = def.color;
  let height = 1.8;
  const shape = SHAPES[kind];
  if (shape) {
    height = buildShape(root, shape);
  } else if (kind === 'cinderling') {
    part(root, 'body', (s) => {
      s.orb('#744c3e', [0, 0.52, -0.06], [0.45, 0.34, 0.65]);
      s.orb('#ae7047', [0, 0.65, 0.42], [0.4, 0.35, 0.4]);
      s.box('#422f2c', [0, 0.51, 0.7], [0.35, 0.16, 0.18]);
      eyes(s, 0.73, 0.72, 0.2, '#fff1a9');
      for (const side of [-1, 1]) {
        s.spike('#483b35', [side * 0.25, 1, 0.3], [0.14, 0.43, 0.16], [0, 0, side * -0.25]);
        for (let i = 0; i < 3; i++)
          s.gem(
            '#f2a051',
            [side * 0.37, 0.61, -0.3 + i * 0.2],
            [0.08, 0.13, 0.11],
            [0, 0, side * 0.5],
            true,
          );
      }
    });
    part(root, 'tail', (s) => {
      s.link('#715145', [0, 0.5, -0.5], [0.15, 0.7, -1.04], 0.16);
      s.gem('#ffc26c', [0.15, 0.74, -1.07], [0.17, 0.25, 0.21], [0.6, 0, 0], true);
    });
    for (const side of [-1, 1])
      part(root, side < 0 ? 'legs-left' : 'legs-right', (s) => {
        for (const z of [-0.34, 0.35]) {
          s.orb('#584439', [side * 0.37, 0.3, z], [0.15, 0.25, 0.18]);
          s.box('#d5ad78', [side * 0.43, 0.12, z + 0.08], [0.22, 0.13, 0.29]);
        }
      });
    height = 1.3;
  } else if (kind === 'thornling') {
    part(root, 'body', (s) => {
      s.orb('#65553c', [0, 0.72, 0], [0.55, 0.56, 0.5]);
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5;
        s.gem(
          '#71945a',
          [Math.sin(a) * 0.35, 1.05, Math.cos(a) * 0.35],
          [0.24, 0.51, 0.17],
          [Math.cos(a) * 0.45, a, -Math.sin(a) * 0.45],
        );
      }
      s.orb('#354c3a', [0, 0.71, 0.46], [0.3, 0.24, 0.11]);
      eyes(s, 0.78, 0.55, 0.13, '#d4e694');
      s.gem('#e8ce7d', [0, 0.51, 0.5], [0.09, 0.14, 0.07], undefined, true);
      for (const side of [-1, 1]) {
        s.link('#a7af72', [side * 0.28, 1.05, 0], [side * 0.66, 1.6, -0.1], 0.08);
        s.link('#a7af72', [side * 0.5, 1.35, -0.05], [side * 0.34, 1.64, 0.1], 0.04);
      }
    });
    for (const side of [-1, 1])
      part(root, side < 0 ? 'legs-left' : 'legs-right', (s) => {
        for (let i = 0; i < 3; i++) {
          const z = (i - 1) * 0.42;
          s.link('#68734a', [side * 0.35, 0.64, z * 0.5], [side * 0.83, 0.42, z], 0.075);
          s.link('#b1b780', [side * 0.83, 0.42, z], [side * 0.78, 0.08, z + 0.16], 0.055);
        }
      });
    height = 1.8;
  } else if (kind === 'wisp') {
    part(root, 'body', (s) => {
      s.gem('#3d727e', [0, 0.95, 0], [0.23, 0.55, 0.22]);
      s.gem('#cefff0', [0, 1.02, 0.12], [0.13, 0.25, 0.15], undefined, true);
      s.arc('#d4bf8a', [0, 1, 0.02], 0.3, 0.028);
      s.spike('#a0d6be', [0, 1.56, 0], [0.23, 0.23, 0.23]);
      for (const side of [-1, 1])
        s.link('#c3e3c5', [side * 0.12, 1.3, 0], [side * 0.35, 1.63, 0.1], 0.025);
    });
    for (const side of [-1, 1])
      part(
        root,
        side < 0 ? 'wing-left' : 'wing-right',
        (s) => {
          s.gem(
            '#79ada7',
            [side * 0.44, 0.28, -0.04],
            [0.49, 0.35, 0.06],
            [0, side * 0.3, side * -0.42],
          );
          s.gem('#c7e8c3', [side * 0.35, -0.14, -0.08], [0.33, 0.33, 0.04], [0, 0, side * 0.5]);
          s.gem('#e6ffd6', [side * 0.3, 0.29, 0.03], [0.14, 0.11, 0.02], undefined, true);
          s.link('#89b8bd', [side * 0.16, -0.25, 0], [side * 0.26, -0.67, -0.2], 0.035);
        },
        [0, 1, 0],
      );
    height = 1.9;
  } else if (kind === 'scarab') {
    part(root, 'body', (s) => {
      s.orb('#605044', [0, 0.47, 0], [0.58, 0.32, 0.78]);
      for (const side of [-1, 1]) {
        s.gem('#ba8a56', [side * 0.27, 0.73, -0.16], [0.36, 0.37, 0.65], [0, 0, side * 0.15]);
        s.gem('#f1cc91', [side * 0.31, 0.89, -0.08], [0.1, 0.19, 0.28], undefined, true);
      }
      s.orb('#3e504a', [0, 0.48, 0.65], [0.34, 0.28, 0.3]);
      eyes(s, 0.64, 0.85, 0.14, '#d3f7f1');
      for (const side of [-1, 1])
        s.spike('#ede0b9', [side * 0.25, 0.35, 0.93], [0.085, 0.43, 0.1], [1.1, 0, side * -0.45]);
      s.gem('#9fe1d5', [0, 1.09, -0.31], [0.16, 0.38, 0.2], [0.35, 0, 0], true);
    });
    for (const side of [-1, 1])
      part(root, side < 0 ? 'legs-left' : 'legs-right', (s) => {
        for (let i = -1; i <= 1; i++) {
          s.link('#6d6555', [side * 0.4, 0.47, i * 0.38], [side * 0.9, 0.33, i * 0.52], 0.08);
          s.link('#cab588', [side * 0.9, 0.33, i * 0.52], [side * 0.88, 0.04, i * 0.65], 0.05);
        }
      });
    height = 1.55;
  } else if (kind === 'watcher') {
    part(root, 'body', (s) => {
      s.box('#55516a', [0, 1.09, 0], [0.77, 0.76, 0.51]);
      s.gem('#a9a1b5', [0, 1.09, 0.24], [0.47, 0.46, 0.14]);
      s.box('#33384b', [0, 1.67, 0.03], [0.64, 0.36, 0.49]);
      s.box('#e4c49a', [0, 1.73, 0.29], [0.42, 0.06, 0.045], undefined, true);
      s.gem('#be9edf', [0, 1.1, 0.39], [0.15, 0.2, 0.06], undefined, true);
      s.box('#9d947e', [0, 0.65, 0], [0.7, 0.14, 0.55]);
    });
    for (const side of [-1, 1]) {
      part(
        root,
        side < 0 ? 'arm-left' : 'arm-right',
        (s) => {
          s.orb('#8b7e89', [side * 0.15, -0.05, 0], [0.33, 0.3, 0.32]);
          s.box('#565065', [side * 0.23, -0.37, 0.08], [0.3, 0.5, 0.33]);
          s.gem('#ecc78f', [side * 0.23, -0.37, 0.28], [0.15, 0.15, 0.09], undefined, true);
        },
        [side * 0.52, 1.35, 0],
      );
      part(root, side < 0 ? 'legs-left' : 'legs-right', (s) => {
        s.box('#514653', [side * 0.23, 0.36, -0.02], [0.28, 0.52, 0.32]);
        s.box('#a4988a', [side * 0.23, 0.13, 0.1], [0.34, 0.23, 0.48]);
      });
    }
    height = 2.15;
  } else if (kind === 'rootwarden') {
    part(root, 'body', (s) => {
      s.orb('#655044', [0, 1.65, 0], [0.76, 1.25, 0.65]);
      for (const side of [-1, 1]) {
        s.link('#8c7952', [side * 0.43, 0.6, 0.4], [side * 0.57, 2.4, 0.18], 0.13);
        s.orb('#6e8c62', [side * 0.77, 2.25, -0.05], [0.66, 0.45, 0.65]);
        s.link('#b2aa76', [side * 0.3, 2.65, 0], [side * 0.95, 3.65, -0.07], 0.1);
        s.link('#c0b588', [side * 0.66, 3.22, -0.04], [side * 0.42, 3.7, 0.1], 0.055);
        s.link('#c0b588', [side * 0.8, 3.42, -0.06], [side * 1.22, 3.42, 0.06], 0.05);
      }
      s.orb('#394b37', [0, 2.42, 0.46], [0.39, 0.45, 0.24]);
      eyes(s, 2.55, 0.65, 0.19, '#edecab');
      s.gem('#bde4a3', [0, 1.65, 0.63], [0.3, 0.53, 0.19], undefined, true);
    });
    for (const side of [-1, 1]) {
      part(
        root,
        side < 0 ? 'arm-left' : 'arm-right',
        (s) => {
          s.link('#7d6b49', [0, 0, 0], [side * 0.3, -0.85, 0.1], 0.22);
          s.orb('#6c8661', [side * 0.24, -0.35, 0], [0.33, 0.29, 0.33]);
          for (let i = 0; i < 3; i++)
            s.link(
              '#b1a67a',
              [side * 0.3, -0.8, 0.05],
              [side * (0.26 + i * 0.12), -1.28, 0.27],
              0.05,
            );
        },
        [side * 1, 2.1, 0],
      );
      part(root, side < 0 ? 'legs-left' : 'legs-right', (s) => {
        s.link('#66513e', [side * 0.36, 0.9, 0], [side * 0.65, 0.18, 0.16], 0.23);
        for (let i = 0; i < 3; i++)
          s.link(
            '#a4996e',
            [side * 0.63, 0.2, 0.08],
            [side * (0.5 + i * 0.14), 0.07, 0.58 - i * 0.25],
            0.07,
          );
      });
    }
    height = 4.1;
  } else if (kind === 'duskwarden') {
    part(root, 'body', (s) => {
      const robe = new THREE.CylinderGeometry(0.47, 0.86, 1.7, 7);
      s.add(robe, '#514861', [0, 1.2, 0], [1, 1, 1]);
      robe.dispose();
      s.box('#968c9d', [0, 2.29, 0], [0.73, 0.7, 0.6]);
      s.box('#2d354a', [0, 2.3, 0.32], [0.53, 0.2, 0.1]);
      s.box('#e4d4a8', [0, 2.3, 0.38], [0.28, 0.045, 0.03], undefined, true);
      s.arc('#a69775', [0, 2.62, -0.16], 0.78, 0.08, Math.PI * 1.4, [0, 0, -0.63]);
      for (const side of [-1, 1]) {
        s.gem('#8b7a93', [side * 0.65, 1.95, 0], [0.46, 0.25, 0.43]);
        s.link('#b6a375', [side * 0.24, 2, 0.48], [side * 0.4, 0.55, 0.58], 0.025);
      }
    });
    for (const side of [-1, 1])
      part(
        root,
        side < 0 ? 'arm-left' : 'arm-right',
        (s) => {
          s.link('#555263', [0, 0, 0], [side * 0.19, -0.72, 0.11], 0.14);
          const bell = new THREE.CylinderGeometry(0.1, 0.34, 0.43, 7);
          s.add(bell, '#b89a68', [side * 0.2, -0.95, 0.12], [1, 1, 1]);
          bell.dispose();
          s.orb('#eee3b3', [side * 0.2, -1.17, 0.12], [0.1, 0.1, 0.1], true);
        },
        [side * 0.92, 1.9, 0],
      );
    height = 3.6;
  } else if (kind === 'glasswarden') {
    part(root, 'body', (s) => {
      s.orb('#626765', [0, 0.98, -0.05], [0.69, 0.63, 1.03]);
      s.gem('#b1d4cb', [0, 1.33, -0.1], [0.76, 0.59, 0.86]);
      s.orb('#739a96', [0, 1.26, 0.88], [0.45, 0.49, 0.54]);
      s.gem('#d8fff1', [0, 1.49, 1.25], [0.21, 0.24, 0.12], undefined, true);
      for (const side of [-1, 1]) {
        s.gem('#cfbe91', [side * 0.35, 1.79, 0.91], [0.16, 0.64, 0.15], [0.3, 0, side * -0.28]);
        for (let i = 0; i < 3; i++)
          s.gem(
            i % 2 ? '#89bcb3' : '#d0e6d6',
            [side * (0.38 + i * 0.22), 1.9 - i * 0.15, -0.25 - i * 0.13],
            [0.2, 0.9 - i * 0.12, 0.23],
            [0.1, 0, side * -0.38],
          );
      }
    });
    for (const side of [-1, 1])
      part(root, side < 0 ? 'legs-left' : 'legs-right', (s) => {
        for (const z of [-0.66, 0.65]) {
          s.gem('#708780', [side * 0.62, 0.56, z], [0.21, 0.48, 0.27]);
          s.box('#bdc9b4', [side * 0.72, 0.16, z + 0.13], [0.41, 0.23, 0.5]);
        }
      });
    height = 3.2;
  } else if (kind === 'archivist') {
    part(root, 'body', (s) => {
      const robe = new THREE.CylinderGeometry(0.34, 0.71, 1.4, 6);
      s.add(robe, '#3d6970', [0, 1.7, 0], [1, 1, 1]);
      robe.dispose();
      s.orb('#91bcb3', [0, 2.72, 0], [0.4, 0.45, 0.34]);
      s.box('#24454f', [0, 2.68, 0.32], [0.47, 0.19, 0.05]);
      eyes(s, 2.72, 0.36, 0.13, '#e6fbd6');
      crown(s, '#bbd1a6', 2.98, 0.43, 3);
      for (const side of [-1, 1]) {
        s.gem('#b7ad87', [side * 0.44, 2.13, 0.24], [0.16, 0.74, 0.11], [0, 0, side * 0.22]);
        s.link('#a6c2ad', [side * 0.57, 2.2, 0], [side * 0.69, 1.66, 0.85], 0.13);
      }
    });
    part(
      root,
      'book',
      (s) => {
        for (const side of [-1, 1]) {
          s.box('#7b5b49', [side * 0.34, 0, 0.1], [0.67, 0.1, 0.85], [0, 0, side * -0.2]);
          s.box('#e3d8ac', [side * 0.33, 0.09, 0.1], [0.59, 0.1, 0.72], [0, 0, side * -0.2]);
          for (let i = 0; i < 3; i++)
            s.box(
              '#8f9f89',
              [side * 0.34, 0.155, -0.12 + i * 0.18],
              [0.35, 0.01, 0.025],
              [0, 0, side * -0.2],
            );
        }
        s.gem('#bbfff0', [0, 0.37, 0], [0.12, 0.23, 0.12], undefined, true);
      },
      [0, 1.68, 1],
    );
    for (const side of [-1, 1])
      part(
        root,
        side < 0 ? 'wing-left' : 'wing-right',
        (s) => {
          for (let i = 0; i < 4; i++) {
            s.box(
              i % 2 ? '#cbd6b4' : '#a9bda4',
              [side * (0.43 + i * 0.2), 0.3 - i * 0.28, -0.14 - i * 0.07],
              [0.34, 0.7, 0.045],
              [0, side * -0.4, side * -0.7],
            );
            s.box(
              '#638f88',
              [side * (0.43 + i * 0.2), 0.3 - i * 0.28, -0.105 - i * 0.07],
              [0.16, 0.28, 0.01],
              [0, side * -0.4, side * -0.7],
            );
          }
        },
        [0, 2.04, -0.08],
      );
    height = 3.8;
  } else if (kind === 'forgemother') {
    part(root, 'body', (s) => {
      s.orb('#51433d', [0, 1.58, 0], [0.95, 1.06, 0.64]);
      s.box('#302f32', [0, 1.5, 0.53], [0.87, 0.88, 0.15]);
      s.gem('#f3a159', [0, 1.52, 0.65], [0.32, 0.48, 0.09], undefined, true);
      for (const x of [-0.26, 0, 0.26]) s.box('#51403a', [x, 1.53, 0.75], [0.08, 0.84, 0.06]);
      s.box('#967763', [0, 2.57, 0], [0.79, 0.56, 0.6]);
      s.box('#ffd598', [0, 2.56, 0.31], [0.45, 0.075, 0.055], undefined, true);
      for (const side of [-1, 1]) {
        s.spike('#51423e', [side * 0.3, 3, -0.15], [0.15, 0.43, 0.15]);
        s.gem('#e29a5b', [side * 0.69, 2.13, 0.23], [0.19, 0.48, 0.15], [0, 0, side * 0.35], true);
      }
    });
    for (const side of [-1, 1]) {
      part(
        root,
        side < 0 ? 'arm-left' : 'arm-right',
        (s) => {
          s.orb('#8d6b50', [0, 0, 0], [0.43, 0.4, 0.43]);
          s.box('#54443d', [side * 0.12, -0.53, 0.15], [0.42, 0.81, 0.47]);
          if (side > 0) {
            s.link('#a27e4c', [0.12, -0.6, 0.2], [0.12, -0.55, 1.36], 0.095);
            s.box('#666167', [0.12, -0.55, 1.43], [0.85, 0.56, 0.53]);
            s.box('#ecba79', [0.12, -0.55, 1.71], [0.64, 0.25, 0.04], undefined, true);
          } else s.orb('#bf8355', [-0.12, -0.9, 0.15], [0.35, 0.28, 0.36]);
        },
        [side * 1.03, 2.14, 0],
      );
      part(root, side < 0 ? 'legs-left' : 'legs-right', (s) => {
        s.box('#6e5142', [side * 0.47, 0.58, 0], [0.46, 0.8, 0.48]);
        s.box('#a08a6c', [side * 0.5, 0.18, 0.19], [0.59, 0.32, 0.69]);
      });
    }
    height = 3.7;
  } else if (kind === 'sovereign') {
    part(root, 'body', (s) => {
      const robe = new THREE.CylinderGeometry(0.48, 1.04, 1.85, 8);
      s.add(robe, '#514252', [0, 1.44, 0], [1, 1, 1]);
      robe.dispose();
      s.gem('#b99565', [0, 2.27, 0.17], [0.75, 0.79, 0.41]);
      s.gem('#ffe3a2', [0, 2.19, 0.53], [0.23, 0.38, 0.15], undefined, true);
      s.box('#51404b', [0, 3.03, 0.02], [0.54, 0.54, 0.45]);
      s.box('#e2bb7a', [0, 2.99, 0.27], [0.36, 0.19, 0.04]);
      eyes(s, 3.03, 0.31, 0.11, '#fff7d5');
      crown(s, '#f8d88f', 3.34, 0.49, 7);
      for (const side of [-1, 1]) {
        s.gem('#765365', [side * 0.86, 2.34, -0.1], [0.5, 0.32, 0.61]);
        s.box('#c6a675', [side * 0.34, 1.33, 0.76], [0.14, 1.63, 0.07], [0, 0, side * 0.13]);
      }
    });
    for (const side of [-1, 1])
      part(
        root,
        side < 0 ? 'arm-left' : 'arm-right',
        (s) => {
          for (let i = 0; i < 2; i++) {
            s.link(
              '#998378',
              [0, -i * 0.44, 0],
              [side * (0.52 + i * 0.2), -0.35 - i * 0.45, 0.42],
              0.115,
            );
            s.orb('#e0bc83', [side * (0.52 + i * 0.2), -0.35 - i * 0.45, 0.42], [0.18, 0.16, 0.18]);
            s.gem(
              '#ffdd97',
              [side * (0.57 + i * 0.2), -0.15 - i * 0.45, 0.53],
              [0.11, 0.29, 0.11],
              undefined,
              true,
            );
          }
        },
        [side * 0.86, 2.45, 0],
      );
    part(
      root,
      'elder-halo',
      (s) => {
        s.arc('#cbb082', [0, 0, 0], 1.22, 0.085);
        for (let i = 0; i < 12; i++) {
          const a = (i * Math.PI) / 6;
          s.gem(
            '#f8d698',
            [Math.sin(a) * 1.43, Math.cos(a) * 1.43, 0],
            [0.07, 0.25, 0.07],
            [0, 0, -a],
            true,
          );
        }
      },
      [0, 2.6, -0.55],
    );
    height = 4.8;
  } else if (kind === 'tideelder') {
    part(root, 'body', (s) => {
      s.orb('#3d727b', [0, 1.55, 0], [0.71, 1.01, 0.73]);
      s.orb('#6daeb1', [0, 2.58, 0.52], [0.55, 0.68, 0.61]);
      s.gem('#b8e5d8', [0, 2.38, 1.1], [0.26, 0.41, 0.44], [0.55, 0, 0]);
      eyes(s, 2.89, 0.99, 0.3, '#efffdf');
      for (const side of [-1, 1]) {
        s.link('#d3d9b7', [side * 0.34, 2.95, 0.4], [side * 0.62, 3.75, 0.08], 0.07);
        s.link('#b7d1b7', [side * 0.4, 2.35, 0.87], [side * 0.72, 1.75, 1.14], 0.035);
      }
      for (let i = 0; i < 4; i++)
        s.gem('#99c4c0', [0, 0.85 + i * 0.36, 0.59], [0.4 - i * 0.035, 0.22, 0.14]);
    });
    part(root, 'tail', (s) => {
      for (let i = 0; i < 7; i++) {
        const a = i * 0.48;
        s.orb(
          i % 2 ? '#548f99' : '#619fa3',
          [Math.sin(a) * 1.02, 0.6 - i * 0.055, -Math.cos(a) * 0.96],
          [0.48 - i * 0.035, 0.4 - i * 0.032, 0.43 - i * 0.028],
        );
        s.gem(
          '#9fe1dd',
          [Math.sin(a) * 1.02, 1.01 - i * 0.075, -Math.cos(a) * 0.96],
          [0.11, 0.3 - i * 0.016, 0.13],
          [0, -a, -0.2],
          true,
        );
      }
    });
    for (const side of [-1, 1])
      part(
        root,
        side < 0 ? 'wing-left' : 'wing-right',
        (s) => {
          for (let i = 0; i < 4; i++)
            s.gem(
              i % 2 ? '#93c9c0' : '#4e959f',
              [side * (0.3 + i * 0.24), 0.18 - i * 0.18, -0.13 * i],
              [0.19, 0.73 - i * 0.04, 0.09],
              [0.18, 0, side * -0.7],
            );
        },
        [side * 0.48, 2, 0],
      );
    height = 4.3;
  } else if (kind === 'cinderelder') {
    part(root, 'body', (s) => {
      s.gem('#674341', [0, 1.74, 0], [0.55, 0.93, 0.49]);
      s.gem('#ffc783', [0, 1.86, 0.4], [0.28, 0.54, 0.12], undefined, true);
      s.orb('#a36348', [0, 2.78, 0.22], [0.35, 0.45, 0.33]);
      s.spike('#e5c18b', [0, 2.62, 0.68], [0.19, 0.61, 0.17], [Math.PI / 2, 0, 0]);
      eyes(s, 2.88, 0.49, 0.18, '#fff8cd');
      for (let i = -1; i <= 1; i++)
        s.gem('#ebac69', [i * 0.17, 3.22, -0.14], [0.13, 0.56, 0.13], [-0.4, 0, -i * 0.18], true);
      for (const side of [-1, 1]) {
        s.link('#ad8b67', [side * 0.24, 1.09, 0.1], [side * 0.37, 0.45, 0.3], 0.07);
        for (let i = 0; i < 3; i++)
          s.link('#e5c699', [side * 0.37, 0.45, 0.3], [side * (0.23 + i * 0.13), 0.24, 0.64], 0.03);
      }
    });
    for (const side of [-1, 1])
      part(
        root,
        side < 0 ? 'wing-left' : 'wing-right',
        (s) => {
          s.link('#74484a', [0, 0, 0], [side * 1.11, 0.4, -0.09], 0.19);
          for (let i = 0; i < 7; i++) {
            const x = 0.35 + i * 0.21;
            s.gem(
              i % 2 ? '#b77750' : '#d29a60',
              [side * x, 0.25 - i * 0.13, -0.13 - i * 0.07],
              [0.16, 0.86 - i * 0.048, 0.12],
              [0.12, 0, side * -0.95],
            );
            s.gem(
              '#ffd38d',
              [side * (x + 0.29), -0.22 - i * 0.09, -0.13 - i * 0.07],
              [0.065, 0.35, 0.06],
              [0, 0, side * -0.95],
              true,
            );
          }
        },
        [side * 0.38, 2.3, 0],
      );
    part(root, 'tail', (s) => {
      for (let i = -1; i <= 1; i++)
        s.gem(
          i ? '#8e5c4e' : '#eda36a',
          [i * 0.23, 0.92, -0.6],
          [0.16, 1, 0.12],
          [-0.55, 0, i * 0.26],
          !i,
        );
    });
    height = 4.4;
  } else {
    // Vesper's broad negative-space wings and single pale eye read through violet storms.
    part(root, 'body', (s) => {
      s.gem('#514361', [0, 1.6, 0], [0.66, 0.99, 0.39]);
      s.gem('#2c3447', [0, 2.3, 0.02], [0.57, 0.43, 0.35]);
      s.gem('#f5f2da', [0, 2.32, 0.36], [0.29, 0.12, 0.04], undefined, true);
      s.gem('#594973', [0, 2.32, 0.4], [0.05, 0.09, 0.02]);
      s.arc('#c3b0d1', [0, 2.96, 0], 0.75, 0.085, Math.PI * 1.5, [0, 0, -0.78]);
      for (const side of [-1, 1])
        s.gem('#e4d5ef', [side * 0.52, 3.62, 0.01], [0.12, 0.47, 0.1], [0, 0, side * -0.25], true);
      for (let i = -1; i <= 1; i++)
        s.gem('#a39bb7', [i * 0.27, 0.88, 0.16], [0.08, 0.81, 0.07], [0, 0, i * 0.16]);
    });
    for (const side of [-1, 1])
      part(
        root,
        side < 0 ? 'wing-left' : 'wing-right',
        (s) => {
          s.gem(
            '#49445e',
            [side * 0.74, -0.04, -0.05],
            [0.97, 0.55, 0.12],
            [0, 0.12 * side, side * -0.15],
          );
          for (let i = 0; i < 4; i++) {
            s.gem(
              '#817296',
              [side * (0.29 + i * 0.29), -0.35 - i * 0.07, -0.07],
              [0.17, 0.91 - i * 0.1, 0.09],
              [0, 0, side * -0.33],
            );
            s.gem(
              '#c5b9d5',
              [side * (0.33 + i * 0.3), 0.19 - i * 0.06, 0.03],
              [0.07, 0.32, 0.04],
              [0, 0, side * -0.95],
            );
          }
        },
        [side * 0.37, 2.2, -0.14],
      );
    part(
      root,
      'elder-halo',
      (s) => {
        for (let i = 0; i < 5; i++) {
          const a = (i * Math.PI * 2) / 5;
          s.gem(
            '#b2a8c9',
            [Math.sin(a) * 1.35, Math.cos(a) * 1.35, 0],
            [0.08, 0.16, 0.07],
            [0, 0, -a],
            true,
          );
        }
      },
      [0, 2.15, -0.5],
    );
    height = 4.5;
  }
  // Bosses are broad enough to communicate their actual collision area without towering offscreen.
  const scale = def.boss ? def.radius / (def.elder ? 1.7 : 1.35) : 1;
  const rig = new THREE.Group();
  rig.name = 'rig';
  rig.scale.setScalar(scale);
  while (root.children.length) rig.add(root.children[0]);
  root.add(rig);
  root.userData.height = height * scale;
  const shadowGeo = new THREE.CircleGeometry(def.radius * 1.07, 28);
  shadowGeo.userData.shared = true;
  const shadowMat = new THREE.MeshBasicMaterial({
    color: '#102923',
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
  });
  shadowMat.userData.shared = true;
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.025;
  root.add(shadow);
  const tellGeo = new THREE.TorusGeometry(def.radius + 0.35, 0.05, 4, 48);
  tellGeo.userData.shared = true;
  const tellMat = new THREE.MeshBasicMaterial({
    color: '#ffba95',
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  });
  tellMat.userData.shared = true;
  const tell = new THREE.Mesh(tellGeo, tellMat);
  tell.name = 'telegraph';
  tell.rotation.x = Math.PI / 2;
  tell.position.y = 0.09;
  tell.visible = false;
  root.add(tell);
  const pointerGeo = new THREE.ConeGeometry(0.22, 1.2, 3);
  pointerGeo.userData.shared = true;
  const pointer = new THREE.Mesh(pointerGeo, tellMat);
  pointer.name = 'attack-pointer';
  pointer.rotation.x = Math.PI / 2;
  pointer.position.set(0, 0.13, def.radius + 1.05);
  pointer.visible = false;
  root.add(pointer);
  return root;
}
export function creature(e: EnemyState) {
  if (!prototypes.has(e.kind)) prototypes.set(e.kind, build(e.kind));
  const root = prototypes.get(e.kind)!.clone(true);
  root.userData.kind = e.kind;
  // Cache part references once. Clone's JSON userData intentionally contains no Object3D references.
  root.userData.parts = Object.fromEntries(
    [
      'body',
      'legs-left',
      'legs-right',
      'arm-left',
      'arm-right',
      'wing-left',
      'wing-right',
      'tail',
      'book',
      'elder-halo',
    ].map((name) => [name, root.getObjectByName(name)]),
  );
  return root;
}
export function animateCreature(
  root: THREE.Group,
  e: EnemyState,
  now: number,
  speed: number,
  reduced: boolean,
) {
  const parts = root.userData.parts as Record<string, THREE.Object3D | undefined>;
  const t = now * 0.001,
    windup = Math.min(1, Math.max(0, e.telegraph)),
    step = reduced
      ? 0
      : Math.sin(t * (e.boss ? 5 : 11) + e.x) * Math.min(1, speed / (e.boss ? 0.8 : 2));
  for (const side of [-1, 1]) {
    const leg = parts[side < 0 ? 'legs-left' : 'legs-right'];
    if (leg) leg.rotation.x = side * step * 0.3;
    const arm = parts[side < 0 ? 'arm-left' : 'arm-right'];
    if (arm) {
      arm.rotation.x = -windup * 0.75 + step * side * 0.12;
      arm.rotation.z = side * windup * -0.2;
    }
    const wing = parts[side < 0 ? 'wing-left' : 'wing-right'];
    if (wing) {
      const fast = e.kind === 'wisp' ? 9 : 2.1;
      wing.rotation.z =
        side * ((reduced ? 0 : Math.sin(t * fast + e.x) * 0.16) + windup * 0.42 + e.phase * 0.045);
      wing.rotation.y = side * -0.12 * windup;
    }
  }
  if (parts.tail) parts.tail.rotation.y = reduced ? 0 : Math.sin(t * 2.8) * 0.18;
  if (parts.book)
    parts.book.position.y = 1.68 + (reduced ? 0 : Math.sin(t * 2) * 0.06) + windup * 0.2;
  if (parts['elder-halo'] && !reduced) parts['elder-halo'].rotation.z = t * 0.07 * (1 + e.phase);
  if (parts.body) {
    parts.body.scale.set(1 + windup * 0.025, 1 - windup * 0.025, 1 + windup * 0.025);
    parts.body.rotation.x = -windup * 0.04;
  }
  const floating =
    ['wisp', 'archivist', 'duskwarden', 'sovereign', 'cinderelder', 'nullelder'].includes(e.kind) ||
    SHAPES[e.kind]?.form === 'drifter' ||
    SHAPES[e.kind]?.form === 'orb';
  const rig = root.getObjectByName('rig')!;
  rig.position.y = floating && !reduced ? Math.sin(t * 2.3 + e.x) * 0.08 : Math.abs(step) * 0.028;
}
