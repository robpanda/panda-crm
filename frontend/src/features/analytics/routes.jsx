import { lazy } from 'react';
import { Navigate, Route } from 'react-router-dom';
import { RedirectWithId, renderLazyRoute } from '../../routes/shared';

const Reports = lazy(() => import('../../pages/Reports'));
const ReportBuilder = lazy(() => import('../../pages/ReportBuilder'));
const ReportDetail = lazy(() => import('../../pages/ReportDetail'));
const DashboardBuilder = lazy(() => import('../../pages/DashboardBuilder'));
const Dashboards = lazy(() => import('../../pages/Dashboards'));
const DashboardView = lazy(() => import('../../pages/DashboardView'));
const ExecutiveDashboards = lazy(() => import('../../pages/ExecutiveDashboards'));
const ClaimsOnboarding = lazy(() => import('../../pages/ClaimsOnboarding'));
const AdvancedReportEditor = lazy(() => import('../../pages/AdvancedReportEditor'));
const AnalyticsShell = lazy(() => import('../../pages/analytics/AnalyticsShell'));
const AnalyticsOverview = lazy(() => import('../../pages/analytics/AnalyticsOverview'));
const AnalyticsSchedules = lazy(() => import('../../pages/analytics/AnalyticsSchedules'));
const AnalyticsSettings = lazy(() => import('../../pages/analytics/AnalyticsSettings'));
const AnalyticsRedirect = lazy(() => import('../../pages/analytics/AnalyticsRedirect'));

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

      <Route path="analytics" element={renderLazyRoute(AnalyticsShell, 'Loading analytics...')}>
        <Route index element={renderLazyRoute(AnalyticsRedirect, 'Loading analytics...')} />
        <Route path="overview" element={renderLazyRoute(AnalyticsOverview, 'Loading analytics overview...')} />
        <Route path="reports" element={renderLazyRoute(Reports, 'Loading reports...')} />
        <Route path="reports/new" element={renderLazyRoute(ReportBuilder, 'Loading report builder...')} />
        <Route path="reports/advanced/new" element={renderLazyRoute(AdvancedReportEditor, 'Loading advanced report editor...')} />
        <Route path="reports/advanced/:id" element={renderLazyRoute(AdvancedReportEditor, 'Loading advanced report editor...')} />
        <Route path="reports/:id" element={renderLazyRoute(ReportDetail, 'Loading report details...')} />
        <Route path="reports/:id/edit" element={renderLazyRoute(ReportBuilder, 'Loading report builder...')} />
        <Route path="dashboards" element={renderLazyRoute(Dashboards, 'Loading dashboards...')} />
        <Route path="dashboards/new" element={renderLazyRoute(DashboardBuilder, 'Loading dashboard builder...')} />
        <Route path="dashboards/executive" element={renderLazyRoute(ExecutiveDashboards, 'Loading executive dashboards...')} />
        <Route path="dashboards/claims-onboarding" element={renderLazyRoute(ClaimsOnboarding, 'Loading claims onboarding...')} />
        <Route path="dashboards/:id" element={renderLazyRoute(DashboardView, 'Loading dashboard...')} />
        <Route path="dashboards/:id/edit" element={renderLazyRoute(DashboardBuilder, 'Loading dashboard builder...')} />
        <Route path="schedules" element={renderLazyRoute(AnalyticsSchedules, 'Loading analytics schedules...')} />
        <Route path="settings" element={<Navigate to="/analytics/settings/health" replace />} />
        <Route path="settings/:section" element={renderLazyRoute(AnalyticsSettings, 'Loading analytics settings...')} />
        <Route path="ai" element={<Navigate to="/analytics/settings/ai" replace />} />
        <Route path="health" element={<Navigate to="/analytics/settings/health" replace />} />
        <Route path="metabase" element={<Navigate to="/analytics/settings/metabase" replace />} />
      </Route>
    </>
  );
}
