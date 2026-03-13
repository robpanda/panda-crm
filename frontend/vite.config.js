import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (
              id.includes('recharts') ||
              id.includes('d3') ||
              id.includes('chart.js') ||
              id.includes('victory')
            ) {
              return 'charts';
            }

            if (
              id.includes('pdf-lib') ||
              id.includes('pdfjs-dist') ||
              id.includes('jspdf') ||
              id.includes('html2canvas')
            ) {
              return 'pdf';
            }

            if (
              id.includes('@stripe') ||
              id.includes('stripe-js')
            ) {
              return 'stripe';
            }
          }

          if (
            id.includes('/src/pages/admin/') ||
            id.includes('/src/components/admin/')
          ) {
            return 'admin';
          }

          if (
            id.includes('/src/pages/analytics/') ||
            id.includes('/src/pages/Reports.jsx') ||
            id.includes('/src/pages/ReportBuilder.jsx') ||
            id.includes('/src/pages/ReportDetail.jsx') ||
            id.includes('/src/pages/DashboardBuilder.jsx') ||
            id.includes('/src/pages/Dashboards.jsx') ||
            id.includes('/src/pages/DashboardView.jsx') ||
            id.includes('/src/pages/ExecutiveDashboards.jsx') ||
            id.includes('/src/pages/ClaimsOnboarding.jsx') ||
            id.includes('/src/pages/AdvancedReportEditor.jsx') ||
            id.includes('/src/components/reports/')
          ) {
            return 'analytics';
          }

          return undefined;
        },
      },
    },
  },
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
