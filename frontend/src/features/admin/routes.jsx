import { lazy } from 'react';
import { Navigate, Route } from 'react-router-dom';
import Workflows from '../../pages/admin/Workflows';
import RolesPermissions from '../../pages/admin/RolesPermissions';
import PandaSignV2 from '../../pages/admin/PandaSignV2';
import { renderLazyRoute } from '../../routes/shared';

export const AdminCommissionsPage = lazy(() => import('../../pages/admin/Commissions'));
const CommissionEngine = lazy(() => import('../../pages/admin/CommissionEngine'));
const PaymentEngine = lazy(() => import('../../pages/admin/PaymentEngine'));
const Integrations = lazy(() => import('../../pages/admin/Integrations'));
const Users = lazy(() => import('../../pages/admin/Users'));
const AuditLogs = lazy(() => import('../../pages/admin/AuditLogs'));
const Bamboogli = lazy(() => import('../../pages/admin/Bamboogli'));
const ServiceAdmin = lazy(() => import('../../pages/admin/ServiceAdmin'));
const TrainingBotAnalytics = lazy(() => import('../../pages/admin/TrainingBotAnalytics'));
const RingCentral = lazy(() => import('../../pages/admin/RingCentral'));
const CallCenterSettings = lazy(() => import('../../pages/admin/CallCenterSettings'));
const AdminHelp = lazy(() => import('../../pages/admin/AdminHelp'));
const AdminSupport = lazy(() => import('../../pages/admin/Support'));
const AdminSupportTickets = lazy(() => import('../../pages/admin/AdminSupportTickets'));
const SupportTicketDetail = lazy(() => import('../../pages/SupportTicketDetail'));
const Setup = lazy(() => import('../../pages/admin/Setup'));
const GoogleCalendar = lazy(() => import('../../pages/admin/GoogleCalendar'));
const DeletedRecords = lazy(() => import('../../pages/admin/DeletedRecords'));
const OrphanedRecords = lazy(() => import('../../pages/admin/OrphanedRecords'));
const Referral = lazy(() => import('../../pages/admin/Referral'));

export function renderAdminRoutes() {
  return (
    <>
      <Route path="admin/workflows" element={<Workflows />} />
      <Route path="admin/roles" element={<RolesPermissions />} />
      <Route path="admin/commissions" element={renderLazyRoute(AdminCommissionsPage, 'Loading commissions...')} />
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
      <Route path="admin/support/ticket/:id" element={renderLazyRoute(SupportTicketDetail, 'Loading support ticket...')} />
      <Route path="admin/ringcentral" element={renderLazyRoute(RingCentral, 'Loading RingCentral...')} />
      <Route path="admin/call-center" element={renderLazyRoute(CallCenterSettings, 'Loading call center settings...')} />
      <Route path="admin/help" element={renderLazyRoute(AdminHelp, 'Loading admin help...')} />
      <Route path="admin/setup" element={renderLazyRoute(Setup, 'Loading setup...')} />
      <Route path="admin/google-calendar" element={renderLazyRoute(GoogleCalendar, 'Loading Google Calendar...')} />
      <Route path="admin/deleted-records" element={renderLazyRoute(DeletedRecords, 'Loading deleted records...')} />
      <Route path="admin/orphaned-records" element={renderLazyRoute(OrphanedRecords, 'Loading orphaned records...')} />
      <Route path="admin/referral" element={renderLazyRoute(Referral, 'Loading referral settings...')} />
    </>
  );
}
