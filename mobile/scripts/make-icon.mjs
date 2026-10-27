// Draws the app icon and splash images (the same green book as the website's
// favicon) into mobile/assets, for `npx capacitor-assets generate`.
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
mkdirSync(out, { recursive: true });

// The book, drawn in a 64×64 box (taken from the favicon in index.html).
const book = `
  <rect x="10" y="6" width="44" height="52" rx="7" fill="#2F5D50"/>
  <rect x="10" y="6" width="10" height="52" rx="4" fill="#234A3F"/>
  <rect x="26" y="16" width="20" height="3" rx="1.5" fill="#FFFFFF" opacity=".85"/>
  <rect x="26" y="23" width="14" height="3" rx="1.5" fill="#FFFFFF" opacity=".55"/>
  <path d="M40 6h8v18l-4-3-4 3z" fill="#C2603E"/>`;

// Light book on the green background, for the adaptive icon's foreground layer.
const bookOnGreen = book
  .replace('fill="#2F5D50"', 'fill="#FAF7F2"')
  .replace('fill="#234A3F"', 'fill="#E4DCCF"')
  .replaceAll('fill="#FFFFFF"', 'fill="#2F5D50"');

const svg = (size, inner, bg) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
  (bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : '') + inner + '</svg>');

// Places the 64-unit book centred, scaled to `share` of the canvas.
const placed = (size, share, art) => {
  const s = (size * share) / 64;
  const o = (size - 64 * s) / 2;
  return `<g transform="translate(${o} ${o}) scale(${s})">${art}</g>`;
};

const jobs = [
  ['icon-only.png', svg(1024, placed(1024, 0.62, bookOnGreen), '#2F5D50')],
  ['icon-foreground.png', svg(1024, placed(1024, 0.42, bookOnGreen))],
  ['icon-background.png', svg(1024, '', '#2F5D50')],
  ['splash.png', svg(2732, placed(2732, 0.16, book), '#FFFFFF')],
  ['splash-dark.png', svg(2732, placed(2732, 0.16, bookOnGreen.replace('fill="#2F5D50"', 'fill="#161412"')), '#161412')]
];
for (const [name, image] of jobs) await sharp(image).png().toFile(join(out, name));
console.log(`Icons drawn in ${out}`);
