import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';

/** Serve .css / .svg imports as plain strings, mirroring esbuild's `text` loader. */
const textAssets = () => ({
  name: 'khe-text-assets',
  enforce: 'pre' as const,
  load(id: string) {
    const clean = id.split('?')[0];
    if (clean.endsWith('.css') || clean.endsWith('.svg')) {
      return `export default ${JSON.stringify(readFileSync(clean, 'utf8'))};`;
    }
    return null;
  },
});

export default defineConfig({
  plugins: [textAssets()],
  define: {
    __KHE_VERSION__: JSON.stringify('0.0.0-test'),
    __KHE_RELEASE_DATE__: JSON.stringify('1970-01-01'),
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
    globals: false,
    css: false,
  },
});
