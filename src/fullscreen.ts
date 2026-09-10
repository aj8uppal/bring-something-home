import { icon } from './icons';

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

let changing = false;

export function isFullscreen() {
  const doc = document as FullscreenDocument;
  return !!(doc.fullscreenElement || doc.webkitFullscreenElement);
}

export function fullscreenButton(withLabel = false) {
  return `<button type="button" class="${withLabel ? 'small-button' : 'icon-button'}" data-action="fullscreen" aria-label="Enter fullscreen" aria-pressed="false" title="Enter fullscreen">${icon('expand')}${withLabel ? '<span data-fullscreen-label>Enter fullscreen</span>' : ''}</button>`;
}

export function syncFullscreenControls() {
  const doc = document as FullscreenDocument;
  const root = doc.documentElement as FullscreenElement;
  const supported =
    typeof root.requestFullscreen === 'function'
      ? doc.fullscreenEnabled
      : !!root.webkitRequestFullscreen && doc.webkitFullscreenEnabled !== false;
  const active = isFullscreen();
  const label = active ? 'Exit fullscreen' : 'Enter fullscreen';
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-action="fullscreen"]')) {
    button.disabled = !supported;
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', supported ? label : 'Fullscreen unavailable');
    button.title = supported ? label : 'This browser does not support fullscreen';
    button.querySelector('svg')!.outerHTML = icon(active ? 'collapse' : 'expand');
    const text = button.querySelector('[data-fullscreen-label]');
    if (text) text.textContent = supported ? label : 'Unavailable in this browser';
  }
}

export function observeFullscreen(onChange: () => void) {
  const changed = () => {
    syncFullscreenControls();
    onChange();
  };
  document.addEventListener('fullscreenchange', changed);
  document.addEventListener('webkitfullscreenchange', changed);
  syncFullscreenControls();
}

export async function toggleFullscreen() {
  if (changing) return;
  changing = true;
  const doc = document as FullscreenDocument;
  const root = doc.documentElement as FullscreenElement;
  try {
    if (isFullscreen()) {
      if (doc.exitFullscreen) await doc.exitFullscreen();
      else await doc.webkitExitFullscreen?.();
    } else if (root.requestFullscreen) {
      await root.requestFullscreen();
    } else if (root.webkitRequestFullscreen) {
      await root.webkitRequestFullscreen();
    } else {
      throw new Error('Fullscreen is unavailable in this browser.');
    }
  } finally {
    changing = false;
    syncFullscreenControls();
  }
}
