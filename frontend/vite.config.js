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

const OPERATIONAL_CATALOG_MODULES = [
  '/src/pages/PriceBooks.jsx',
  '/src/pages/PriceBookDetail.jsx',
  '/src/pages/Products.jsx',
];

const OPERATIONAL_FINANCE_MODULES = [
  '/src/pages/QuoteBuilder.jsx',
  '/src/pages/Invoices.jsx',
  '/src/pages/Documents.jsx',
];

const OPERATIONAL_WORKFLOW_MODULES = [
  '/src/pages/WorkOrders.jsx',
  '/src/pages/WorkOrderWizard.jsx',
  '/src/pages/Cases.jsx',
  '/src/pages/Emails.jsx',
  '/src/pages/Schedule.jsx',
  '/src/pages/Campaigns.jsx',
];

const OPERATIONAL_MISC_MODULES = [
  '/src/pages/Settings.jsx',
  '/src/pages/More.jsx',
  '/src/pages/Help.jsx',
];

const OPERATIONAL_MANAGEMENT_MODULES = [
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

          if (includesAny(id, OPERATIONAL_CATALOG_MODULES)) {
            return 'routes-operational-catalog';
          }

          if (includesAny(id, OPERATIONAL_FINANCE_MODULES)) {
            return 'routes-operational-finance';
          }

          if (includesAny(id, OPERATIONAL_WORKFLOW_MODULES)) {
            return 'routes-operational-workflow';
          }

          if (includesAny(id, OPERATIONAL_MISC_MODULES)) {
            return 'routes-operational-misc';
          }

          if (includesAny(id, OPERATIONAL_MANAGEMENT_MODULES)) {
            return 'routes-operational-management';
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
