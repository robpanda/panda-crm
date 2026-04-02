import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  server: {
    port: 3013,
    proxy: {
      '/api/auth': 'http://localhost:3000',
      '/api/accounts': 'http://localhost:3001',
      '/api/contacts': 'http://localhost:3002',
      '/api/leads': 'http://localhost:3003',
      '/api/opportunities': 'http://localhost:3004',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'analytics-assets',
    manifest: 'analytics/manifest.json',
    rollupOptions: {
      input: {
        analytics: 'analytics/index.html',
      },
      output: {
        entryFileNames: 'analytics-assets/[name]-[hash].js',
        chunkFileNames: 'analytics-assets/[name]-[hash].js',
        assetFileNames: 'analytics-assets/[name]-[hash][extname]',
      },
    },
  },
});
