import { Navigate, Route } from 'react-router-dom';
import Reports from '../../pages/Reports';
import ReportBuilder from '../../pages/ReportBuilder';
import ReportDetail from '../../pages/ReportDetail';
import DashboardBuilder from '../../pages/DashboardBuilder';
import Dashboards from '../../pages/Dashboards';
import DashboardView from '../../pages/DashboardView';
import ExecutiveDashboards from '../../pages/ExecutiveDashboards';
import ClaimsOnboarding from '../../pages/ClaimsOnboarding';
import AdvancedReportEditor from '../../pages/AdvancedReportEditor';
import AnalyticsShell from '../../pages/analytics/AnalyticsShell';
import AnalyticsOverview from '../../pages/analytics/AnalyticsOverview';
import AnalyticsSchedules from '../../pages/analytics/AnalyticsSchedules';
import AnalyticsSettings from '../../pages/analytics/AnalyticsSettings';
import AnalyticsRedirect from '../../pages/analytics/AnalyticsRedirect';
import { RedirectWithId } from '../../routes/shared';

export function renderAnalyticsRoutes() {
  return (
    <>
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
    </>
  );
}
