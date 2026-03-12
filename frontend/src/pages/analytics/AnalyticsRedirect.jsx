import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function AnalyticsRedirect() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const tab = searchParams.get('tab');
    const reportId = searchParams.get('reportId');
    const dashboardId = searchParams.get('dashboardId');
    const builder = searchParams.get('builder') === '1';
    const view = searchParams.get('view');
    const reportTab = searchParams.get('reportTab');
    const category = searchParams.get('category');

    if (!tab) {
      navigate('/analytics/overview', { replace: true });
      return;
    }

    if (tab === 'reports') {
      if (builder) {
        if (reportId) {
          navigate(`/analytics/reports/${reportId}/edit`, { replace: true });
        } else {
          navigate('/analytics/reports/new', { replace: true });
        }
        return;
      }
      if (reportId) {
        navigate(`/analytics/reports/${reportId}`, { replace: true });
        return;
      }
      const params = new URLSearchParams();
      if (reportTab) params.set('reportTab', reportTab);
      if (category) params.set('category', category);
      const suffix = params.toString();
      navigate(`/analytics/reports${suffix ? `?${suffix}` : ''}`, { replace: true });
      return;
    }

    if (tab === 'dashboards') {
      if (builder) {
        if (dashboardId) {
          navigate(`/analytics/dashboards/${dashboardId}/edit`, { replace: true });
        } else {
          navigate('/analytics/dashboards/new', { replace: true });
        }
        return;
      }
      if (view === 'executive') {
        navigate('/analytics/dashboards/executive', { replace: true });
        return;
      }
      if (view === 'claims-onboarding') {
        navigate('/analytics/dashboards/claims-onboarding', { replace: true });
        return;
      }
      if (dashboardId) {
        navigate(`/analytics/dashboards/${dashboardId}`, { replace: true });
        return;
      }
      navigate('/analytics/dashboards', { replace: true });
      return;
    }

    if (tab === 'ai-insights') {
      navigate('/analytics/settings/ai', { replace: true });
      return;
    }

    if (tab === 'metabase') {
      navigate('/analytics/dashboards?tab=external', { replace: true });
      return;
    }

    if (tab === 'schedules') {
      navigate('/analytics/schedules', { replace: true });
      return;
    }

    navigate('/analytics/overview', { replace: true });
  }, [searchParams, navigate]);

  return null;
}
