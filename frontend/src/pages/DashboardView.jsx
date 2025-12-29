import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { reportsApi, opportunitiesApi, leadsApi, accountsApi } from '../services/api';
import {
  GlobalDateRangePicker,
  KPICard,
  BarChartWidget,
  LineChartWidget,
} from '../components/reports';
import {
  ArrowLeft,
  Edit,
  Share2,
  MoreVertical,
  Maximize2,
  RefreshCw,
  Download,
  Star,
  Clock,
  Target,
  DollarSign,
  Building2,
  Users,
  TrendingUp,
  PauseCircle,
} from 'lucide-react';

// Map icon names to components
const iconMap = {
  Target,
  DollarSign,
  Building2,
  Users,
  TrendingUp,
  PauseCircle,
};

export default function DashboardView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState({ preset: 'THIS_MONTH' });
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch dashboard with widgets
  const { data: dashboardData, isLoading: dashboardLoading, refetch } = useQuery({
    queryKey: ['dashboard', id],
    queryFn: () => reportsApi.getDashboard(id),
    enabled: !!id,
  });

  // Fetch opportunity stage counts for widgets
  const { data: stageCounts } = useQuery({
    queryKey: ['opportunityStageCounts', dateRange],
    queryFn: () => opportunitiesApi.getStageCounts(),
  });

  // Fetch opportunities for aggregations
  const { data: opportunitiesData } = useQuery({
    queryKey: ['opportunities', 'all', dateRange],
    queryFn: () => opportunitiesApi.getOpportunities({ limit: 1000 }),
  });

  // Fetch leads
  const { data: leadCounts } = useQuery({
    queryKey: ['leadCounts', dateRange],
    queryFn: () => leadsApi.getLeadCounts(),
  });

  // Fetch accounts
  const { data: accountsData } = useQuery({
    queryKey: ['accounts', 'all', dateRange],
    queryFn: () => accountsApi.getAccounts({ limit: 1000 }),
  });

  const dashboard = dashboardData?.data;

  // Compute metrics from data
  const metrics = useMemo(() => {
    const opps = opportunitiesData?.data || [];
    const totalCount = opps.length;
    const totalAmount = opps.reduce((sum, opp) => sum + (opp.amount || 0), 0);
    const closedWon = opps.filter(o => o.stage === 'CLOSED_WON').length;
    const closedLost = opps.filter(o => o.stage === 'CLOSED_LOST').length;
    const openOpps = opps.filter(o => !['CLOSED_WON', 'CLOSED_LOST'].includes(o.stage));
    const onHold = opps.filter(o => o.stage === 'ON_HOLD' || o.status === 'ON_HOLD').length;
    const balanceDue = openOpps.reduce((sum, opp) => sum + (opp.amount || 0), 0);

    return {
      pipelineCount: openOpps.length,
      pipelineVolume: totalAmount,
      balanceDue,
      onHoldCount: onHold,
      closedWon,
      closedLost,
      newLeads: leadCounts?.NEW || 0,
    };
  }, [opportunitiesData, leadCounts]);

  // Stage chart data
  const stageChartData = useMemo(() => {
    if (!stageCounts) return [];
    const stageLabels = {
      leadUnassigned: 'Lead Unassigned',
      leadAssigned: 'Lead Assigned',
      scheduled: 'Scheduled',
      inspected: 'Inspected',
      claimFiled: 'Claim Filed',
      approved: 'Approved',
      contractSigned: 'Contract Signed',
      inProduction: 'In Production',
      completed: 'Completed',
    };
    return Object.entries(stageLabels).map(([key, label]) => ({
      name: label,
      count: stageCounts[key] || 0,
    })).filter(item => item.count > 0);
  }, [stageCounts]);

  // Rep chart data
  const repChartData = useMemo(() => {
    const opps = opportunitiesData?.data || [];
    const byOwner = {};
    opps.forEach(opp => {
      const ownerName = opp.owner?.name || 'Unassigned';
      if (!byOwner[ownerName]) {
        byOwner[ownerName] = { name: ownerName, count: 0, value: 0 };
      }
      byOwner[ownerName].count += 1;
      byOwner[ownerName].value += opp.amount || 0;
    });
    return Object.values(byOwner).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [opportunitiesData]);

  // Time series data (sample)
  const timeSeriesData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months.map((month, index) => ({
      month,
      count: Math.floor(Math.random() * 50) + 20,
      amount: Math.floor(Math.random() * 500000) + 100000,
    }));
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(value || 0);
  };

  const getDateRangeLabel = () => {
    const labels = {
      ALL_DATA: 'All Data',
      TODAY: 'Today',
      YESTERDAY: 'Yesterday',
      THIS_WEEK: 'This Week',
      LAST_WEEK: 'Last Week',
      THIS_MONTH: 'This Month',
      LAST_MONTH: 'Last Month',
      THIS_YEAR: 'This Year',
    };
    return labels[dateRange.preset] || 'Custom Range';
  };

  // Render widget based on type
  const renderWidget = (widget) => {
    const IconComponent = iconMap[widget.iconName] || Target;

    switch (widget.widgetType) {
      case 'KPI_CARD':
        let value = 0;
        if (widget.dataSource === 'pipeline') {
          if (widget.metricField === 'count') value = metrics.pipelineCount;
          if (widget.metricField === 'amount') value = metrics.pipelineVolume;
        } else if (widget.dataSource === 'revenue') {
          value = metrics.pipelineVolume;
        } else if (widget.dataSource === 'leads') {
          value = metrics.newLeads;
        }

        return (
          <KPICard
            key={widget.id}
            title={widget.title}
            value={value}
            format={widget.formatType || 'number'}
            icon={IconComponent}
            iconColor={widget.iconColor || 'from-blue-500 to-blue-600'}
            subtitle={widget.subtitle || getDateRangeLabel()}
          />
        );

      case 'BAR_CHART':
        const barData = widget.dataSource === 'pipeline' ? stageChartData : repChartData;
        return (
          <BarChartWidget
            key={widget.id}
            data={barData}
            dataKey={widget.metricField || 'count'}
            nameKey="name"
            title={widget.title}
            subtitle={widget.subtitle}
            layout="vertical"
            height={350}
          />
        );

      case 'LINE_CHART':
        return (
          <LineChartWidget
            key={widget.id}
            data={timeSeriesData}
            lines={[
              { dataKey: 'count', name: 'Job Count', color: 'primary' },
              { dataKey: 'amount', name: 'Volume ($)', color: 'success' },
            ]}
            xAxisKey="month"
            title={widget.title}
            subtitle={widget.subtitle}
            height={300}
            showArea
          />
        );

      default:
        return (
          <div key={widget.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-2">{widget.title}</h3>
            <p className="text-sm text-gray-500">Widget type: {widget.widgetType}</p>
          </div>
        );
    }
  };

  if (dashboardLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-panda-primary"></div>
      </div>
    );
  }

  // Default dashboard if no custom one
  const displayDashboard = dashboard || {
    id: 'default',
    name: 'Sales Overview',
    description: 'Track pipeline, revenue, and team performance',
    columns: 4,
    widgets: [],
  };

  const hasWidgets = displayDashboard.widgets?.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-4">
          <button
            onClick={() => navigate('/dashboards')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors mt-0.5"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{displayDashboard.name}</h1>
              {displayDashboard.isDefault && (
                <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                  Default
                </span>
              )}
            </div>
            {displayDashboard.description && (
              <p className="text-gray-500 mt-1">{displayDashboard.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <GlobalDateRangePicker
            value={dateRange}
            onChange={setDateRange}
            showComparison={false}
          />
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2.5 hover:bg-gray-100 rounded-lg transition-colors"
            title="Refresh data"
          >
            <RefreshCw className={`w-4 h-4 text-gray-600 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => navigate(`/dashboards/builder/${displayDashboard.id}`)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
          >
            <Edit className="w-4 h-4" />
            Edit
          </button>
        </div>
      </div>

      {/* Dashboard Content */}
      {hasWidgets ? (
        <div
          className="grid gap-6"
          style={{
            gridTemplateColumns: `repeat(${displayDashboard.columns || 4}, 1fr)`
          }}
        >
          {displayDashboard.widgets.map((widget) => (
            <div
              key={widget.id}
              style={{
                gridColumn: `span ${Math.min(widget.width || 1, displayDashboard.columns || 4)}`,
              }}
            >
              {renderWidget(widget)}
            </div>
          ))}
        </div>
      ) : (
        /* Default Dashboard Layout when no custom widgets */
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              title="Pipeline Count"
              value={metrics.pipelineCount}
              format="number"
              icon={Target}
              iconColor="from-blue-500 to-blue-600"
              subtitle={getDateRangeLabel()}
            />
            <KPICard
              title="Pipeline Volume"
              value={metrics.pipelineVolume}
              format="currency"
              icon={DollarSign}
              iconColor="from-green-500 to-emerald-600"
              subtitle={getDateRangeLabel()}
            />
            <KPICard
              title="Balance Due"
              value={metrics.balanceDue}
              format="currency"
              icon={Building2}
              iconColor="from-purple-500 to-purple-600"
              subtitle={getDateRangeLabel()}
            />
            <KPICard
              title="Jobs on Hold"
              value={metrics.onHoldCount}
              format="number"
              icon={PauseCircle}
              iconColor="from-orange-500 to-orange-600"
              subtitle={getDateRangeLabel()}
            />
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <BarChartWidget
              data={stageChartData}
              dataKey="count"
              nameKey="name"
              title="Pipeline by Status"
              subtitle={getDateRangeLabel()}
              layout="vertical"
              height={350}
            />
            <BarChartWidget
              data={repChartData}
              dataKey="value"
              nameKey="name"
              title="Pipeline by Sales Rep"
              subtitle="Top 10 by volume"
              formatValue={formatCurrency}
              layout="vertical"
              height={350}
            />
          </div>

          {/* Time Series */}
          <LineChartWidget
            data={timeSeriesData}
            lines={[
              { dataKey: 'count', name: 'Job Count', color: 'primary' },
              { dataKey: 'amount', name: 'Volume ($)', color: 'success' },
            ]}
            xAxisKey="month"
            title="Monthly Trends"
            subtitle="Jobs created and volume over time"
            formatValue={(v) => typeof v === 'number' && v > 1000 ? formatCurrency(v) : v}
            height={300}
            showArea
          />

          {/* Quick Stats */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Stats</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'New Leads', value: metrics.newLeads },
                { label: 'Closed Won', value: metrics.closedWon },
                { label: 'Closed Lost', value: metrics.closedLost },
                { label: 'Conversion Rate', value: `${metrics.closedWon + metrics.closedLost > 0 ? ((metrics.closedWon / (metrics.closedWon + metrics.closedLost)) * 100).toFixed(1) : 0}%` },
              ].map((stat) => (
                <div key={stat.label} className="text-center p-4 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                  <p className="text-xs font-medium text-gray-500 mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
