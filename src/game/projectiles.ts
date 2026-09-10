import * as THREE from 'three';
import type { BulletState, Dimension } from '../../shared/types';
import { groundHeight } from '../../shared/world';

/** Solid cores share world depth; a separate, sorted pass adds translucent trails. */
export class ProjectileField {
  mesh: THREE.InstancedMesh;
  glowMesh: THREE.InstancedMesh;
  dummy = new THREE.Object3D();
  color = new THREE.Color();
  sizes = new Float32Array(4500 * 3);
  styles = new Float32Array(4500);
  opacity = new Float32Array(4500);
  constructor(scene: THREE.Scene) {
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.setAttribute(
      'shotSize',
      new THREE.InstancedBufferAttribute(this.sizes, 3).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setAttribute(
      'shotStyle',
      new THREE.InstancedBufferAttribute(this.styles, 1).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setAttribute(
      'shotOpacity',
      new THREE.InstancedBufferAttribute(this.opacity, 1).setUsage(THREE.DynamicDrawUsage),
    );
    const material = new THREE.ShaderMaterial({
      depthWrite: true,
      depthTest: true,
      uniforms: { glowPass: { value: false } },
      toneMapped: false,
      vertexShader: `
        attribute vec3 shotSize;
        attribute float shotStyle;
        attribute float shotOpacity;
        varying float opacityShot;
        varying float styleShot;
        varying vec2 uvShot;
        varying vec3 sizeShot;
        varying vec3 colorShot;
        void main() {
          opacityShot = shotOpacity; uvShot = uv - 0.5; sizeShot = shotSize; colorShot = instanceColor; styleShot = shotStyle;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform bool glowPass;
        varying float opacityShot;
        varying float styleShot;
        varying vec2 uvShot;
        varying vec3 sizeShot;
        varying vec3 colorShot;
        void main() {
          vec2 p = uvShot * sizeShot.xy;
          float r = sizeShot.z;
          float tip = sizeShot.x * 0.5 - r * 2.6;
          vec2 q = p - vec2(tip, 0.0);
          float d = length(q) / r;
          if (styleShot > 0.5 && styleShot < 1.5) d = length(q / vec2(2.0, 0.65)) / r;
          if (styleShot > 1.5 && styleShot < 2.5) d = (abs(q.x) * 0.43 + abs(q.y) * 1.7) / r;
          if (styleShot > 2.5 && styleShot < 3.5) d = max(abs(length(q + vec2(-r * 0.6,0.0)) - r * 1.5) / (r * 0.4), -q.x / r + 0.5);
          // Hostile families keep the same round hit center inside distinctive outer shapes.
          float a = atan(q.y, q.x);
          if (styleShot > 3.5 && styleShot < 4.5) d = length(q / vec2(1.25, .85)) / r;
          if (styleShot > 4.5 && styleShot < 5.5) d = (abs(q.x) * .65 + abs(q.y) * 1.1) / r;
          if (styleShot > 5.5 && styleShot < 6.5) d = max(abs(q.x) * .85 + abs(q.y) * .55, abs(q.y) * 1.05) / r;
          if (styleShot > 6.5 && styleShot < 7.5) d = max(abs(q.x), abs(q.y)) / (r * .87);
          if (styleShot > 7.5 && styleShot < 8.5) d = length(q) / (r * (.94 + .15 * cos(a * 8.0)));
          if (styleShot > 9.5) d = length(q) / (r * (.82 + .25 * cos(a * 4.0)));
          float edge = max(.015, fwidth(d) * 1.05);
          float hit = length(q) / r;
          float rim = 1.0 - smoothstep(1.0-edge, 1.0+edge, d);
          float outline = 1.0 - smoothstep(1.15-edge, 1.15+edge, d);
          float along = clamp((p.x + sizeShot.x * 0.5) / max(.01, tip + sizeShot.x * 0.5), 0.0, 1.0);
          float tail = pow(along, 2.0) * exp(-abs(p.y) / (r * max(0.05, along) * .38));
          tail *= 1.0 - smoothstep(tip - r * .2, tip + r * .3, p.x);
          float glow = exp(-d * d * 1.6) * .22;
          // A shaded face, bright upper edge, and dark lower rim give a tangible, faceted core.
          float face = clamp(.65 - q.y / r * .3 + q.x / r * .12, .25, 1.0);
          vec3 c = mix(vec3(.11, .12, .16), colorShot * face, rim);
          float specular = exp(-dot(q / r - vec2(-.19, .26), q / r - vec2(-.19, .26)) * 12.0);
          float hot = (1.0 - smoothstep(.3, .65, hit)) * .55 + specular * .65;
          if (styleShot > 6.5 && styleShot < 7.5) hot += (1.0 - smoothstep(.05, .12, min(abs(q.x), abs(q.y)) / r)) * rim * .3;
          if (styleShot > 8.5 && styleShot < 9.5) hot += (1.0 - smoothstep(.04, .14, abs(hit - .67))) * .3;
          c = mix(c, vec3(1.0, .97, .84), clamp(hot, 0.0, .96));
          float alpha = max(outline, max(tail * (styleShot > 3.5 ? .4 : .65), glow));
          if (outline < .1) c = colorShot;
          if (glowPass) {
            // Cores have already written depth. Only translucent edges and trails remain.
            if (outline >= .5) discard;
            alpha *= opacityShot;
            if (alpha < .015) discard;
          } else {
            if (outline < .5 || opacityShot <= 0.0) discard;
            // Screen-door ally fading preserves correct occlusion without a transparent core.
            float coverage = fract(dot(floor(gl_FragCoord.xy), vec2(.754877666, .569840296)));
            if (coverage >= opacityShot) discard;
            alpha = 1.0;
          }
          gl_FragColor = vec4(c, alpha);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, 4500);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Three injects instanceColor only when the attribute exists at first compilation.
    this.mesh.setColorAt(0, new THREE.Color('white'));
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    const glow = material.clone();
    glow.uniforms.glowPass.value = true;
    glow.transparent = true;
    glow.depthWrite = false;
    this.glowMesh = new THREE.InstancedMesh(geometry, glow, 4500);
    this.glowMesh.instanceMatrix = this.mesh.instanceMatrix;
    this.glowMesh.instanceColor = this.mesh.instanceColor;
    this.glowMesh.frustumCulled = false;
    this.glowMesh.count = 0;
    scene.add(this.mesh, this.glowMesh);
  }
  render(
    bullets: BulletState[],
    camera: THREE.Camera,
    dimension: Dimension,
    self = '',
    allyOpacity = 0.3,
  ) {
    let i = 0;
    const basis = camera.matrixWorld.elements;
    // Instanced transparent geometry is not sorted by Three. Sort by camera depth,
    // never by faction or spawn order, so trails also behave correctly after an orbit.
    const view = camera.matrixWorldInverse.elements;
    const depth = (b: BulletState) =>
      view[2] * b.x + view[6] * (groundHeight(b.x, b.z, dimension) + 0.8) + view[10] * b.z;
    const ordered = bullets
      .filter((b) => b.dimension === dimension)
      .sort((a, b) => depth(a) - depth(b) || a.id - b.id);
    for (const b of ordered) {
      if (i >= 4500) break;
      const radius = b.friendly ? b.radius * 0.72 : b.radius;
      const length = b.friendly ? 2.3 : 1.55;
      const width = radius * 4;
      // Project velocity onto camera right/up. A fixed pitch would skew the trail after tilting.
      const dx = b.vx * basis[0] + b.vz * basis[2];
      const dy = b.vx * basis[4] + b.vz * basis[6];
      this.dummy.quaternion.copy(camera.quaternion);
      this.dummy.rotateZ(Math.atan2(dy, dx));
      this.dummy.position.set(b.x, groundHeight(b.x, b.z, dimension) + 0.8, b.z);
      // The luminous core, not the midpoint of its trail, marks the collision location.
      this.dummy.translateX(-(length * 0.5 - radius * 2.6));
      this.dummy.scale.set(length, width, 1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, this.color.set(b.color));
      this.opacity[i] = b.friendly && self && b.owner !== self ? allyOpacity : 1;
      this.styles[i] = !b.friendly
        ? (b.style ?? 0)
        : b.color === '#c8d98b'
          ? 2
          : b.color === '#edb879'
            ? 3
            : 1;
      this.sizes[i * 3] = length;
      this.sizes[i * 3 + 1] = width;
      this.sizes[i * 3 + 2] = radius;
      i++;
    }
    this.mesh.count = this.glowMesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
    this.mesh.geometry.attributes.shotSize.needsUpdate = true;
    this.mesh.geometry.attributes.shotStyle.needsUpdate = true;
    this.mesh.geometry.attributes.shotOpacity.needsUpdate = true;
  }
}
