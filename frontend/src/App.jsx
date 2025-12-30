import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
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
import LeadsDashboard from './pages/LeadsDashboard';
import LeadList from './pages/LeadList';
import LeadDetail from './pages/LeadDetail';
import LeadWizard from './pages/LeadWizard';
import JobsDashboard from './pages/JobsDashboard';
import Opportunities from './pages/Opportunities';
import OpportunityList from './pages/OpportunityList';
import OpportunityDetail from './pages/OpportunityDetail';
import OpportunityWizard from './pages/OpportunityWizard';
import AccountWizard from './pages/AccountWizard';
import AttentionQueue from './pages/AttentionQueue';
import Reports from './pages/Reports';
import ReportBuilder from './pages/ReportBuilder';
import ReportDetail from './pages/ReportDetail';
import DashboardBuilder from './pages/DashboardBuilder';
import Dashboards from './pages/Dashboards';
import DashboardView from './pages/DashboardView';
import ExecutiveDashboards from './pages/ExecutiveDashboards';
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

// Admin Pages
import Workflows from './pages/admin/Workflows';
import RolesPermissions from './pages/admin/RolesPermissions';
import Commissions from './pages/admin/Commissions';
import CommissionEngine from './pages/admin/CommissionEngine';
import PaymentEngine from './pages/admin/PaymentEngine';
import Templates from './pages/admin/Templates';
import Integrations from './pages/admin/Integrations';
import Users from './pages/admin/Users';
import AuditLogs from './pages/admin/AuditLogs';
import PandaSign from './pages/admin/PandaSign';
import Bamboogli from './pages/admin/Bamboogli';
import FieldService from './pages/admin/FieldService';
import TrainingBotAnalytics from './pages/admin/TrainingBotAnalytics';
import RingCentral from './pages/admin/RingCentral';

// Search
import Search from './pages/Search';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-panda-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="accounts" element={<AccountsDashboard />} />
        <Route path="accounts/list" element={<AccountList />} />
        <Route path="accounts/new" element={<AccountWizard />} />
        <Route path="accounts/:id" element={<AccountDetail />} />
        <Route path="accounts/:id/wizard" element={<AccountWizard />} />
        <Route path="contacts" element={<ContactsDashboard />} />
        <Route path="contacts/list" element={<ContactList />} />
        <Route path="contacts/new" element={<ContactDetail />} />
        <Route path="contacts/:id" element={<ContactDetail />} />
        <Route path="leads" element={<LeadsDashboard />} />
        <Route path="leads/list" element={<LeadList />} />
        <Route path="leads/new" element={<LeadWizard />} />
        <Route path="leads/:id" element={<LeadDetail />} />
        <Route path="leads/:id/wizard" element={<LeadWizard />} />
        {/* Jobs (Opportunities) - both URL patterns supported */}
        <Route path="jobs" element={<JobsDashboard />} />
        <Route path="jobs/list" element={<OpportunityList />} />
        <Route path="jobs/new" element={<OpportunityWizard />} />
        <Route path="jobs/:id" element={<OpportunityDetail />} />
        <Route path="jobs/:id/wizard" element={<OpportunityWizard />} />
        {/* Legacy /opportunities URLs redirect to /jobs */}
        <Route path="opportunities" element={<Navigate to="/jobs" replace />} />
        <Route path="opportunities/list" element={<Navigate to="/jobs/list" replace />} />
        <Route path="opportunities/new" element={<Navigate to="/jobs/new" replace />} />
        <Route path="opportunities/:id" element={<OpportunityDetail />} />
        <Route path="opportunities/:id/wizard" element={<OpportunityWizard />} />
        <Route path="attention" element={<AttentionQueue />} />
        <Route path="reports" element={<Reports />} />
        <Route path="reports/builder" element={<ReportBuilder />} />
        <Route path="reports/builder/:id" element={<ReportBuilder />} />
        <Route path="reports/:id" element={<ReportDetail />} />
        <Route path="dashboards" element={<ExecutiveDashboards />} />
        <Route path="dashboards/default" element={<ExecutiveDashboards />} />
        <Route path="dashboards/custom" element={<Dashboards />} />
        <Route path="dashboards/builder" element={<DashboardBuilder />} />
        <Route path="dashboards/builder/:id" element={<DashboardBuilder />} />
        <Route path="dashboards/:id" element={<DashboardView />} />
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
        <Route path="schedule" element={<Schedule />} />
        <Route path="documents" element={<Documents />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="settings" element={<Settings />} />
        <Route path="more" element={<More />} />
        <Route path="search" element={<Search />} />

        {/* Admin Routes */}
        <Route path="admin/workflows" element={<Workflows />} />
        <Route path="admin/roles" element={<RolesPermissions />} />
        <Route path="admin/commissions" element={<Commissions />} />
        <Route path="admin/commission-engine" element={<CommissionEngine />} />
        <Route path="admin/payment-engine" element={<PaymentEngine />} />
        <Route path="admin/templates" element={<Templates />} />
        <Route path="admin/integrations" element={<Integrations />} />
        <Route path="admin/users" element={<Users />} />
        <Route path="admin/audit" element={<AuditLogs />} />
        <Route path="admin/pandasign" element={<PandaSign />} />
        <Route path="admin/bamboogli" element={<Bamboogli />} />
        <Route path="admin/field-service" element={<FieldService />} />
        <Route path="admin/training-bot" element={<TrainingBotAnalytics />} />
        <Route path="admin/ringcentral" element={<RingCentral />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
