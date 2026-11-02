import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root,
  plugins: [react(), tailwindcss()],
  server: {
    port: 5317,
    proxy: { '/api': { target: 'http://127.0.0.1:4317', changeOrigin: true } },
  },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1200 },
});
