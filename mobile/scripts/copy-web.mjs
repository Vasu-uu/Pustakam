// Copies the Pustakam website (index.html, style.css, script.js in the parent
// folder) into mobile/www, which is what the Android app shows.
// - Google Fonts are swapped for font files bundled in the app, so it looks
//   right with no internet connection. Only the alphabets Pustakam needs
//   (Latin and Malayalam) and only the modern woff2 format are kept.
// - script.js and style.css are minified to keep the app small and quick.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, '..', '..');
const www = resolve(here, '..', 'www');
const modules = resolve(here, '..', 'node_modules');

rmSync(www, { recursive: true, force: true });
mkdirSync(join(www, 'fonts'), { recursive: true });

// --- Minified script and styles ---
// Android WebView is always a recent Chrome, so modern syntax can stay as it is.
const minify = (file, loader) => {
  const { code } = transformSync(readFileSync(join(site, file), 'utf8'), { loader, minify: true, target: 'chrome100', legalComments: 'none' });
  writeFileSync(join(www, file), code);
};
minify('script.js', 'js');
minify('style.css', 'css');

// --- Fonts ---
// [package, css file, family name used in style.css, file-name prefix, alphabets to keep]
const LATIN = ['latin', 'latin-ext'];
const fonts = [
  ['@fontsource-variable/fraunces', 'opsz.css', 'Fraunces', 'fraunces-', LATIN],
  ['@fontsource-variable/fraunces', 'opsz-italic.css', 'Fraunces', 'fraunces-', LATIN],
  ...['400', '500', '600', '700'].map((w) => ['@fontsource/inter', `${w}.css`, 'Inter', 'inter-', LATIN]),
  // Latin text is drawn with Inter/Fraunces, so the Malayalam fonts only need Malayalam letters.
  ...['400', '500', '600'].map((w) => ['@fontsource/noto-sans-malayalam', `${w}.css`, 'Noto Sans Malayalam', 'noto-sans-malayalam-', ['malayalam']]),
  ...['400', '500', '600'].map((w) => ['@fontsource/noto-serif-malayalam', `${w}.css`, 'Noto Serif Malayalam', 'noto-serif-malayalam-', ['malayalam']])
];

let css = '';
for (const [pkg, file, family, prefix, keep] of fonts) {
  const blocks = readFileSync(join(modules, pkg, file), 'utf8').match(/@font-face\s*\{[^}]*\}/g) || [];
  for (const block of blocks) {
    const woff2 = block.match(/url\(\.\/files\/([^)]+\.woff2)\)/)[1];
    const alphabet = woff2.slice(prefix.length).replace(/-(\d{3}|opsz)-.*$/, '');
    if (!keep.includes(alphabet)) continue;
    cpSync(join(modules, pkg, 'files', woff2), join(www, 'fonts', woff2));
    css += block
      .replace(/font-family:\s*'[^']+'/, `font-family:'${family}'`)
      .replace(/src:[^;]*/, `src:url(./${woff2}) format('woff2')`)
      .replace(/\s*\n\s*/g, '') + '\n';
  }
}
writeFileSync(join(www, 'fonts', 'fonts.css'), css);

// --- Page ---
const html = readFileSync(join(site, 'index.html'), 'utf8');
const fontLinks = /\s*<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">[\s\S]*?<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/;
if (!fontLinks.test(html)) throw new Error('Could not find the Google Fonts links in index.html — update copy-web.mjs');
if (!html.includes('<html lang="en" data-theme="light">')) throw new Error('Could not find the <html> tag in index.html — update copy-web.mjs');
writeFileSync(join(www, 'index.html'), html
  .replace('<html lang="en" data-theme="light">', '<html lang="en" data-theme="light" class="is-app">') // app-only styles in style.css
  .replace(fontLinks, '\n  <link rel="stylesheet" href="fonts/fonts.css">')
  .replace(/<!--(?!\[)[\s\S]*?-->/g, '')     // drop HTML comments
  .replace(/\n\s*\n+/g, '\n'));                // and the blank lines they leave

console.log(`Copied the website into ${www}`);
