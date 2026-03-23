import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  ExternalLink,
  FileSpreadsheet,
  Filter,
  MessageSquare,
  RefreshCw,
  Search,
} from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { callCenterImportsApi } from '../../services/api';

const REVIEW_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'OPEN', label: 'Open' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'IGNORED', label: 'Ignored' },
];

const REVIEW_WARNING_OPTIONS = [
  'OWNER_UNRESOLVED',
  'LEAD_SETTER_UNRESOLVED',
  'OWNER_LOW_CONFIDENCE',
  'LEAD_SETTER_LOW_CONFIDENCE',
  'OWNER_SPLIT_CREDIT_UNRESOLVED',
  'AMBIGUOUS_NAME',
  'AMBIGUOUS_PHONE',
  'AMBIGUOUS_EMAIL',
  'OWNER_INACTIVE_USER',
  'LEAD_SETTER_INACTIVE_USER',
];

const STATUS_STYLES = {
  OPEN: 'bg-amber-100 text-amber-800',
  RESOLVED: 'bg-green-100 text-green-800',
  IGNORED: 'bg-gray-100 text-gray-700',
};

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function prettyJson(value) {
  if (!value) return '{}';
  return JSON.stringify(value, null, 2);
}

function RecordLink({ href, label }) {
  if (!href || !label) return <span className="text-gray-400">-</span>;
  return (
    <Link to={href} className="inline-flex items-center gap-1 text-sm font-medium text-panda-primary hover:underline">
      {label}
      <ExternalLink className="h-3.5 w-3.5" />
    </Link>
  );
}

export default function CallCenterImportReview() {
  const [selectedRunId, setSelectedRunId] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('OPEN');
  const [selectedWarningCode, setSelectedWarningCode] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [resolutionNote, setResolutionNote] = useState('');

  const queryClient = useQueryClient();

  const runsQuery = useQuery({
    queryKey: ['callCenterImportReviewRuns'],
    queryFn: () => callCenterImportsApi.getReviewRuns({ limit: 50 }),
  });

  const itemsQuery = useQuery({
    queryKey: ['callCenterImportReviewItems', selectedRunId, selectedStatus, selectedWarningCode, searchTerm],
    queryFn: () => callCenterImportsApi.getReviewItems({
      runId: selectedRunId || undefined,
      status: selectedStatus || undefined,
      warningCode: selectedWarningCode || undefined,
      search: searchTerm || undefined,
      limit: 200,
    }),
  });

  const detailQuery = useQuery({
    queryKey: ['callCenterImportReviewItem', selectedItemId],
    queryFn: () => callCenterImportsApi.getReviewItem(selectedItemId),
    enabled: Boolean(selectedItemId),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status, note }) => callCenterImportsApi.updateReviewItem(id, {
      status,
      resolutionNote: note,
    }),
    onSuccess: (response) => {
      const updated = response?.data || null;
      setResolutionNote(updated?.resolutionNote || '');
      queryClient.invalidateQueries({ queryKey: ['callCenterImportReviewRuns'] });
      queryClient.invalidateQueries({ queryKey: ['callCenterImportReviewItems'] });
      queryClient.invalidateQueries({ queryKey: ['callCenterImportReviewItem', selectedItemId] });
    },
  });

  const runs = runsQuery.data?.data || [];
  const items = itemsQuery.data?.data || [];
  const selectedItem = detailQuery.data?.data || null;

  useEffect(() => {
    if (!items.length) {
      setSelectedItemId(null);
      return;
    }
    if (!selectedItemId || !items.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(items[0].id);
    }
  }, [items, selectedItemId]);

  useEffect(() => {
    setResolutionNote(selectedItem?.resolutionNote || '');
  }, [selectedItem?.id, selectedItem?.resolutionNote]);

  const stats = useMemo(() => {
    return {
      totalItems: items.length,
      openItems: items.filter((item) => item.status === 'OPEN').length,
      resolvedItems: items.filter((item) => item.status === 'RESOLVED').length,
      ignoredItems: items.filter((item) => item.status === 'IGNORED').length,
    };
  }, [items]);

  const handleStatusUpdate = (status) => {
    if (!selectedItemId) return;
    updateMutation.mutate({
      id: selectedItemId,
      status,
      note: resolutionNote,
    });
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-panda-primary/10 px-3 py-1 text-xs font-medium text-panda-primary">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Post-import manual review
            </div>
            <h1 className="mt-3 text-2xl font-bold text-gray-900">Call Center Import Review Queue</h1>
            <p className="mt-1 text-sm text-gray-500">
              Review rows that were imported with unresolved, low-confidence, ambiguous, or inactive-user warnings.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ['callCenterImportReviewRuns'] });
                queryClient.invalidateQueries({ queryKey: ['callCenterImportReviewItems'] });
                if (selectedItemId) {
                  queryClient.invalidateQueries({ queryKey: ['callCenterImportReviewItem', selectedItemId] });
                }
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <Link
              to="/admin/call-center"
              className="inline-flex items-center gap-2 rounded-lg bg-panda-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              <MessageSquare className="h-4 w-4" />
              Back to Call Center
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <StatCard label="Visible items" value={stats.totalItems} />
          <StatCard label="Open" value={stats.openItems} tone="warning" />
          <StatCard label="Resolved" value={stats.resolvedItems} tone="success" />
          <StatCard label="Ignored" value={stats.ignoredItems} />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search customer, email, phone..."
                className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-transparent focus:ring-2 focus:ring-panda-primary"
              />
            </div>

            <select
              value={selectedRunId}
              onChange={(event) => setSelectedRunId(event.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-panda-primary"
            >
              <option value="">All runs</option>
              {runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.workbookFileName} · {formatDateTime(run.executedAt)}
                </option>
              ))}
            </select>

            <select
              value={selectedStatus}
              onChange={(event) => setSelectedStatus(event.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-panda-primary"
            >
              {REVIEW_STATUS_OPTIONS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              value={selectedWarningCode}
              onChange={(event) => setSelectedWarningCode(event.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-panda-primary"
            >
              <option value="">All warning codes</option>
              {REVIEW_WARNING_OPTIONS.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Review items</h2>
                <p className="text-sm text-gray-500">Rows imported with warnings that still need human follow-up.</p>
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                {items.length} shown
              </span>
            </div>

            {itemsQuery.isLoading ? (
              <div className="flex items-center justify-center py-20">
                <RefreshCw className="h-6 w-6 animate-spin text-panda-primary" />
              </div>
            ) : !items.length ? (
              <div className="px-5 py-12 text-center">
                <Filter className="mx-auto h-8 w-8 text-gray-300" />
                <h3 className="mt-3 text-sm font-semibold text-gray-900">No review items found</h3>
                <p className="mt-1 text-sm text-gray-500">Change the filters or wait for the next import run.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedItemId(item.id)}
                    className={`w-full px-5 py-4 text-left transition-colors hover:bg-gray-50 ${selectedItemId === item.id ? 'bg-panda-primary/5' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">{item.customerName || 'Unnamed row'}</span>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[item.status] || STATUS_STYLES.OPEN}`}>
                            {item.status}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                          <span>{item.phone || 'No phone'}</span>
                          <span>{item.email || 'No email'}</span>
                          <span>{item.sourceSheet} row {item.sourceRowNumber}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {item.warningCodes.map((code) => (
                            <span key={code} className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                              {code}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="text-right text-xs text-gray-400">
                        <div>{formatDateTime(item.run?.executedAt)}</div>
                        <div>{item.run?.workbookFileName}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Review detail</h2>
              <p className="text-sm text-gray-500">Inspect warning context, CRM ids, and mark resolution status.</p>
            </div>

            {detailQuery.isLoading ? (
              <div className="flex items-center justify-center py-20">
                <RefreshCw className="h-6 w-6 animate-spin text-panda-primary" />
              </div>
            ) : !selectedItem ? (
              <div className="px-5 py-12 text-center">
                <Circle className="mx-auto h-8 w-8 text-gray-300" />
                <h3 className="mt-3 text-sm font-semibold text-gray-900">Select a review item</h3>
                <p className="mt-1 text-sm text-gray-500">Choose an item from the queue to inspect its details.</p>
              </div>
            ) : (
              <div className="space-y-5 p-5">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-gray-900">{selectedItem.customerName || 'Unnamed row'}</h3>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[selectedItem.status] || STATUS_STYLES.OPEN}`}>
                      {selectedItem.status}
                    </span>
                  </div>
                  <div className="grid gap-2 text-sm text-gray-600 sm:grid-cols-2">
                    <DetailRow label="Workbook" value={selectedItem.run?.workbookFileName || '-'} />
                    <DetailRow label="Imported at" value={formatDateTime(selectedItem.run?.executedAt)} />
                    <DetailRow label="Phone" value={selectedItem.phone || '-'} />
                    <DetailRow label="Email" value={selectedItem.email || '-'} />
                    <DetailRow label="State" value={selectedItem.state || '-'} />
                    <DetailRow label="Disposition" value={selectedItem.normalizedDisposition || '-'} />
                    <DetailRow label="Source row" value={`${selectedItem.sourceSheet} row ${selectedItem.sourceRowNumber}`} />
                    <DetailRow label="Resolved at" value={formatDateTime(selectedItem.resolvedAt)} />
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-900">Warnings</p>
                  <div className="mt-2 space-y-2">
                    {selectedItem.warningCodes.map((code, index) => (
                      <div key={`${code}-${index}`} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
                          <div>
                            <p className="text-sm font-medium text-amber-900">{code}</p>
                            <p className="text-sm text-amber-800">{selectedItem.warningMessages[index] || 'No warning detail recorded'}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-gray-200 p-4">
                    <p className="text-sm font-medium text-gray-900">Matched CRM records</p>
                    <div className="mt-3 space-y-2">
                      <DetailRow
                        label="Lead"
                        value={<RecordLink href={selectedItem.matchedLeadId ? `/leads/${selectedItem.matchedLeadId}` : null} label={selectedItem.matchedLeadId} />}
                      />
                      <DetailRow
                        label="Job"
                        value={<RecordLink href={selectedItem.matchedOpportunityId ? `/jobs/${selectedItem.matchedOpportunityId}` : null} label={selectedItem.matchedOpportunityId} />}
                      />
                      <DetailRow label="Appointment" value={selectedItem.matchedAppointmentId || '-'} />
                    </div>
                  </div>

                  <div className="rounded-lg border border-gray-200 p-4">
                    <p className="text-sm font-medium text-gray-900">Created CRM records</p>
                    <div className="mt-3 space-y-2">
                      <DetailRow
                        label="Lead"
                        value={<RecordLink href={selectedItem.createdLeadId ? `/leads/${selectedItem.createdLeadId}` : null} label={selectedItem.createdLeadId} />}
                      />
                      <DetailRow
                        label="Job"
                        value={<RecordLink href={selectedItem.createdOpportunityId ? `/jobs/${selectedItem.createdOpportunityId}` : null} label={selectedItem.createdOpportunityId} />}
                      />
                      <DetailRow label="Appointment" value={selectedItem.createdAppointmentId || '-'} />
                    </div>
                  </div>
                </div>

                <div className="grid gap-4">
                  <JsonPanel title="User mappings snapshot" value={selectedItem.userMappingsJson} />
                  <JsonPanel title="Workbook row snapshot" value={selectedItem.rowDataJson} />
                  <JsonPanel title="Execution result snapshot" value={selectedItem.executionResultJson} />
                </div>

                <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900">Resolution</p>
                    {selectedItem.resolvedBy && (
                      <p className="text-xs text-gray-500">
                        Last updated by {selectedItem.resolvedBy.fullName || selectedItem.resolvedBy.email}
                      </p>
                    )}
                  </div>
                  <textarea
                    value={resolutionNote}
                    onChange={(event) => setResolutionNote(event.target.value)}
                    rows={4}
                    placeholder="Add a resolution note for the next reviewer..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-panda-primary"
                  />
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => handleStatusUpdate('RESOLVED')}
                      disabled={updateMutation.isPending}
                      className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Mark resolved
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusUpdate('IGNORED')}
                      disabled={updateMutation.isPending}
                      className="inline-flex items-center gap-2 rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                    >
                      <AlertTriangle className="h-4 w-4" />
                      Ignore
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusUpdate('OPEN')}
                      disabled={updateMutation.isPending}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <Circle className="h-4 w-4" />
                      Reopen
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function StatCard({ label, value, tone = 'default' }) {
  const toneClasses = {
    default: 'text-gray-900',
    success: 'text-green-700',
    warning: 'text-amber-700',
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${toneClasses[tone] || toneClasses.default}`}>{value}</p>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium text-gray-900">{value}</span>
    </div>
  );
}

function JsonPanel({ title, value }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-3">
        <p className="text-sm font-medium text-gray-900">{title}</p>
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-xs text-gray-700">{prettyJson(value)}</pre>
    </div>
  );
}
