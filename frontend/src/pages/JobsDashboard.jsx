import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { opportunitiesApi } from '../services/api';
import { formatNumber, formatCompact, formatCurrency } from '../utils/formatters';
import {
  Target,
  DollarSign,
  TrendingUp,
  ArrowRight,
  CheckCircle,
  Clock,
  Calendar,
  Briefcase,
  FileText,
  AlertCircle,
  Wrench,
  ClipboardCheck,
  Building2,
  BarChart3,
  PieChart,
} from 'lucide-react';

const stageColors = {
  LEAD_UNASSIGNED: { bg: 'bg-gray-400', text: 'text-gray-400' },
  LEAD_ASSIGNED: { bg: 'bg-blue-400', text: 'text-blue-400' },
  SCHEDULED: { bg: 'bg-indigo-400', text: 'text-indigo-400' },
  INSPECTED: { bg: 'bg-purple-400', text: 'text-purple-400' },
  CLAIM_FILED: { bg: 'bg-pink-400', text: 'text-pink-400' },
  ADJUSTER_MEETING_COMPLETE: { bg: 'bg-violet-400', text: 'text-violet-400' },
  APPROVED: { bg: 'bg-green-400', text: 'text-green-400' },
  CONTRACT_SIGNED: { bg: 'bg-emerald-400', text: 'text-emerald-400' },
  IN_PRODUCTION: { bg: 'bg-yellow-400', text: 'text-yellow-400' },
  COMPLETED: { bg: 'bg-teal-400', text: 'text-teal-400' },
  CLOSED_WON: { bg: 'bg-green-600', text: 'text-green-600' },
  CLOSED_LOST: { bg: 'bg-red-400', text: 'text-red-400' },
};

const stageLabels = {
  LEAD_UNASSIGNED: 'Lead Unassigned',
  LEAD_ASSIGNED: 'Lead Assigned',
  SCHEDULED: 'Scheduled',
  INSPECTED: 'Inspected',
  CLAIM_FILED: 'Claim Filed',
  ADJUSTER_MEETING_COMPLETE: 'Adjuster Meeting Complete',
  APPROVED: 'Approved',
  CONTRACT_SIGNED: 'Contract Signed',
  IN_PRODUCTION: 'In Production',
  COMPLETED: 'Completed',
  CLOSED_WON: 'Closed Won',
  CLOSED_LOST: 'Closed Lost',
};

export default function JobsDashboard() {
  const { user } = useAuth();

  // Fetch stage counts
  const { data: stageCounts } = useQuery({
    queryKey: ['jobStageCounts'],
    queryFn: () => opportunitiesApi.getStageCounts('all'),
  });

  // Fetch job statistics
  const { data: jobStats } = useQuery({
    queryKey: ['jobStats'],
    queryFn: async () => {
      const response = await opportunitiesApi.getOpportunities({ limit: 1000 });
      const jobs = response.data || [];

      const stats = {
        total: jobs.length,
        open: 0,
        won: 0,
        lost: 0,
        mine: 0,
        totalRevenue: 0,
        avgDealSize: 0,
        totalPipeline: 0,
        closingThisMonth: 0,
        inProduction: 0,
        stageBreakdown: {},
      };

      const now = new Date();
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      jobs.forEach(job => {
        // Stage breakdown
        if (job.stage) {
          stats.stageBreakdown[job.stage] = (stats.stageBreakdown[job.stage] || 0) + 1;
        }

        // Count by status
        if (job.stage === 'CLOSED_WON') {
          stats.won++;
          stats.totalRevenue += job.amount || 0;
        } else if (job.stage === 'CLOSED_LOST') {
          stats.lost++;
        } else {
          stats.open++;
          stats.totalPipeline += job.amount || 0;
        }

        // My jobs
        if (job.ownerId === user?.id) {
          stats.mine++;
        }

        // Closing this month
        if (job.closeDate) {
          const closeDate = new Date(job.closeDate);
          if (closeDate >= now && closeDate <= endOfMonth && job.stage !== 'CLOSED_WON' && job.stage !== 'CLOSED_LOST') {
            stats.closingThisMonth++;
          }
        }

        // In production
        if (job.stage === 'IN_PRODUCTION') {
          stats.inProduction++;
        }
      });

      if (stats.won > 0) {
        stats.avgDealSize = stats.totalRevenue / stats.won;
      }

      return stats;
    },
  });

  // Fetch recent jobs
  const { data: recentJobs } = useQuery({
    queryKey: ['recentJobs'],
    queryFn: () => opportunitiesApi.getOpportunities({ limit: 5, sort: 'createdAt', order: 'desc' }),
  });

  // Fetch my jobs
  const { data: myJobs } = useQuery({
    queryKey: ['myJobsDashboard'],
    queryFn: () => opportunitiesApi.getOpportunities({ ownerFilter: 'mine', limit: 5 }),
  });

  // Stats cards
  const stats = [
    {
      label: 'Total Pipeline',
      value: formatCompact(jobStats?.totalPipeline || 0, true),
      icon: DollarSign,
      color: 'from-blue-500 to-blue-600',
      link: '/jobs/list?status=open',
      isFormatted: true,
    },
    {
      label: 'Open Jobs',
      value: stageCounts?.open || jobStats?.open || 0,
      icon: Target,
      color: 'from-green-500 to-green-600',
      link: '/jobs/list?status=open',
    },
    {
      label: 'In Production',
      value: stageCounts?.IN_PRODUCTION?.count || 0,
      icon: Wrench,
      color: 'from-yellow-500 to-yellow-600',
      link: '/jobs/list?stage=IN_PRODUCTION',
    },
    {
      label: 'Closed Won',
      value: stageCounts?.won || jobStats?.won || 0,
      icon: CheckCircle,
      color: 'from-emerald-500 to-emerald-600',
      link: '/jobs/list?stage=CLOSED_WON',
    },
  ];

  // Pipeline stages for funnel - use stageCounts from dedicated API endpoint (more accurate than limit:1000)
  const pipelineStages = [
    { stage: 'LEAD_ASSIGNED', label: 'Lead Assigned', count: stageCounts?.LEAD_ASSIGNED?.count || 0 },
    { stage: 'SCHEDULED', label: 'Scheduled', count: stageCounts?.SCHEDULED?.count || 0 },
    { stage: 'INSPECTED', label: 'Inspected', count: stageCounts?.INSPECTED?.count || 0 },
    { stage: 'CLAIM_FILED', label: 'Claim Filed', count: stageCounts?.CLAIM_FILED?.count || 0 },
    { stage: 'ADJUSTER_MEETING_COMPLETE', label: 'Adjuster Meeting', count: stageCounts?.ADJUSTER_MEETING_COMPLETE?.count || 0 },
    { stage: 'APPROVED', label: 'Approved', count: stageCounts?.APPROVED?.count || 0 },
    { stage: 'CONTRACT_SIGNED', label: 'Contract Signed', count: stageCounts?.CONTRACT_SIGNED?.count || 0 },
    { stage: 'IN_PRODUCTION', label: 'In Production', count: stageCounts?.IN_PRODUCTION?.count || 0 },
  ];

  // Revenue metrics
  const revenueMetrics = [
    { label: 'Total Revenue', value: formatCompact(jobStats?.totalRevenue || 0, true), icon: DollarSign, color: 'text-green-600', bg: 'bg-green-100' },
    { label: 'Avg Deal Size', value: formatCompact(jobStats?.avgDealSize || 0, true), icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-100' },
    { label: 'Win Rate', value: `${jobStats?.total > 0 ? Math.round((jobStats.won / (jobStats.won + jobStats.lost || 1)) * 100) : 0}%`, icon: PieChart, color: 'text-purple-600', bg: 'bg-purple-100' },
    { label: 'Closing This Month', value: formatNumber(jobStats?.closingThisMonth || 0), icon: Calendar, color: 'text-yellow-600', bg: 'bg-yellow-100' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jobs Dashboard</h1>
          <p className="text-gray-500">Track your sales pipeline and job progress</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/jobs/list"
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            View All Jobs
          </Link>
          <Link
            to="/jobs/new"
            className="px-4 py-2 text-sm font-medium text-white bg-panda-primary rounded-lg hover:bg-panda-primary/90 transition-colors"
          >
            + New Job
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link
              key={stat.label}
              to={stat.link}
              className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 card-hover"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stat.isFormatted ? stat.value : formatNumber(stat.value)}</p>
                </div>
                <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Revenue Metrics */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Revenue & Performance</h2>
            <span className="text-sm text-gray-500">All Time</span>
          </div>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {revenueMetrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <div key={metric.label} className="text-center p-4 rounded-lg bg-gray-50">
                  <div className={`w-10 h-10 mx-auto rounded-full ${metric.bg} flex items-center justify-center mb-2`}>
                    <Icon className={`w-5 h-5 ${metric.color}`} />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{metric.value}</p>
                  <p className="text-xs text-gray-500 mt-1">{metric.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipeline Funnel */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Pipeline Stages</h2>
              <Link to="/jobs/list" className="text-panda-primary text-sm hover:underline flex items-center">
                View All <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </div>
          </div>
          <div className="p-5">
            <div className="space-y-4">
              {pipelineStages.map((item) => {
                const maxCount = Math.max(...pipelineStages.map(s => s.count), 1);
                const stageColor = stageColors[item.stage] || { bg: 'bg-gray-400' };
                return (
                  <Link
                    key={item.stage}
                    to={`/jobs/list?stage=${item.stage}`}
                    className="flex items-center group hover:bg-gray-50 p-2 -mx-2 rounded-lg transition-colors"
                  >
                    <div className="w-32 text-sm text-gray-600 group-hover:text-gray-900">{item.label}</div>
                    <div className="flex-1 mx-4">
                      <div className="h-8 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${stageColor.bg} rounded-full transition-all duration-500 flex items-center justify-end pr-2`}
                          style={{
                            width: `${Math.max(10, Math.min(100, (item.count / maxCount) * 100))}%`,
                          }}
                        >
                          {item.count > 0 && (
                            <span className="text-white text-xs font-bold">{formatNumber(item.count)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="w-12 text-right font-semibold text-gray-900">{formatNumber(item.count)}</div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* My Jobs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">My Jobs</h2>
              <span className="bg-blue-100 text-blue-600 text-xs font-bold px-2 py-1 rounded-full">
                {stageCounts?.mine || jobStats?.mine || 0}
              </span>
            </div>
          </div>
          <div className="p-2">
            {(myJobs?.data || []).slice(0, 5).map((job) => {
              const stageColor = stageColors[job.stage] || { bg: 'bg-gray-400' };
              return (
                <Link
                  key={job.id}
                  to={`/jobs/${job.id}`}
                  className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <div className={`w-2 h-2 mt-2 rounded-full ${stageColor.bg}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {job.name}
                    </p>
                    <p className="text-xs text-gray-500">{stageLabels[job.stage] || job.stage}</p>
                  </div>
                  {job.amount > 0 && (
                    <span className="text-xs text-green-600 font-medium">
                      {formatCompact(job.amount, true)}
                    </span>
                  )}
                </Link>
              );
            })}
            {(!myJobs?.data || myJobs.data.length === 0) && (
              <div className="p-4 text-center text-sm text-gray-500">
                No jobs assigned to you
              </div>
            )}
          </div>
          <div className="p-3 border-t border-gray-100">
            <Link
              to="/jobs/list?owner=me"
              className="block text-center text-sm text-panda-primary hover:underline"
            >
              View All My Jobs
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Jobs & Stage Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Jobs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Recent Jobs</h2>
              <Link to="/jobs/list" className="text-panda-primary text-sm hover:underline flex items-center">
                View All <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </div>
          </div>
          <div className="p-2 max-h-80 overflow-y-auto">
            {(recentJobs?.data || []).map((job) => {
              const stageColor = stageColors[job.stage] || { bg: 'bg-gray-400' };
              return (
                <Link
                  key={job.id}
                  to={`/jobs/${job.id}`}
                  className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <div className={`w-8 h-8 rounded-lg ${stageColor.bg} flex items-center justify-center`}>
                    <Target className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {job.name}
                    </p>
                    <div className="flex items-center space-x-2 text-xs text-gray-500">
                      {job.account && (
                        <span className="flex items-center">
                          <Building2 className="w-3 h-3 mr-1" />
                          {job.account.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    {job.amount > 0 && (
                      <p className="text-sm font-medium text-green-600">
                        {formatCurrency(job.amount)}
                      </p>
                    )}
                    <span className="text-xs text-gray-500">
                      {stageLabels[job.stage] || job.stage}
                    </span>
                  </div>
                </Link>
              );
            })}
            {(!recentJobs?.data || recentJobs.data.length === 0) && (
              <div className="p-4 text-center text-sm text-gray-500">
                No recent jobs
              </div>
            )}
          </div>
        </div>

        {/* Stage Health */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Pipeline Health</h2>
              <span className="text-sm text-gray-500">Overview</span>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <Target className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Open Jobs</p>
                  <p className="text-xs text-gray-500">Active opportunities</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-gray-900">{formatNumber(jobStats?.open || 0)}</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Closed Won</p>
                  <p className="text-xs text-gray-500">Successfully completed</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-gray-900">{formatNumber(jobStats?.won || 0)}</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Closed Lost</p>
                  <p className="text-xs text-gray-500">Did not convert</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-gray-900">{formatNumber(jobStats?.lost || 0)}</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                  <Wrench className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">In Production</p>
                  <p className="text-xs text-gray-500">Currently being worked</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-gray-900">{formatNumber(jobStats?.inProduction || 0)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
