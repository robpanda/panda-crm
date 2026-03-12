import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { AlertCircle, Database, Layers } from 'lucide-react';
import { getModuleMetadata, getReportBaseModule } from '../utils/reporting';

function normalizeDraftReport(parsedValue, currentReport) {
  return {
    ...currentReport,
    ...parsedValue,
    selectedFields: Array.isArray(parsedValue.selectedFields)
      ? parsedValue.selectedFields
      : currentReport.selectedFields,
    groupByFields: Array.isArray(parsedValue.groupByFields)
      ? parsedValue.groupByFields
      : currentReport.groupByFields,
    filters: Array.isArray(parsedValue.filters) ? parsedValue.filters : currentReport.filters,
    includeRelations: Array.isArray(parsedValue.includeRelations)
      ? parsedValue.includeRelations
      : currentReport.includeRelations,
    sharedWithRoles: Array.isArray(parsedValue.sharedWithRoles)
      ? parsedValue.sharedWithRoles
      : currentReport.sharedWithRoles,
  };
}

export function AdvancedReportEditorPanel({
  report,
  onChange,
  fields,
  relationships,
  selectedModule,
  fieldsError,
}) {
  const [draft, setDraft] = useState('');
  const [parseError, setParseError] = useState('');

  useEffect(() => {
    setDraft(JSON.stringify(report, null, 2));
    setParseError('');
  }, [report]);

  const moduleMetadata = useMemo(
    () => getModuleMetadata(getReportBaseModule(report)),
    [report]
  );

  const applyDraft = () => {
    try {
      const parsedValue = JSON.parse(draft);
      const normalized = normalizeDraftReport(parsedValue, report);

      if (!normalized.name?.trim()) {
        setParseError('Report name is required.');
        return;
      }

      if (!normalized.baseModule) {
        setParseError('baseModule is required.');
        return;
      }

      onChange(normalized);
      setParseError('');
    } catch (error) {
      setParseError(error.message || 'The advanced spec is not valid JSON.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-panda-primary/10 rounded-lg">
            <Layers className="w-6 h-6 text-panda-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Advanced ReportSpec Editor</h2>
            <p className="text-sm text-gray-500">
              Edit the shared report configuration directly. Changes here immediately power the basic builder and saved report.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl bg-gray-50 p-4">
            <div className="text-xs uppercase tracking-wide text-gray-400">Module</div>
            <div className="mt-2 text-lg font-semibold text-gray-900">
              {selectedModule?.name || moduleMetadata.label}
            </div>
          </div>
          <div className="rounded-xl bg-gray-50 p-4">
            <div className="text-xs uppercase tracking-wide text-gray-400">Table</div>
            <div className="mt-2 text-lg font-semibold text-gray-900">
              {selectedModule?.tableName || moduleMetadata.table}
            </div>
          </div>
          <div className="rounded-xl bg-gray-50 p-4">
            <div className="text-xs uppercase tracking-wide text-gray-400">Field Count</div>
            <div className="mt-2 text-lg font-semibold text-gray-900">{fields.length}</div>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
            <Database className="h-4 w-4 text-panda-primary" />
            Connected to CRM Database
          </div>
          {fieldsError && (
            <p className="mt-2 text-sm text-rose-700">
              {fieldsError?.response?.data?.error?.message || 'Fields could not be loaded for this module.'}
            </p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">ReportSpec JSON</h3>
            <p className="text-sm text-gray-500">
              Keep `selectedFields`, `filters`, and `groupByFields` as arrays to stay compatible with the builder.
            </p>
          </div>
          <button
            type="button"
            onClick={applyDraft}
            className="rounded-lg bg-panda-primary px-4 py-2 text-sm font-medium text-white hover:bg-panda-primary/90"
          >
            Apply Changes
          </button>
        </div>

        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="min-h-[420px] w-full rounded-xl border border-gray-300 bg-gray-950 p-4 font-mono text-sm text-gray-100 focus:border-panda-primary focus:outline-none focus:ring-2 focus:ring-panda-primary/20"
          spellCheck={false}
        />

        {parseError && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{parseError}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900">Available Fields</h3>
          <div className="mt-4 max-h-64 overflow-y-auto space-y-2">
            {fields.map((field) => (
              <div key={field.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                <span className="text-sm font-medium text-gray-900">{field.label}</span>
                <span className="text-xs uppercase tracking-wide text-gray-500">{field.id}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900">Related Modules</h3>
          <div className="mt-4 max-h-64 overflow-y-auto space-y-2">
            {relationships.length === 0 ? (
              <p className="text-sm text-gray-500">No related modules are available for this report.</p>
            ) : (
              relationships.map((relationship) => (
                <div key={relationship.id} className="rounded-lg border border-gray-100 px-3 py-2">
                  <div className="text-sm font-medium text-gray-900">{relationship.label}</div>
                  <div className="mt-1 text-xs uppercase tracking-wide text-gray-500">
                    {relationship.id} · {relationship.type}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdvancedReportEditor() {
  const { id } = useParams();

  if (id) {
    return <Navigate to={`/analytics/reports/${id}/edit?mode=advanced`} replace />;
  }

  return <Navigate to="/analytics/reports/new?mode=advanced" replace />;
}
