import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': path.resolve(process.cwd(), 'src') } },
  server: {
    host: '127.0.0.1',
    proxy: { '/api': { target: 'http://127.0.0.1:8800', changeOrigin: true } },
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 2000 },
});
