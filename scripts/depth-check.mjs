/** Render real projectile shaders against solid geometry, then inspect GPU pixels. */
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const source = `
import * as THREE from '/node_modules/three/build/three.module.js';
import { ProjectileField } from '/src/game/projectiles.ts';
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(600, 500); renderer.setClearColor('#142725');
document.body.append(renderer.domElement);
const scene = new THREE.Scene(), field = new ProjectileField(scene);
const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 30, 4), new THREE.MeshBasicMaterial({color:'#246ce5'}));
wall.position.y = 12; scene.add(wall);
const camera = new THREE.OrthographicCamera(-6, 6, 5, -5, .1, 200);
const target = new THREE.WebGLRenderTarget(600, 500);
const results = [], samples = [];
for (const pitch of [32, 46, 62, 78]) for (const yaw of [-2.2, 0, .62, 1.9]) {
  const p = THREE.MathUtils.degToRad(pitch);
  camera.position.set(Math.sin(yaw)*Math.cos(p)*55, Math.sin(p)*55, Math.cos(yaw)*Math.cos(p)*55);
  camera.lookAt(0, .8, 0); camera.updateMatrixWorld();
  for (const side of [-1, 1]) {
    const b = { id:1, x:Math.sin(yaw)*3*side, z:Math.cos(yaw)*3*side, vx:Math.cos(yaw), vz:-Math.sin(yaw), radius:.3, friendly:false, owner:'test', color:'#ff3000', dimension:'hollow', style:6 };
    field.render([b], camera, 'hollow');
    renderer.setRenderTarget(target); renderer.render(scene, camera);
    const point = new THREE.Vector3(b.x, .8, b.z).project(camera), pixel = new Uint8Array(4);
    renderer.readRenderTargetPixels(target, Math.round((point.x+1)*300), Math.round((point.y+1)*250), 1, 1, pixel);
    const correct = side === -1 ? pixel[2] > pixel[0] * 1.4 : pixel[0] > pixel[2] + 20;
    results.push({pitch,yaw,side,pixel:[...pixel],correct});
    if (yaw === .62) {
      renderer.setRenderTarget(null); renderer.render(scene,camera);
      samples.push({pitch,side,url:renderer.domElement.toDataURL()});
    }
  }
}
window.result = { results, renderer: renderer.getContext().getParameter(renderer.getContext().getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL) };
document.body.innerHTML = '<h1>World depth · actual GPU renders</h1><p>Blue pillar, orange shot. The nearer surface wins at every camera angle.</p><div class="grid">'+samples.map(s=>'<figure><img src="'+s.url+'"><figcaption>'+s.pitch+'° · Shot '+(s.side===-1?'behind pillar':'in front of pillar')+'</figcaption></figure>').join('')+'</div>';
target.dispose(); renderer.dispose();
`;
const server = await createServer({
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 18183, strictPort: true, hmr: false },
  plugins: [
    {
      name: 'depth-check',
      configureServer(s) {
        s.middlewares.use((req, res, next) => {
          if (req.url === '/depth-check') {
            res.setHeader('Content-Type', 'text/html');
            res.end(
              '<!doctype html><html><head><link rel="icon" href="data:,"><style>body{margin:25px;background:#142725;color:#eedcb2;font:14px system-ui}h1{font:28px Georgia}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}figure{margin:0}img{width:100%;border:1px solid #74978b}figcaption{padding:10px 0}</style></head><body><script type="module" src="/depth-module"></script></body></html>',
            );
          } else if (req.url === '/depth-module') {
            res.setHeader('Content-Type', 'text/javascript');
            res.end(source);
          } else next();
        });
      },
    },
  ],
});
await server.listen();
let browser;
try {
  browser = await chromium.launch({
    executablePath: existsSync(chrome) ? chrome : undefined,
    args: existsSync(chrome) ? [] : ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 820 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('http://127.0.0.1:18183/depth-check');
  await page.waitForFunction(() => window.result);
  const result = await page.evaluate(() => window.result);
  mkdirSync('docs/playtests', { recursive: true });
  await page.screenshot({ path: 'docs/playtests/v6-depth-buffer.png', fullPage: true });
  console.log(JSON.stringify({ ...result, errors }));
  if (errors.length || result.results.some((r) => !r.correct)) process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}
