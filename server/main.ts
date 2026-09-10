import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { Store } from './database.js';
import { Realm, type Player } from './realm.js';
import { cleanName, parseMessage, RateLimiter } from './validation.js';
import { Encoder } from '../shared/protocol.js';
import { MAX_PLAYERS, VERSION } from '../shared/content.js';
import type { ServerMessage } from '../shared/types.js';
process.umask(0o077);
const port = Number(process.env.PORT || 8790),
  host = process.env.HOST || '127.0.0.1';
const store = new Store(process.env.DATA_PATH || 'data/emberwilds.sqlite');
const realms = new Map<string, Realm>();
realms.set('hearth-1', new Realm('hearth-1', 'The First Light', store));
const sockets = new Map<string, WebSocket>();
const root = resolve('dist');
const requests = new RateLimiter(120, 60000),
  creations = new RateLimiter(10, 60000),
  recoveries = new RateLimiter(8, 60000),
  upgrades = new RateLimiter(120, 60000);
const reports = new RateLimiter(5, 3600000);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
let shuttingDown = false,
  tickMs = 0;
const ipOf = (req: IncomingMessage) =>
  process.env.TRUST_PROXY === 'fly'
    ? String(req.headers['fly-client-ip'] || req.socket.remoteAddress || 'unknown').trim()
    : process.env.TRUST_PROXY === '1'
      ? String(req.headers['x-forwarded-for'] || req.socket.remoteAddress)
          .split(',')[0]
          .trim()
      : req.socket.remoteAddress || 'unknown';
function originAllowed(req: IncomingMessage) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host || allowedOrigins.includes(origin);
  } catch {
    return false;
  }
}
function headers(res: ServerResponse) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; font-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
  );
  if (process.env.NODE_ENV === 'production')
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}
function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(value));
}
async function body(req: IncomingMessage) {
  if (!String(req.headers['content-type']).startsWith('application/json'))
    throw new Error('Send JSON.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4096) throw new Error('Request too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}
function auth(req: IncomingMessage) {
  return store.authenticate(String(req.headers.authorization || '').replace(/^Bearer /, ''));
}
const server = createServer(async (req, res) => {
  headers(res);
  try {
    const url = new URL(req.url || '/', 'http://localhost'),
      ip = ipOf(req);
    if (url.pathname.startsWith('/api/')) {
      if (!requests.take(ip)) {
        res.setHeader('Retry-After', '60');
        json(res, 429, { error: 'Too many requests. Try again in a minute.' });
        return;
      }
      if (!originAllowed(req)) {
        json(res, 403, { error: 'Origin not allowed.' });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/health') {
        json(res, shuttingDown ? 503 : 200, {
          status: shuttingDown ? 'draining' : 'ok',
          version: VERSION,
          realms: realms.size,
          players: sockets.size,
          tickMs: Math.round(tickMs * 100) / 100,
          uptime: Math.floor(process.uptime()),
        });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/realms') {
        json(
          res,
          200,
          [...realms.values()].map((r) => r.info()),
        );
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/leaderboard') {
        json(res, 200, store.leaderboard());
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/account') {
        if (!creations.take(ip)) {
          json(res, 429, { error: 'Too many new travelers. Try again in a minute.' });
          return;
        }
        const b = await body(req),
          name = cleanName(b.name);
        if (name.length < 2) {
          json(res, 400, { error: 'Choose a name with 2–18 letters, numbers, spaces, or dashes.' });
          return;
        }
        json(res, 201, store.create(name));
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/recover') {
        if (!recoveries.take(ip)) {
          json(res, 429, { error: 'Too many attempts. Try again in a minute.' });
          return;
        }
        const b = await body(req),
          result = store.recover(String(b.recoveryCode || ''));
        if (!result) {
          json(res, 401, {
            error: 'That recovery code was not found. Check every group and try again.',
          });
          return;
        }
        for (const realm of realms.values()) {
          const live = realm.players.get(result.profile.id);
          if (live) {
            store.save(live.profile);
            result.profile = live.profile;
          }
        }
        sockets.get(result.profile.id)?.close(4001, 'Account recovered on another device');
        json(res, 200, result);
        return;
      }
      if (req.method === 'DELETE' && url.pathname === '/api/account') {
        const profile = auth(req);
        if (!profile) {
          json(res, 401, { error: 'Session expired.' });
          return;
        }
        const b = await body(req);
        if (b.name !== profile.name) {
          json(res, 400, { error: 'Type your traveler name exactly to confirm deletion.' });
          return;
        }
        for (const r of realms.values()) r.players.delete(profile.id);
        store.deleteAccount(profile.id);
        sockets.get(profile.id)?.close(4009, 'Account deleted');
        json(res, 200, { deleted: true });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/reports') {
        const profile = auth(req);
        if (!profile) {
          json(res, 401, { error: 'Session expired.' });
          return;
        }
        if (!reports.take(profile.id)) {
          json(res, 429, { error: 'You can send 5 reports per hour.' });
          return;
        }
        const b = await body(req),
          target = String(b.target || ''),
          reason = String(b.reason || '')
            .replace(/[\p{Cc}\p{Cf}]/gu, '')
            .trim();
        if (
          target === profile.id ||
          target.length > 40 ||
          !store.exists(target) ||
          reason.length < 5 ||
          reason.length > 500
        ) {
          json(res, 400, {
            error: 'Choose a traveler and describe the issue in 5–500 characters.',
          });
          return;
        }
        store.report(profile.id, target, reason);
        json(res, 201, { received: true });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/profile') {
        const profile = auth(req);
        if (!profile) {
          json(res, 401, {
            error: 'Your session has expired. Restore your account with its recovery code.',
          });
          return;
        }
        for (const realm of realms.values()) {
          const live = realm.players.get(profile.id);
          if (live) {
            json(res, 200, live.profile);
            return;
          }
        }
        json(res, 200, profile);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/realms') {
        if (!auth(req)) {
          json(res, 401, { error: 'Enter the world before opening a realm.' });
          return;
        }
        if (!creations.take(ip) || realms.size >= 12) {
          json(res, 429, { error: 'All realm slots are in use. Join an open realm.' });
          return;
        }
        const id = `hearth-${randomBytes(3).toString('hex')}`;
        const names = [
          'Silver Morning',
          'Amber Horizon',
          'The Quiet Tide',
          'Lantern’s Reach',
          'A Wilder Dawn',
        ];
        const realm = new Realm(id, names[(realms.size - 1) % names.length], store);
        realms.set(id, realm);
        json(res, 201, realm.info());
        return;
      }
      json(res, 404, { error: 'Not found.' });
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method || '')) {
      res.writeHead(405);
      res.end();
      return;
    }
    let path = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (!path.startsWith(root + sep) && path !== root) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
    } catch {
      if (extname(path)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      path = resolve(root, 'index.html');
    }
    const data = await readFile(path);
    const mime: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.woff2': 'font/woff2',
      '.json': 'application/json',
      '.ico': 'image/x-icon',
    };
    res.writeHead(200, {
      'Content-Type':
        (mime[extname(path)] || 'application/octet-stream') +
        (['.html', '.js', '.css'].includes(extname(path)) ? '; charset=utf-8' : ''),
      'Cache-Control': path.includes(`${sep}assets${sep}`)
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch (error) {
    if (!res.headersSent)
      json(res, error instanceof SyntaxError ? 400 : 500, {
        error: error instanceof SyntaxError ? 'Invalid JSON.' : 'Unable to complete that request.',
      });
    else res.end();
    if (!(error instanceof SyntaxError))
      console.error('Request failed:', error instanceof Error ? error.message : 'Unknown error');
  }
});
server.requestTimeout = 10000;
server.headersTimeout = 10000;
const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
server.on('upgrade', (req, socket, head) => {
  if (
    shuttingDown ||
    req.url !== '/socket' ||
    !originAllowed(req) ||
    !upgrades.take(ipOf(req)) ||
    wss.clients.size >= 650
  ) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});
wss.on('connection', (ws: WebSocket) => {
  let realm: Realm | undefined,
    player: Player | undefined,
    malformed = 0,
    alive = true;
  const encoder = new Encoder();
  const limiter = new RateLimiter(100, 1000),
    actionLimiter = new RateLimiter(15, 1000);
  const send = (m: ServerMessage) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > 1024 * 1024) {
      ws.close(4002, 'Connection too slow');
      return;
    }
    if (m.type === 'snapshot' && ws.bufferedAmount > 256 * 1024) {
      encoder.reset();
      return;
    }
    ws.send(JSON.stringify(m.type === 'snapshot' ? encoder.encode(m) : m));
  };
  const joinTimer = setTimeout(() => {
    if (!player) ws.close(4003, 'Join timeout');
  }, 5000);
  const heartbeat = setInterval(() => {
    if (!alive) {
      ws.terminate();
      return;
    }
    alive = false;
    ws.ping();
  }, 15000);
  ws.on('pong', () => {
    alive = true;
  });
  ws.on('error', () => {
    /* close handler persists the character */
  });
  ws.on('message', (raw) => {
    if (!limiter.take('messages')) {
      ws.close(4008, 'Too many messages');
      return;
    }
    const m = parseMessage(raw.toString());
    if (!m) {
      if (++malformed >= 3) ws.close(4007, 'Invalid messages');
      return;
    }
    if (m.type === 'ping') {
      send({ type: 'pong', time: m.time });
      return;
    }
    if (m.type === 'join' && !player) {
      const profile = store.authenticate(m.token);
      if (!profile) {
        send({ type: 'error', text: 'Session expired. Restore your account in settings.' });
        ws.close(4004, 'Unauthorized');
        return;
      }
      const old = sockets.get(profile.id);
      if (old && old !== ws) old.close(4001, 'Your traveler entered from another window');
      for (const r of realms.values())
        if (r.players.has(profile.id)) {
          realm = r;
          break;
        }
      if (!realm)
        realm = m.realm
          ? realms.get(m.realm)
          : [...realms.values()].find((r) => r.players.size < MAX_PLAYERS);
      if (!realm && !m.realm && realms.size < 12) {
        const id = `hearth-${randomBytes(3).toString('hex')}`;
        realm = new Realm(id, `Dawn ${realms.size + 1}`, store);
        realms.set(id, realm);
      }
      if (!realm) {
        send({ type: 'error', text: 'That realm is unavailable. Choose another realm.' });
        ws.close(4005, 'Realm unavailable');
        return;
      }
      try {
        sockets.set(profile.id, ws);
        player = realm.add(profile, m.classId, send);
        clearTimeout(joinTimer);
      } catch (error) {
        if (sockets.get(profile.id) === ws) sockets.delete(profile.id);
        send({ type: 'error', text: error instanceof Error ? error.message : 'Unable to join.' });
        ws.close(4005, 'Realm unavailable');
      }
      return;
    }
    if (!player || !realm || sockets.get(player.profile.id) !== ws) return;
    if (m.type === 'input') realm.input(player.profile.id, m.input);
    if (m.type === 'action' && actionLimiter.take('actions'))
      realm.action(player.profile.id, m.action, m.id);
    if (m.type === 'chat' && realm.time - player.lastChat >= 1) {
      player.lastChat = realm.time;
      const text = m.text.replace(/[\p{Cc}\p{Cf}]/gu, '').trim();
      if (text) realm.chat(player.profile.name, text, false, player.profile.id);
    }
  });
  ws.on('close', () => {
    clearTimeout(joinTimer);
    clearInterval(heartbeat);
    if (player && sockets.get(player.profile.id) === ws) {
      sockets.delete(player.profile.id);
      realm?.disconnect(player.profile.id);
    }
  });
});
let last = performance.now(),
  accumulator = 0;
const timer = setInterval(() => {
  const now = performance.now();
  accumulator = Math.min(0.25, accumulator + (now - last) / 1000);
  last = now;
  const start = performance.now();
  while (accumulator >= 0.05) {
    for (const realm of realms.values()) realm.step(0.05);
    accumulator -= 0.05;
  }
  tickMs = tickMs * 0.9 + (performance.now() - start) * 0.1;
}, 10);
const cleanup = setInterval(() => {
  requests.prune();
  creations.prune();
  recoveries.prune();
  upgrades.prune();
  reports.prune();
  for (const [id, ws] of sockets)
    if (store.isBanned(id)) ws.close(4006, 'This account has been suspended');
  for (const [id, r] of realms)
    if (id !== 'hearth-1' && !r.players.size && r.time > 1800) realms.delete(id);
}, 60000);
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(timer);
  clearInterval(cleanup);
  for (const r of realms.values()) r.shutdown();
  for (const ws of wss.clients) ws.close(1012, 'Realm restarting');
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => {
    for (const ws of wss.clients) ws.terminate();
    store.close();
    process.exit(0);
  }, 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
server.listen(port, host, () =>
  console.log(
    `Bring Something Home ${VERSION} · http://${host}:${port} · ${process.env.DATA_PATH || 'data/emberwilds.sqlite'}`,
  ),
);
