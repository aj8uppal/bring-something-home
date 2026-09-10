import type { Action, ClassId, Input, ServerMessage, Snapshot } from '../shared/types';
import { Decoder, type Frame } from '../shared/protocol';
export async function api<T>(
  path: string,
  body?: unknown,
  token?: string,
  method?: 'DELETE',
): Promise<T> {
  const controller = new AbortController(),
    timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`/api/${path}`, {
      method: method || (body === undefined ? 'GET' : 'POST'),
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'The realm could not be reached.');
    return data as T;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError')
      throw new Error('The realm took too long to answer. Try again.');
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}
export class Connection {
  ws?: WebSocket;
  stopped = true;
  retry = 0;
  latency = 0;
  timer?: ReturnType<typeof setTimeout>;
  heartbeat?: ReturnType<typeof setInterval>;
  pendingSnapshot?: Snapshot;
  decoder = new Decoder();
  token = '';
  classId: ClassId = 'arcanist';
  realm?: string;
  onMessage: (m: ServerMessage) => void = () => {};
  onStatus: (s: string) => void = () => {};
  connect(token: string, classId: ClassId, realm?: string) {
    this.close();
    this.token = token;
    this.classId = classId;
    this.realm = realm;
    this.stopped = false;
    this.retry = 0;
    this.open();
  }
  open() {
    if (this.stopped) return;
    this.decoder.reset();
    this.pendingSnapshot = undefined;
    this.onStatus(this.retry ? 'Reconnecting…' : 'Entering the realm…');
    const ws = new WebSocket(
      `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/socket`,
    );
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      ws.send(
        JSON.stringify({
          type: 'join',
          token: this.token,
          classId: this.classId,
          realm: this.realm,
        }),
      );
      this.send({ type: 'ping', time: performance.now() });
      this.heartbeat = setInterval(
        () => this.send({ type: 'ping', time: performance.now() }),
        3000,
      );
    };
    ws.onmessage = (event) => {
      if (this.ws !== ws) return;
      let m: ServerMessage;
      try {
        const wire = JSON.parse(event.data) as ServerMessage | Frame;
        m = wire.type === 'frame' ? this.decoder.decode(wire) : wire;
      } catch {
        return;
      }
      if (m.type === 'snapshot') {
        if (this.pendingSnapshot?.self.dimension === m.self.dimension)
          m.effects = [...this.pendingSnapshot.effects, ...m.effects].slice(-100);
        this.pendingSnapshot = m;
        return;
      }
      if (m.type === 'welcome') {
        this.retry = 0;
        this.onStatus('Connected');
      }
      if (m.type === 'pong') this.latency = Math.round(performance.now() - m.time);
      this.onMessage(m);
    };
    ws.onclose = (event) => {
      if (this.ws !== ws) return;
      clearInterval(this.heartbeat);
      if (this.stopped) return;
      if ([4001, 4004, 4005, 4006, 4007, 4008, 4009].includes(event.code)) {
        this.stopped = true;
        this.onStatus(event.reason || 'Connection closed');
        this.onMessage({
          type: 'error',
          text:
            event.code === 4001
              ? 'Your traveler is active in another window. Return to the title to reconnect here.'
              : event.reason || 'Unable to connect.',
        });
        return;
      }
      this.onStatus('Connection lost. Reconnecting…');
      this.timer = setTimeout(
        () => {
          this.retry++;
          this.open();
        },
        Math.min(10000, 800 * 2 ** this.retry),
      );
    };
    ws.onerror = () => {};
  }
  send(value: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(value));
  }
  input(input: Input) {
    this.send({ type: 'input', input });
  }
  action(action: Action, id?: string) {
    this.send({ type: 'action', action, id });
  }
  close() {
    this.stopped = true;
    this.pendingSnapshot = undefined;
    clearTimeout(this.timer);
    clearInterval(this.heartbeat);
    if (this.ws) {
      const old = this.ws;
      this.ws = undefined;
      old.close();
    }
  }
}
