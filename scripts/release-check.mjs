/** Exercise the exact distribution, including runtime-only installation and operator tools. */
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile),
  root = dirname(dirname(fileURLToPath(import.meta.url))),
  manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')),
  version = manifest.version,
  archive = join(root, 'release', `${manifest.name}-${version}.tar.gz`),
  port = Number(process.env.RELEASE_CHECK_PORT || 18182),
  origin = `http://127.0.0.1:${port}`;
assert.ok(existsSync(archive), 'Run npm run release before checking the distribution.');
assert.equal(
  createHash('sha256').update(readFileSync(archive)).digest('hex'),
  readFileSync(`${archive}.sha256`, 'utf8').split(/\s/)[0],
  'Archive checksum must match.',
);
const dir = mkdtempSync(join(tmpdir(), `${manifest.name}-release-check-`));
let child;
try {
  const { stdout } = await run('tar', ['-tzf', archive]);
  const entries = stdout.trim().split('\n');
  assert.ok(
    entries.every(
      (entry) =>
        !/\.sqlite|(?:^|\/)\.env|node_modules\/|^\.\/data\/|(?:^|\/)\.\.(?:\/|$)/.test(entry),
    ),
    'The release must exclude private data, local dependencies, and escaping paths.',
  );
  await run('tar', ['-xzf', archive, '-C', dir]);
  const launch = readFileSync(join(dir, 'README.md'), 'utf8');
  assert.ok(launch.includes('(docs/DEPLOYMENT.md)'));
  assert.ok(existsSync(join(dir, 'docs/DEPLOYMENT.md')));
  await run('npm', ['ci', '--omit=dev', '--ignore-scripts'], { cwd: dir, timeout: 90000 });
  const env = {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
    NODE_ENV: 'production',
    DATA_PATH: join(dir, 'data', 'smoke.sqlite'),
  };
  child = spawn(process.execPath, ['dist-server/server/main.js'], {
    cwd: dir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Packaged server did not start.')), 10000);
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.includes(`Bring Something Home ${version} · ${origin}`)) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.stderr.on('data', () => {});
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Packaged server exited before readiness (${code}).`));
    });
  });
  const get = (path) => fetch(origin + path, { signal: AbortSignal.timeout(3000) });
  const health = await get('/api/health');
  assert.equal(health.status, 200);
  assert.equal((await health.json()).version, version);
  const document = await get('/');
  assert.equal(document.status, 200);
  const html = await document.text();
  assert.ok(html.includes('Bring Something Home'));
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map((m) => m[1]);
  assert.ok(assets.length >= 2);
  for (const asset of assets) assert.equal((await get(asset)).status, 200, asset);
  await run(process.execPath, ['dist-server/scripts/admin.js', 'reports'], { cwd: dir, env });
  const backup = join(dir, 'backup.sqlite');
  await run(process.execPath, ['dist-server/scripts/backup.js', backup], { cwd: dir, env });
  assert.ok(existsSync(backup));
  console.log(
    JSON.stringify({
      version,
      archiveEntries: entries.length,
      clientAssets: assets.length,
      productionInstall: true,
      privateFiles: false,
      launch: true,
      operatorTools: true,
      verifiedBackup: true,
    }),
  );
} finally {
  if (child && child.exitCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000).unref())]);
    if (child.exitCode === null) {
      child.kill('SIGKILL');
      await exited;
    }
  }
  rmSync(dir, { recursive: true, force: true });
}
