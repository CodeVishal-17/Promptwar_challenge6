import { defineConfig } from 'vite';

/** The browser app lives in web/ and builds into dist/web, which Express serves in production. */
export default defineConfig({
  root: 'web',
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
    target: 'es2022',
    // Every supported browser has native modulepreload; the polyfill would be extra script.
    modulePreload: { polyfill: false },
    // Keep assets as files: the CSP allows data: images but nothing else inline.
    assetsInlineLimit: 0,
  },
  server: {
    proxy: { '/api': 'http://localhost:8080' },
  },
});
