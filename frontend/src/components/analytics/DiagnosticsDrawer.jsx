import DataSourceBadge from './DataSourceBadge';
import VerifiedBadge from './VerifiedBadge';
import { summarizeFilters } from '../../utils/analyticsDiagnostics';

export default function DiagnosticsDrawer({ open, onClose, context }) {
  if (!open) return null;

  const title = context?.title || 'Diagnostics';
  const filters = summarizeFilters(context?.filters);
  const diagnostics = Array.isArray(context?.diagnostics) ? context.diagnostics : [];
  const failedChecks = Array.isArray(context?.failedChecks) ? context.failedChecks : [];

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-xl flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500">No data found</div>
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Close
          </button>
        </div>

        <div className="p-5 space-y-6 overflow-y-auto">
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-gray-400">Source</div>
            <div className="flex flex-wrap gap-2">
              <DataSourceBadge source={context?.source} size="sm" />
              <VerifiedBadge status={context?.verifiedStatus} reason={context?.verifiedReason} size="sm" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-gray-400">Active Filters</div>
            {filters.length === 0 ? (
              <div className="text-sm text-gray-500">No filters applied.</div>
            ) : (
              <div className="space-y-2">
                {filters.map((filter, idx) => (
                  <div key={`${filter.label}-${idx}`} className="flex items-start justify-between gap-3">
                    <span className="text-sm text-gray-600">{filter.label}</span>
                    <span className="text-sm font-medium text-gray-900 text-right">{filter.value || '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-gray-400">Possible Reasons</div>
            {diagnostics.length === 0 ? (
              <div className="text-sm text-gray-500">Diagnostics unavailable.</div>
            ) : (
              <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
                {diagnostics.map((item, idx) => (
                  <li key={`${item}-${idx}`}>{item}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-gray-400">Health Checks</div>
            {failedChecks.length === 0 ? (
              <div className="text-sm text-gray-500">No failed checks reported.</div>
            ) : (
              <ul className="space-y-2 text-sm">
                {failedChecks.map((check) => (
                  <li key={check.id} className="flex items-center justify-between">
                    <span className="text-gray-700">{check.title || check.id}</span>
                    <span className="text-xs uppercase text-rose-600">{check.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
