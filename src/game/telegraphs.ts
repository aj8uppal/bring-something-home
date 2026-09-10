import * as THREE from 'three';
import { attackPlan } from '../../shared/patterns';
import { groundHeight } from '../../shared/world';
import type { EnemyState } from '../../shared/types';

/** One shared draw for attack directions, updated only from authoritative locked plans. */
export class AttackGuides {
  positions = new Float32Array(2400 * 3);
  geometry = new THREE.BufferGeometry();
  mesh: THREE.LineSegments;
  constructor(scene: THREE.Scene) {
    this.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.geometry.setDrawRange(0, 0);
    this.mesh = new THREE.LineSegments(
      this.geometry,
      new THREE.LineBasicMaterial({
        color: '#ffd1b5',
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
      }),
    );
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  update(enemies: EnemyState[]) {
    let n = 0;
    for (const e of enemies) {
      if (!e.boss || e.telegraph <= 0) continue;
      for (const shot of attackPlan(e).shots) {
        if (n + 2 > 2400) break;
        for (const r of [e.radius + 0.6, e.radius + 7]) {
          const x = e.x + Math.cos(shot.angle) * r,
            z = e.z + Math.sin(shot.angle) * r;
          this.positions.set([x, groundHeight(x, z, e.dimension) + 0.16, z], n++ * 3);
        }
      }
    }
    this.geometry.setDrawRange(0, n);
    this.geometry.attributes.position.needsUpdate = true;
  }
}
