import { lazy } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
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
import AdvancedReportEditor from './pages/AdvancedReportEditor';
import AnalyticsShell from './pages/analytics/AnalyticsShell';
import AnalyticsOverview from './pages/analytics/AnalyticsOverview';
import AnalyticsSchedules from './pages/analytics/AnalyticsSchedules';
import AnalyticsSettings from './pages/analytics/AnalyticsSettings';
import AnalyticsRedirect from './pages/analytics/AnalyticsRedirect';
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
import CustomerPortal from './pages/CustomerPortal';
import PMPortal from './pages/PMPortal';
import SubcontractorPortal from './pages/SubcontractorPortal';

// Management Pages
import TasksPage from './pages/management/TasksPage';
import ContractsPage from './pages/management/ContractsPage';
import QuotesPage from './pages/management/QuotesPage';
import AppointmentsPage from './pages/management/AppointmentsPage';
import { PermissionRoute } from './components/PermissionRoute';

// Admin Pages
import Workflows from './pages/admin/Workflows';
import RolesPermissions from './pages/admin/RolesPermissions';
// Templates page is now part of Bamboogli - redirect in routes
import PandaSignV2 from './pages/admin/PandaSignV2';

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
import LazyBoundary from './components/LazyBoundary';

const Commissions = lazy(() => import('./pages/admin/Commissions'));
const CommissionEngine = lazy(() => import('./pages/admin/CommissionEngine'));
const PaymentEngine = lazy(() => import('./pages/admin/PaymentEngine'));
const Integrations = lazy(() => import('./pages/admin/Integrations'));
const Users = lazy(() => import('./pages/admin/Users'));
const AuditLogs = lazy(() => import('./pages/admin/AuditLogs'));
const Bamboogli = lazy(() => import('./pages/admin/Bamboogli'));
const ServiceAdmin = lazy(() => import('./pages/admin/ServiceAdmin'));
const TrainingBotAnalytics = lazy(() => import('./pages/admin/TrainingBotAnalytics'));
const RingCentral = lazy(() => import('./pages/admin/RingCentral'));
const CallCenterSettings = lazy(() => import('./pages/admin/CallCenterSettings'));
const AdminHelp = lazy(() => import('./pages/admin/AdminHelp'));
const AdminSupport = lazy(() => import('./pages/admin/Support'));
const AdminSupportTickets = lazy(() => import('./pages/admin/AdminSupportTickets'));
const Setup = lazy(() => import('./pages/admin/Setup'));
const GoogleCalendar = lazy(() => import('./pages/admin/GoogleCalendar'));
const DeletedRecords = lazy(() => import('./pages/admin/DeletedRecords'));
const OrphanedRecords = lazy(() => import('./pages/admin/OrphanedRecords'));
const Referral = lazy(() => import('./pages/admin/Referral'));

function renderLazyRoute(Component, label) {
  return (
    <LazyBoundary label={label}>
      <Component />
    </LazyBoundary>
  );
}

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

function RedirectWithId({ basePath, suffix = '' }) {
  const { id } = useParams();
  if (!id) {
    return <Navigate to={basePath} replace />;
  }
  return <Navigate to={`${basePath}/${id}${suffix}`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Public Champion Routes */}
      <Route path="/champion/register" element={<ChampionRegister />} />
      <Route path="/champion/join/:token" element={<ChampionJoin />} />

      {/* Public Customer Portal Routes */}
      <Route path="/portal/job/:jobId" element={<CustomerPortal />} />
      <Route path="/portal/:token" element={<CustomerPortal />} />

      {/* Public Contractor Portal Routes */}
      <Route path="/contractor-portal/:token" element={<SubcontractorPortal />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="pm-portal" element={<PMPortal />} />
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
        <Route path="reports" element={<Navigate to="/analytics/reports" replace />} />
        <Route path="reports/builder" element={<Navigate to="/analytics/reports/new" replace />} />
        <Route path="reports/builder/:id" element={<RedirectWithId basePath="/analytics/reports" suffix="/edit" />} />
        <Route path="reports/advanced" element={<Navigate to="/analytics/reports/advanced/new" replace />} />
        <Route path="reports/advanced/:id" element={<RedirectWithId basePath="/analytics/reports/advanced" />} />
        <Route path="reports/:id" element={<RedirectWithId basePath="/analytics/reports" />} />
        <Route path="dashboards" element={<Navigate to="/analytics/dashboards" replace />} />
        <Route path="dashboards/default" element={<Navigate to="/analytics/dashboards/executive" replace />} />
        <Route path="dashboards/custom" element={<Navigate to="/analytics/dashboards" replace />} />
        <Route path="dashboards/claims-onboarding" element={<Navigate to="/analytics/dashboards/claims-onboarding" replace />} />
        <Route path="dashboards/builder" element={<Navigate to="/analytics/dashboards/new" replace />} />
        <Route path="dashboards/builder/:id" element={<RedirectWithId basePath="/analytics/dashboards" suffix="/edit" />} />
        <Route path="dashboards/:id" element={<RedirectWithId basePath="/analytics/dashboards" />} />
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

        {/* Analytics Hub */}
        <Route path="analytics" element={<AnalyticsShell />}>
          <Route index element={<AnalyticsRedirect />} />
          <Route path="overview" element={<AnalyticsOverview />} />
          <Route path="reports" element={<Reports />} />
          <Route path="reports/new" element={<ReportBuilder />} />
          <Route path="reports/advanced/new" element={<AdvancedReportEditor />} />
          <Route path="reports/advanced/:id" element={<AdvancedReportEditor />} />
          <Route path="reports/:id" element={<ReportDetail />} />
          <Route path="reports/:id/edit" element={<ReportBuilder />} />
          <Route path="dashboards" element={<Dashboards />} />
          <Route path="dashboards/new" element={<DashboardBuilder />} />
          <Route path="dashboards/executive" element={<ExecutiveDashboards />} />
          <Route path="dashboards/claims-onboarding" element={<ClaimsOnboarding />} />
          <Route path="dashboards/:id" element={<DashboardView />} />
          <Route path="dashboards/:id/edit" element={<DashboardBuilder />} />
          <Route path="schedules" element={<AnalyticsSchedules />} />
          <Route path="settings" element={<Navigate to="/analytics/settings/health" replace />} />
          <Route path="settings/:section" element={<AnalyticsSettings />} />
          <Route path="ai" element={<Navigate to="/analytics/settings/ai" replace />} />
          <Route path="health" element={<Navigate to="/analytics/settings/health" replace />} />
          <Route path="metabase" element={<Navigate to="/analytics/settings/metabase" replace />} />
        </Route>

        {/* Admin Routes */}
        <Route path="admin/workflows" element={<Workflows />} />
        <Route path="admin/roles" element={<RolesPermissions />} />
        <Route path="admin/commissions" element={renderLazyRoute(Commissions, 'Loading commissions...')} />
        <Route path="admin/commission-engine" element={renderLazyRoute(CommissionEngine, 'Loading commission engine...')} />
        <Route path="admin/payment-engine" element={renderLazyRoute(PaymentEngine, 'Loading payment engine...')} />
        <Route path="admin/pandasign-v2" element={<PandaSignV2 />} />
        <Route path="admin/templates" element={<Navigate to="/admin/bamboogli?tab=templates" replace />} />
        <Route path="admin/integrations" element={renderLazyRoute(Integrations, 'Loading integrations...')} />
        <Route path="admin/users" element={renderLazyRoute(Users, 'Loading users...')} />
        <Route path="admin/audit" element={renderLazyRoute(AuditLogs, 'Loading audit logs...')} />
        <Route path="admin/bamboogli" element={renderLazyRoute(Bamboogli, 'Loading templates...')} />
        <Route path="admin/service-admin" element={renderLazyRoute(ServiceAdmin, 'Loading service admin...')} />
        <Route path="admin/training-bot" element={renderLazyRoute(TrainingBotAnalytics, 'Loading training bot analytics...')} />
        <Route path="admin/support" element={renderLazyRoute(AdminSupport, 'Loading support admin...')} />
        <Route path="admin/support/tickets" element={renderLazyRoute(AdminSupportTickets, 'Loading support tickets...')} />
        <Route path="admin/support/ticket/:id" element={<SupportTicketDetail />} />
        <Route path="admin/ringcentral" element={renderLazyRoute(RingCentral, 'Loading RingCentral...')} />
        <Route path="admin/call-center" element={renderLazyRoute(CallCenterSettings, 'Loading call center settings...')} />
        <Route path="admin/help" element={renderLazyRoute(AdminHelp, 'Loading admin help...')} />
        <Route path="admin/setup" element={renderLazyRoute(Setup, 'Loading setup...')} />
        <Route path="admin/google-calendar" element={renderLazyRoute(GoogleCalendar, 'Loading Google Calendar...')} />
        <Route path="admin/deleted-records" element={renderLazyRoute(DeletedRecords, 'Loading deleted records...')} />
        <Route path="admin/orphaned-records" element={renderLazyRoute(OrphanedRecords, 'Loading orphaned records...')} />
        <Route path="admin/referral" element={renderLazyRoute(Referral, 'Loading referral settings...')} />

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
