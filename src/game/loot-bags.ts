import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bagStyle, LOOT_BAGS } from '../../shared/gear';
import type { Item } from '../../shared/types';

const models = new Map<string, THREE.Group>();
function fabric(color: string, glow = 0) {
  const material = new THREE.MeshStandardMaterial({
    fog: false,
    color,
    roughness: 1,
    flatShading: true,
    emissive: color,
    emissiveIntensity: glow,
  });
  material.userData.shared = true;
  return material;
}
function rope(points: number[][]) {
  return new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z))),
    12,
    0.025,
    4,
    false,
  );
}
/** Original folded cloth, drawstring and stitched tier marks. Five draw calls per bag.
 * Geometry is cached for the finite family of bags and shared across drops. */
export function lootBag(item: Item) {
  const style = bagStyle(item),
    tier = Math.max(1, Math.min(6, item.tier)),
    key = `${style}:${tier}`;
  if (!models.has(key)) {
    const spec = LOOT_BAGS[style],
      group = new THREE.Group();
    const body = new THREE.LatheGeometry(
      [
        [0, 0.06],
        [0.32, 0.07],
        [0.5, 0.25],
        [0.51, 0.49],
        [0.41, 0.71],
        [0.2, 0.85],
        [0.18, 0.96],
        [0.26, 1.07],
        [0.1, 1.04],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
      16,
    );
    const positions = body.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i),
        y = positions.getY(i),
        z = positions.getZ(i),
        angle = Math.atan2(x, z),
        fold = 1 + Math.cos(angle * 8) * (y > 0.7 ? 0.1 : 0.055);
      positions.setXYZ(i, x * fold, y + (y > 1 ? Math.cos(angle * 8) * 0.025 : 0), z * fold * 0.83);
    }
    body.computeVertexNormals();
    group.add(new THREE.Mesh(body, fabric(spec.color, style === 'white' ? 0.22 : 0.08)));
    const neck = new THREE.TorusGeometry(0.21, 0.035, 4, 20);
    neck.rotateX(Math.PI / 2);
    neck.scale(1, 1, 0.87);
    neck.translate(0, 0.9, 0);
    const stitchParts: THREE.BufferGeometry[] = [
      neck,
      rope([
        [0, 0.91, 0.2],
        [-0.26, 1.02, 0.22],
        [-0.3, 0.84, 0.28],
        [0, 0.91, 0.2],
      ]),
      rope([
        [0, 0.91, 0.2],
        [0.24, 1.04, 0.2],
        [0.3, 0.85, 0.28],
        [0, 0.91, 0.2],
      ]),
      rope([
        [0, 0.91, 0.2],
        [-0.12, 0.7, 0.4],
        [-0.19, 0.6, 0.41],
      ]),
      rope([
        [0.02, 0.91, 0.2],
        [0.13, 0.78, 0.34],
        [0.22, 0.7, 0.37],
      ]),
    ];
    // One, two or three paired stitches mark the tier family independently of color.
    for (let i = 0; i < Math.ceil(tier / 2); i++) {
      const seam = new THREE.BoxGeometry(0.14, 0.028, 0.024);
      seam.rotateZ(-0.2);
      seam.translate(0.2, 0.3 + i * 0.085, 0.395);
      stitchParts.push(seam);
    }
    const trim = mergeGeometries(stitchParts)!;
    stitchParts.forEach((g) => g.dispose());
    group.add(new THREE.Mesh(trim, fabric(spec.trim, 0.16)));
    const seal = new THREE.OctahedronGeometry(style === 'white' ? 0.115 : 0.075, 0);
    seal.scale(1, 1.2, 0.25);
    seal.translate(-0.07, 0.52, 0.435);
    group.add(new THREE.Mesh(seal, fabric(spec.trim, 0.35)));
    const special = style === 'white' || style === 'gold',
      height = special ? 3.6 : 1.7;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, special ? 0.24 : 0.12, height, 6),
      new THREE.MeshBasicMaterial({
        fog: false,
        color: spec.color,
        transparent: true,
        opacity: special ? 0.2 : 0.11,
        depthWrite: false,
      }),
    );
    beam.position.y = height / 2;
    group.add(beam);
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.61, 0.65, 40),
      new THREE.MeshBasicMaterial({
        fog: false,
        color: spec.color,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.08;
    group.add(halo);
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.userData.shared = true;
        o.material.userData.shared = true;
        o.receiveShadow = true;
      }
    });
    group.rotation.y = 0.4;
    models.set(key, group);
  }
  const result = models.get(key)!.clone();
  result.userData.bagStyle = style;
  result.userData.born = performance.now();
  return result;
}
