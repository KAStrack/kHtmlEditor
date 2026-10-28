import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const src = resolve(root, 'dist');
const dest = resolve(root, 'docs/dist');
if (!existsSync(src)) {
  console.error('dist/ does not exist — run `npm run build` first');
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
for (const f of ['khtmleditor.js', 'khtmleditor.js.map', 'khtmleditor.min.js', 'khtmleditor.min.js.map', 'khtmleditor.esm.js', 'khtmleditor.esm.js.map', 'khtmleditor.tinymce-shim.js']) {
  if (existsSync(resolve(src, f))) cpSync(resolve(src, f), resolve(dest, f));
}
if (existsSync(resolve(src, 'skins'))) cpSync(resolve(src, 'skins'), resolve(dest, 'skins'), { recursive: true });
console.log('docs/dist updated');
