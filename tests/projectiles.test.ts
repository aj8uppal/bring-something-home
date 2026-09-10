import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ProjectileField } from '../src/game/projectiles.js';
import type { BulletState } from '../shared/types.js';

test('billboard trails follow projected velocity and keep the luminous core at the collision point at every tilt', () => {
  const field = new ProjectileField(new THREE.Scene()),
    camera = new THREE.OrthographicCamera(-20, 20, 15, -15, 0.1, 200);
  const bullet: BulletState = {
    id: 1,
    x: 0,
    z: 0,
    vx: 4,
    vz: -7,
    owner: 'test',
    friendly: false,
    radius: 0.3,
    color: '#ff865f',
    dimension: 'hollow',
  };
  for (const pitch of [32, 46, 62, 78])
    for (const yaw of [-2.2, 0, 0.62, 1.9]) {
      const radians = (pitch * Math.PI) / 180;
      camera.position.set(
        Math.sin(yaw) * Math.cos(radians) * 55,
        Math.sin(radians) * 55,
        Math.cos(yaw) * Math.cos(radians) * 55,
      );
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      field.render([bullet], camera, 'hollow');
      const matrix = new THREE.Matrix4();
      field.mesh.getMatrixAt(0, matrix);
      const center = new THREE.Vector3().applyMatrix4(matrix).project(camera);
      const nose = new THREE.Vector3(1, 0, 0).applyMatrix4(matrix).project(camera);
      const origin = new THREE.Vector3(bullet.x, 0.8, bullet.z).project(camera);
      const ahead = new THREE.Vector3(bullet.x + bullet.vx, 0.8, bullet.z + bullet.vz).project(
        camera,
      );
      const trail = new THREE.Vector2(nose.x - center.x, nose.y - center.y).normalize();
      const velocity = new THREE.Vector2(ahead.x - origin.x, ahead.y - origin.y).normalize();
      assert.ok(trail.dot(velocity) > 0.99999, `trail direction at ${pitch} degrees, yaw ${yaw}`);
      const length = 1.55,
        tip = length / 2 - bullet.radius * 2.6;
      const core = new THREE.Vector3(tip / length, 0, 0).applyMatrix4(matrix).project(camera);
      assert.ok(core.distanceTo(origin) < 0.00001, `core location at ${pitch} degrees`);
    }
});

test('ally opacity never weakens incoming attacks and does not override physical depth', () => {
  const field = new ProjectileField(new THREE.Scene()),
    camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
  camera.position.set(0, 40, 20);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const base: BulletState = {
    id: 1,
    x: 0,
    z: 0,
    vx: 1,
    vz: 1,
    owner: 'enemy',
    friendly: false,
    radius: 0.3,
    color: '#ff865f',
    dimension: 'hollow',
    style: 10,
  };
  field.render(
    [
      base,
      { ...base, id: 2, friendly: true, owner: 'ally' },
      { ...base, id: 3, friendly: true, owner: 'self' },
    ],
    camera,
    'hollow',
    'self',
    0,
  );
  assert.deepEqual([...field.opacity.slice(0, 3)], [1, 0, 1]);
  assert.equal(field.styles[0], 10);
});

test('projectile cores occlude by depth and translucent instances reverse order after a camera orbit', () => {
  const scene = new THREE.Scene(),
    field = new ProjectileField(scene);
  const material = field.mesh.material as THREE.ShaderMaterial;
  const glow = field.glowMesh.material as THREE.ShaderMaterial;
  assert.ok(material.depthTest && material.depthWrite && !material.transparent);
  assert.ok(glow.depthTest && !glow.depthWrite && glow.transparent);
  assert.equal(field.mesh.renderOrder, 0);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  const base: BulletState = {
    id: 1,
    x: 0,
    z: 4,
    vx: 1,
    vz: 0,
    friendly: false,
    owner: 'enemy',
    radius: 0.3,
    color: '#ff865f',
    dimension: 'hollow',
    style: 10,
  };
  const bullets = [base, { ...base, id: 2, z: -4, friendly: true, owner: 'self', style: 1 }];
  for (const side of [1, -1]) {
    camera.position.set(0, 20, side * 30);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    field.render(bullets, camera, 'hollow', 'self');
    assert.equal(
      field.styles[side === 1 ? 1 : 0],
      10,
      'transparent trails sort far to near regardless of faction',
    );
    assert.equal(field.glowMesh.count, 2);
    assert.equal(field.glowMesh.instanceMatrix, field.mesh.instanceMatrix);
  }
  assert.equal(bullets[0].id, 1, 'sorting never mutates network state');
  field.render(bullets, camera, 'eclipse');
  assert.equal(field.mesh.count, 0, 'other dimensions are never drawn');
  assert.equal(field.glowMesh.count, 0);
});
