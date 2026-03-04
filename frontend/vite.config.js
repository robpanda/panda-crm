import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiProxyTarget = env.VITE_API_PROXY;

  const proxy = apiProxyTarget
    ? {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: true,
        },
      }
    : {
        '/api/auth': 'http://localhost:3000',
        '/api/accounts': 'http://localhost:3001',
        '/api/contacts': 'http://localhost:3002',
        '/api/leads': 'http://localhost:3003',
        '/api/opportunities': 'http://localhost:3004',
      };

  return {
    plugins: [react()],
    server: {
      port: 3000,
      proxy,
    },
  };
});
