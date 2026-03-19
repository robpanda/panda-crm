import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const CORE_VENDOR_PACKAGES = [
  '/react/',
  '/react-dom/',
  '/react-router-dom/',
  '/@tanstack/react-query/',
  '/axios/',
  '/lucide-react/',
];

const ANALYTICS_VENDOR_PACKAGES = [
  '/date-fns/',
  '/recharts/',
  '/react-grid-layout/',
  '/react-resizable/',
];

const OPERATIONAL_ROUTE_MODULES = [
  '/src/pages/PriceBooks.jsx',
  '/src/pages/PriceBookDetail.jsx',
  '/src/pages/Products.jsx',
  '/src/pages/QuoteBuilder.jsx',
  '/src/pages/Invoices.jsx',
  '/src/pages/WorkOrders.jsx',
  '/src/pages/WorkOrderWizard.jsx',
  '/src/pages/Cases.jsx',
  '/src/pages/Emails.jsx',
  '/src/pages/Schedule.jsx',
  '/src/pages/Documents.jsx',
  '/src/pages/Campaigns.jsx',
  '/src/pages/Settings.jsx',
  '/src/pages/More.jsx',
  '/src/pages/Help.jsx',
  '/src/pages/management/TasksPage.jsx',
  '/src/pages/management/ContractsPage.jsx',
  '/src/pages/management/QuotesPage.jsx',
  '/src/pages/management/AppointmentsPage.jsx',
];

function includesAny(id, patterns) {
  return patterns.some((pattern) => id.includes(pattern));
}

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/')) {
            if (includesAny(id, ANALYTICS_VENDOR_PACKAGES)) {
              return 'vendor-analytics';
            }

            if (includesAny(id, CORE_VENDOR_PACKAGES)) {
              return 'vendor-core';
            }
          }

          if (includesAny(id, OPERATIONAL_ROUTE_MODULES)) {
            return 'routes-operational';
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
