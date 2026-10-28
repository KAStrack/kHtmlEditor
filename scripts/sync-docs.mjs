import { cpSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const src = resolve(root, 'dist');
const dest = resolve(root, 'docs/dist');
if (!existsSync(src)) {
  console.error('dist/ does not exist — run `npm run build` first');
  process.exit(1);
}
// docs/dist is committed for GitHub Pages, so it holds only what the site loads: the minified
// bundle, the TinyMCE shim and the optional skin stylesheets.
const files = ['khtmleditor.min.js', 'khtmleditor.tinymce-shim.js'];
mkdirSync(dest, { recursive: true });
for (const f of readdirSync(dest)) {
  if (!files.includes(f) && f !== 'skins') rmSync(resolve(dest, f), { recursive: true });
}
for (const f of files) {
  if (existsSync(resolve(src, f))) cpSync(resolve(src, f), resolve(dest, f));
}
if (existsSync(resolve(src, 'skins'))) cpSync(resolve(src, 'skins'), resolve(dest, 'skins'), { recursive: true });
console.log('docs/dist updated');
