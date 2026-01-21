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
import UnapprovedJobs from './pages/UnapprovedJobs';
import AccountWizard from './pages/AccountWizard';
import AttentionQueue from './pages/AttentionQueue';
import Reports from './pages/Reports';
import ReportBuilder from './pages/ReportBuilder';
import ReportDetail from './pages/ReportDetail';
import DashboardBuilder from './pages/DashboardBuilder';
import Dashboards from './pages/Dashboards';
import DashboardView from './pages/DashboardView';
import ExecutiveDashboards from './pages/ExecutiveDashboards';
import ClaimsOnboarding from './pages/ClaimsOnboarding';
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

// Admin Pages
import Workflows from './pages/admin/Workflows';
import RolesPermissions from './pages/admin/RolesPermissions';
import Commissions from './pages/admin/Commissions';
import CommissionEngine from './pages/admin/CommissionEngine';
import PaymentEngine from './pages/admin/PaymentEngine';
// Templates page is now part of Bamboogli - redirect in routes
import Integrations from './pages/admin/Integrations';
import Users from './pages/admin/Users';
import AuditLogs from './pages/admin/AuditLogs';
import PandaSign from './pages/admin/PandaSign';
import Bamboogli from './pages/admin/Bamboogli';
import ServiceAdmin from './pages/admin/ServiceAdmin';
import TrainingBotAnalytics from './pages/admin/TrainingBotAnalytics';
import RingCentral from './pages/admin/RingCentral';
import CallCenterSettings from './pages/admin/CallCenterSettings';
import AdminHelp from './pages/admin/AdminHelp';
import AdminSupport from './pages/admin/Support';
import AdminSupportTickets from './pages/admin/AdminSupportTickets';
import Setup from './pages/admin/Setup';
import GoogleCalendar from './pages/admin/GoogleCalendar';
import DeletedRecords from './pages/admin/DeletedRecords';
import OrphanedRecords from './pages/admin/OrphanedRecords';
import Referral from './pages/admin/Referral';

// Help
import Help from './pages/Help';

// Support
import Support from './pages/Support';
import SupportTicketDetail from './pages/SupportTicketDetail';

// Search
import Search from './pages/Search';

// Champion Public Pages
import ChampionRegister from './pages/ChampionRegister';
import ChampionJoin from './pages/ChampionJoin';

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

      {/* Public Champion Routes */}
      <Route path="/champion/register" element={<ChampionRegister />} />
      <Route path="/champion/join/:token" element={<ChampionJoin />} />

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
        <Route path="jobs/unapproved" element={<UnapprovedJobs />} />
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
        <Route path="dashboards/claims-onboarding" element={<ClaimsOnboarding />} />
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
        <Route path="my-commissions" element={<MyCommissions />} />
        <Route path="my-dashboard" element={<SalesRepDashboard />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="documents" element={<Documents />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="settings" element={<Settings />} />
        <Route path="more" element={<More />} />
        <Route path="search" element={<Search />} />
        <Route path="help" element={<Help />} />
        <Route path="support" element={<Support />} />
        <Route path="support/:id" element={<SupportTicketDetail />} />

        {/* Admin Routes */}
        <Route path="admin/workflows" element={<Workflows />} />
        <Route path="admin/roles" element={<RolesPermissions />} />
        <Route path="admin/commissions" element={<Commissions />} />
        <Route path="admin/commission-engine" element={<CommissionEngine />} />
        <Route path="admin/payment-engine" element={<PaymentEngine />} />
        <Route path="admin/templates" element={<Navigate to="/admin/bamboogli?tab=templates" replace />} />
        <Route path="admin/integrations" element={<Integrations />} />
        <Route path="admin/users" element={<Users />} />
        <Route path="admin/audit" element={<AuditLogs />} />
        <Route path="admin/pandasign" element={<PandaSign />} />
        <Route path="admin/bamboogli" element={<Bamboogli />} />
        <Route path="admin/service-admin" element={<ServiceAdmin />} />
        <Route path="admin/training-bot" element={<TrainingBotAnalytics />} />
        <Route path="admin/support" element={<AdminSupport />} />
        <Route path="admin/support/tickets" element={<AdminSupportTickets />} />
        <Route path="admin/support/ticket/:id" element={<SupportTicketDetail />} />
        <Route path="admin/ringcentral" element={<RingCentral />} />
        <Route path="admin/call-center" element={<CallCenterSettings />} />
        <Route path="admin/help" element={<AdminHelp />} />
        <Route path="admin/setup" element={<Setup />} />
        <Route path="admin/google-calendar" element={<GoogleCalendar />} />
        <Route path="admin/deleted-records" element={<DeletedRecords />} />
        <Route path="admin/orphaned-records" element={<OrphanedRecords />} />
        <Route path="admin/referral" element={<Referral />} />

        {/* Management Routes - Protected by page access permissions */}
        <Route path="management/cases" element={<PermissionRoute page="cases"><Cases /></PermissionRoute>} />
        <Route path="management/tasks" element={<PermissionRoute page="tasks"><TasksPage /></PermissionRoute>} />
        <Route path="management/commissions" element={<PermissionRoute page="commissions"><Commissions /></PermissionRoute>} />
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
