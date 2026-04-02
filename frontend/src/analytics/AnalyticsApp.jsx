import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from '../components/Layout';
import RequireAuthenticatedRoute from '../platform/RequireAuthenticatedRoute';
import AnalyticsShell from '../pages/analytics/AnalyticsShell';
import AnalyticsOverview from '../pages/analytics/AnalyticsOverview';
import AnalyticsSchedules from '../pages/analytics/AnalyticsSchedules';
import AnalyticsSettings from '../pages/analytics/AnalyticsSettings';
import AnalyticsRedirect from '../pages/analytics/AnalyticsRedirect';
import Reports from '../pages/Reports';
import ReportBuilder from '../pages/ReportBuilder';
import ReportDetail from '../pages/ReportDetail';
import AdvancedReportEditor from '../pages/AdvancedReportEditor';
import Dashboards from '../pages/Dashboards';
import DashboardView from '../pages/DashboardView';
import DashboardBuilder from '../pages/DashboardBuilder';
import ExecutiveDashboards from '../pages/ExecutiveDashboards';
import ClaimsOnboarding from '../pages/ClaimsOnboarding';
import Login from '../pages/Login';

export default function AnalyticsApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<RequireAuthenticatedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/analytics/overview" replace />} />
            <Route path="/analytics" element={<AnalyticsShell />}>
              <Route index element={<AnalyticsRedirect />} />
              <Route path="overview" element={<AnalyticsOverview />} />
              <Route path="reports" element={<Reports />} />
              <Route path="reports/new" element={<ReportBuilder />} />
              <Route path="reports/advanced/new" element={<AdvancedReportEditor />} />
              <Route path="reports/advanced/:id" element={<AdvancedReportEditor />} />
              <Route path="reports/:id/edit" element={<ReportBuilder />} />
              <Route path="reports/:id" element={<ReportDetail />} />
              <Route path="dashboards" element={<Dashboards />} />
              <Route path="dashboards/new" element={<DashboardBuilder />} />
              <Route path="dashboards/executive" element={<ExecutiveDashboards />} />
              <Route path="dashboards/claims-onboarding" element={<ClaimsOnboarding />} />
              <Route path="dashboards/:id/edit" element={<DashboardBuilder />} />
              <Route path="dashboards/:id" element={<DashboardView />} />
              <Route path="schedules" element={<AnalyticsSchedules />} />
              <Route path="settings" element={<Navigate to="/analytics/settings/health" replace />} />
              <Route path="settings/:section" element={<AnalyticsSettings />} />
              <Route path="ai" element={<Navigate to="/analytics/settings/ai" replace />} />
              <Route path="health" element={<Navigate to="/analytics/settings/health" replace />} />
              <Route path="metabase" element={<Navigate to="/analytics/settings/metabase" replace />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/analytics/overview" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
