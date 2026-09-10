import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { name, version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (
  !existsSync(join(root, 'dist/index.html')) ||
  !existsSync(join(root, 'dist-server/server/main.js'))
)
  throw new Error('Run npm run build before packaging.');
const staging = mkdtempSync(join(tmpdir(), `${name}-package-`));
try {
  // Deliberate allowlist: local profiles, credentials and test databases never enter a release.
  for (const path of [
    'dist',
    'dist-server',
    'package.json',
    'package-lock.json',
    'LICENSE',
    'CREDITS.md',
    'docs/DEPLOYMENT.md',
  ]) {
    mkdirSync(dirname(join(staging, path)), { recursive: true });
    cpSync(join(root, path), join(staging, path), { recursive: true });
  }
  writeFileSync(
    join(staging, 'README.md'),
    readFileSync(join(root, 'release/LAUNCH.md'), 'utf8').replace(
      '(../docs/DEPLOYMENT.md)',
      '(docs/DEPLOYMENT.md)',
    ),
  );
  writeFileSync(
    join(staging, 'THIRD_PARTY_NOTICES.txt'),
    ['three', 'ws']
      .map(
        (name) => `${name}\n\n${readFileSync(join(root, 'node_modules', name, 'LICENSE'), 'utf8')}`,
      )
      .join('\n\n'),
  );
  const destination = join(root, 'release', `${name}-${version}.tar.gz`);
  mkdirSync(dirname(destination), { recursive: true });
  execFileSync('tar', ['-czf', destination, '-C', staging, '.'], {
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  });
  const hash = createHash('sha256').update(readFileSync(destination)).digest('hex');
  writeFileSync(`${destination}.sha256`, `${hash}  ${name}-${version}.tar.gz\n`);
  process.stdout.write(`Packaged ${destination}\nSHA-256 ${hash}\n`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
