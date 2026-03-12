import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '../../services/api';
import ReportRenderer from './ReportRenderer';
import { toAnalyticsDateParams } from '../../utils/analyticsDateRange';

export default function DashboardReportWidget({
  reportId,
  dateRange,
  title,
  subtitle,
  verification,
}) {
  const analyticsDateParams = useMemo(() => toAnalyticsDateParams(dateRange), [dateRange]);

  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ['dashboard-report-definition', reportId],
    queryFn: () => reportsApi.getSavedReport(reportId),
    enabled: Boolean(reportId),
  });

  const { data: payload, isLoading: payloadLoading } = useQuery({
    queryKey: ['dashboard-report-run', reportId, analyticsDateParams],
    queryFn: () => reportsApi.runReport(reportId, analyticsDateParams),
    enabled: Boolean(reportId),
  });

  const emptyStateContext = {
    title: title || report?.name || 'Dashboard report',
    source: 'native',
    verifiedStatus: verification?.status || 'unknown',
    verifiedReason: verification?.reason || 'Verification unavailable.',
  };

  return (
    <ReportRenderer
      report={report || { chartType: 'TABLE', selectedFields: [] }}
      payload={payload}
      loading={reportLoading || payloadLoading}
      title={title || report?.name}
      subtitle={subtitle || report?.description}
      emptyStateContext={emptyStateContext}
    />
  );
}
