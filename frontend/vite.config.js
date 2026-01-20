import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api/auth': 'http://localhost:3000',
      '/api/accounts': 'http://localhost:3001',
      '/api/contacts': 'http://localhost:3002',
      '/api/leads': 'http://localhost:3003',
      '/api/opportunities': 'http://localhost:3004',
    },
  },
});
