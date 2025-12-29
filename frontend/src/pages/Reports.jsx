import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { opportunitiesApi, leadsApi, accountsApi, reportsApi } from '../services/api';
import { formatNumber, formatCurrency as formatCurrencyUtil } from '../utils/formatters';
import {
  GlobalDateRangePicker,
  KPICard,
  BarChartWidget,
  LineChartWidget,
  parseDateRange
} from '../components/reports';
import {
  Target,
  DollarSign,
  Users,
  TrendingUp,
  Building2,
  FileText,
  Plus,
  Star,
  Clock,
  BarChart3,
  ChevronRight,
  Download,
  Filter,
  Calendar,
  PauseCircle,
  LayoutGrid,
} from 'lucide-react';

// Sample data generators for demo (will be replaced by actual API data)
const generateTimeSeriesData = () => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months.map((month, index) => ({
    date: `2025-${String(index + 1).padStart(2, '0')}-01`,
    month,
    count: Math.floor(Math.random() * 50) + 20,
    amount: Math.floor(Math.random() * 500000) + 100000,
  }));
};

export default function Reports() {
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState({ preset: 'THIS_MONTH' });
  const [activeTab, setActiveTab] = useState('dashboard');

  // Fetch opportunity stage counts
  const { data: stageCounts, isLoading: stageLoading } = useQuery({
    queryKey: ['opportunityStageCounts', dateRange],
    queryFn: () => opportunitiesApi.getStageCounts(),
  });

  // Fetch lead counts
  const { data: leadCounts, isLoading: leadLoading } = useQuery({
    queryKey: ['leadCounts', dateRange],
    queryFn: () => leadsApi.getLeadCounts(),
  });

  // Fetch opportunity list for aggregations
  const { data: opportunitiesData, isLoading: oppsLoading } = useQuery({
    queryKey: ['opportunities', 'all', dateRange],
    queryFn: () => opportunitiesApi.getOpportunities({ limit: 1000 }),
  });

  // Fetch accounts for aggregations
  const { data: accountsData } = useQuery({
    queryKey: ['accounts', 'all', dateRange],
    queryFn: () => accountsApi.getAccounts({ limit: 1000 }),
  });

  // Compute KPI metrics from actual data
  const kpiMetrics = useMemo(() => {
    const opps = opportunitiesData?.data || [];
    const totalCount = opps.length;
    const totalAmount = opps.reduce((sum, opp) => sum + (opp.amount || 0), 0);

    // Count by stage
    const closedWon = opps.filter(o => o.stage === 'CLOSED_WON').length;
    const closedLost = opps.filter(o => o.stage === 'CLOSED_LOST').length;
    const openOpps = opps.filter(o => !['CLOSED_WON', 'CLOSED_LOST'].includes(o.stage));
    const onHold = opps.filter(o => o.stage === 'ON_HOLD' || o.status === 'ON_HOLD').length;

    // Balance due (simplified - sum of open opportunity amounts)
    const balanceDue = openOpps.reduce((sum, opp) => sum + (opp.amount || 0), 0);

    // Conversion rate
    const conversionRate = totalCount > 0 ? ((closedWon / (closedWon + closedLost)) * 100) || 0 : 0;

    return {
      totalCount,
      totalAmount,
      balanceDue,
      onHoldCount: onHold,
      closedWon,
      closedLost,
      conversionRate: conversionRate.toFixed(1),
      openCount: openOpps.length,
    };
  }, [opportunitiesData]);

  // Transform stage data for bar chart
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

  // Generate owner/rep chart data from opportunities
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

    return Object.values(byOwner)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [opportunitiesData]);

  // Generate state chart data from accounts
  const stateChartData = useMemo(() => {
    const accts = accountsData?.data || [];
    const byState = {};

    accts.forEach(acct => {
      const state = acct.billingState || acct.shippingState || 'Unknown';
      if (!byState[state]) {
        byState[state] = { name: state, count: 0 };
      }
      byState[state].count += 1;
    });

    return Object.values(byState)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [accountsData]);

  // Time series data (using generated data for now)
  const timeSeriesData = useMemo(() => generateTimeSeriesData(), []);

  // Format currency
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(value || 0);
  };

  // Get display label for current date range
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
      LAST_YEAR: 'Last Year',
      ROLLING_7: 'Rolling 7 Days',
      ROLLING_30: 'Rolling 30 Days',
      ROLLING_90: 'Rolling 90 Days',
      ROLLING_365: 'Rolling 365 Days',
    };
    return labels[dateRange.preset] || dateRange.preset || 'Custom Range';
  };

  const isLoading = stageLoading || leadLoading || oppsLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="text-gray-500">Track performance and business metrics</p>
        </div>
        <div className="flex items-center gap-3">
          <GlobalDateRangePicker
            value={dateRange}
            onChange={setDateRange}
            showComparison={true}
          />
          <button
            onClick={() => navigate('/reports/builder')}
            className="flex items-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90 transition-opacity shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Create Report</span>
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
          { id: 'dashboards', label: 'Dashboards', icon: LayoutGrid, link: '/dashboards' },
          { id: 'saved', label: 'Saved Reports', icon: FileText },
          { id: 'favorites', label: 'Favorites', icon: Star },
        ].map((tab) => {
          const Icon = tab.icon;
          if (tab.link) {
            return (
              <Link
                key={tab.id}
                to={tab.link}
                className="flex items-center space-x-2 px-4 py-2 rounded-lg transition-all text-gray-600 hover:text-gray-900"
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm font-medium">{tab.label}</span>
              </Link>
            );
          }
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-sm font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'dashboard' && (
        <>
          {/* KPI Cards - AccuLynx style */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              title="Pipeline Count"
              value={kpiMetrics.openCount || stageCounts?.open || 0}
              format="number"
              icon={Target}
              iconColor="from-blue-500 to-blue-600"
              loading={isLoading}
              subtitle={getDateRangeLabel()}
            />
            <KPICard
              title="Pipeline Volume"
              value={kpiMetrics.totalAmount || 0}
              format="currency"
              icon={DollarSign}
              iconColor="from-green-500 to-emerald-600"
              loading={isLoading}
              subtitle={getDateRangeLabel()}
            />
            <KPICard
              title="Balance Due"
              value={kpiMetrics.balanceDue || 0}
              format="currency"
              icon={Building2}
              iconColor="from-purple-500 to-purple-600"
              loading={isLoading}
              subtitle={getDateRangeLabel()}
            />
            <KPICard
              title="Jobs on Hold"
              value={kpiMetrics.onHoldCount || 0}
              format="number"
              icon={PauseCircle}
              iconColor="from-orange-500 to-orange-600"
              loading={isLoading}
              subtitle={getDateRangeLabel()}
            />
          </div>

          {/* Charts Grid - Row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pipeline by Status */}
            <BarChartWidget
              data={stageChartData}
              dataKey="count"
              nameKey="name"
              title="Pipeline by Status"
              subtitle={getDateRangeLabel()}
              layout="vertical"
              height={350}
              loading={isLoading}
            />

            {/* Pipeline by Sales Rep */}
            <BarChartWidget
              data={repChartData}
              dataKey="value"
              nameKey="name"
              title="Pipeline by Sales Rep"
              subtitle="Top 10 by volume"
              formatValue={formatCurrency}
              layout="vertical"
              height={350}
              loading={isLoading}
            />
          </div>

          {/* Time Series Chart */}
          <LineChartWidget
            data={timeSeriesData}
            lines={[
              { dataKey: 'count', name: 'Job Count', color: 'primary' },
              { dataKey: 'amount', name: 'Volume ($)', color: 'success' },
            ]}
            xAxisKey="month"
            formatXAxis={(v) => v}
            title="Monthly Trends"
            subtitle="Jobs created and volume over time"
            formatValue={(v) => typeof v === 'number' && v > 1000 ? formatCurrency(v) : v}
            height={300}
            showArea
            loading={isLoading}
          />

          {/* More Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* By State */}
            <BarChartWidget
              data={stateChartData}
              dataKey="count"
              nameKey="name"
              title="Jobs by State"
              height={250}
              loading={isLoading}
            />

            {/* Quick Stats - 2 column span */}
            <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Stats</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'New Leads', value: leadCounts?.NEW || 0, color: 'bg-blue-100 text-blue-700' },
                  { label: 'Closed Won', value: kpiMetrics.closedWon || 0, color: 'bg-green-100 text-green-700' },
                  { label: 'Closed Lost', value: kpiMetrics.closedLost || 0, color: 'bg-red-100 text-red-700' },
                  { label: 'Conversion Rate', value: `${kpiMetrics.conversionRate || 0}%`, color: 'bg-purple-100 text-purple-700', isFormatted: true },
                ].map((stat) => (
                  <div key={stat.label} className="text-center p-4 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
                    <p className="text-2xl font-bold text-gray-900">{stat.isFormatted ? stat.value : formatNumber(stat.value)}</p>
                    <p className="text-xs font-medium text-gray-500 mt-1">{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* Lead Funnel Summary */}
              <div className="mt-6 pt-6 border-t border-gray-100">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Lead Status Breakdown</h4>
                <div className="flex flex-wrap gap-3">
                  {[
                    { label: 'New', value: leadCounts?.NEW || 0, bg: 'bg-blue-500' },
                    { label: 'Contacted', value: leadCounts?.CONTACTED || 0, bg: 'bg-indigo-500' },
                    { label: 'Qualified', value: leadCounts?.QUALIFIED || 0, bg: 'bg-purple-500' },
                    { label: 'Nurturing', value: leadCounts?.NURTURING || 0, bg: 'bg-orange-500' },
                    { label: 'Converted', value: leadCounts?.CONVERTED || 0, bg: 'bg-green-500' },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center space-x-2">
                      <div className={`w-3 h-3 rounded-full ${item.bg}`} />
                      <span className="text-sm text-gray-600">{item.label}:</span>
                      <span className="text-sm font-semibold text-gray-900">{formatNumber(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'saved' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Saved Reports</h2>
            <div className="flex items-center space-x-2">
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <Filter className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>

          {/* Placeholder for saved reports */}
          <div className="divide-y divide-gray-100">
            {[
              { id: '1', name: 'Pipeline Overview', category: 'Sales', lastRun: '2 hours ago' },
              { id: '2', name: 'Monthly Revenue', category: 'Financial', lastRun: 'Yesterday' },
              { id: '3', name: 'Lead Conversion', category: 'Marketing', lastRun: '3 days ago' },
              { id: '4', name: 'Sales Performance', category: 'Sales', lastRun: 'Last week' },
            ].map((report) => (
              <Link
                key={report.id}
                to={`/reports/${report.id}`}
                className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-panda-primary to-panda-secondary flex items-center justify-center">
                    <BarChart3 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">{report.name}</h3>
                    <p className="text-sm text-gray-500">{report.category}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Last run</p>
                    <p className="text-sm text-gray-600">{report.lastRun}</p>
                  </div>
                  <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                    <Download className="w-4 h-4 text-gray-400" />
                  </button>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              </Link>
            ))}
          </div>

          <div className="p-4 border-t border-gray-100 bg-gray-50">
            <button
              onClick={() => navigate('/reports/builder')}
              className="w-full py-2 text-sm text-panda-primary font-medium hover:underline"
            >
              + Create New Report
            </button>
          </div>
        </div>
      )}

      {activeTab === 'favorites' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Star className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-900">No favorite reports yet</h3>
          <p className="text-sm text-gray-500 mt-2">Star reports to add them here for quick access</p>
          <button
            onClick={() => setActiveTab('saved')}
            className="mt-4 px-4 py-2 text-sm text-panda-primary font-medium hover:underline"
          >
            Browse saved reports
          </button>
        </div>
      )}
    </div>
  );
}
