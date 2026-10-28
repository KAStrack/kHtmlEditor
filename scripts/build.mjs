import * as esbuild from 'esbuild';
import { readFileSync, mkdirSync, existsSync, cpSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const watch = process.argv.includes('--watch');

const define = {
  __KHE_VERSION__: JSON.stringify(pkg.version),
  __KHE_RELEASE_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
};

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  sourcemap: true,
  target: ['es2020', 'chrome100', 'firefox100', 'safari15'],
  loader: { '.css': 'text', '.svg': 'text' },
  define,
  legalComments: 'none',
  logLevel: 'info',
  charset: 'utf8',
  absWorkingDir: root,
};

const builds = [
  { ...common, entryPoints: ['src/entry-iife.ts'], format: 'iife', outfile: 'dist/khtmleditor.js' },
  { ...common, entryPoints: ['src/entry-iife.ts'], format: 'iife', outfile: 'dist/khtmleditor.min.js', minify: true },
  { ...common, entryPoints: ['src/index.ts'], format: 'esm', outfile: 'dist/khtmleditor.esm.js' },
  { ...common, entryPoints: ['src/entry-tinymce-shim.ts'], format: 'iife', outfile: 'dist/khtmleditor.tinymce-shim.js', minify: true },
];

mkdirSync(resolve(root, 'dist'), { recursive: true });

if (watch) {
  const ctxs = await Promise.all(builds.map((b) => esbuild.context(b)));
  await Promise.all(ctxs.map((c) => c.watch()));
  console.log('watching…');
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
  const skins = resolve(root, 'src/ui/skin');
  if (existsSync(skins)) {
    cpSync(skins, resolve(root, 'dist/skins'), { recursive: true });
  }
  const size = statSync(resolve(root, 'dist/khtmleditor.min.js')).size;
  const budget = 400 * 1024;
  console.log(`dist/khtmleditor.min.js: ${(size / 1024).toFixed(1)} KB (budget ${(budget / 1024).toFixed(0)} KB)`);
  if (size > budget) {
    console.error('Bundle exceeds size budget');
    process.exit(1);
  }
}
