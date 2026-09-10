import { CAMERA, clampPitch } from './game/camera';
import { MINIMAP_SPANS } from './game/map';
export interface Settings {
  cameraTilt: number;
  allyShots: number;
  volume: number;
  music: boolean;
  quality: 'high' | 'low';
  shake: boolean;
  damageNumbers: boolean;
  reducedMotion: boolean;
  /** Minimap framing in world units across, cycled with N. */
  minimapSpan: number;
}
export const defaultSettings: Settings = {
  cameraTilt: CAMERA.defaultPitch,
  allyShots: 0.3,
  volume: 0.35,
  music: true,
  quality: 'high',
  shake: true,
  damageNumbers: true,
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  minimapSpan: MINIMAP_SPANS[1],
};
export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`ew:${key}`);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
export function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(`ew:${key}`, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export const settings = { ...defaultSettings, ...readLocal<Partial<Settings>>('settings', {}) };
settings.cameraTilt = clampPitch(settings.cameraTilt);

settings.allyShots = Number.isFinite(settings.allyShots)
  ? Math.max(0, Math.min(1, settings.allyShots))
  : 0.3;
if (!MINIMAP_SPANS.includes(settings.minimapSpan)) settings.minimapSpan = MINIMAP_SPANS[1];
