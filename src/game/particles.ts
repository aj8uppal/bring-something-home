import * as THREE from 'three';
import { groundHeight } from '../../shared/world';
import type { Dimension } from '../../shared/types';
export class Sparks {
  mesh = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(1),
    new THREE.MeshBasicMaterial({
      color: 'white',
      toneMapped: false,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
    700,
  );
  particles: {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    life: number;
    max: number;
    size: number;
    color: THREE.Color;
  }[] = [];
  dummy = new THREE.Object3D();
  constructor(scene: THREE.Scene) {
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  burst(x: number, z: number, color: string, count: number, dim: Dimension, force = 1) {
    for (let i = 0; i < count && this.particles.length < 700; i++) {
      const a = Math.random() * Math.PI * 2,
        speed = (1 + Math.random() * 3) * force,
        life = 0.18 + Math.random() * 0.3;
      this.particles.push({
        x,
        y: groundHeight(x, z, dim) + 0.85,
        z,
        vx: Math.cos(a) * speed,
        vz: Math.sin(a) * speed,
        vy: 1 + Math.random() * 3,
        life,
        max: life,
        size: 0.06 + Math.random() * 0.075,
        color: new THREE.Color(color),
      });
    }
  }
  step(dt: number) {
    let i = 0;
    for (let n = this.particles.length - 1; n >= 0; n--) {
      const p = this.particles[n];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(n, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= dt * 8;
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.scale.setScalar(p.size * Math.min(1, (p.life / p.max) * 2));
      this.dummy.rotation.set(p.life * 5, p.life * 9, 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, p.color);
      i++;
    }
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
