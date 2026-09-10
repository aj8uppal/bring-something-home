const paths: Record<string, string> = {
  flame: '<path d="M13 2 5 13l3 7 5 3 7-9-4-7-3 7-3-2z"/><path d="m13 14-2 4 2 2 2-3z"/>',
  spark:
    '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z"/><path d="m19 2 1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/>',
  sword: '<path d="m5 20 3-3m-4-3 6 6M8 14 18 3l3 0v3L11 17M6 16l2 2"/>',
  bow: '<path d="M5 3c15 0 15 18 0 18L15 12zM2 12h19m-3-3 3 3-3 3"/>',
  shield: '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6zM12 7v10m-4-6h8"/>',
  heart:
    '<path d="M20.5 5.5a5 5 0 0 0-7 0L12 7l-1.5-1.5a5 5 0 0 0-7 7L12 21l8.5-8.5a5 5 0 0 0 0-7z"/>',
  dash: '<path d="m14 3-7 10h6l-3 8 9-12h-6l4-6M2 7h5M1 12h3M3 17h3"/>',
  potion: '<path d="M9 2h6M9 3v5L4 17c-1 3 1 5 3 5h10c2 0 4-2 3-5l-5-9V3M7 14h10m-8 4h3"/>',
  portal:
    '<ellipse cx="12" cy="12" rx="7" ry="10"/><ellipse cx="12" cy="12" rx="3" ry="6"/><path d="M3 22h18"/>',
  chest: '<path d="M3 11V7a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v13H3zm0 0h18M9 4v7m6-7v7m-5 0v5h4v-5"/>',
  anvil: '<path d="M2 7h20l-5 6H9L2 9zm8 6v5m5-5v5M7 21h12l-3-3H9zM6 3l4 4"/>',
  armor: '<path d="m8 3 4 3 4-3 5 5-4 3v10H7V11L3 8zM8 15h8"/>',
  map: '<path d="m3 5 6-3 6 3 6-3v17l-6 3-6-3-6 3zM9 2v17m6-14v17"/>',
  bag: '<path d="M7 8V6a5 5 0 0 1 10 0v2M4 8h16l1 14H3zM8 12v3m8-3v3"/>',
  book: '<path d="M12 5C9 2 5 2 2 3v17c4-1 7 0 10 2 3-2 6-3 10-2V3c-3-1-7-1-10 2zm0 0v17M5 7h4m-4 4h4m6-4h4m-4 4h4"/>',
  crown: '<path d="m3 6 4 4 5-7 5 7 4-4-2 13H5zm3 16h12"/>',
  settings:
    '<path d="m10 2-1 3-3 1-3-1-2 4 2 2v3l-2 2 2 4 3-1 3 1 1 3h4l1-3 3-1 3 1 2-4-2-2v-3l2-2-2-4-3 1-3-1-1-3z"/><circle cx="12" cy="12" r="3"/>',
  close: '<path d="m5 5 14 14M19 5 5 19"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  collapse: '<path d="M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5"/>',
  arrow: '<path d="M3 12h17m-6-6 6 6-6 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  volume: '<path d="M3 9h4l5-5v16l-5-5H3zm13-2c4 2 4 8 0 10m3-13c7 4 7 12 0 16"/>',
  mute: '<path d="M3 9h4l5-5v16l-5-5H3zm13 0 6 6m0-6-6 6"/>',
  people:
    '<circle cx="9" cy="7" r="4"/><path d="M1 22v-3a8 8 0 0 1 16 0v3m0-18a4 4 0 0 1 0 8m3 3c3 1 3 4 3 7"/>',
  chat: '<path d="M3 3h18v14H9l-6 5zM7 7h10M7 11h7"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="m12 6 4 6-4 6-4-6z"/>',
  check: '<path d="m4 12 5 5L20 5"/>',
  compass: '<circle cx="12" cy="12" r="10"/><path d="m16 8-3 5-5 3 3-5z"/>',
  skull:
    '<path d="M6 17C0 13 3 3 12 3s12 10 6 14v5H6zM9 18v4m6-4v4"/><circle cx="8" cy="11" r="2"/><circle cx="16" cy="11" r="2"/>',
  link: '<path d="m9 15 6-6m-7 3-2 2a4 4 0 0 0 6 6l3-3m-6-9 3-3a4 4 0 0 1 6 6l-2 2"/>',
  eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
  home: '<path d="m2 11 10-9 10 9M5 9v13h14V9M9 22v-8h6v8"/>',
};
export function icon(name: string, cls = '') {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.spark}</svg>`;
}
export function escapeHtml(s: unknown) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
