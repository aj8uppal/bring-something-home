import { templateOf } from '../shared/instances';
import { TEMPLATE_BY_ID } from '../shared/templates';
import { MODIFIERS, type Modifier } from '../shared/endgame';
import type { ExpeditionResult } from '../shared/types';
import { runDuration } from './rally-ui';

/** A locally rendered keepsake. Contains only public game achievements and a realm invitation. */
export async function saveVictoryCard(name: string, run: ExpeditionResult, invitation: string) {
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  const rows = TEMPLATE_BY_ID.get(templateOf(run.dimension));
  const color = rows?.color ?? '#8fd8d2',
    full = run.chambers === run.totalChambers;
  const glow = ctx.createRadialGradient(975, 180, 10, 780, 250, 850);
  glow.addColorStop(0, '#324747');
  glow.addColorStop(1, '#101d22');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1200, 630);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.2;
  ctx.lineWidth = 1;
  for (const r of [140, 200, 280, 390]) {
    ctx.beginPath();
    ctx.arc(1010, 160, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 76; i++) {
    const x = (i * 233 + 53) % 1200,
      y = (i * 149 + 31) % 630;
    ctx.fillStyle = i % 3 ? '#b4d3ce' : '#f8dfa1';
    ctx.globalAlpha = 0.12 + (i % 4) * 0.05;
    ctx.fillRect(x, y, (i % 3) + 1, (i % 3) + 1);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#d9c59666';
  ctx.strokeRect(24.5, 24.5, 1151, 581);
  const write = (
    text: string,
    x: number,
    y: number,
    size: number,
    color = '#f6e9cc',
    family = 'sans-serif',
  ) => {
    ctx.font = `${size}px ${family}`;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  };
  write('BRING SOMETHING HOME', 64, 77, 20, '#e6cd94');
  write(full ? 'A STORM WORTH REMEMBERING' : 'A KEEPER BROUGHT DOWN TOGETHER', 64, 139, 15, color);
  write(rows?.name ?? run.dimension, 60, 217, 60, '#fff2d8', 'Georgia, serif');
  write(
    run.dimension === 'eclipse'
      ? `DEPTH ${run.depth}  /  ${MODIFIERS[run.modifier as Modifier]?.name.toUpperCase() ?? ''}${run.personalBest ? '  /  PERSONAL BEST' : ''}`
      : `${full ? 'COMPLETE EXPEDITION' : 'JOINED IN PROGRESS'}  /  ${run.chambers} OF ${run.totalChambers} CHAMBERS`,
    64,
    258,
    17,
    '#bed2ca',
  );
  ctx.fillStyle = '#ffffff08';
  ctx.fillRect(64, 298, 1072, 131);
  const values = [
    runDuration(run.elapsed),
    `${run.chambers}/${run.totalChambers}`,
    `+${run.shards}`,
    String(run.crew.length),
  ];
  const labels = ['EXPEDITION TIME', 'YOUR CHAMBERS', 'PERMANENT SHARDS', 'LIGHTS IN THE STORM'];
  for (let i = 0; i < 4; i++) {
    write(values[i], 88 + i * 267, 361, 42, '#fff0cd', 'Georgia, serif');
    write(labels[i], 88 + i * 267, 398, 13, '#b2c7c3');
  }
  write(name, 64, 478, 27, '#fff0d5', 'Georgia, serif');
  const others = run.crew.filter((p) => p.name !== name).map((p) => p.name);
  write(
    others.length
      ? `With ${others.slice(0, 4).join(', ')}${others.length > 4 ? ` + ${others.length - 4} more` : ''}`
      : 'One traveler. A little light, held against the dark.',
    64,
    509,
    17,
    '#adc9c0',
  );
  write('YOUR NEXT CREW IS ONE INVITATION AWAY.', 64, 562, 13, color);
  let urlSize = 14;
  ctx.font = `${urlSize}px sans-serif`;
  while (ctx.measureText(invitation).width > 1070 && urlSize > 9)
    ctx.font = `${--urlSize}px sans-serif`;
  write(invitation, 64, 586, urlSize, '#adc9c0');
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('Image export failed'))),
      'image/png',
    ),
  );
  const url = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = url;
  link.download = `bring-something-home-${run.dimension}-depth-${run.depth}.png`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
