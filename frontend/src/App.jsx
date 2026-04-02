import { lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';

// Management Pages
import { PermissionRoute } from './components/PermissionRoute';

// Champion Public Pages
import { renderAccountRoutes } from './features/accounts/routes';
import { AdminCommissionsPage, renderAdminRoutes } from './features/admin/routes';
import { renderContactRoutes } from './features/contacts/routes';
import { renderJobsRoutes } from './features/jobs/routes';
import { renderLeadRoutes } from './features/leads/routes';
import { renderPublicPortalRoutes, renderProtectedPortalRoutes } from './features/portals/routes';
import { renderSearchRoutes } from './features/search/routes';
import { renderSupportRoutes } from './features/support/routes';
import AnalyticsLegacyHandoffRoute from './platform/AnalyticsLegacyHandoffRoute';
import { ProtectedRoute, renderLazyRoute } from './routes/shared';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AttentionQueue = lazy(() => import('./pages/AttentionQueue'));
const MyCommissions = lazy(() => import('./pages/MyCommissions'));
const SalesRepDashboard = lazy(() => import('./pages/SalesRepDashboard'));
const ChampionRegister = lazy(() => import('./pages/ChampionRegister'));
const ChampionJoin = lazy(() => import('./pages/ChampionJoin'));
const More = lazy(() => import('./pages/More'));
const PriceBooks = lazy(() => import('./pages/PriceBooks'));
const PriceBookDetail = lazy(() => import('./pages/PriceBookDetail'));
const Products = lazy(() => import('./pages/Products'));
const Schedule = lazy(() => import('./pages/Schedule'));
const Documents = lazy(() => import('./pages/Documents'));
const Campaigns = lazy(() => import('./pages/Campaigns'));
const Settings = lazy(() => import('./pages/Settings'));
const QuoteBuilder = lazy(() => import('./pages/QuoteBuilder'));
const Invoices = lazy(() => import('./pages/Invoices'));
const WorkOrders = lazy(() => import('./pages/WorkOrders'));
const WorkOrderWizard = lazy(() => import('./pages/WorkOrderWizard'));
const Cases = lazy(() => import('./pages/Cases'));
const Emails = lazy(() => import('./pages/Emails'));
const Help = lazy(() => import('./pages/Help'));
const TasksPage = lazy(() => import('./pages/management/TasksPage'));
const ContractsPage = lazy(() => import('./pages/management/ContractsPage'));
const QuotesPage = lazy(() => import('./pages/management/QuotesPage'));
const AppointmentsPage = lazy(() => import('./pages/management/AppointmentsPage'));

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={renderLazyRoute(Login, 'Loading login...')} />

      {/* Public Champion Routes */}
      <Route path="/champion/register" element={renderLazyRoute(ChampionRegister, 'Loading champion registration...')} />
      <Route path="/champion/join/:token" element={renderLazyRoute(ChampionJoin, 'Loading champion join...')} />

      {renderPublicPortalRoutes()}

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={renderLazyRoute(Dashboard, 'Loading dashboard...')} />
        {renderProtectedPortalRoutes()}
        {renderAccountRoutes()}
        {renderContactRoutes()}
        {renderLeadRoutes()}
        {renderJobsRoutes()}
        <Route path="attention" element={renderLazyRoute(AttentionQueue, 'Loading attention queue...')} />
        <Route path="reports/*" element={<AnalyticsLegacyHandoffRoute />} />
        <Route path="dashboards/*" element={<AnalyticsLegacyHandoffRoute />} />
        <Route path="pricebooks" element={renderLazyRoute(PriceBooks, 'Loading price books...')} />
        <Route path="pricebooks/:id" element={renderLazyRoute(PriceBookDetail, 'Loading price book...')} />
        <Route path="products" element={renderLazyRoute(Products, 'Loading products...')} />
        <Route path="quotes" element={renderLazyRoute(QuoteBuilder, 'Loading quote builder...')} />
        <Route path="quotes/new" element={renderLazyRoute(QuoteBuilder, 'Loading quote builder...')} />
        <Route path="quotes/:id" element={renderLazyRoute(QuoteBuilder, 'Loading quote builder...')} />
        <Route path="invoices" element={renderLazyRoute(Invoices, 'Loading invoices...')} />
        <Route path="invoices/:id" element={renderLazyRoute(Invoices, 'Loading invoices...')} />
        <Route path="workorders" element={renderLazyRoute(WorkOrders, 'Loading work orders...')} />
        <Route path="workorders/new" element={renderLazyRoute(WorkOrderWizard, 'Loading work order wizard...')} />
        <Route path="workorders/:id" element={renderLazyRoute(WorkOrders, 'Loading work orders...')} />
        <Route path="workorders/:id/wizard" element={renderLazyRoute(WorkOrderWizard, 'Loading work order wizard...')} />
        <Route path="cases" element={renderLazyRoute(Cases, 'Loading cases...')} />
        <Route path="cases/:id" element={renderLazyRoute(Cases, 'Loading cases...')} />
        <Route path="emails" element={renderLazyRoute(Emails, 'Loading emails...')} />
        <Route path="emails/:id" element={renderLazyRoute(Emails, 'Loading emails...')} />
        <Route path="my-commissions" element={renderLazyRoute(MyCommissions, 'Loading commissions...')} />
        <Route path="my-dashboard" element={renderLazyRoute(SalesRepDashboard, 'Loading dashboard...')} />
        <Route path="schedule" element={renderLazyRoute(Schedule, 'Loading schedule...')} />
        <Route path="documents" element={renderLazyRoute(Documents, 'Loading documents...')} />
        <Route path="campaigns" element={renderLazyRoute(Campaigns, 'Loading campaigns...')} />
        <Route path="settings" element={renderLazyRoute(Settings, 'Loading settings...')} />
        <Route path="more" element={renderLazyRoute(More, 'Loading more...')} />
        {renderSearchRoutes()}
        <Route path="help" element={renderLazyRoute(Help, 'Loading help...')} />
        {renderSupportRoutes()}

        {renderAdminRoutes()}

        {/* Management Routes - Protected by page access permissions */}
        <Route path="management/cases" element={<PermissionRoute page="cases">{renderLazyRoute(Cases, 'Loading cases...')}</PermissionRoute>} />
        <Route path="management/tasks" element={<PermissionRoute page="tasks">{renderLazyRoute(TasksPage, 'Loading tasks...')}</PermissionRoute>} />
        <Route
          path="management/commissions"
          element={
            <PermissionRoute page="commissions">
              {renderLazyRoute(AdminCommissionsPage, 'Loading commissions...')}
            </PermissionRoute>
          }
        />
        <Route path="management/invoices" element={<PermissionRoute page="invoices">{renderLazyRoute(Invoices, 'Loading invoices...')}</PermissionRoute>} />
        <Route path="management/contracts" element={<PermissionRoute page="contracts">{renderLazyRoute(ContractsPage, 'Loading contracts...')}</PermissionRoute>} />
        <Route path="management/quotes" element={<PermissionRoute page="quotes">{renderLazyRoute(QuotesPage, 'Loading quotes...')}</PermissionRoute>} />
        <Route path="management/appointments" element={<PermissionRoute page="appointments">{renderLazyRoute(AppointmentsPage, 'Loading appointments...')}</PermissionRoute>} />
        <Route path="management/work-orders" element={<PermissionRoute page="workOrders">{renderLazyRoute(WorkOrders, 'Loading work orders...')}</PermissionRoute>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
