import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { opportunitiesApi, leadsApi, accountsApi } from '../services/api';
import {
  GlobalDateRangePicker,
  KPICard,
  BarChartWidget,
  LineChartWidget,
  PieChartWidget,
  TableWidget,
  GaugeWidget,
  parseDateRange,
} from '../components/reports';
import {
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  FolderClosed,
  LayoutDashboard,
  Target,
  DollarSign,
  Building2,
  Users,
  TrendingUp,
  PauseCircle,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Briefcase,
  Home,
  RefreshCw,
  Filter,
  MapPin,
  Plus,
  Settings,
  Wrench,
  Calendar,
  AlertOctagon,
  Banknote,
  Timer,
  UserCheck,
  Activity,
  Hammer,
} from 'lucide-react';

// Icon map for dynamic rendering
const iconMap = {
  Target,
  DollarSign,
  Building2,
  Users,
  TrendingUp,
  PauseCircle,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Briefcase,
  Home,
};

// Dashboard-specific configurations with unique layouts
const DASHBOARD_CONFIGS = {
  // Panda Sales Executive Dashboard - Residential Sales Overview
  'panda-sales-executive': {
    title: 'Panda Sales Executive Dashboard',
    description: 'Residential sales overview and performance metrics',
    defaultFilters: { workType: 'Retail' },
    layout: 'sales-executive',
  },
  // Insurance Sales Executive Dashboard
  'insurance-sales-executive': {
    title: 'Insurance Sales Executive Dashboard',
    description: 'Insurance sales metrics and claim tracking',
    defaultFilters: { workType: 'Insurance' },
    layout: 'insurance-executive',
  },
  // Production Executive Dashboard
  'production-executive': {
    title: 'Production Executive Dashboard',
    description: 'Production operations and project tracking',
    defaultFilters: {},
    layout: 'production-executive',
  },
  // Executive Dashboard - Company Wide
  'executive': {
    title: 'Executive Dashboard',
    description: 'Company-wide KPIs and performance',
    defaultFilters: {},
    layout: 'executive',
  },
  // Daily Sales Tracker
  'daily-sales-tracker': {
    title: 'Daily Sales Tracker by State',
    description: 'State-by-state daily sales metrics',
    defaultFilters: {},
    layout: 'daily-tracker',
  },
  // Production Install Pipeline (AccuLynx Style)
  'production-install-pipeline': {
    title: 'Production Install Pipeline',
    description: 'Install pipeline tracking, holds, and completion metrics',
    defaultFilters: {},
    layout: 'production-install-pipeline',
  },
  // Claims Onboarding Dashboard
  'claims-onboarding': {
    title: 'Claims Onboarding Dashboard',
    description: 'New accounts pending onboarding and photo review workflow',
    defaultFilters: { workType: 'Insurance', isPandaClaims: true },
    layout: 'claims-onboarding',
  },
  // Panda Collections Dashboard
  'panda-collections': {
    title: 'Panda Collections Dashboard',
    description: 'Insurance claims collections, AR tracking, and payment status',
    defaultFilters: { workType: 'Insurance' },
    layout: 'panda-collections',
  },
};

// Executive Dashboard folder structure (matches Salesforce)
const DASHBOARD_FOLDERS = [
  // Sales Dashboards
  {
    id: 'sales-dashboards',
    name: 'Sales Dashboards',
    description: 'Daily sales tracking and metrics',
    color: 'from-blue-500 to-blue-600',
    dashboards: [
      { id: 'daily-sales-tracker', name: 'Daily Sales Tracker by State', description: 'State-by-state daily sales metrics' },
    ],
  },
  // Finance & Accounting
  {
    id: 'finance-accounting',
    name: 'Finance & Accounting',
    description: 'Financial reports and AR tracking',
    color: 'from-emerald-500 to-emerald-600',
    dashboards: [
      { id: 'ar-dashboard', name: 'A/R Dashboard', description: 'Accounts receivable tracking' },
      { id: 'streamlined-teams', name: 'Streamlined Teams', description: 'Team financial performance' },
    ],
  },
  // Company Dashboards
  {
    id: 'company-dashboards',
    name: 'Company Dashboards',
    description: 'Organization-wide dashboards',
    color: 'from-violet-500 to-purple-600',
    dashboards: [
      { id: 'executive', name: 'Executive Dashboard', description: 'Company-wide KPIs and metrics' },
      { id: 'daily-office-activity', name: 'Daily Office Activity Tracker', description: 'Office activity metrics' },
      { id: 'panda-collections', name: 'Panda Collections', description: 'Collections tracking' },
      { id: 'marketing', name: 'Marketing', description: 'Marketing performance metrics' },
      { id: 'revenue', name: 'Revenue', description: 'Revenue tracking and forecasting' },
      { id: 'production-executive', name: 'Production Executive Dashboard', description: 'Production and operations metrics' },
      { id: 'cat-sales-executive', name: 'CAT Sales Executive Dashboard', description: 'Catastrophe response sales' },
      { id: 'leadership-dashboard', name: 'Leadership Dashboard', description: 'Leadership team metrics' },
      { id: 'leadership-dashboard-v2', name: 'Leadership Dashboard V2', description: 'Enhanced leadership metrics' },
      { id: 'call-center-live', name: 'Call Center Live', description: 'Real-time call center metrics' },
    ],
  },
  // IT
  {
    id: 'it',
    name: 'IT',
    description: 'Technical and data health dashboards',
    color: 'from-slate-500 to-slate-600',
    dashboards: [
      { id: 'data-health-check', name: 'Data Health Check', description: 'Data quality and integrity metrics' },
    ],
  },
  // Residential Sales
  {
    id: 'residential-sales',
    name: 'Residential Sales',
    description: 'Residential sales team dashboards',
    color: 'from-sky-500 to-sky-600',
    dashboards: [
      { id: 'panda-sales-executive', name: 'Panda Sales Executive Dashboard', description: 'Residential sales overview' },
      { id: 'daily-operations', name: 'Daily Operations', description: 'Daily sales operations metrics' },
    ],
  },
  // Interior Sales
  {
    id: 'interior-sales',
    name: 'Interior Sales',
    description: 'Interior projects dashboards',
    color: 'from-amber-500 to-amber-600',
    dashboards: [
      { id: 'panda-interiors-executive', name: 'Panda Interiors Executive Dashboard', description: 'Interior sales overview' },
    ],
  },
  // Insurance Sales
  {
    id: 'insurance-sales',
    name: 'Insurance Sales',
    description: 'Insurance sales team dashboards',
    color: 'from-teal-500 to-teal-600',
    dashboards: [
      { id: 'insurance-sales-executive', name: 'Insurance Sales Executive Dashboard', description: 'Insurance sales metrics' },
      { id: 'insurance-leader', name: 'Insurance Leader', description: 'Insurance team leadership metrics' },
    ],
  },
  // Business Development
  {
    id: 'business-development',
    name: 'Business Development',
    description: 'BD team performance and metrics',
    color: 'from-indigo-500 to-indigo-600',
    dashboards: [
      { id: 'leaderboards', name: 'Leaderboards', description: 'BD team leaderboards' },
      { id: 'inspection-report', name: 'Inspection Report', description: 'Inspection tracking' },
      { id: 'self-gen-report', name: 'Self-Gen Report', description: 'Self-generated leads report' },
    ],
  },
  // Digital Marketing
  {
    id: 'digital-marketing',
    name: 'Digital Marketing',
    description: 'Marketing and call center dashboards',
    color: 'from-pink-500 to-pink-600',
    dashboards: [
      { id: 'call-center-leader-board', name: 'Call Center Leader Board', description: 'Call center performance rankings' },
      { id: 'dm-dashboard', name: 'DM Dashboard', description: 'Digital marketing metrics' },
      { id: 'department-head', name: 'Department Head', description: 'Department head overview' },
      { id: 'dm-dashboard-v2', name: 'DM Dashboard V2', description: 'Enhanced digital marketing metrics' },
    ],
  },
  // Production
  {
    id: 'production',
    name: 'Production',
    description: 'Production and project management dashboards',
    color: 'from-orange-500 to-orange-600',
    dashboards: [
      { id: 'production-install-pipeline', name: 'Production Install Pipeline', description: 'Install pipeline, holds, and completion tracking' },
      { id: 'regional-project-managers', name: 'Regional Project managers', description: 'Regional PM performance' },
      { id: 'pm-leaderboard', name: 'PM Leaderboard', description: 'Project manager rankings' },
      { id: 'warranty-report', name: 'Warranty Report', description: 'Warranty tracking and metrics' },
      { id: 'specs-sent-report', name: 'Specs Sent Report', description: 'Specifications sent tracking' },
    ],
  },
  // BoostLog Dashboards
  {
    id: 'boostlog',
    name: 'BoostLog Dashboards',
    description: 'Development and support tracking',
    color: 'from-cyan-500 to-cyan-600',
    dashboards: [
      { id: 'user-stories', name: 'User Stories', description: 'User story tracking' },
      { id: 'ticket-monitoring', name: 'Ticket Monitoring', description: 'Support ticket metrics' },
    ],
  },
  // Cash Attack
  {
    id: 'cash-attack',
    name: 'Cash Attack',
    description: 'Cash collection initiatives',
    color: 'from-green-500 to-green-600',
    dashboards: [
      { id: 'cash-attack-main', name: 'Cash Attack', description: 'Cash collection tracking' },
      { id: 'cash-attack-individual', name: 'Cash Attack - Individual', description: 'Individual contributor metrics' },
      { id: 'cash-attack-leaderboard', name: 'Cash Attack Leaderboard', description: 'Collection rankings' },
    ],
  },
  // Call Center
  {
    id: 'call-center',
    name: 'Call Center',
    description: 'Call center operations and performance',
    color: 'from-rose-500 to-rose-600',
    dashboards: [
      { id: 'call-center-operations', name: 'Call Center Operations', description: 'Call center daily operations' },
      { id: 'lead-assignment', name: 'Lead Assignment', description: 'Lead assignment tracking' },
      { id: 'ringcentral-integration', name: 'RingCentral Integration', description: 'RingCentral call metrics' },
    ],
  },
  // Onboarding & Expediting
  {
    id: 'onboarding',
    name: 'Onboarding & Expediting',
    description: 'Job onboarding and expediting metrics',
    color: 'from-lime-500 to-lime-600',
    dashboards: [
      { id: 'onboarding-tracker', name: 'Onboarding Tracker', description: 'Job onboarding status' },
      { id: 'expediting-dashboard', name: 'Expediting Dashboard', description: 'Project expediting metrics' },
    ],
  },
  // Scheduling
  {
    id: 'scheduling',
    name: 'Scheduling',
    description: 'Field service scheduling dashboards',
    color: 'from-fuchsia-500 to-fuchsia-600',
    dashboards: [
      { id: 'scheduling-overview', name: 'Scheduling Overview', description: 'Appointment scheduling metrics' },
      { id: 'crew-utilization', name: 'Crew Utilization', description: 'Crew capacity and utilization' },
      { id: 'install-calendar', name: 'Install Calendar', description: 'Installation schedule view' },
    ],
  },
  // Claims Operations
  {
    id: 'claims-operations',
    name: 'Claims Operations',
    description: 'PandaClaims onboarding, photo review, and project tracking',
    color: 'from-teal-500 to-cyan-600',
    dashboards: [
      { id: 'claims-onboarding', name: 'Claims Onboarding Dashboard', description: 'New accounts pending onboarding and photo review' },
      { id: 'photo-review-queue', name: 'Photo Review Queue', description: 'CompanyCam photo review workflow' },
      { id: 'claims-pipeline', name: 'Claims Pipeline', description: 'Insurance claims tracking and status' },
    ],
  },
  // Commissions
  {
    id: 'commissions',
    name: 'Commissions',
    description: 'Commission tracking and payouts',
    color: 'from-yellow-500 to-yellow-600',
    dashboards: [
      { id: 'commission-summary', name: 'Commission Summary', description: 'Commission overview by period' },
      { id: 'commission-by-rep', name: 'Commission by Rep', description: 'Individual commission tracking' },
      { id: 'pending-commissions', name: 'Pending Commissions', description: 'Commissions awaiting approval' },
    ],
  },
];

// Office/Location filter options
const OFFICE_OPTIONS = [
  { value: 'all', label: 'All Offices' },
  { value: 'MD', label: 'Maryland' },
  { value: 'VA', label: 'Virginia' },
  { value: 'DE', label: 'Delaware' },
  { value: 'NJ', label: 'New Jersey' },
  { value: 'KOP', label: 'King of Prussia' },
  { value: 'NC', label: 'North Carolina' },
  { value: 'TPA', label: 'Tampa' },
  { value: 'CAT', label: 'Catastrophe' },
];

// Work Type filter options
const WORK_TYPE_OPTIONS = [
  { value: 'all', label: 'All Work Types' },
  { value: 'Insurance', label: 'Insurance' },
  { value: 'Retail', label: 'Retail' },
  { value: 'Interior', label: 'Interior' },
];

export default function ExecutiveDashboards() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedDashboardId = searchParams.get('dashboard') || null;
  const [dateRange, setDateRange] = useState({ preset: 'THIS_MONTH' });
  const [selectedOffice, setSelectedOffice] = useState('all');
  const [selectedWorkType, setSelectedWorkType] = useState('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState({});

  const toggleFolder = (folderId) => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderId]: !prev[folderId]
    }));
  };

  // Fetch opportunity stage counts
  const { data: stageCounts, refetch: refetchStages, isError: stageCountsError } = useQuery({
    queryKey: ['opportunityStageCounts', dateRange, selectedOffice, selectedWorkType],
    queryFn: () => opportunitiesApi.getStageCounts(),
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch all opportunities for aggregations (max 1000 per API validation)
  const { data: opportunitiesData, refetch: refetchOpps, isLoading: oppsLoading, isError: oppsError } = useQuery({
    queryKey: ['opportunities', 'all', dateRange, selectedOffice, selectedWorkType],
    queryFn: () => opportunitiesApi.getOpportunities({ limit: 1000 }),
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch leads
  const { data: leadCounts, refetch: refetchLeads, isError: leadsError } = useQuery({
    queryKey: ['leadCounts', dateRange],
    queryFn: () => leadsApi.getLeadCounts(),
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch accounts (max 1000 per API validation)
  const { data: accountsData, refetch: refetchAccounts, isLoading: accountsLoading, isError: accountsError } = useQuery({
    queryKey: ['accounts', 'all', dateRange],
    queryFn: () => accountsApi.getAccounts({ limit: 1000 }),
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Loading state
  const isLoading = oppsLoading || accountsLoading;

  // Filter opportunities based on selected filters
  const filteredOpportunities = useMemo(() => {
    let opps = opportunitiesData?.data || [];

    // Apply date filter
    const { startDate, endDate } = parseDateRange(dateRange);
    if (startDate && endDate) {
      opps = opps.filter(opp => {
        const oppDate = new Date(opp.createdAt || opp.closeDate);
        return oppDate >= startDate && oppDate <= endDate;
      });
    }

    // Apply office filter
    if (selectedOffice !== 'all') {
      opps = opps.filter(opp => opp.office === selectedOffice);
    }

    // Apply work type filter
    if (selectedWorkType !== 'all') {
      opps = opps.filter(opp => opp.workType === selectedWorkType);
    }

    return opps;
  }, [opportunitiesData, dateRange, selectedOffice, selectedWorkType]);

  // Compute metrics from filtered data
  const metrics = useMemo(() => {
    const opps = filteredOpportunities;
    const totalCount = opps.length;
    const totalAmount = opps.reduce((sum, opp) => sum + (opp.amount || 0), 0);
    const closedWon = opps.filter(o => o.stage === 'CLOSED_WON' || o.stage === 'closedWon');
    const closedLost = opps.filter(o => o.stage === 'CLOSED_LOST' || o.stage === 'closedLost');
    const openOpps = opps.filter(o => !['CLOSED_WON', 'CLOSED_LOST', 'closedWon', 'closedLost'].includes(o.stage));
    const onHold = opps.filter(o => o.stage === 'ON_HOLD' || o.status === 'ON_HOLD' || o.status === 'onHold');

    const closedWonAmount = closedWon.reduce((sum, opp) => sum + (opp.amount || 0), 0);
    const closedLostAmount = closedLost.reduce((sum, opp) => sum + (opp.amount || 0), 0);
    const pipelineAmount = openOpps.reduce((sum, opp) => sum + (opp.amount || 0), 0);

    return {
      pipelineCount: openOpps.length,
      pipelineVolume: pipelineAmount,
      totalSold: closedWonAmount,
      soldCount: closedWon.length,
      lostCount: closedLost.length,
      lostAmount: closedLostAmount,
      onHoldCount: onHold.length,
      closedWon: closedWon.length,
      closedLost: closedLost.length,
      totalAmount,
      conversionRate: closedWon.length + closedLost.length > 0
        ? ((closedWon.length / (closedWon.length + closedLost.length)) * 100)
        : 0,
      newLeads: leadCounts?.NEW || 0,
    };
  }, [filteredOpportunities, leadCounts]);

  // Stage distribution data for charts
  const stageChartData = useMemo(() => {
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

    // Count from filtered opportunities
    const stageCounts = {};
    filteredOpportunities.forEach(opp => {
      const stage = opp.stage || 'unknown';
      stageCounts[stage] = (stageCounts[stage] || 0) + 1;
    });

    return Object.entries(stageLabels).map(([key, label]) => ({
      name: label,
      count: stageCounts[key] || 0,
    })).filter(item => item.count > 0);
  }, [filteredOpportunities]);

  // Sales rep performance data
  const repPerformanceData = useMemo(() => {
    const opps = filteredOpportunities;
    const byOwner = {};

    opps.forEach(opp => {
      const ownerName = opp.owner?.name || opp.ownerName || 'Unassigned';
      if (!byOwner[ownerName]) {
        byOwner[ownerName] = { name: ownerName, count: 0, value: 0, won: 0 };
      }
      byOwner[ownerName].count += 1;
      byOwner[ownerName].value += opp.amount || 0;
      if (opp.stage === 'CLOSED_WON' || opp.stage === 'closedWon') {
        byOwner[ownerName].won += 1;
      }
    });

    return Object.values(byOwner)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [filteredOpportunities]);

  // Office breakdown data
  const officeBreakdownData = useMemo(() => {
    const opps = filteredOpportunities;
    const byOffice = {};

    opps.forEach(opp => {
      const office = opp.office || 'Unknown';
      if (!byOffice[office]) {
        byOffice[office] = { name: office, count: 0, value: 0 };
      }
      byOffice[office].count += 1;
      byOffice[office].value += opp.amount || 0;
    });

    return Object.values(byOffice).sort((a, b) => b.value - a.value);
  }, [filteredOpportunities]);

  // Work type breakdown data
  const workTypeBreakdownData = useMemo(() => {
    const opps = filteredOpportunities;
    const byType = {};

    opps.forEach(opp => {
      const type = opp.workType || 'Unknown';
      if (!byType[type]) {
        byType[type] = { name: type, count: 0, value: 0 };
      }
      byType[type].count += 1;
      byType[type].value += opp.amount || 0;
    });

    return Object.values(byType).sort((a, b) => b.value - a.value);
  }, [filteredOpportunities]);

  // Monthly trend data
  const monthlyTrendData = useMemo(() => {
    const opps = filteredOpportunities;
    const byMonth = {};

    opps.forEach(opp => {
      const date = new Date(opp.createdAt || opp.closeDate || new Date());
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!byMonth[monthKey]) {
        byMonth[monthKey] = { month: monthKey, count: 0, amount: 0, won: 0, wonAmount: 0 };
      }
      byMonth[monthKey].count += 1;
      byMonth[monthKey].amount += opp.amount || 0;
      if (opp.stage === 'CLOSED_WON' || opp.stage === 'closedWon') {
        byMonth[monthKey].won += 1;
        byMonth[monthKey].wonAmount += opp.amount || 0;
      }
    });

    return Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));
  }, [filteredOpportunities]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refetchStages(), refetchOpps(), refetchLeads(), refetchAccounts()]);
    setIsRefreshing(false);
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
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

  // Get dashboard config
  const dashboardConfig = DASHBOARD_CONFIGS[selectedDashboardId] || {};

  // Compute lead-specific metrics for Sales Executive Dashboard
  const leadMetrics = useMemo(() => {
    const opps = filteredOpportunities;

    // Leads generated (all unqualified + new leads)
    const leadsGenerated = opps.filter(o =>
      o.stage === 'leadUnassigned' ||
      o.stage === 'leadAssigned' ||
      o.stage === 'LEAD_UNASSIGNED' ||
      o.stage === 'LEAD_ASSIGNED'
    ).length + (leadCounts?.NEW || 0) + (leadCounts?.WORKING || 0);

    // Leads issued (assigned to reps)
    const leadsIssued = opps.filter(o =>
      o.stage === 'leadAssigned' ||
      o.stage === 'LEAD_ASSIGNED' ||
      o.stage === 'scheduled' ||
      o.stage === 'SCHEDULED'
    ).length;

    // Leads run (inspected/demoed)
    const leadsRun = opps.filter(o =>
      o.stage === 'inspected' ||
      o.stage === 'INSPECTED' ||
      o.stage === 'claimFiled' ||
      o.stage === 'CLAIM_FILED' ||
      o.stage === 'adjusterMeetingComplete' ||
      o.stage === 'ADJUSTER_MEETING_COMPLETE'
    ).length;

    // Prospects (in negotiation)
    const prospects = opps.filter(o =>
      o.stage === 'approved' ||
      o.stage === 'APPROVED' ||
      o.stage === 'contractSigned' ||
      o.stage === 'CONTRACT_SIGNED'
    ).length;

    return {
      leadsGenerated,
      leadsIssued,
      leadsRun,
      prospects,
    };
  }, [filteredOpportunities, leadCounts]);

  // Lead source breakdown data
  const leadSourceData = useMemo(() => {
    const opps = filteredOpportunities;
    const bySource = {};

    opps.forEach(opp => {
      const source = opp.leadSource || opp.source || 'Unknown';
      if (!bySource[source]) {
        bySource[source] = { name: source, count: 0, value: 0 };
      }
      bySource[source].count += 1;
      bySource[source].value += opp.amount || 0;
    });

    return Object.values(bySource).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [filteredOpportunities]);

  // Self-gen by rep data
  const selfGenByRepData = useMemo(() => {
    const opps = filteredOpportunities.filter(o =>
      o.leadSource === 'Self-Gen' ||
      o.leadSource === 'SelfGen' ||
      o.isSelfGen === true
    );
    const byRep = {};

    opps.forEach(opp => {
      const repName = opp.owner?.name || opp.ownerName || 'Unassigned';
      if (!byRep[repName]) {
        byRep[repName] = { name: repName, count: 0, value: 0 };
      }
      byRep[repName].count += 1;
      byRep[repName].value += opp.amount || 0;
    });

    return Object.values(byRep).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [filteredOpportunities]);

  // Leads issued by rep
  const leadsIssuedByRepData = useMemo(() => {
    const opps = filteredOpportunities.filter(o =>
      o.stage === 'leadAssigned' ||
      o.stage === 'scheduled' ||
      o.stage === 'LEAD_ASSIGNED' ||
      o.stage === 'SCHEDULED'
    );
    const byRep = {};

    opps.forEach(opp => {
      const repName = opp.owner?.name || opp.ownerName || 'Unassigned';
      if (!byRep[repName]) {
        byRep[repName] = { name: repName, count: 0 };
      }
      byRep[repName].count += 1;
    });

    return Object.values(byRep).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [filteredOpportunities]);

  // Leads run by rep
  const leadsRunByRepData = useMemo(() => {
    const opps = filteredOpportunities.filter(o =>
      o.stage === 'inspected' ||
      o.stage === 'claimFiled' ||
      o.stage === 'INSPECTED' ||
      o.stage === 'CLAIM_FILED' ||
      o.stage === 'adjusterMeetingComplete' ||
      o.stage === 'ADJUSTER_MEETING_COMPLETE'
    );
    const byRep = {};

    opps.forEach(opp => {
      const repName = opp.owner?.name || opp.ownerName || 'Unassigned';
      if (!byRep[repName]) {
        byRep[repName] = { name: repName, count: 0 };
      }
      byRep[repName].count += 1;
    });

    return Object.values(byRep).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [filteredOpportunities]);

  // Volume by rep (sold)
  const volumeByRepData = useMemo(() => {
    const opps = filteredOpportunities.filter(o =>
      o.stage === 'CLOSED_WON' ||
      o.stage === 'closedWon' ||
      o.stage === 'completed'
    );
    const byRep = {};

    opps.forEach(opp => {
      const repName = opp.owner?.name || opp.ownerName || 'Unassigned';
      if (!byRep[repName]) {
        byRep[repName] = { name: repName, count: 0, value: 0 };
      }
      byRep[repName].count += 1;
      byRep[repName].value += opp.amount || 0;
    });

    return Object.values(byRep).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [filteredOpportunities]);

  // Compute collections/AR metrics for Panda Collections Dashboard
  const collectionsMetrics = useMemo(() => {
    const opps = filteredOpportunities;
    const accounts = accountsData?.data || [];

    // Filter for insurance/claims opportunities that are approved or beyond
    const collectionsOpps = opps.filter(o =>
      (o.workType === 'Insurance' || o.isPandaClaims) &&
      ['APPROVED', 'approved', 'CONTRACT_SIGNED', 'contractSigned', 'IN_PRODUCTION', 'inProduction', 'COMPLETED', 'completed', 'CLOSED_WON', 'closedWon'].includes(o.stage)
    );

    // Total RCV (Replacement Cost Value)
    const totalRCV = collectionsOpps.reduce((sum, o) => sum + (parseFloat(o.rcvAmount) || 0), 0);

    // Total ACV (Actual Cash Value)
    const totalACV = collectionsOpps.reduce((sum, o) => sum + (parseFloat(o.acvAmount) || 0), 0);

    // Total Deductible Collected
    const deductibleCollected = collectionsOpps.filter(o => o.deductibleReceived).reduce((sum, o) => sum + (parseFloat(o.deductible) || 0), 0);
    const deductiblePending = collectionsOpps.filter(o => !o.deductibleReceived).reduce((sum, o) => sum + (parseFloat(o.deductible) || 0), 0);

    // Total Invoiced vs Paid
    const totalInvoiced = accounts.reduce((sum, a) => sum + (parseFloat(a.totalInvoiceAmount) || 0), 0);
    const totalPaid = accounts.reduce((sum, a) => sum + (parseFloat(a.totalPaidAmount) || 0), 0);
    const totalBalanceDue = accounts.reduce((sum, a) => sum + (parseFloat(a.balanceDue) || 0), 0);

    // Collected percentage
    const avgCollectedPercent = totalInvoiced > 0 ? (totalPaid / totalInvoiced) * 100 : 0;

    // Down payments
    const downPaymentReceived = collectionsOpps.filter(o => o.downPaymentReceived).length;
    const downPaymentPending = collectionsOpps.filter(o => !o.downPaymentReceived && o.stage !== 'CLOSED_WON').length;

    // Supplements
    const supplementsTotal = collectionsOpps.reduce((sum, o) => sum + (parseFloat(o.supplementsTotal) || 0), 0);
    const jobsWithSupplements = collectionsOpps.filter(o => parseFloat(o.supplementsTotal) > 0).length;

    // Invoice status breakdown
    const invoiceReady = collectionsOpps.filter(o => o.invoiceStatus === 'READY' || o.invoiceStatus === 'ready').length;
    const invoiced = collectionsOpps.filter(o => o.invoiceStatus === 'INVOICED' || o.invoiceStatus === 'invoiced').length;
    const paidInFull = collectionsOpps.filter(o => o.invoiceStatus === 'PAID_IN_FULL' || o.invoiceStatus === 'paidInFull').length;

    // Aging buckets (based on invoice date or close date)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const unpaidOpps = collectionsOpps.filter(o => !o.paidInFull && (parseFloat(o.balanceDue) || parseFloat(o.amount)) > 0);
    const current = unpaidOpps.filter(o => new Date(o.invoicedDate || o.closeDate || o.createdAt) > thirtyDaysAgo);
    const over30 = unpaidOpps.filter(o => {
      const date = new Date(o.invoicedDate || o.closeDate || o.createdAt);
      return date <= thirtyDaysAgo && date > sixtyDaysAgo;
    });
    const over60 = unpaidOpps.filter(o => {
      const date = new Date(o.invoicedDate || o.closeDate || o.createdAt);
      return date <= sixtyDaysAgo && date > ninetyDaysAgo;
    });
    const over90 = unpaidOpps.filter(o => {
      const date = new Date(o.invoicedDate || o.closeDate || o.createdAt);
      return date <= ninetyDaysAgo;
    });

    return {
      totalRCV,
      totalACV,
      deductibleCollected,
      deductiblePending,
      totalInvoiced,
      totalPaid,
      totalBalanceDue,
      avgCollectedPercent,
      downPaymentReceived,
      downPaymentPending,
      supplementsTotal,
      jobsWithSupplements,
      invoiceReady,
      invoiced,
      paidInFull,
      currentCount: current.length,
      currentAmount: current.reduce((sum, o) => sum + (parseFloat(o.balanceDue) || parseFloat(o.amount) || 0), 0),
      over30Count: over30.length,
      over30Amount: over30.reduce((sum, o) => sum + (parseFloat(o.balanceDue) || parseFloat(o.amount) || 0), 0),
      over60Count: over60.length,
      over60Amount: over60.reduce((sum, o) => sum + (parseFloat(o.balanceDue) || parseFloat(o.amount) || 0), 0),
      over90Count: over90.length,
      over90Amount: over90.reduce((sum, o) => sum + (parseFloat(o.balanceDue) || parseFloat(o.amount) || 0), 0),
      totalJobs: collectionsOpps.length,
    };
  }, [filteredOpportunities, accountsData]);

  // Collections by office data
  const collectionsByOfficeData = useMemo(() => {
    const opps = filteredOpportunities.filter(o =>
      (o.workType === 'Insurance' || o.isPandaClaims) &&
      ['APPROVED', 'approved', 'CONTRACT_SIGNED', 'contractSigned', 'IN_PRODUCTION', 'inProduction', 'COMPLETED', 'completed', 'CLOSED_WON', 'closedWon'].includes(o.stage)
    );
    const byOffice = {};

    opps.forEach(opp => {
      const office = opp.office || 'Unknown';
      if (!byOffice[office]) {
        byOffice[office] = { name: office, rcv: 0, collected: 0, balance: 0, count: 0 };
      }
      byOffice[office].rcv += parseFloat(opp.rcvAmount) || 0;
      byOffice[office].collected += parseFloat(opp.totalPaid) || 0;
      byOffice[office].balance += parseFloat(opp.balanceDue) || parseFloat(opp.amount) * 0.3 || 0;
      byOffice[office].count += 1;
    });

    return Object.values(byOffice).sort((a, b) => b.balance - a.balance);
  }, [filteredOpportunities]);

  // Collections aging data for chart
  const collectionsAgingData = useMemo(() => [
    { name: 'Current', count: collectionsMetrics.currentCount, amount: collectionsMetrics.currentAmount },
    { name: '30+ Days', count: collectionsMetrics.over30Count, amount: collectionsMetrics.over30Amount },
    { name: '60+ Days', count: collectionsMetrics.over60Count, amount: collectionsMetrics.over60Amount },
    { name: '90+ Days', count: collectionsMetrics.over90Count, amount: collectionsMetrics.over90Amount },
  ], [collectionsMetrics]);

  // Top accounts by balance due
  const topAccountsByBalance = useMemo(() => {
    const accounts = accountsData?.data || [];
    return accounts
      .filter(a => parseFloat(a.balanceDue) > 0)
      .map(a => ({
        name: a.name,
        balanceDue: parseFloat(a.balanceDue) || 0,
        totalInvoiced: parseFloat(a.totalInvoiceAmount) || 0,
        collectedPercent: parseFloat(a.collectedPercent) || 0,
      }))
      .sort((a, b) => b.balanceDue - a.balanceDue)
      .slice(0, 15);
  }, [accountsData]);

  // Render Panda Collections Dashboard
  const renderPandaCollections = () => (
    <>
      {/* Row 1: Big Number KPIs - AR Overview */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard
          title="Total RCV"
          value={collectionsMetrics.totalRCV}
          format="currency"
          icon={DollarSign}
          iconColor="from-blue-500 to-blue-600"
          subtitle="Replacement Cost Value"
          size="large"
        />
        <KPICard
          title="Total Invoiced"
          value={collectionsMetrics.totalInvoiced}
          format="currency"
          icon={Banknote}
          iconColor="from-indigo-500 to-indigo-600"
          subtitle="Billed to customers"
          size="large"
        />
        <KPICard
          title="Total Collected"
          value={collectionsMetrics.totalPaid}
          format="currency"
          icon={CheckCircle}
          iconColor="from-green-500 to-green-600"
          subtitle={`${collectionsMetrics.avgCollectedPercent.toFixed(1)}% collected`}
          size="large"
        />
        <KPICard
          title="Balance Due"
          value={collectionsMetrics.totalBalanceDue}
          format="currency"
          icon={AlertTriangle}
          iconColor="from-amber-500 to-amber-600"
          subtitle="Outstanding AR"
          size="large"
        />
        <KPICard
          title="Deductibles Pending"
          value={collectionsMetrics.deductiblePending}
          format="currency"
          icon={Clock}
          iconColor="from-orange-500 to-orange-600"
          subtitle="Not yet collected"
          size="large"
        />
        <KPICard
          title="Supplements"
          value={collectionsMetrics.supplementsTotal}
          format="currency"
          icon={TrendingUp}
          iconColor="from-purple-500 to-purple-600"
          subtitle={`${collectionsMetrics.jobsWithSupplements} jobs`}
          size="large"
        />
      </div>

      {/* Row 2: Payment Status & Aging */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BarChartWidget
          data={collectionsAgingData}
          dataKey="amount"
          nameKey="name"
          title="AR Aging by Amount"
          subtitle="Outstanding balances by age"
          formatValue={formatCurrency}
          height={300}
          color="warning"
          showValues
        />
        <BarChartWidget
          data={collectionsAgingData}
          dataKey="count"
          nameKey="name"
          title="AR Aging by Job Count"
          subtitle="Number of jobs by aging bucket"
          height={300}
          color="primary"
          showValues
        />
      </div>

      {/* Row 3: Collections Gauges */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <GaugeWidget
          value={collectionsMetrics.avgCollectedPercent}
          min={0}
          max={100}
          title="Collection Rate"
          format="percent"
          thresholds={{ warning: 80, danger: 60 }}
          size="medium"
        />
        <GaugeWidget
          value={collectionsMetrics.downPaymentReceived}
          min={0}
          max={collectionsMetrics.downPaymentReceived + collectionsMetrics.downPaymentPending + 1}
          title="Down Payments Received"
          format="number"
          thresholds={{ warning: 50, danger: 25 }}
          size="medium"
        />
        <GaugeWidget
          value={collectionsMetrics.paidInFull}
          min={0}
          max={collectionsMetrics.totalJobs || 100}
          title="Jobs Paid in Full"
          format="number"
          thresholds={{ warning: 30, danger: 15 }}
          size="medium"
        />
        <GaugeWidget
          value={collectionsMetrics.over90Count}
          min={0}
          max={Math.max(50, collectionsMetrics.over90Count + 10)}
          title="90+ Days Overdue"
          format="number"
          thresholds={{ warning: 20, danger: 35 }}
          invertThresholds
          size="medium"
        />
      </div>

      {/* Row 4: Collections by Office */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BarChartWidget
          data={collectionsByOfficeData}
          dataKey="balance"
          nameKey="name"
          title="Balance Due by Office"
          subtitle="Outstanding AR by location"
          formatValue={formatCurrency}
          layout="vertical"
          height={350}
          color="danger"
          showValues
        />
        <BarChartWidget
          data={collectionsByOfficeData}
          dataKey="rcv"
          nameKey="name"
          title="RCV by Office"
          subtitle="Total replacement cost value"
          formatValue={formatCurrency}
          layout="vertical"
          height={350}
          color="success"
          showValues
        />
      </div>

      {/* Row 5: Invoice Status Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <PieChartWidget
          data={[
            { name: 'Invoice Ready', value: collectionsMetrics.invoiceReady },
            { name: 'Invoiced', value: collectionsMetrics.invoiced },
            { name: 'Paid in Full', value: collectionsMetrics.paidInFull },
            { name: 'Other', value: collectionsMetrics.totalJobs - collectionsMetrics.invoiceReady - collectionsMetrics.invoiced - collectionsMetrics.paidInFull },
          ].filter(d => d.value > 0)}
          dataKey="value"
          nameKey="name"
          title="Invoice Status Distribution"
          subtitle="Jobs by invoice workflow stage"
          height={280}
          innerRadius={50}
        />
        <PieChartWidget
          data={[
            { name: 'Deductible Collected', value: collectionsMetrics.deductibleCollected },
            { name: 'Deductible Pending', value: collectionsMetrics.deductiblePending },
          ].filter(d => d.value > 0)}
          dataKey="value"
          nameKey="name"
          title="Deductible Collection"
          subtitle="Customer deductible status"
          formatValue={formatCurrency}
          height={280}
          innerRadius={50}
        />
        <PieChartWidget
          data={[
            { name: 'Down Payment Received', value: collectionsMetrics.downPaymentReceived },
            { name: 'Down Payment Pending', value: collectionsMetrics.downPaymentPending },
          ].filter(d => d.value > 0)}
          dataKey="value"
          nameKey="name"
          title="Down Payment Status"
          subtitle="Initial payment collection"
          height={280}
          innerRadius={50}
        />
      </div>

      {/* Row 6: Top Accounts by Balance */}
      <TableWidget
        data={topAccountsByBalance}
        columns={[
          { key: 'name', label: 'Account', width: '40%' },
          { key: 'balanceDue', label: 'Balance Due', format: 'currency', width: '25%' },
          { key: 'totalInvoiced', label: 'Total Invoiced', format: 'currency', width: '20%' },
          { key: 'collectedPercent', label: 'Collected %', format: 'percent', width: '15%' },
        ]}
        title="🔴 Top Accounts by Outstanding Balance"
        subtitle="Highest AR balances requiring attention"
        pageSize={15}
      />
    </>
  );

  // Render Panda Sales Executive Dashboard - Matches Salesforce Layout
  const renderPandaSalesExecutive = () => (
    <>
      {/* Row 1: Key Metrics - 6 Big Number KPI Cards (Salesforce Style) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard
          title="Total Leads Generated"
          value={leadMetrics.leadsGenerated}
          format="number"
          icon={Users}
          iconColor="from-blue-500 to-blue-600"
          subtitle={getDateRangeLabel()}
          size="large"
        />
        <KPICard
          title="Leads Issued"
          value={leadMetrics.leadsIssued}
          format="number"
          icon={UserCheck}
          iconColor="from-indigo-500 to-indigo-600"
          subtitle={getDateRangeLabel()}
          size="large"
        />
        <KPICard
          title="Total Leads Run"
          value={leadMetrics.leadsRun}
          format="number"
          icon={Activity}
          iconColor="from-cyan-500 to-cyan-600"
          subtitle={getDateRangeLabel()}
          size="large"
        />
        <KPICard
          title="Total Prospects"
          value={leadMetrics.prospects}
          format="number"
          icon={Target}
          iconColor="from-purple-500 to-purple-600"
          subtitle={getDateRangeLabel()}
          size="large"
        />
        <KPICard
          title="Total Sold"
          value={metrics.soldCount}
          format="number"
          icon={CheckCircle}
          iconColor="from-green-500 to-green-600"
          subtitle={getDateRangeLabel()}
          size="large"
        />
        <KPICard
          title="Total Volume"
          value={metrics.totalSold}
          format="currency"
          icon={DollarSign}
          iconColor="from-emerald-500 to-emerald-600"
          subtitle={getDateRangeLabel()}
          size="large"
        />
      </div>

      {/* Row 2: Donut Charts - 6 columns matching Salesforce */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <PieChartWidget
          data={leadSourceData}
          dataKey="count"
          nameKey="name"
          title="Leads by Source"
          height={200}
          innerRadius={40}
          showLegend={false}
        />
        <PieChartWidget
          data={leadsIssuedByRepData.slice(0, 5)}
          dataKey="count"
          nameKey="name"
          title="Leads Issued"
          height={200}
          innerRadius={40}
          showLegend={false}
        />
        <PieChartWidget
          data={leadsRunByRepData.slice(0, 5)}
          dataKey="count"
          nameKey="name"
          title="Leads Run"
          height={200}
          innerRadius={40}
          showLegend={false}
        />
        <PieChartWidget
          data={stageChartData.filter(s => ['Approved', 'Contract Signed'].includes(s.name))}
          dataKey="count"
          nameKey="name"
          title="Prospect Results"
          height={200}
          innerRadius={40}
          showLegend={false}
        />
        <PieChartWidget
          data={workTypeBreakdownData}
          dataKey="count"
          nameKey="name"
          title="Sold by Work Type"
          height={200}
          innerRadius={40}
          showLegend={false}
        />
        <PieChartWidget
          data={workTypeBreakdownData}
          dataKey="value"
          nameKey="name"
          title="Volume by Type"
          formatValue={formatCurrency}
          height={200}
          innerRadius={40}
          showLegend={false}
        />
      </div>

      {/* Row 3: Rep Performance Tables - 6 columns matching Salesforce */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <TableWidget
          data={selfGenByRepData}
          columns={[
            { key: 'name', label: 'Rep' },
            { key: 'count', label: '#', format: 'number' },
          ]}
          title="Self Gens by Rep"
          pageSize={8}
          compact
          showPagination={false}
        />
        <TableWidget
          data={leadsIssuedByRepData}
          columns={[
            { key: 'name', label: 'Rep' },
            { key: 'count', label: '#', format: 'number' },
          ]}
          title="Leads Issued by Rep"
          pageSize={8}
          compact
          showPagination={false}
        />
        <TableWidget
          data={leadsRunByRepData}
          columns={[
            { key: 'name', label: 'Rep' },
            { key: 'count', label: '#', format: 'number' },
          ]}
          title="Leads Run by Rep"
          pageSize={8}
          compact
          showPagination={false}
        />
        <TableWidget
          data={repPerformanceData.filter(r => r.won > 0 || r.count > 0).map(r => ({
            name: r.name,
            count: r.count - r.won // prospects = total - won
          }))}
          columns={[
            { key: 'name', label: 'Rep' },
            { key: 'count', label: '#', format: 'number' },
          ]}
          title="Prospects by Rep"
          pageSize={8}
          compact
          showPagination={false}
        />
        <TableWidget
          data={volumeByRepData.map(r => ({ name: r.name, count: r.count }))}
          columns={[
            { key: 'name', label: 'Rep' },
            { key: 'count', label: '#', format: 'number' },
          ]}
          title="Sold by Rep"
          pageSize={8}
          compact
          showPagination={false}
        />
        <TableWidget
          data={volumeByRepData}
          columns={[
            { key: 'name', label: 'Rep' },
            { key: 'value', label: '$', format: 'currency' },
          ]}
          title="Volume by Rep"
          pageSize={8}
          compact
          showPagination={false}
        />
      </div>

      {/* Row 4: Additional Breakdown Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BarChartWidget
          data={officeBreakdownData}
          dataKey="value"
          nameKey="name"
          title="Revenue by Office"
          subtitle={`Residential Sales - ${getDateRangeLabel()}`}
          formatValue={formatCurrency}
          height={300}
          showValues
        />
        <BarChartWidget
          data={stageChartData}
          dataKey="count"
          nameKey="name"
          title="Pipeline by Stage"
          subtitle="Current opportunity distribution"
          layout="vertical"
          height={300}
        />
      </div>

      {/* Row 5: Monthly Trends */}
      <LineChartWidget
        data={monthlyTrendData}
        lines={[
          { dataKey: 'wonAmount', name: 'Revenue', color: 'success' },
          { dataKey: 'count', name: 'Jobs', color: 'primary' },
        ]}
        xAxisKey="month"
        title="Monthly Revenue Trend"
        subtitle="Revenue and job count over time"
        formatValue={(v) => typeof v === 'number' && v > 1000 ? formatCurrency(v) : v}
        height={280}
        showArea
      />
    </>
  );

  // Compute additional metrics for Production Install Pipeline
  const productionMetrics = useMemo(() => {
    const opps = filteredOpportunities;

    // Approved pipeline (jobs ready for install)
    const approved = opps.filter(o =>
      o.stage === 'approved' ||
      o.stage === 'APPROVED' ||
      o.stage === 'contractSigned' ||
      o.stage === 'inProduction'
    );
    const approvedCount = approved.length;
    const approvedVolume = approved.reduce((sum, o) => sum + (o.amount || 0), 0);

    // Balance due (unpaid amounts on approved/in-progress jobs)
    const balanceDue = approved.reduce((sum, o) => sum + (o.balanceDue || o.amount * 0.7 || 0), 0);

    // Jobs on hold
    const onHold = opps.filter(o =>
      o.status === 'ON_HOLD' ||
      o.status === 'onHold' ||
      o.stage === 'ON_HOLD'
    );
    const holdCount = onHold.length;
    const holdVolume = onHold.reduce((sum, o) => sum + (o.amount || 0), 0);

    // Jobs untouched in 7 days (no activity)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const untouched = approved.filter(o => {
      const lastActivity = new Date(o.lastActivityDate || o.updatedAt || o.createdAt);
      return lastActivity < sevenDaysAgo;
    });

    // Jobs over 60 days
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const over60Days = approved.filter(o => {
      const created = new Date(o.createdAt);
      return created < sixtyDaysAgo;
    });

    // Completed jobs (this month)
    const completedJobs = opps.filter(o =>
      o.stage === 'completed' ||
      o.stage === 'COMPLETED' ||
      o.stage === 'CLOSED_WON'
    );

    return {
      approvedCount,
      approvedVolume,
      balanceDue,
      holdCount,
      holdVolume,
      untouchedCount: untouched.length,
      over60DaysCount: over60Days.length,
      completedCount: completedJobs.length,
      completedVolume: completedJobs.reduce((sum, o) => sum + (o.amount || 0), 0),
    };
  }, [filteredOpportunities]);

  // Pipeline by status data for Production Install
  const pipelineByStatusData = useMemo(() => {
    const opps = filteredOpportunities;
    const statusLabels = {
      approved: 'Approved',
      contractSigned: 'Contract Signed',
      inProduction: 'In Production',
      scheduled: 'Scheduled',
      materialOrdered: 'Material Ordered',
      readyToInstall: 'Ready to Install',
      installing: 'Installing',
      completed: 'Completed',
    };

    const statusCounts = {};
    const statusVolumes = {};

    opps.forEach(opp => {
      const stage = opp.stage || 'unknown';
      if (statusLabels[stage]) {
        statusCounts[stage] = (statusCounts[stage] || 0) + 1;
        statusVolumes[stage] = (statusVolumes[stage] || 0) + (opp.amount || 0);
      }
    });

    return Object.entries(statusLabels).map(([key, label]) => ({
      name: label,
      count: statusCounts[key] || 0,
      volume: statusVolumes[key] || 0,
    })).filter(item => item.count > 0 || item.volume > 0);
  }, [filteredOpportunities]);

  // Hold jobs by rep data
  const holdByRepData = useMemo(() => {
    const opps = filteredOpportunities.filter(o =>
      o.status === 'ON_HOLD' || o.status === 'onHold' || o.stage === 'ON_HOLD'
    );
    const byRep = {};

    opps.forEach(opp => {
      const repName = opp.projectManager?.name || opp.owner?.name || opp.ownerName || 'Unassigned';
      if (!byRep[repName]) {
        byRep[repName] = { name: repName, count: 0, volume: 0 };
      }
      byRep[repName].count += 1;
      byRep[repName].volume += opp.amount || 0;
    });

    return Object.values(byRep).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [filteredOpportunities]);

  // Monthly jobs completed data
  const monthlyCompletedData = useMemo(() => {
    const opps = filteredOpportunities.filter(o =>
      o.stage === 'completed' || o.stage === 'COMPLETED' || o.stage === 'CLOSED_WON'
    );
    const byMonth = {};

    opps.forEach(opp => {
      const date = new Date(opp.closeDate || opp.completedDate || opp.updatedAt || new Date());
      const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      if (!byMonth[monthKey]) {
        byMonth[monthKey] = { month: monthKey, count: 0, volume: 0 };
      }
      byMonth[monthKey].count += 1;
      byMonth[monthKey].volume += opp.amount || 0;
    });

    return Object.values(byMonth).slice(-6); // Last 6 months
  }, [filteredOpportunities]);

  // Available to install by status
  const availableToInstallData = useMemo(() => {
    const statuses = [
      { name: 'Ready to Install', stage: 'readyToInstall' },
      { name: 'Material Ordered', stage: 'materialOrdered' },
      { name: 'Permit Approved', stage: 'permitApproved' },
      { name: 'Contract Signed', stage: 'contractSigned' },
      { name: 'Scheduled', stage: 'scheduled' },
    ];

    return statuses.map(s => ({
      name: s.name,
      count: filteredOpportunities.filter(o => o.stage === s.stage).length,
    })).filter(item => item.count > 0);
  }, [filteredOpportunities]);

  // Render Production Install Pipeline Dashboard (AccuLynx Style)
  const renderProductionInstallPipeline = () => (
    <>
      {/* Row 1: Big Number KPIs - Pipeline Overview */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard
          title="Approved Pipeline"
          value={productionMetrics.approvedCount}
          format="number"
          icon={CheckCircle}
          iconColor="from-green-500 to-green-600"
          subtitle="Jobs ready for install"
          size="large"
        />
        <KPICard
          title="Total Volume"
          value={productionMetrics.approvedVolume}
          format="currency"
          icon={DollarSign}
          iconColor="from-blue-500 to-blue-600"
          subtitle="Pipeline value"
          size="large"
        />
        <KPICard
          title="Balance Due"
          value={productionMetrics.balanceDue}
          format="currency"
          icon={Banknote}
          iconColor="from-amber-500 to-amber-600"
          subtitle="Unpaid balance"
          size="large"
        />
        <KPICard
          title="Jobs On Hold"
          value={productionMetrics.holdCount}
          format="number"
          icon={PauseCircle}
          iconColor="from-red-500 to-red-600"
          subtitle="Blocked jobs"
          size="large"
        />
        <KPICard
          title="Hold Volume"
          value={productionMetrics.holdVolume}
          format="currency"
          icon={AlertOctagon}
          iconColor="from-orange-500 to-orange-600"
          subtitle="Revenue at risk"
          size="large"
        />
        <KPICard
          title="Untouched 7 Days"
          value={productionMetrics.untouchedCount}
          format="number"
          icon={Timer}
          iconColor="from-purple-500 to-purple-600"
          subtitle="Needs attention"
          size="large"
        />
      </div>

      {/* Row 2: Pipeline by Status (Count and Volume) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BarChartWidget
          data={pipelineByStatusData}
          dataKey="count"
          nameKey="name"
          title="Pipeline Job Count by Status"
          subtitle="Number of jobs at each stage"
          layout="vertical"
          height={350}
          color="primary"
          showValues
        />
        <BarChartWidget
          data={pipelineByStatusData}
          dataKey="volume"
          nameKey="name"
          title="Pipeline Volume by Status"
          subtitle="Revenue at each stage"
          formatValue={formatCurrency}
          layout="vertical"
          height={350}
          color="success"
          showValues
        />
      </div>

      {/* Row 3: Monthly Completion Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BarChartWidget
          data={monthlyCompletedData}
          dataKey="count"
          nameKey="month"
          title="Monthly Jobs Completed"
          subtitle="Count of completed installations"
          height={280}
          color="info"
          showValues
        />
        <BarChartWidget
          data={monthlyCompletedData}
          dataKey="volume"
          nameKey="month"
          title="Monthly Completed Volume"
          subtitle="Revenue from completed jobs"
          formatValue={formatCurrency}
          height={280}
          color="success"
          showValues
        />
      </div>

      {/* Row 4: Hold Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BarChartWidget
          data={holdByRepData}
          dataKey="count"
          nameKey="name"
          title="Hold Jobs by Rep"
          subtitle="Jobs on hold by project manager"
          layout="vertical"
          height={320}
          color="danger"
          showValues
        />
        <BarChartWidget
          data={holdByRepData}
          dataKey="volume"
          nameKey="name"
          title="Hold Volume by Rep"
          subtitle="Revenue at risk by project manager"
          formatValue={formatCurrency}
          layout="vertical"
          height={320}
          color="warning"
          showValues
        />
      </div>

      {/* Row 5: Additional Metrics & Aging */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <BarChartWidget
          data={availableToInstallData}
          dataKey="count"
          nameKey="name"
          title="Available to Install"
          subtitle="Jobs by readiness status"
          layout="vertical"
          height={280}
          color="primary"
          showValues
        />
        <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4">
          <GaugeWidget
            value={productionMetrics.approvedCount}
            min={0}
            max={Math.max(400, productionMetrics.approvedCount + 50)}
            title="Pipeline"
            format="number"
            thresholds={{ warning: 200, danger: 100 }}
            size="small"
          />
          <GaugeWidget
            value={productionMetrics.holdCount}
            min={0}
            max={Math.max(100, productionMetrics.holdCount + 20)}
            title="On Hold"
            format="number"
            thresholds={{ warning: 50, danger: 75 }}
            invertThresholds
            size="small"
          />
          <GaugeWidget
            value={productionMetrics.over60DaysCount}
            min={0}
            max={Math.max(50, productionMetrics.over60DaysCount + 10)}
            title="Over 60 Days"
            format="number"
            thresholds={{ warning: 20, danger: 35 }}
            invertThresholds
            size="small"
          />
          <GaugeWidget
            value={productionMetrics.completedCount}
            min={0}
            max={Math.max(100, productionMetrics.completedCount + 20)}
            title="Completed"
            format="number"
            thresholds={{ warning: 30, danger: 15 }}
            size="small"
          />
        </div>
      </div>

      {/* Row 6: Detailed Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TableWidget
          data={holdByRepData}
          columns={[
            { key: 'name', label: 'Project Manager', width: '40%' },
            { key: 'count', label: 'Hold Jobs', format: 'number', width: '25%' },
            { key: 'volume', label: 'Hold Volume', format: 'currency', width: '35%' },
          ]}
          title="🚫 Jobs On Hold by Rep"
          subtitle="Project managers with blocked jobs"
          pageSize={10}
          compact
        />
        <TableWidget
          data={pipelineByStatusData}
          columns={[
            { key: 'name', label: 'Status', width: '40%' },
            { key: 'count', label: 'Job Count', format: 'number', width: '25%' },
            { key: 'volume', label: 'Volume', format: 'currency', width: '35%' },
          ]}
          title="📊 Pipeline Summary by Status"
          subtitle="Current pipeline distribution"
          pageSize={10}
          compact
        />
      </div>
    </>
  );

  // Render default/generic dashboard layout
  const renderDefaultDashboard = () => (
    <>
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Sold"
          value={metrics.totalSold}
          format="currency"
          icon={DollarSign}
          iconColor="from-green-500 to-emerald-600"
          subtitle={`${metrics.soldCount} jobs - ${getDateRangeLabel()}`}
        />
        <KPICard
          title="Pipeline Volume"
          value={metrics.pipelineVolume}
          format="currency"
          icon={TrendingUp}
          iconColor="from-blue-500 to-blue-600"
          subtitle={`${metrics.pipelineCount} open jobs`}
        />
        <KPICard
          title="Conversion Rate"
          value={metrics.conversionRate}
          format="percent"
          icon={Target}
          iconColor="from-purple-500 to-purple-600"
          subtitle={`${metrics.closedWon} won / ${metrics.closedLost} lost`}
        />
        <KPICard
          title="Jobs On Hold"
          value={metrics.onHoldCount}
          format="number"
          icon={PauseCircle}
          iconColor="from-orange-500 to-orange-600"
          subtitle={getDateRangeLabel()}
        />
      </div>

      {/* Charts */}
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
          data={repPerformanceData}
          dataKey="value"
          nameKey="name"
          title="Pipeline by Sales Rep"
          subtitle="Top 10 by volume"
          formatValue={formatCurrency}
          layout="vertical"
          height={350}
        />
      </div>

      {/* Pie Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PieChartWidget
          data={officeBreakdownData}
          dataKey="value"
          nameKey="name"
          title="Revenue by Office"
          subtitle={getDateRangeLabel()}
          formatValue={formatCurrency}
          height={300}
          innerRadius={50}
        />
        <PieChartWidget
          data={workTypeBreakdownData}
          dataKey="value"
          nameKey="name"
          title="Revenue by Work Type"
          subtitle={getDateRangeLabel()}
          formatValue={formatCurrency}
          height={300}
          innerRadius={50}
        />
      </div>

      {/* Monthly Trends */}
      <LineChartWidget
        data={monthlyTrendData}
        lines={[
          { dataKey: 'count', name: 'Job Count', color: 'primary' },
          { dataKey: 'wonAmount', name: 'Won Revenue ($)', color: 'success' },
        ]}
        xAxisKey="month"
        title="Monthly Trends"
        subtitle="Jobs and revenue over time"
        formatValue={(v) => typeof v === 'number' && v > 1000 ? formatCurrency(v) : v}
        height={300}
        showArea
      />

      {/* Table */}
      <TableWidget
        data={repPerformanceData}
        columns={[
          { key: 'name', label: 'Sales Rep' },
          { key: 'count', label: 'Total Jobs', format: 'number' },
          { key: 'value', label: 'Pipeline Value', format: 'currency' },
          { key: 'won', label: 'Won', format: 'number' },
        ]}
        title="Sales Rep Performance"
        subtitle="Top performers by pipeline value"
        pageSize={10}
      />
    </>
  );

  // Main render function that switches based on dashboard type
  const renderDashboardContent = () => {
    const layout = dashboardConfig.layout || 'default';

    switch (layout) {
      case 'sales-executive':
        return renderPandaSalesExecutive();
      case 'insurance-executive':
        // TODO: Implement insurance-specific layout
        return renderDefaultDashboard();
      case 'production-executive':
        // TODO: Implement production-specific layout
        return renderDefaultDashboard();
      case 'production-install-pipeline':
        return renderProductionInstallPipeline();
      case 'panda-collections':
        return renderPandaCollections();
      case 'daily-tracker':
        // TODO: Implement daily tracker layout
        return renderDefaultDashboard();
      default:
        return renderDefaultDashboard();
    }
  };

  // If no dashboard selected, show folder list
  if (!selectedDashboardId) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Executive Dashboards</h1>
            <p className="text-gray-500">Select a dashboard to view</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/dashboards/custom"
              className="flex items-center space-x-2 px-4 py-2.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700"
            >
              <Settings className="w-4 h-4" />
              <span>Custom Dashboards</span>
            </Link>
            <Link
              to="/dashboards/builder"
              className="flex items-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90 transition-opacity shadow-md"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Create Dashboard</span>
            </Link>
          </div>
        </div>

        {/* Folder List */}
        <div className="space-y-3">
          {DASHBOARD_FOLDERS.map((folder) => {
            const isExpanded = expandedFolders[folder.id] || false;
            return (
              <div key={folder.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Folder Header - Clickable */}
                <button
                  onClick={() => toggleFolder(folder.id)}
                  className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${folder.color} flex items-center justify-center shadow-sm`}>
                      {isExpanded ? (
                        <FolderOpen className="w-5 h-5 text-white" />
                      ) : (
                        <FolderClosed className="w-5 h-5 text-white" />
                      )}
                    </div>
                    <div className="text-left">
                      <h2 className="font-semibold text-gray-900">{folder.name}</h2>
                      <p className="text-sm text-gray-500">{folder.dashboards.length} dashboard{folder.dashboards.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 text-xs font-medium rounded-full bg-gradient-to-r ${folder.color} text-white`}>
                      {folder.dashboards.length}
                    </span>
                    <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {/* Collapsible Dashboard List */}
                <div className={`transition-all duration-200 ease-in-out ${isExpanded ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {folder.dashboards.map((dashboard) => (
                      <button
                        key={dashboard.id}
                        onClick={() => setSearchParams({ dashboard: dashboard.id })}
                        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <LayoutDashboard className="w-5 h-5 text-gray-400" />
                          <div>
                            <p className="font-medium text-gray-900">{dashboard.name}</p>
                            <p className="text-sm text-gray-500">{dashboard.description}</p>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Find selected dashboard
  const selectedDashboard = DASHBOARD_FOLDERS
    .flatMap(f => f.dashboards)
    .find(d => d.id === selectedDashboardId);

  // Render the selected dashboard
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-4">
          <button
            onClick={() => setSearchParams({})}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors mt-0.5"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {selectedDashboard?.name || 'Executive Dashboard'}
            </h1>
            <p className="text-gray-500 mt-1">
              {selectedDashboard?.description || 'View key metrics and performance'}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <GlobalDateRangePicker
            value={dateRange}
            onChange={setDateRange}
            showComparison={false}
          />

          {/* Office Filter */}
          <div className="relative">
            <select
              value={selectedOffice}
              onChange={(e) => setSelectedOffice(e.target.value)}
              className="appearance-none pl-10 pr-8 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:border-gray-300 focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none cursor-pointer"
            >
              {OFFICE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          </div>

          {/* Work Type Filter */}
          <div className="relative">
            <select
              value={selectedWorkType}
              onChange={(e) => setSelectedWorkType(e.target.value)}
              className="appearance-none pl-10 pr-8 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:border-gray-300 focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none cursor-pointer"
            >
              {WORK_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          </div>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2.5 hover:bg-gray-100 rounded-lg transition-colors"
            title="Refresh data"
          >
            <RefreshCw className={`w-4 h-4 text-gray-600 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3 text-gray-500">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>Loading dashboard data...</span>
          </div>
        </div>
      )}

      {/* Dashboard Content */}
      {!isLoading && renderDashboardContent()}
    </div>
  );
}
