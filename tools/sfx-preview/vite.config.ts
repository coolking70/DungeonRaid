import { defineConfig } from 'vite';

// Standalone root: do not inherit the game's original-art aliases or shared port.
const projectRoot = decodeURIComponent(new URL('../../', import.meta.url).pathname);
export default defineConfig({
  server: { host: '127.0.0.1', port: 5319, strictPort: true, fs: { allow: [projectRoot] } },
  build: { outDir: 'dist', emptyOutDir: true },
});
