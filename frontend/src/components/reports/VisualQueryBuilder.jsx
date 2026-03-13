import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownUp,
  Database,
  Filter,
  Layers,
  Plus,
  Search,
  Table2,
  Trash2,
  Workflow,
} from 'lucide-react';
import { modulesApi, reportsApi } from '../../services/api';
import {
  buildPreviewReportSpec,
  formatReportFieldLabel,
  getModuleMetadata,
  getReportAggregationItems,
  getReportFilterOperators,
  getReportPresentationWidgets,
  normalizeReportConfig,
} from '../../utils/reporting';
import PresentationWidgets from './PresentationWidgets';
import TableWidget from './charts/TableWidget';

function buildFieldContextLabel(baseModuleLabel, relationshipMap, fieldId, fallbackLabel) {
  if (!fieldId?.includes('.')) {
    return `${baseModuleLabel} > ${fallbackLabel || formatReportFieldLabel(fieldId)}`;
  }

  const [relationId] = fieldId.split('.');
  const relatedModuleLabel = relationshipMap[relationId]?.label || formatReportFieldLabel(relationId);
  return `${relatedModuleLabel} > ${fallbackLabel || formatReportFieldLabel(fieldId.split('.').slice(1).join('.'))}`;
}

function getAggregationLabel(aggregation) {
  return `${String(aggregation.function || 'COUNT').toUpperCase()}(${aggregation.field || 'id'})`;
}

export default function VisualQueryBuilder({
  report,
  onChange,
  allowPresentationBuilder = true,
  previewLimit = 100,
  compact = false,
}) {
  const normalizedReport = useMemo(() => normalizeReportConfig(report), [report]);
  const [fieldSearch, setFieldSearch] = useState('');
  const [previewState, setPreviewState] = useState({ loading: false, error: null, payload: null });
  const [relatedFieldMap, setRelatedFieldMap] = useState({});

  const { data: modulesResponse } = useQuery({
    queryKey: ['analytics-builder-modules'],
    queryFn: () => modulesApi.getModules(),
  });

  const { data: moduleResponse } = useQuery({
    queryKey: ['analytics-builder-module', normalizedReport.baseModule],
    queryFn: () => modulesApi.getModule(normalizedReport.baseModule),
    enabled: Boolean(normalizedReport.baseModule),
  });

  const { data: fieldsResponse, error: fieldsError } = useQuery({
    queryKey: ['analytics-builder-fields', normalizedReport.baseModule],
    queryFn: () => modulesApi.getModuleFields(normalizedReport.baseModule),
    enabled: Boolean(normalizedReport.baseModule),
  });

  const { data: relationshipsResponse } = useQuery({
    queryKey: ['analytics-builder-relationships', normalizedReport.baseModule],
    queryFn: () => modulesApi.getModuleRelationships(normalizedReport.baseModule),
    enabled: Boolean(normalizedReport.baseModule),
  });

  const modules = modulesResponse?.data?.modules || [];
  const baseFields = fieldsResponse?.data?.fields || [];
  const relationships = relationshipsResponse?.data?.relationships || [];
  const relationshipMap = useMemo(
    () =>
      Object.fromEntries(
        relationships.map((relationship) => [relationship.id, relationship.targetModule || relationship])
      ),
    [relationships]
  );

  useEffect(() => {
    let cancelled = false;
    const activeRelations = normalizedReport.includeRelations || [];

    if (!normalizedReport.baseModule || activeRelations.length === 0) {
      setRelatedFieldMap({});
      return undefined;
    }

    Promise.all(
      activeRelations.map(async (relationId) => {
        try {
          const response = await modulesApi.getRelatedModuleFields(normalizedReport.baseModule, relationId);
          return [relationId, response?.data?.fields || []];
        } catch (error) {
          console.error('Failed to load related module fields:', relationId, error);
          return [relationId, []];
        }
      })
    ).then((entries) => {
      if (!cancelled) {
        setRelatedFieldMap(Object.fromEntries(entries));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [normalizedReport.baseModule, normalizedReport.includeRelations]);

  const allFields = useMemo(() => {
    const baseModuleLabel = getModuleMetadata(normalizedReport.baseModule).label;
    const baseEntries = baseFields.map((field) => ({
      ...field,
      moduleId: normalizedReport.baseModule,
      moduleLabel: baseModuleLabel,
      contextLabel: `${baseModuleLabel} > ${field.label}`,
      relationId: null,
    }));

    const relatedEntries = Object.entries(relatedFieldMap).flatMap(([relationId, fields]) =>
      (fields || []).map((field) => ({
        ...field,
        moduleId: relationshipMap[relationId]?.module || relationId,
        moduleLabel: relationshipMap[relationId]?.name || relationshipMap[relationId]?.singularName || formatReportFieldLabel(relationId),
        contextLabel: buildFieldContextLabel(baseModuleLabel, relationshipMap, field.id, field.label),
        relationId,
      }))
    );

    return [...baseEntries, ...relatedEntries];
  }, [baseFields, normalizedReport.baseModule, relatedFieldMap, relationshipMap]);

  const selectedFields = useMemo(
    () => normalizedReport.selectedFields.map((fieldId) => allFields.find((field) => field.id === fieldId) || {
      id: fieldId,
      label: formatReportFieldLabel(fieldId),
      contextLabel: formatReportFieldLabel(fieldId),
      type: 'string',
    }),
    [allFields, normalizedReport.selectedFields]
  );

  const searchableFields = useMemo(() => {
    const searchTerm = fieldSearch.trim().toLowerCase();
    if (!searchTerm) {
      return allFields;
    }

    return allFields.filter((field) =>
      [field.label, field.contextLabel, field.id, field.type]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(searchTerm)
    );
  }, [allFields, fieldSearch]);

  const numericFields = useMemo(
    () => allFields.filter((field) => ['number', 'currency', 'decimal', 'percent'].includes(String(field.type || '').toLowerCase())),
    [allFields]
  );

  const addSelectedField = (fieldId) => {
    if (normalizedReport.selectedFields.includes(fieldId)) {
      onChange({
        ...normalizedReport,
        selectedFields: normalizedReport.selectedFields.filter((value) => value !== fieldId),
      });
      return;
    }

    onChange({
      ...normalizedReport,
      selectedFields: [...normalizedReport.selectedFields, fieldId],
    });
  };

  const updateBaseModule = (moduleId) => {
    const nextModule = getModuleMetadata(moduleId);
    onChange({
      ...normalizedReport,
      baseModule: moduleId,
      baseObject: nextModule.label,
      selectedFields: [],
      groupByFields: [],
      filters: [],
      includeRelations: [],
      sort: [],
      sortBy: null,
      sortDirection: null,
      aggregations: [],
      aggregationItems: [],
      presentation: { widgets: [] },
      dateRangeField: 'createdAt',
    });
  };

  const toggleRelation = (relationId) => {
    const nextRelations = normalizedReport.includeRelations.includes(relationId)
      ? normalizedReport.includeRelations.filter((value) => value !== relationId)
      : [...normalizedReport.includeRelations, relationId];

    onChange({
      ...normalizedReport,
      includeRelations: nextRelations,
      selectedFields: normalizedReport.selectedFields.filter((fieldId) => {
        if (!fieldId.includes('.')) return true;
        return nextRelations.includes(fieldId.split('.')[0]);
      }),
      groupByFields: normalizedReport.groupByFields.filter((fieldId) => {
        if (!fieldId.includes('.')) return true;
        return nextRelations.includes(fieldId.split('.')[0]);
      }),
      filters: normalizedReport.filters.filter((filter) => {
        if (!filter?.field?.includes('.')) return true;
        return nextRelations.includes(filter.field.split('.')[0]);
      }),
    });
  };

  const addFilter = () => {
    const firstField = allFields.find((field) => field.filterable) || allFields[0];
    if (!firstField) return;

    onChange({
      ...normalizedReport,
      filters: [
        ...normalizedReport.filters,
        {
          id: `filter_${Date.now()}`,
          field: firstField.id,
          operator: 'equals',
          value: '',
        },
      ],
    });
  };

  const updateFilter = (filterId, patch) => {
    onChange({
      ...normalizedReport,
      filters: normalizedReport.filters.map((filter) =>
        filter.id === filterId ? { ...filter, ...patch } : filter
      ),
    });
  };

  const removeFilter = (filterId) => {
    onChange({
      ...normalizedReport,
      filters: normalizedReport.filters.filter((filter) => filter.id !== filterId),
    });
  };

  const addSort = () => {
    const firstField = selectedFields[0] || allFields[0];
    if (!firstField) return;

    onChange({
      ...normalizedReport,
      sort: [...normalizedReport.sort, { field: firstField.id, direction: 'asc' }],
      sortBy: firstField.id,
      sortDirection: 'asc',
    });
  };

  const updateSort = (index, patch) => {
    const nextSort = normalizedReport.sort.map((sortRule, sortIndex) =>
      sortIndex === index ? { ...sortRule, ...patch } : sortRule
    );

    onChange({
      ...normalizedReport,
      sort: nextSort,
      sortBy: nextSort[0]?.field || null,
      sortDirection: nextSort[0]?.direction || null,
    });
  };

  const removeSort = (index) => {
    const nextSort = normalizedReport.sort.filter((_, sortIndex) => sortIndex !== index);
    onChange({
      ...normalizedReport,
      sort: nextSort,
      sortBy: nextSort[0]?.field || null,
      sortDirection: nextSort[0]?.direction || null,
    });
  };

  const toggleGroupByField = (fieldId) => {
    onChange({
      ...normalizedReport,
      groupByFields: normalizedReport.groupByFields.includes(fieldId)
        ? normalizedReport.groupByFields.filter((value) => value !== fieldId)
        : [...normalizedReport.groupByFields, fieldId],
    });
  };

  const addAggregation = () => {
    const field = numericFields[0] || selectedFields[0] || allFields[0];
    if (!field) return;

    onChange({
      ...normalizedReport,
      aggregations: [
        ...getReportAggregationItems(normalizedReport),
        {
          id: `aggregation_${Date.now()}`,
          field: field.id,
          function: field.id === 'id' ? 'count' : 'sum',
        },
      ],
    });
  };

  const updateAggregation = (aggregationId, patch) => {
    onChange({
      ...normalizedReport,
      aggregations: getReportAggregationItems(normalizedReport).map((aggregation) =>
        aggregation.id === aggregationId ? { ...aggregation, ...patch } : aggregation
      ),
    });
  };

  const removeAggregation = (aggregationId) => {
    onChange({
      ...normalizedReport,
      aggregations: getReportAggregationItems(normalizedReport).filter((aggregation) => aggregation.id !== aggregationId),
    });
  };

  const addPresentationWidget = (type) => {
    onChange({
      ...normalizedReport,
      presentation: {
        widgets: [
          ...getReportPresentationWidgets(normalizedReport),
          {
            id: `presentation_${Date.now()}`,
            type,
            title: `${formatReportFieldLabel(type)} Widget`,
            subtitle: '',
            visualization: type === 'CHART' ? { chartType: 'BAR' } : {},
          },
        ],
      },
    });
  };

  const updatePresentationWidget = (widgetId, patch) => {
    onChange({
      ...normalizedReport,
      presentation: {
        widgets: getReportPresentationWidgets(normalizedReport).map((widget) =>
          widget.id === widgetId ? { ...widget, ...patch } : widget
        ),
      },
    });
  };

  const removePresentationWidget = (widgetId) => {
    onChange({
      ...normalizedReport,
      presentation: {
        widgets: getReportPresentationWidgets(normalizedReport).filter((widget) => widget.id !== widgetId),
      },
    });
  };

  useEffect(() => {
    if (!normalizedReport.baseModule) {
      return undefined;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        setPreviewState((previous) => ({ ...previous, loading: true, error: null }));
        const response = await reportsApi.previewReport({
          reportSpec: buildPreviewReportSpec(normalizedReport),
          limit: previewLimit,
        });
        setPreviewState({
          loading: false,
          error: null,
          payload: response?.data || response,
        });
      } catch (error) {
        setPreviewState({
          loading: false,
          error: error?.response?.data?.error?.message || error?.message || 'Preview unavailable',
          payload: null,
        });
      }
    }, 500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [normalizedReport, previewLimit]);

  const previewRows = previewState.payload?.results?.rows
    || previewState.payload?.data?.results?.rows
    || previewState.payload?.results?.data
    || previewState.payload?.data?.results?.data
    || [];

  const previewColumns = useMemo(() => {
    const sample = previewRows?.[0] || {};
    return Object.keys(sample).map((key) => ({
      key,
      label: formatReportFieldLabel(key),
    }));
  }, [previewRows]);

  const selectedModuleMeta = moduleResponse?.data || getModuleMetadata(normalizedReport.baseModule);

  return (
    <div className="space-y-6">
      <div className={`grid gap-6 ${compact ? 'grid-cols-1' : 'xl:grid-cols-[320px_minmax(0,1fr)]'}`}>
        <aside className="space-y-6">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-panda-primary" />
              <h3 className="text-lg font-semibold text-gray-900">Modules</h3>
            </div>
            <p className="mt-1 text-sm text-gray-500">Choose a base table, then add related modules for joined fields.</p>
            <div className="mt-4 space-y-2">
              {modules.map((module) => (
                <button
                  key={module.id}
                  type="button"
                  onClick={() => updateBaseModule(module.id)}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                    normalizedReport.baseModule === module.id
                      ? 'border-panda-primary bg-panda-primary/5 text-panda-primary'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="font-medium">{module.name}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    Table: {getModuleMetadata(module.id).table} · Fields: {module.fieldCount}
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Workflow className="h-5 w-5 text-panda-primary" />
              <h3 className="text-lg font-semibold text-gray-900">Related Modules</h3>
            </div>
            <div className="mt-4 space-y-2">
              {relationships.length === 0 ? (
                <p className="text-sm text-gray-500">No relationships available for this module.</p>
              ) : relationships.map((relationship) => (
                <label key={relationship.id} className="flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={normalizedReport.includeRelations.includes(relationship.id)}
                    onChange={() => toggleRelation(relationship.id)}
                    className="rounded text-panda-primary focus:ring-panda-primary"
                  />
                  <div>
                    <div className="font-medium text-gray-900">{relationship.label}</div>
                    <div className="text-xs text-gray-500">
                      {relationship.type} · {relationship.targetModule?.name || relationship.module}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5 text-panda-primary" />
              <h3 className="text-lg font-semibold text-gray-900">Field Explorer</h3>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2">
              <Search className="h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={fieldSearch}
                onChange={(event) => setFieldSearch(event.target.value)}
                placeholder="Search fields across modules"
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
            <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {searchableFields.map((field) => (
                <button
                  key={field.id}
                  type="button"
                  onClick={() => addSelectedField(field.id)}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                    normalizedReport.selectedFields.includes(field.id)
                      ? 'border-panda-primary bg-panda-primary/5'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="font-medium text-gray-900">{field.contextLabel}</div>
                  <div className="mt-1 text-xs text-gray-500">{field.id} · {field.type}</div>
                </button>
              ))}
            </div>
          </section>
        </aside>

        <div className="space-y-6">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="flex items-start gap-3">
              <Database className="mt-0.5 h-5 w-5 text-emerald-600" />
              <div className="flex-1">
                <div className="font-semibold text-emerald-900">Connected to CRM Database</div>
                <div className="mt-2 grid grid-cols-1 gap-3 text-sm md:grid-cols-4">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">Module</div>
                    <div className="mt-1 font-medium text-gray-900">{selectedModuleMeta?.name || selectedModuleMeta?.label}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">Table</div>
                    <div className="mt-1 font-medium text-gray-900">{selectedModuleMeta?.tableName || selectedModuleMeta?.table}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">Fields</div>
                    <div className="mt-1 font-medium text-gray-900">{allFields.length}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">Database</div>
                    <div className="mt-1 font-medium text-gray-900">{selectedModuleMeta?.database || 'CRM'}</div>
                  </div>
                </div>
                {fieldsError && (
                  <p className="mt-3 text-sm text-rose-700">
                    {fieldsError?.response?.data?.error?.message || 'Fields failed to load.'}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="h-5 w-5 text-panda-primary" />
                  <h3 className="text-lg font-semibold text-gray-900">Selected Fields</h3>
                </div>
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                  {selectedFields.length}
                </span>
              </div>
              <div className="mt-4 max-h-60 space-y-2 overflow-y-auto pr-1">
                {selectedFields.length === 0 ? (
                  <p className="text-sm text-gray-500">Select fields from the explorer to build the report.</p>
                ) : selectedFields.map((field) => (
                  <div key={field.id} className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
                    <div>
                      <div className="font-medium text-gray-900">{field.contextLabel || field.label}</div>
                      <div className="text-xs text-gray-500">{field.id}</div>
                    </div>
                    <button type="button" onClick={() => addSelectedField(field.id)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowDownUp className="h-5 w-5 text-panda-primary" />
                  <h3 className="text-lg font-semibold text-gray-900">Sorting</h3>
                </div>
                <button type="button" onClick={addSort} className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white">
                  <Plus className="h-4 w-4" />
                  Add Sort
                </button>
              </div>
              <div className="mt-4 space-y-3">
                {normalizedReport.sort.length === 0 ? (
                  <p className="text-sm text-gray-500">No sorting applied. Preview uses newest records first when possible.</p>
                ) : normalizedReport.sort.map((sortRule, index) => (
                  <div key={`${sortRule.field}_${index}`} className="grid grid-cols-[minmax(0,1fr)_140px_40px] gap-2">
                    <select
                      value={sortRule.field}
                      onChange={(event) => updateSort(index, { field: event.target.value })}
                      className="rounded-xl border border-gray-300 px-3 py-2"
                    >
                      {selectedFields.map((field) => (
                        <option key={field.id} value={field.id}>{field.contextLabel || field.label}</option>
                      ))}
                    </select>
                    <select
                      value={sortRule.direction}
                      onChange={(event) => updateSort(index, { direction: event.target.value })}
                      className="rounded-xl border border-gray-300 px-3 py-2"
                    >
                      <option value="asc">Ascending</option>
                      <option value="desc">Descending</option>
                    </select>
                    <button type="button" onClick={() => removeSort(index)} className="rounded-xl border border-gray-300 text-rose-600 hover:bg-rose-50">
                      <Trash2 className="mx-auto h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="h-5 w-5 text-panda-primary" />
                  <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
                </div>
                <button type="button" onClick={addFilter} className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white">
                  <Plus className="h-4 w-4" />
                  Add Filter
                </button>
              </div>
              <div className="mt-4 space-y-3">
                {normalizedReport.filters.length === 0 ? (
                  <p className="text-sm text-gray-500">No filters yet. Add filters to refine the preview automatically.</p>
                ) : normalizedReport.filters.map((filter) => (
                  <div key={filter.id} className="space-y-2 rounded-xl border border-gray-200 p-3">
                    <select
                      value={filter.field}
                      onChange={(event) => updateFilter(filter.id, { field: event.target.value })}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2"
                    >
                      {allFields.filter((field) => field.filterable !== false).map((field) => (
                        <option key={field.id} value={field.id}>{field.contextLabel || field.label}</option>
                      ))}
                    </select>
                    <div className="grid grid-cols-[160px_minmax(0,1fr)_40px] gap-2">
                      <select
                        value={filter.operator}
                        onChange={(event) => updateFilter(filter.id, { operator: event.target.value })}
                        className="rounded-xl border border-gray-300 px-3 py-2"
                      >
                        {getReportFilterOperators().map((operator) => (
                          <option key={operator.id} value={operator.id}>{operator.label}</option>
                        ))}
                      </select>
                      <input
                        value={Array.isArray(filter.value) ? filter.value.join(', ') : filter.value}
                        onChange={(event) => updateFilter(filter.id, {
                          value: filter.operator === 'in'
                            ? event.target.value.split(',').map((value) => value.trim()).filter(Boolean)
                            : filter.operator === 'lastXDays'
                            ? Number(event.target.value) || 0
                            : event.target.value,
                        })}
                        placeholder={filter.operator === 'in' ? 'Comma-separated values' : filter.operator === 'lastXDays' ? 'Number of days' : 'Value'}
                        className="rounded-xl border border-gray-300 px-3 py-2"
                      />
                      <button type="button" onClick={() => removeFilter(filter.id)} className="rounded-xl border border-gray-300 text-rose-600 hover:bg-rose-50">
                        <Trash2 className="mx-auto h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Table2 className="h-5 w-5 text-panda-primary" />
                  <h3 className="text-lg font-semibold text-gray-900">Grouping & Aggregations</h3>
                </div>
                <button type="button" onClick={addAggregation} className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white">
                  <Plus className="h-4 w-4" />
                  Add Aggregation
                </button>
              </div>
              <div className="mt-4 space-y-4">
                <div>
                  <div className="mb-2 text-sm font-medium text-gray-700">Group By</div>
                  <div className="flex flex-wrap gap-2">
                    {allFields.filter((field) => field.groupable !== false).map((field) => (
                      <label key={field.id} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${normalizedReport.groupByFields.includes(field.id) ? 'border-panda-primary bg-panda-primary/5 text-panda-primary' : 'border-gray-300 text-gray-700'}`}>
                        <input
                          type="checkbox"
                          checked={normalizedReport.groupByFields.includes(field.id)}
                          onChange={() => toggleGroupByField(field.id)}
                          className="rounded text-panda-primary focus:ring-panda-primary"
                        />
                        {field.contextLabel || field.label}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  {getReportAggregationItems(normalizedReport).length === 0 ? (
                    <p className="text-sm text-gray-500">No aggregations configured yet.</p>
                  ) : getReportAggregationItems(normalizedReport).map((aggregation) => (
                    <div key={aggregation.id} className="grid grid-cols-[minmax(0,1fr)_140px_40px] gap-2">
                      <select
                        value={aggregation.field}
                        onChange={(event) => updateAggregation(aggregation.id, { field: event.target.value })}
                        className="rounded-xl border border-gray-300 px-3 py-2"
                      >
                        {[...numericFields, ...selectedFields].filter((field, index, array) => array.findIndex((entry) => entry.id === field.id) === index).map((field) => (
                          <option key={field.id} value={field.id}>{field.contextLabel || field.label}</option>
                        ))}
                      </select>
                      <select
                        value={String(aggregation.function || 'count').toUpperCase()}
                        onChange={(event) => updateAggregation(aggregation.id, { function: event.target.value.toLowerCase() })}
                        className="rounded-xl border border-gray-300 px-3 py-2"
                      >
                        <option value="count">COUNT</option>
                        <option value="sum">SUM</option>
                        <option value="avg">AVG</option>
                        <option value="min">MIN</option>
                        <option value="max">MAX</option>
                      </select>
                      <button type="button" onClick={() => removeAggregation(aggregation.id)} className="rounded-xl border border-gray-300 text-rose-600 hover:bg-rose-50">
                        <Trash2 className="mx-auto h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>

          {allowPresentationBuilder && (
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Report Presentation</h3>
                  <p className="mt-1 text-sm text-gray-500">Widgets here appear above the report table and run from the same ReportSpec.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {['KPI', 'CHART', 'TABLE', 'AI_SUMMARY'].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => addPresentationWidget(type)}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      + {formatReportFieldLabel(type)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {getReportPresentationWidgets(normalizedReport).length === 0 ? (
                  <p className="text-sm text-gray-500">No presentation widgets yet. Add KPI, chart, table, or AI summary blocks.</p>
                ) : getReportPresentationWidgets(normalizedReport).map((widget) => (
                  <div key={widget.id} className="rounded-2xl border border-gray-200 p-4">
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px_40px]">
                      <input
                        value={widget.title}
                        onChange={(event) => updatePresentationWidget(widget.id, { title: event.target.value })}
                        placeholder={`${formatReportFieldLabel(widget.type)} title`}
                        className="rounded-xl border border-gray-300 px-3 py-2"
                      />
                      <select
                        value={widget.type}
                        onChange={(event) => updatePresentationWidget(widget.id, { type: event.target.value })}
                        className="rounded-xl border border-gray-300 px-3 py-2"
                      >
                        <option value="KPI">KPI</option>
                        <option value="CHART">Chart</option>
                        <option value="TABLE">Table</option>
                        <option value="AI_SUMMARY">AI Summary</option>
                      </select>
                      <button type="button" onClick={() => removePresentationWidget(widget.id)} className="rounded-xl border border-gray-300 text-rose-600 hover:bg-rose-50">
                        <Trash2 className="mx-auto h-4 w-4" />
                      </button>
                    </div>
                    {widget.type === 'CHART' && (
                      <div className="mt-3 grid gap-3 lg:grid-cols-3">
                        <select
                          value={widget.visualization?.chartType || 'BAR'}
                          onChange={(event) => updatePresentationWidget(widget.id, {
                            visualization: { ...widget.visualization, chartType: event.target.value },
                          })}
                          className="rounded-xl border border-gray-300 px-3 py-2"
                        >
                          <option value="BAR">Bar Chart</option>
                          <option value="LINE">Line Chart</option>
                          <option value="AREA">Area Chart</option>
                          <option value="PIE">Pie Chart</option>
                        </select>
                        <select
                          value={widget.visualization?.xField || ''}
                          onChange={(event) => updatePresentationWidget(widget.id, {
                            visualization: { ...widget.visualization, xField: event.target.value },
                          })}
                          className="rounded-xl border border-gray-300 px-3 py-2"
                        >
                          <option value="">Auto X field</option>
                          {selectedFields.map((field) => (
                            <option key={field.id} value={field.id}>{field.contextLabel || field.label}</option>
                          ))}
                        </select>
                        <select
                          value={widget.visualization?.yField || ''}
                          onChange={(event) => updatePresentationWidget(widget.id, {
                            visualization: { ...widget.visualization, yField: event.target.value },
                          })}
                          className="rounded-xl border border-gray-300 px-3 py-2"
                        >
                          <option value="">Auto Y field</option>
                          {[...numericFields, ...selectedFields].filter((field, index, array) => array.findIndex((entry) => entry.id === field.id) === index).map((field) => (
                            <option key={field.id} value={field.id}>{field.contextLabel || field.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {widget.type === 'KPI' && (
                      <div className="mt-3 grid gap-3 lg:grid-cols-2">
                        <select
                          value={widget.metricField || ''}
                          onChange={(event) => updatePresentationWidget(widget.id, { metricField: event.target.value })}
                          className="rounded-xl border border-gray-300 px-3 py-2"
                        >
                          <option value="">Auto metric</option>
                          {[...numericFields, ...selectedFields].filter((field, index, array) => array.findIndex((entry) => entry.id === field.id) === index).map((field) => (
                            <option key={field.id} value={field.id}>{field.contextLabel || field.label}</option>
                          ))}
                        </select>
                        <select
                          value={String(widget.metricFunction || 'SUM').toUpperCase()}
                          onChange={(event) => updatePresentationWidget(widget.id, { metricFunction: event.target.value })}
                          className="rounded-xl border border-gray-300 px-3 py-2"
                        >
                          <option value="SUM">SUM</option>
                          <option value="AVG">AVG</option>
                          <option value="MIN">MIN</option>
                          <option value="MAX">MAX</option>
                          <option value="COUNT">COUNT</option>
                        </select>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Live Preview Table</h3>
            <p className="mt-1 text-sm text-gray-500">The preview updates automatically 500ms after each change and returns up to {previewLimit} rows.</p>
          </div>
          <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
            {previewState.loading ? 'Refreshing preview…' : `${previewRows.length} rows`}
          </div>
        </div>

        {previewState.error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {previewState.error}
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <PresentationWidgets
              report={normalizedReport}
              payload={previewState.payload}
              emptyStateContext={{
                title: normalizedReport.name || 'Preview',
                source: 'native',
                rowCount: previewRows.length,
              }}
            />
            <TableWidget
              title="Preview Rows"
              subtitle={`${selectedModuleMeta?.name || 'Module'} · ${previewRows.length} rows`}
              data={previewRows}
              columns={previewColumns}
              loading={previewState.loading}
              pageSize={compact ? 5 : 8}
              emptyMessage="No preview data yet"
              emptyStateContext={{
                title: normalizedReport.name || 'Preview',
                source: 'native',
                rowCount: previewRows.length,
              }}
            />
          </div>
        )}
      </section>
    </div>
  );
}
