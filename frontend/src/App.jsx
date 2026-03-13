import { lazy, Suspense } from 'react';
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
import Notifications from './pages/Notifications';
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
// Templates page is now part of Bamboogli - redirect in routes

// Help
import Help from './pages/Help';

// Support
// Champion Public Pages
import ChampionRegister from './pages/ChampionRegister';
import ChampionJoin from './pages/ChampionJoin';

const LeadsDashboard = lazy(() => import('./pages/LeadsDashboard'));
const LeadList = lazy(() => import('./pages/LeadList'));
const LeadDetail = lazy(() => import('./pages/LeadDetail'));
const LeadWizard = lazy(() => import('./pages/LeadWizard'));

const JobsDashboard = lazy(() => import('./pages/JobsDashboard'));
const OpportunityList = lazy(() => import('./pages/OpportunityList'));
const OpportunityDetail = lazy(() => import('./pages/OpportunityDetail'));
const OpportunityWizard = lazy(() => import('./pages/OpportunityWizard'));
const UnapprovedJobs = lazy(() => import('./pages/UnapprovedJobs'));

const Reports = lazy(() => import('./pages/Reports'));
const ReportBuilder = lazy(() => import('./pages/ReportBuilder'));
const ReportDetail = lazy(() => import('./pages/ReportDetail'));
const DashboardBuilder = lazy(() => import('./pages/DashboardBuilder'));
const Dashboards = lazy(() => import('./pages/Dashboards'));
const DashboardView = lazy(() => import('./pages/DashboardView'));
const ExecutiveDashboards = lazy(() => import('./pages/ExecutiveDashboards'));
const ClaimsOnboarding = lazy(() => import('./pages/ClaimsOnboarding'));
const AdvancedReportEditor = lazy(() => import('./pages/AdvancedReportEditor'));
const AIInsightsFeed = lazy(() => import('./pages/AIInsightsFeed'));
const AnalyticsShell = lazy(() => import('./pages/analytics/AnalyticsShell'));
const AnalyticsOverview = lazy(() => import('./pages/analytics/AnalyticsOverview'));
const AnalyticsSchedules = lazy(() => import('./pages/analytics/AnalyticsSchedules'));
const AnalyticsHealth = lazy(() => import('./pages/analytics/AnalyticsHealth'));
const AnalyticsMetabase = lazy(() => import('./pages/analytics/AnalyticsMetabase'));
const AnalyticsRedirect = lazy(() => import('./pages/analytics/AnalyticsRedirect'));

const CustomerPortal = lazy(() => import('./pages/CustomerPortal'));
const PMPortal = lazy(() => import('./pages/PMPortal'));
const SubcontractorPortal = lazy(() => import('./pages/SubcontractorPortal'));

const Workflows = lazy(() => import('./pages/admin/Workflows'));
const RolesPermissions = lazy(() => import('./pages/admin/RolesPermissions'));
const Commissions = lazy(() => import('./pages/admin/Commissions'));
const CommissionEngine = lazy(() => import('./pages/admin/CommissionEngine'));
const PaymentEngine = lazy(() => import('./pages/admin/PaymentEngine'));
const Integrations = lazy(() => import('./pages/admin/Integrations'));
const Users = lazy(() => import('./pages/admin/Users'));
const AuditLogs = lazy(() => import('./pages/admin/AuditLogs'));
const PandaSign = lazy(() => import('./pages/admin/PandaSign'));
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

const Support = lazy(() => import('./pages/Support'));
const SupportTicketDetail = lazy(() => import('./pages/SupportTicketDetail'));
const Search = lazy(() => import('./pages/Search'));

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

function RouteLoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-[40vh] py-12">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-panda-primary"></div>
    </div>
  );
}

function withSuspense(Component, props) {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Component {...props} />
    </Suspense>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Public Champion Routes */}
      <Route path="/champion/register" element={<ChampionRegister />} />
      <Route path="/champion/join/:token" element={<ChampionJoin />} />

      {/* Public Customer Portal Routes */}
      <Route path="/portal/:token" element={withSuspense(CustomerPortal)} />

      {/* Public Contractor Portal Routes */}
      <Route path="/contractor-portal/:token" element={withSuspense(SubcontractorPortal)} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="pm-portal" element={withSuspense(PMPortal)} />
        <Route path="accounts" element={<AccountsDashboard />} />
        <Route path="accounts/list" element={<AccountList />} />
        <Route path="accounts/new" element={<AccountWizard />} />
        <Route path="accounts/:id" element={<AccountDetail />} />
        <Route path="accounts/:id/wizard" element={<AccountWizard />} />
        <Route path="contacts" element={<ContactsDashboard />} />
        <Route path="contacts/list" element={<ContactList />} />
        <Route path="contacts/new" element={<ContactDetail />} />
        <Route path="contacts/:id" element={<ContactDetail />} />
        <Route path="leads" element={withSuspense(LeadsDashboard)} />
        <Route path="leads/list" element={withSuspense(LeadList)} />
        <Route path="leads/new" element={withSuspense(LeadWizard)} />
        <Route path="leads/:id" element={withSuspense(LeadDetail)} />
        <Route path="leads/:id/wizard" element={withSuspense(LeadWizard)} />
        {/* Jobs (Opportunities) - both URL patterns supported */}
        <Route path="jobs" element={withSuspense(JobsDashboard)} />
        <Route path="jobs/list" element={withSuspense(OpportunityList)} />
        <Route path="jobs/new" element={withSuspense(OpportunityWizard)} />
        <Route path="jobs/unapproved" element={withSuspense(UnapprovedJobs)} />
        <Route path="jobs/:id" element={withSuspense(OpportunityDetail)} />
        <Route path="jobs/:id/wizard" element={withSuspense(OpportunityWizard)} />
        {/* Legacy /opportunities URLs redirect to /jobs */}
        <Route path="opportunities" element={<Navigate to="/jobs" replace />} />
        <Route path="opportunities/list" element={<Navigate to="/jobs/list" replace />} />
        <Route path="opportunities/new" element={<Navigate to="/jobs/new" replace />} />
        <Route path="opportunities/:id" element={withSuspense(OpportunityDetail)} />
        <Route path="opportunities/:id/wizard" element={withSuspense(OpportunityWizard)} />
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
        <Route path="notifications" element={<Notifications />} />
        <Route path="more" element={<More />} />
        <Route path="search" element={withSuspense(Search)} />
        <Route path="help" element={<Help />} />
        <Route path="support" element={withSuspense(Support)} />
        <Route path="support/:id" element={withSuspense(SupportTicketDetail)} />

        {/* Analytics Hub */}
        <Route path="analytics" element={withSuspense(AnalyticsShell)}>
          <Route index element={withSuspense(AnalyticsRedirect)} />
          <Route path="overview" element={withSuspense(AnalyticsOverview)} />
          <Route path="reports" element={withSuspense(Reports)} />
          <Route path="reports/new" element={withSuspense(ReportBuilder)} />
          <Route path="reports/advanced/new" element={withSuspense(AdvancedReportEditor)} />
          <Route path="reports/advanced/:id" element={withSuspense(AdvancedReportEditor)} />
          <Route path="reports/:id" element={withSuspense(ReportDetail)} />
          <Route path="reports/:id/edit" element={withSuspense(ReportBuilder)} />
          <Route path="dashboards" element={withSuspense(Dashboards)} />
          <Route path="dashboards/new" element={withSuspense(DashboardBuilder)} />
          <Route path="dashboards/executive" element={withSuspense(ExecutiveDashboards)} />
          <Route path="dashboards/claims-onboarding" element={withSuspense(ClaimsOnboarding)} />
          <Route path="dashboards/:id" element={withSuspense(DashboardView)} />
          <Route path="dashboards/:id/edit" element={withSuspense(DashboardBuilder)} />
          <Route path="schedules" element={withSuspense(AnalyticsSchedules)} />
          <Route path="ai" element={withSuspense(AIInsightsFeed)} />
          <Route path="health" element={withSuspense(AnalyticsHealth)} />
          <Route path="metabase" element={withSuspense(AnalyticsMetabase)} />
        </Route>

        {/* Admin Routes */}
        <Route path="admin/workflows" element={withSuspense(Workflows)} />
        <Route path="admin/roles" element={withSuspense(RolesPermissions)} />
        <Route path="admin/commissions" element={withSuspense(Commissions)} />
        <Route path="admin/commission-engine" element={withSuspense(CommissionEngine)} />
        <Route path="admin/payment-engine" element={withSuspense(PaymentEngine)} />
        <Route path="admin/templates" element={<Navigate to="/admin/bamboogli?tab=templates" replace />} />
        <Route path="admin/integrations" element={withSuspense(Integrations)} />
        <Route path="admin/users" element={withSuspense(Users)} />
        <Route path="admin/audit" element={withSuspense(AuditLogs)} />
        <Route path="admin/pandasign" element={withSuspense(PandaSign)} />
        <Route path="admin/bamboogli" element={withSuspense(Bamboogli)} />
        <Route path="admin/service-admin" element={withSuspense(ServiceAdmin)} />
        <Route path="admin/training-bot" element={withSuspense(TrainingBotAnalytics)} />
        <Route path="admin/support" element={withSuspense(AdminSupport)} />
        <Route path="admin/support/tickets" element={withSuspense(AdminSupportTickets)} />
        <Route path="admin/support/ticket/:id" element={withSuspense(SupportTicketDetail)} />
        <Route path="admin/ringcentral" element={withSuspense(RingCentral)} />
        <Route path="admin/call-center" element={withSuspense(CallCenterSettings)} />
        <Route path="admin/help" element={withSuspense(AdminHelp)} />
        <Route path="admin/setup" element={withSuspense(Setup)} />
        <Route path="admin/google-calendar" element={withSuspense(GoogleCalendar)} />
        <Route path="admin/deleted-records" element={withSuspense(DeletedRecords)} />
        <Route path="admin/orphaned-records" element={withSuspense(OrphanedRecords)} />
        <Route path="admin/referral" element={withSuspense(Referral)} />

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
