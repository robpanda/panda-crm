import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AccountsDashboard from './pages/AccountsDashboard';
import Accounts from './pages/Accounts';
import AccountList from './pages/AccountList';
import AccountDetail from './pages/AccountDetail';
import ContactsDashboard from './pages/ContactsDashboard';
import Contacts from './pages/Contacts';
import ContactList from './pages/ContactList';
import ContactDetail from './pages/ContactDetail';
import Opportunities from './pages/Opportunities';
import AccountWizard from './pages/AccountWizard';
import AttentionQueue from './pages/AttentionQueue';
import More from './pages/More';
import PriceBooks from './pages/PriceBooks';
import PriceBookDetail from './pages/PriceBookDetail';
import Products from './pages/Products';
import Schedule from './pages/Schedule';
import Documents from './pages/Documents';
import Campaigns from './pages/Campaigns';
import Settings from './pages/Settings';
import QuoteBuilder from './pages/QuoteBuilder';
import Invoices from './pages/Invoices';
import WorkOrders from './pages/WorkOrders';
import WorkOrderWizard from './pages/WorkOrderWizard';
import Cases from './pages/Cases';
import Emails from './pages/Emails';
import MyCommissions from './pages/MyCommissions';
import SalesRepDashboard from './pages/SalesRepDashboard';

// Management Pages
import TasksPage from './pages/management/TasksPage';
import ContractsPage from './pages/management/ContractsPage';
import QuotesPage from './pages/management/QuotesPage';
import AppointmentsPage from './pages/management/AppointmentsPage';
import { PermissionRoute } from './components/PermissionRoute';

// Help
import Help from './pages/Help';

// Champion Public Pages
import ChampionRegister from './pages/ChampionRegister';
import ChampionJoin from './pages/ChampionJoin';
import { AdminCommissionsPage, renderAdminRoutes } from './features/admin/routes';
import { renderAnalyticsRoutes } from './features/analytics/routes';
import { renderJobsRoutes } from './features/jobs/routes';
import { renderLeadRoutes } from './features/leads/routes';
import { renderPublicPortalRoutes, renderProtectedPortalRoutes } from './features/portals/routes';
import { renderSearchRoutes } from './features/search/routes';
import { renderSupportRoutes } from './features/support/routes';
import { ProtectedRoute, renderLazyRoute } from './routes/shared';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Public Champion Routes */}
      <Route path="/champion/register" element={<ChampionRegister />} />
      <Route path="/champion/join/:token" element={<ChampionJoin />} />

      {renderPublicPortalRoutes()}

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        {renderProtectedPortalRoutes()}
        <Route path="accounts" element={<AccountsDashboard />} />
        <Route path="accounts/list" element={<AccountList />} />
        <Route path="accounts/new" element={<AccountWizard />} />
        <Route path="accounts/:id" element={<AccountDetail />} />
        <Route path="accounts/:id/wizard" element={<AccountWizard />} />
        <Route path="contacts" element={<ContactsDashboard />} />
        <Route path="contacts/list" element={<ContactList />} />
        <Route path="contacts/new" element={<ContactDetail />} />
        <Route path="contacts/:id" element={<ContactDetail />} />
        {renderLeadRoutes()}
        {renderJobsRoutes()}
        <Route path="attention" element={<AttentionQueue />} />
        {renderAnalyticsRoutes()}
        <Route path="pricebooks" element={<PriceBooks />} />
        <Route path="pricebooks/:id" element={<PriceBookDetail />} />
        <Route path="products" element={<Products />} />
        <Route path="quotes" element={<QuoteBuilder />} />
        <Route path="quotes/new" element={<QuoteBuilder />} />
        <Route path="quotes/:id" element={<QuoteBuilder />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="invoices/:id" element={<Invoices />} />
        <Route path="workorders" element={<WorkOrders />} />
        <Route path="workorders/new" element={<WorkOrderWizard />} />
        <Route path="workorders/:id" element={<WorkOrders />} />
        <Route path="workorders/:id/wizard" element={<WorkOrderWizard />} />
        <Route path="cases" element={<Cases />} />
        <Route path="cases/:id" element={<Cases />} />
        <Route path="emails" element={<Emails />} />
        <Route path="emails/:id" element={<Emails />} />
        <Route path="my-commissions" element={<MyCommissions />} />
        <Route path="my-dashboard" element={<SalesRepDashboard />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="documents" element={<Documents />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="settings" element={<Settings />} />
        <Route path="more" element={<More />} />
        {renderSearchRoutes()}
        <Route path="help" element={<Help />} />
        {renderSupportRoutes()}

        {renderAdminRoutes()}

        {/* Management Routes - Protected by page access permissions */}
        <Route path="management/cases" element={<PermissionRoute page="cases"><Cases /></PermissionRoute>} />
        <Route path="management/tasks" element={<PermissionRoute page="tasks"><TasksPage /></PermissionRoute>} />
        <Route
          path="management/commissions"
          element={
            <PermissionRoute page="commissions">
              {renderLazyRoute(AdminCommissionsPage, 'Loading commissions...')}
            </PermissionRoute>
          }
        />
        <Route path="management/invoices" element={<PermissionRoute page="invoices"><Invoices /></PermissionRoute>} />
        <Route path="management/contracts" element={<PermissionRoute page="contracts"><ContractsPage /></PermissionRoute>} />
        <Route path="management/quotes" element={<PermissionRoute page="quotes"><QuotesPage /></PermissionRoute>} />
        <Route path="management/appointments" element={<PermissionRoute page="appointments"><AppointmentsPage /></PermissionRoute>} />
        <Route path="management/work-orders" element={<PermissionRoute page="workOrders"><WorkOrders /></PermissionRoute>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
