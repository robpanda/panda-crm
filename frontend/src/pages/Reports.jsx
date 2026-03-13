import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Calendar,
  Copy,
  FileText,
  Pencil,
  Play,
  Plus,
  Search,
  Star,
  Trash2,
  LayoutTemplate,
  Users,
} from 'lucide-react';
import { reportsApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import DataSourceBadge from '../components/analytics/DataSourceBadge';
import {
  REPORT_TEMPLATES,
  buildDuplicateReportPayload,
  formatReportTimestamp,
  getModuleMetadata,
  getReportBaseModule,
  getReportCreatedByLabel,
  getReportTablesUsed,
  normalizeReportConfig,
} from '../utils/reporting';
import { deriveDataSource } from '../utils/analyticsSource';

const REPORT_TABS = [
  { id: 'my', label: 'My Reports', icon: FileText },
  { id: 'shared', label: 'Shared Reports', icon: Users },
  { id: 'favorites', label: 'Favorites', icon: Star },
  { id: 'templates', label: 'Templates', icon: LayoutTemplate },
];

function ReportActionButton({ icon: Icon, label, onClick, disabled = false, tone = 'default' }) {
  const toneClasses = {
    default: 'border-gray-200 text-gray-700 hover:bg-gray-50',
    primary: 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100',
    danger: 'border-rose-200 text-rose-700 hover:bg-rose-50',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${toneClasses[tone]}`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function SavedReportCard({
  report,
  isOwner,
  onRun,
  onEdit,
  onSchedule,
  onDuplicate,
  onDelete,
  onToggleFavorite,
}) {
  const moduleMetadata = getModuleMetadata(getReportBaseModule(report));
  const tablesUsed = getReportTablesUsed(report);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h3 className="truncate text-lg font-semibold text-gray-900">{report.name}</h3>
            {report.isPublic && (
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                Shared
              </span>
            )}
          </div>
          {report.description && (
            <p className="mt-2 text-sm text-gray-500">{report.description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onToggleFavorite}
          className={`rounded-lg p-2 transition-colors ${
            report.isFavorite ? 'text-amber-500 hover:bg-amber-50' : 'text-gray-300 hover:bg-gray-50 hover:text-amber-500'
          }`}
          title={report.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Star className="h-5 w-5" fill={report.isFavorite ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 text-sm text-gray-600 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Data source</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <DataSourceBadge source={deriveDataSource(report)} />
            <span>{moduleMetadata.label}</span>
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Tables used</div>
          <div className="mt-2 text-gray-900">{tablesUsed.join(', ') || moduleMetadata.table}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Last run</div>
          <div className="mt-2 text-gray-900">{formatReportTimestamp(report.lastRunAt)}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Created by</div>
          <div className="mt-2 text-gray-900">{getReportCreatedByLabel(report)}</div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <ReportActionButton icon={Play} label="Run" onClick={onRun} tone="primary" />
        <ReportActionButton icon={Pencil} label="Edit" onClick={onEdit} disabled={!isOwner} />
        <ReportActionButton icon={Calendar} label="Schedule" onClick={onSchedule} />
        <ReportActionButton icon={Copy} label="Duplicate" onClick={onDuplicate} />
        <ReportActionButton icon={Trash2} label="Delete" onClick={onDelete} disabled={!isOwner} tone="danger" />
      </div>
    </div>
  );
}

function TemplateCard({ template, onCreate }) {
  const moduleMetadata = getModuleMetadata(template.report.baseModule);
  const tablesUsed = getReportTablesUsed(template.report);

  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-5">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600">
          <LayoutTemplate className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{template.name}</h3>
          <p className="text-sm text-gray-500">{template.description}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 text-sm text-gray-600 md:grid-cols-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Data source</div>
          <div className="mt-2 flex items-center gap-2">
            <DataSourceBadge source="native" />
            <span>{moduleMetadata.label}</span>
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Tables used</div>
          <div className="mt-2 text-gray-900">{tablesUsed.join(', ') || moduleMetadata.table}</div>
        </div>
      </div>

      <div className="mt-5">
        <ReportActionButton icon={Plus} label="Create from Template" onClick={onCreate} tone="primary" />
      </div>
    </div>
  );
}

function EmptyLibraryState({ title, description, actionLabel, onAction }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center">
      <FileText className="mx-auto h-12 w-12 text-gray-300" />
      <h3 className="mt-4 text-lg font-semibold text-gray-900">{title}</h3>
      <p className="mt-2 text-sm text-gray-500">{description}</p>
      {onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export default function Reports({ embedded = false }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = searchParams.get('tab') || searchParams.get('reportTab') || 'my';
  const tabAliases = {
    saved: 'my',
    dashboard: 'my',
    dashboards: 'shared',
  };
  const normalizedTab = tabAliases[initialTab] || initialTab;
  const activeTab = REPORT_TABS.some((tab) => tab.id === normalizedTab) ? normalizedTab : 'my';
  const searchQuery = searchParams.get('q') || '';

  const { data: savedReportsResponse, isLoading } = useQuery({
    queryKey: ['saved-reports', 'library'],
    queryFn: () => reportsApi.getSavedReports({ limit: 200 }),
  });

  const rawSavedReports = Array.isArray(savedReportsResponse)
    ? savedReportsResponse
    : savedReportsResponse?.data?.reports || savedReportsResponse?.data || [];
  const savedReports = rawSavedReports.map((report) => normalizeReportConfig(report));

  const filteredReports = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return savedReports
      .filter((report) => {
        const isOwner = report.createdById === user?.id;
        const isShared = !isOwner && (report.isPublic || report.sharedWithRoles?.length > 0);
        const isFavorite = Boolean(report.isFavorite);

        if (activeTab === 'my') return isOwner;
        if (activeTab === 'shared') return isShared;
        if (activeTab === 'favorites') return isFavorite;
        return true;
      })
      .filter((report) => {
        if (!normalizedSearch) return true;

        return [
          report.name,
          report.description,
          getReportCreatedByLabel(report),
          getReportTablesUsed(report).join(' '),
          getModuleMetadata(getReportBaseModule(report)).label,
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch);
      });
  }, [activeTab, savedReports, searchQuery, user?.id]);

  const updateSearchParams = (updates) => {
    const nextParams = new URLSearchParams(searchParams);

    Object.entries(updates).forEach(([key, value]) => {
      if (!value) {
        nextParams.delete(key);
      } else {
        nextParams.set(key, value);
      }
    });

    setSearchParams(nextParams, { replace: true });
  };

  const handleDuplicate = async (report) => {
    try {
      await reportsApi.createReport(buildDuplicateReportPayload(report));
      await queryClient.invalidateQueries({ queryKey: ['saved-reports'] });
    } catch (error) {
      console.error('Failed to duplicate report:', error);
    }
  };

  const handleDelete = async (report) => {
    if (!window.confirm(`Delete "${report.name}"?`)) return;

    try {
      await reportsApi.deleteReport(report.id);
      await queryClient.invalidateQueries({ queryKey: ['saved-reports'] });
    } catch (error) {
      console.error('Failed to delete report:', error);
    }
  };

  const handleToggleFavorite = async (reportId) => {
    try {
      await reportsApi.toggleFavorite(reportId);
      await queryClient.invalidateQueries({ queryKey: ['saved-reports'] });
      await queryClient.invalidateQueries({ queryKey: ['saved-report', reportId] });
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  return (
    <div className="space-y-6">
      {!embedded && (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Report Library</h1>
            <p className="text-gray-500">
              Create, run, and organize saved reports from one place.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/analytics/reports/new')}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            New Report
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap gap-2">
          {REPORT_TABS.map((tab) => {
            const Icon = tab.icon;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => updateSearchParams({ tab: tab.id, reportTab: null })}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:text-gray-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab !== 'templates' && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => updateSearchParams({ q: event.target.value || null })}
              placeholder="Search reports..."
              className="w-full rounded-xl border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-500">Loading reports...</div>
      ) : activeTab === 'templates' ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {REPORT_TEMPLATES.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onCreate={() => navigate(`/analytics/reports/new?template=${template.id}`)}
            />
          ))}
        </div>
      ) : filteredReports.length === 0 ? (
        <EmptyLibraryState
          title={activeTab === 'favorites' ? 'No favorite reports yet' : 'No reports found'}
          description={
            activeTab === 'shared'
              ? 'Shared reports from your team will appear here.'
              : activeTab === 'favorites'
              ? 'Star any report to keep it close at hand.'
              : searchQuery
              ? 'Try a different search or clear your filters.'
              : 'Create your first saved report to build your library.'
          }
          actionLabel="New Report"
          onAction={activeTab === 'my' ? () => navigate('/analytics/reports/new') : null}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredReports.map((report) => {
            const isOwner = report.createdById === user?.id;

            return (
              <SavedReportCard
                key={report.id}
                report={report}
                isOwner={isOwner}
                onRun={() => navigate(`/analytics/reports/${report.id}?run=1`)}
                onEdit={() => navigate(`/analytics/reports/${report.id}/edit`)}
                onSchedule={() => navigate(`/analytics/schedules?reportId=${report.id}`)}
                onDuplicate={() => handleDuplicate(report)}
                onDelete={() => handleDelete(report)}
                onToggleFavorite={() => handleToggleFavorite(report.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
