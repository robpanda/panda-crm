import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { reportsApi, modulesApi } from '../services/api';
import { useAnalyticsBadgeContext } from '../components/analytics/AnalyticsBadgeContext';
import { deriveDataSource } from '../utils/analyticsSource';
import { toAnalyticsDateParams } from '../utils/analyticsDateRange';
import { formatDateMDY, formatNumber } from '../utils/formatters';
import ReportRuntimeFilters from '../components/reports/ReportRuntimeFilters';
import KPICard from '../components/reports/KPICard';
import BarChartWidget from '../components/reports/charts/BarChartWidget';
import LineChartWidget from '../components/reports/charts/LineChartWidget';
import PieChartWidget from '../components/reports/charts/PieChartWidget';
import TableWidget from '../components/reports/charts/TableWidget';
import {
  buildChartDataFromGroupedResults,
  buildChartDataFromTimeSeriesResults,
  buildGroupedChartQuery,
  buildKpiMetricsFromSummary,
  buildReportFilters,
  buildReportPresentationData,
  buildRawReportQuery,
  buildTimeSeriesQuery,
  resolveReportModule,
} from '../utils/reportingRuntime';
import {
  getReportDateRangeLabel,
  normalizeReportRuntimeDateRange,
} from '../utils/reportRuntimeDateRange';
import {
  buildInitialRuntimeFilterValues,
  buildReportRuntimeFilterModel,
  buildRuntimeFiltersFromValues,
  buildRuntimeFilterSummaryEntries,
} from '../utils/reportRuntimeFilters';
import {
  applyColumnOrder,
  extractColumnKeys,
  hasCustomColumnOrder,
  moveOrderedValue,
  normalizeOrderedKeys,
} from '../utils/reportColumnOrder';
import {
  applyReportColumnWidths,
  buildPersistableReportColumnWidths,
  clampReportColumnWidth,
  hasCustomReportColumnWidths,
} from '../utils/reportColumnSizing';
import {
  applyGroupCalculationSelections,
  buildReportCalculationEntries,
  formatReportCalculationValue,
  getCalculableReportColumns,
  normalizeReportCalculationSelections,
  REPORT_COLUMN_CALCULATION_OPTIONS,
} from '../utils/reportColumnCalculations';
import { buildReportTablePresentation } from '../utils/reportTablePresentation';

const TABLE_PAGE_SIZE = 100;

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildFieldAliasMap(fieldDefinitions = []) {
  const aliasMap = new Map();

  toArray(fieldDefinitions).forEach((field) => {
    if (!field?.id) {
      return;
    }

    const canonicalId = field.canonicalId || field.id;
    aliasMap.set(field.id, canonicalId);
    aliasMap.set(canonicalId, canonicalId);

    toArray(field.legacyIds).forEach((legacyId) => {
      if (legacyId) {
        aliasMap.set(legacyId, canonicalId);
      }
    });
  });

  return aliasMap;
}

function getDefaultDateField(fieldDefinitions = []) {
  return toArray(fieldDefinitions).find((field) => field?.defaultDateField)?.canonicalId
    || toArray(fieldDefinitions).find((field) => field?.defaultDateField)?.id
    || 'createdAt';
}

function sanitizeFieldList(fieldKeys, fieldDefinitions = [], options = {}) {
  const { allowRelated = true, dropUnknown = false } = options;
  const aliasMap = buildFieldAliasMap(fieldDefinitions);

  return [...new Set(
    toArray(fieldKeys)
      .map((fieldKey) => String(fieldKey || '').trim())
      .filter(Boolean)
      .map((fieldKey) => {
        if (fieldKey.includes('.')) {
          return allowRelated ? fieldKey : null;
        }

        const canonicalField = aliasMap.get(fieldKey);
        if (canonicalField) {
          return canonicalField;
        }

        return dropUnknown ? null : fieldKey;
      })
      .filter(Boolean),
  )];
}

function sanitizeFilterList(filters, fieldDefinitions = [], options = {}) {
  const { allowRelated = true, dropUnknown = false } = options;
  const aliasMap = buildFieldAliasMap(fieldDefinitions);

  return toArray(filters).flatMap((filter) => {
    if (!filter?.field) {
      return [];
    }

    const fieldKey = String(filter.field).trim();
    if (!fieldKey) {
      return [];
    }

    if (fieldKey.includes('.')) {
      return allowRelated ? [{ ...filter, field: fieldKey }] : [];
    }

    const canonicalField = aliasMap.get(fieldKey);
    if (canonicalField) {
      return [{ ...filter, field: canonicalField }];
    }

    return dropUnknown ? [] : [{ ...filter, field: fieldKey }];
  });
}

function sanitizeSortList(sortBy, fieldDefinitions = [], options = {}) {
  const { allowRelated = true, dropUnknown = false } = options;
  const aliasMap = buildFieldAliasMap(fieldDefinitions);

  return toArray(sortBy).flatMap((sortEntry) => {
    if (!sortEntry?.field) {
      return [];
    }

    const fieldKey = String(sortEntry.field).trim();
    if (!fieldKey) {
      return [];
    }

    if (fieldKey.includes('.')) {
      return allowRelated ? [{ ...sortEntry, field: fieldKey }] : [];
    }

    const canonicalField = aliasMap.get(fieldKey);
    if (canonicalField) {
      return [{ ...sortEntry, field: canonicalField }];
    }

    return dropUnknown ? [] : [{ ...sortEntry, field: fieldKey }];
  });
}

function buildMinimalFieldList(reportConfig, fieldDefinitions = []) {
  const aliasMap = buildFieldAliasMap(fieldDefinitions);
  const resolvedDateField = aliasMap.get(reportConfig?.dateRangeField) || getDefaultDateField(fieldDefinitions);

  return [...new Set([resolvedDateField, 'id'].filter(Boolean))];
}

function shouldRetryDetailQuery(error) {
  const status = error?.response?.status;
  if (!status) {
    return true;
  }

  return status === 400 || status >= 500;
}

async function queryReportDetailWithFallback(module, reportConfig, baseQueryConfig, fieldDefinitions = []) {
  const selectedFields = toArray(baseQueryConfig?.fields);
  const baseFilters = toArray(baseQueryConfig?.filters);
  const baseSort = toArray(baseQueryConfig?.sortBy);
  const includeRelations = toArray(baseQueryConfig?.includeRelations);
  const pagination = baseQueryConfig?.pagination || { page: 1, pageSize: TABLE_PAGE_SIZE };

  const attempts = [
    {
      label: 'selected-fields',
      queryConfig: {
        ...baseQueryConfig,
        fields: selectedFields.length > 0 ? selectedFields : buildMinimalFieldList(reportConfig, fieldDefinitions),
      },
    },
    {
      label: 'canonical-fields',
      queryConfig: {
        ...baseQueryConfig,
        fields: sanitizeFieldList(selectedFields, fieldDefinitions, { allowRelated: true, dropUnknown: true }),
        filters: sanitizeFilterList(baseFilters, fieldDefinitions, { allowRelated: true, dropUnknown: false }),
        sortBy: sanitizeSortList(baseSort, fieldDefinitions, { allowRelated: true, dropUnknown: true }),
        includeRelations,
      },
    },
    {
      label: 'base-fields',
      queryConfig: {
        ...baseQueryConfig,
        fields: sanitizeFieldList(selectedFields, fieldDefinitions, { allowRelated: false, dropUnknown: true }),
        filters: sanitizeFilterList(baseFilters, fieldDefinitions, { allowRelated: true, dropUnknown: false }),
        sortBy: sanitizeSortList(baseSort, fieldDefinitions, { allowRelated: false, dropUnknown: true }),
        includeRelations: [],
      },
    },
    {
      label: 'base-safe',
      queryConfig: {
        ...baseQueryConfig,
        fields: sanitizeFieldList(selectedFields, fieldDefinitions, { allowRelated: false, dropUnknown: true }),
        filters: sanitizeFilterList(baseFilters, fieldDefinitions, { allowRelated: false, dropUnknown: true }),
        sortBy: [],
        includeRelations: [],
      },
    },
    {
      label: 'minimal-safe',
      queryConfig: {
        ...baseQueryConfig,
        fields: buildMinimalFieldList(reportConfig, fieldDefinitions),
        filters: sanitizeFilterList(baseFilters, fieldDefinitions, { allowRelated: false, dropUnknown: true }),
        sortBy: [],
        includeRelations: [],
      },
    },
    {
      label: 'unscoped-records',
      queryConfig: {
        ...baseQueryConfig,
        fields: [],
        filters: sanitizeFilterList(baseFilters, fieldDefinitions, { allowRelated: false, dropUnknown: true }),
        sortBy: [],
        includeRelations: [],
      },
    },
  ].map((attempt) => ({
    ...attempt,
    queryConfig: {
      ...attempt.queryConfig,
      fields: attempt.queryConfig.fields?.length > 0
        ? attempt.queryConfig.fields
        : attempt.label === 'unscoped-records'
          ? []
          : buildMinimalFieldList(reportConfig, fieldDefinitions),
      pagination,
    },
  }));

  const seenSignatures = new Set();
  let lastError = null;

  for (const attempt of attempts) {
    const signature = JSON.stringify(attempt.queryConfig);
    if (seenSignatures.has(signature)) {
      continue;
    }
    seenSignatures.add(signature);

    try {
      const response = await modulesApi.queryModule(module, attempt.queryConfig);
      return {
        response,
        attempt,
      };
    } catch (error) {
      lastError = error;

      if (!shouldRetryDetailQuery(error)) {
        throw error;
      }

      console.warn(`Report detail query fallback "${attempt.label}" failed, trying a safer shape.`, error);
    }
  }

  throw lastError || new Error('Unable to run the report detail query.');
}

export default function ReportDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const analyticsBadges = useAnalyticsBadgeContext();
  const verification = analyticsBadges?.verification || { status: 'unknown', reason: 'Verification unavailable.' };

  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState(null);
  const [moduleFields, setModuleFields] = useState([]);
  const [moduleFieldsLoading, setModuleFieldsLoading] = useState(false);
  const [data, setData] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [dateRange, setDateRange] = useState(null);
  const [runtimeFilterValues, setRuntimeFilterValues] = useState({});
  const [runtimeColumnOrder, setRuntimeColumnOrder] = useState([]);
  const [runtimeColumnWidths, setRuntimeColumnWidths] = useState({});
  const [runtimeColumnCalculations, setRuntimeColumnCalculations] = useState({});
  const [tablePage, setTablePage] = useState(1);
  const [shouldAutoRun, setShouldAutoRun] = useState(false);
  const latestRunIdRef = useRef(0);

  useEffect(() => {
    loadReport();
  }, [id]);

  useEffect(() => {
    const module = resolveReportModule(report);
    if (!module) {
      setModuleFields([]);
      setModuleFieldsLoading(false);
      return undefined;
    }

    let active = true;
    setModuleFieldsLoading(true);

    const loadModuleFields = async () => {
      try {
        const response = await modulesApi.getModuleFields(module);
        const fields = Array.isArray(response?.data?.fields)
          ? response.data.fields
          : Array.isArray(response?.fields)
            ? response.fields
            : [];

        if (active) {
          setModuleFields(fields);
        }
      } catch (error) {
        console.error('Failed to load report module fields:', error);
        if (active) {
          setModuleFields([]);
        }
      } finally {
        if (active) {
          setModuleFieldsLoading(false);
        }
      }
    };

    loadModuleFields();

    return () => {
      active = false;
    };
  }, [report]);

  useEffect(() => {
    if (!report || !shouldAutoRun || moduleFieldsLoading) {
      return;
    }

    setShouldAutoRun(false);
    runReport(report, { page: 1 });
  }, [report, shouldAutoRun, moduleFieldsLoading]);

  const loadReport = async () => {
    try {
      setLoading(true);
      setDateRange(null);
      setRuntimeFilterValues({});
      setRuntimeColumnOrder([]);
      setRuntimeColumnWidths({});
      setRuntimeColumnCalculations({});
      const response = await reportsApi.getSavedReport(id);
      const reportData = response?.data || response;
      if (reportData) {
        const initialDateRange = normalizeReportRuntimeDateRange(reportData);
        setReport(reportData);
        setData(null);
        setDateRange(initialDateRange);
        setRuntimeFilterValues(buildInitialRuntimeFilterValues(reportData));
        setTablePage(1);
        setShouldAutoRun(true);
        setModuleFieldsLoading(Boolean(resolveReportModule(reportData)));
      }
    } catch (error) {
      console.error('Failed to load report:', error);
    } finally {
      setLoading(false);
    }
  };

  const runReport = async (reportConfig = report, options = {}) => {
    if (!reportConfig) return;

    const runId = latestRunIdRef.current + 1;
    latestRunIdRef.current = runId;

    try {
      setRunning(true);
      setErrorMessage('');
      const page = options.page || 1;
      const module = resolveReportModule(reportConfig);
      const activeDateRange = dateRange;
      if (!module) {
        throw new Error('Unable to resolve a report source module.');
      }

      const runtimeFilterModelForRun = buildReportRuntimeFilterModel(
        reportConfig,
        moduleFields,
        Array.isArray(data?.rows) ? data.rows : [],
      );
      const runtimeReportConfig = {
        ...reportConfig,
        filters: buildRuntimeFiltersFromValues(runtimeFilterModelForRun, runtimeFilterValues),
        ...(activeDateRange && !reportConfig?.dateRangeField
          ? { dateRangeField: getDefaultDateField(moduleFields) }
          : {}),
      };

      const detailPlan = buildRawReportQuery(runtimeReportConfig, activeDateRange, {
        page,
        pageSize: TABLE_PAGE_SIZE,
      });
      const selectedFields = toArray(runtimeReportConfig?.selectedFields);
      const detailQueryConfig = {
        ...detailPlan.queryConfig,
        fields: selectedFields.length > 0
          ? selectedFields
          : buildMinimalFieldList(runtimeReportConfig, moduleFields),
      };

      const { response: detailResponse, attempt: detailAttempt } = await queryReportDetailWithFallback(
        module,
        runtimeReportConfig,
        detailQueryConfig,
        moduleFields,
      );
      const rawResult = {
        rows: Array.isArray(detailResponse?.data) ? detailResponse.data : [],
        rowCount: detailResponse?.metadata?.totalCount ?? 0,
        metadata: {
          ...(detailResponse?.metadata || {}),
          page,
          pageSize: TABLE_PAGE_SIZE,
          queryFallbackApplied: detailAttempt?.label && detailAttempt.label !== 'selected-fields',
          queryFallbackLabel: detailAttempt?.label || 'selected-fields',
        },
      };

      const basePresentation = buildReportPresentationData(runtimeReportConfig, rawResult, {
        fieldDefinitions: moduleFields,
      });
      const tablePresentation = buildReportTablePresentation(runtimeReportConfig, basePresentation, {
        fieldDefinitions: moduleFields,
      });

      if (runtimeReportConfig.chartType === 'TABLE') {
        if (runId !== latestRunIdRef.current) {
          return;
        }

        setData(tablePresentation);
        return;
      }

      let nextData = {
        ...tablePresentation,
      };

      if (runtimeReportConfig.chartType === 'BAR' || runtimeReportConfig.chartType === 'PIE') {
        try {
          const groupedPlan = buildGroupedChartQuery(runtimeReportConfig, activeDateRange, moduleFields);
          if (groupedPlan) {
            const groupedResponse = await modulesApi.queryModule(groupedPlan.module, groupedPlan.queryConfig);
            nextData = {
              ...nextData,
              chartData: buildChartDataFromGroupedResults(groupedResponse, groupedPlan),
              metadata: {
                ...nextData.metadata,
                chartSource: 'grouped-query',
              },
            };
          }
        } catch (error) {
          console.error('Failed to load grouped chart data, using visible rows fallback:', error);
          nextData = {
            ...nextData,
            metadata: {
              ...nextData.metadata,
              chartSource: 'visible-rows-fallback',
            },
          };
        }
      }

      if (runtimeReportConfig.chartType === 'LINE' || runtimeReportConfig.chartType === 'AREA') {
        try {
          const timeSeriesPlan = buildTimeSeriesQuery(runtimeReportConfig, activeDateRange, moduleFields);
          if (timeSeriesPlan?.options?.dateField) {
            const timeSeriesResponse = await modulesApi.getTimeSeries(timeSeriesPlan.module, timeSeriesPlan.options);
            const chartPayload = buildChartDataFromTimeSeriesResults(timeSeriesResponse, timeSeriesPlan);
            nextData = {
              ...nextData,
              ...chartPayload,
              metadata: {
                ...nextData.metadata,
                chartSource: 'time-series-query',
              },
            };
          }
        } catch (error) {
          console.error('Failed to load time-series chart data, using visible rows fallback:', error);
          nextData = {
            ...nextData,
            metadata: {
              ...nextData.metadata,
              chartSource: 'visible-rows-fallback',
            },
          };
        }
      }

      if (runtimeReportConfig.chartType === 'KPI') {
        try {
          const summaryFilters = Array.isArray(detailAttempt?.queryConfig?.filters)
            ? detailAttempt.queryConfig.filters
            : buildReportFilters(runtimeReportConfig, activeDateRange);
          const summaryResponse = await modulesApi.getModuleSummary(
            module,
            summaryFilters,
          );

          nextData = {
            ...nextData,
            metrics: buildKpiMetricsFromSummary(summaryResponse, runtimeReportConfig, moduleFields),
            metadata: {
              ...nextData.metadata,
              chartSource: 'summary-query',
            },
          };
        } catch (error) {
          console.error('Failed to load KPI summary data, using visible rows fallback:', error);
          nextData = {
            ...nextData,
            metadata: {
              ...nextData.metadata,
              chartSource: 'visible-rows-fallback',
            },
          };
        }
      }

      if (runId !== latestRunIdRef.current) {
        return;
      }

      setData(nextData);
    } catch (error) {
      if (runId !== latestRunIdRef.current) {
        return;
      }

      console.error('Failed to run report:', error);
      setData(null);
      setErrorMessage('This report could not be run right now. Please try again in a moment.');
    } finally {
      if (runId === latestRunIdRef.current) {
        setRunning(false);
      }
    }
  };

  const handleExport = async (format) => {
    try {
      const params = dateRange ? toAnalyticsDateParams(dateRange) : undefined;
      await reportsApi.exportReport(id, format, params);
    } catch (error) {
      console.error('Failed to export report:', error);
    }
  };

  const handleToggleFavorite = async () => {
    try {
      await reportsApi.toggleFavorite(id);
      setReport(prev => ({ ...prev, isFavorite: !prev.isFavorite }));
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  const dateRangeLabel = useMemo(() => {
    if (!dateRange) {
      return null;
    }

    const resolvedLabel = getReportDateRangeLabel(dateRange);
    if (resolvedLabel) {
      return resolvedLabel;
    }

    if (dateRange?.preset === 'CUSTOM' && dateRange?.startDate && dateRange?.endDate) {
      return `${formatDateMDY(dateRange.startDate)} - ${formatDateMDY(dateRange.endDate)}`;
    }

    return 'Custom Range';
  }, [dateRange]);

  const runtimeFilterModel = useMemo(
    () => buildReportRuntimeFilterModel(
      report,
      moduleFields,
      Array.isArray(data?.rows) ? data.rows : [],
    ),
    [report, moduleFields, data?.rows],
  );

  const runtimeFilterSummaryEntries = useMemo(
    () => buildRuntimeFilterSummaryEntries(runtimeFilterModel, runtimeFilterValues),
    [runtimeFilterModel, runtimeFilterValues],
  );

  const recordCountSummary = useMemo(() => {
    const total = data?.rowCount ?? 0;
    const visible = data?.metadata?.visibleRowCount ?? data?.rows?.length ?? 0;
    const page = data?.metadata?.page || tablePage;
    const pageSize = data?.metadata?.pageSize || TABLE_PAGE_SIZE;

    if (!total) {
      return null;
    }

    const start = visible > 0 ? ((page - 1) * pageSize) + 1 : 0;
    const end = visible > 0 ? start + visible - 1 : 0;

    return {
      total,
      visible,
      page,
      pageSize,
      start,
      end,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      hasHiddenRows: total > visible,
    };
  }, [data, tablePage]);

  const tableRows = Array.isArray(data?.rows) ? data.rows : [];
  const tableColumns = Array.isArray(data?.tableColumns) ? data.tableColumns : [];
  const groupedRows = Array.isArray(data?.groupedRows) ? data.groupedRows : [];
  const defaultTableColumnOrder = useMemo(
    () => extractColumnKeys(tableColumns),
    [tableColumns],
  );
  const orderedTableColumns = useMemo(
    () => applyColumnOrder(tableColumns, runtimeColumnOrder),
    [tableColumns, runtimeColumnOrder],
  );
  const sizedTableColumns = useMemo(
    () => applyReportColumnWidths(orderedTableColumns, runtimeColumnWidths),
    [orderedTableColumns, runtimeColumnWidths],
  );
  const calculableTableColumns = useMemo(
    () => getCalculableReportColumns(orderedTableColumns),
    [orderedTableColumns],
  );
  const normalizedColumnCalculations = useMemo(
    () => normalizeReportCalculationSelections(orderedTableColumns, runtimeColumnCalculations),
    [orderedTableColumns, runtimeColumnCalculations],
  );
  const overallCalculationEntries = useMemo(
    () => buildReportCalculationEntries(orderedTableColumns, tableRows, normalizedColumnCalculations),
    [orderedTableColumns, tableRows, normalizedColumnCalculations],
  );
  const displayGroupedRows = useMemo(
    () => applyGroupCalculationSelections(groupedRows, orderedTableColumns, normalizedColumnCalculations),
    [groupedRows, orderedTableColumns, normalizedColumnCalculations],
  );
  const hasRuntimeColumnCustomization = useMemo(
    () => hasCustomColumnOrder(runtimeColumnOrder, defaultTableColumnOrder),
    [defaultTableColumnOrder, runtimeColumnOrder],
  );
  const hasRuntimeColumnWidthCustomization = useMemo(
    () => hasCustomReportColumnWidths(orderedTableColumns, runtimeColumnWidths),
    [orderedTableColumns, runtimeColumnWidths],
  );
  const hasRuntimeColumnCalculationCustomization = useMemo(
    () => Object.keys(normalizedColumnCalculations).length > 0,
    [normalizedColumnCalculations],
  );
  const shouldRenderDetailTable = tableColumns.length > 0
    && (tableRows.length > 0 || displayGroupedRows.length > 0);

  useEffect(() => {
    if (!id || defaultTableColumnOrder.length === 0) {
      return;
    }

    const storageKey = `report-column-order:${id}`;

    setRuntimeColumnOrder((prev) => {
      let baseOrder = prev;

      if (baseOrder.length === 0 && typeof window !== 'undefined') {
        try {
          const storedOrder = window.sessionStorage.getItem(storageKey);
          if (storedOrder) {
            const parsedOrder = JSON.parse(storedOrder);
            if (Array.isArray(parsedOrder)) {
              baseOrder = parsedOrder;
            }
          }
        } catch (error) {
          console.warn('Failed to restore report column order:', error);
        }
      }

      const normalizedOrder = normalizeOrderedKeys(
        baseOrder.length > 0 ? baseOrder : defaultTableColumnOrder,
        defaultTableColumnOrder,
      );

      return JSON.stringify(prev) === JSON.stringify(normalizedOrder)
        ? prev
        : normalizedOrder;
    });
  }, [defaultTableColumnOrder, id]);

  useEffect(() => {
    if (!id || typeof window === 'undefined') {
      return;
    }

    try {
      const storageKey = `report-column-order:${id}`;
      if (!hasCustomColumnOrder(runtimeColumnOrder, defaultTableColumnOrder)) {
        window.sessionStorage.removeItem(storageKey);
        return;
      }

      window.sessionStorage.setItem(storageKey, JSON.stringify(
        normalizeOrderedKeys(runtimeColumnOrder, defaultTableColumnOrder),
      ));
    } catch (error) {
      console.warn('Failed to persist report column order:', error);
    }
  }, [defaultTableColumnOrder, id, runtimeColumnOrder]);

  useEffect(() => {
    if (!id || orderedTableColumns.length === 0) {
      return;
    }

    const storageKey = `report-column-widths:${id}`;

    setRuntimeColumnWidths((prev) => {
      let baseWidths = prev;

      if (Object.keys(baseWidths).length === 0 && typeof window !== 'undefined') {
        try {
          const storedWidths = window.sessionStorage.getItem(storageKey);
          if (storedWidths) {
            const parsedWidths = JSON.parse(storedWidths);
            if (parsedWidths && typeof parsedWidths === 'object' && !Array.isArray(parsedWidths)) {
              baseWidths = parsedWidths;
            }
          }
        } catch (error) {
          console.warn('Failed to restore report column widths:', error);
        }
      }

      const normalizedWidths = buildPersistableReportColumnWidths(orderedTableColumns, baseWidths);

      return JSON.stringify(prev) === JSON.stringify(normalizedWidths)
        ? prev
        : normalizedWidths;
    });
  }, [id, orderedTableColumns]);

  useEffect(() => {
    if (!id || typeof window === 'undefined') {
      return;
    }

    try {
      const storageKey = `report-column-widths:${id}`;
      const persistableWidths = buildPersistableReportColumnWidths(orderedTableColumns, runtimeColumnWidths);

      if (Object.keys(persistableWidths).length === 0) {
        window.sessionStorage.removeItem(storageKey);
        return;
      }

      window.sessionStorage.setItem(storageKey, JSON.stringify(persistableWidths));
    } catch (error) {
      console.warn('Failed to persist report column widths:', error);
    }
  }, [id, orderedTableColumns, runtimeColumnWidths]);

  useEffect(() => {
    if (!id || orderedTableColumns.length === 0) {
      return;
    }

    const storageKey = `report-column-calculations:${id}`;

    setRuntimeColumnCalculations((prev) => {
      let baseSelections = prev;

      if (Object.keys(baseSelections).length === 0 && typeof window !== 'undefined') {
        try {
          const storedSelections = window.sessionStorage.getItem(storageKey);
          if (storedSelections) {
            const parsedSelections = JSON.parse(storedSelections);
            if (parsedSelections && typeof parsedSelections === 'object' && !Array.isArray(parsedSelections)) {
              baseSelections = parsedSelections;
            }
          }
        } catch (error) {
          console.warn('Failed to restore report column calculations:', error);
        }
      }

      const normalizedSelections = normalizeReportCalculationSelections(orderedTableColumns, baseSelections);

      return JSON.stringify(prev) === JSON.stringify(normalizedSelections)
        ? prev
        : normalizedSelections;
    });
  }, [id, orderedTableColumns]);

  useEffect(() => {
    if (!id || typeof window === 'undefined') {
      return;
    }

    try {
      const storageKey = `report-column-calculations:${id}`;
      const persistableSelections = normalizeReportCalculationSelections(
        orderedTableColumns,
        runtimeColumnCalculations,
      );

      if (Object.keys(persistableSelections).length === 0) {
        window.sessionStorage.removeItem(storageKey);
        return;
      }

      window.sessionStorage.setItem(storageKey, JSON.stringify(persistableSelections));
    } catch (error) {
      console.warn('Failed to persist report column calculations:', error);
    }
  }, [id, orderedTableColumns, runtimeColumnCalculations]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-panda-primary"></div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="p-6 text-center">
        <div className="text-gray-500 mb-4">Report not found</div>
        <button
          onClick={() => navigate('/analytics/reports')}
          className="text-panda-primary hover:underline"
        >
          Back to Reports
        </button>
      </div>
    );
  }

  const emptyStateContext = {
    title: report?.name || 'Report',
    source: deriveDataSource(report),
    verifiedStatus: verification.status,
    verifiedReason: verification.reason,
    failedChecks: verification.failedChecks || [],
    rowCount: data?.rowCount ?? data?.rows?.length ?? 0,
    filters: {
      ...(dateRangeLabel ? { 'Date Range': dateRangeLabel } : {}),
      ...runtimeFilterSummaryEntries.reduce((entries, entry, index) => ({
        ...entries,
        [runtimeFilterSummaryEntries.some((candidate, candidateIndex) => candidate.label === entry.label && candidateIndex !== index)
          ? `${entry.label} ${index + 1}`
          : entry.label]: entry.value,
      }), {}),
    },
  };

  const handleRunReport = async () => {
    setShouldAutoRun(false);
    setTablePage(1);
    await runReport(report, { page: 1 });
  };

  const handleTablePageChange = async (nextPage) => {
    setShouldAutoRun(false);
    setTablePage(nextPage);
    await runReport(report, { page: nextPage });
  };

  const handleRuntimeFilterValueChange = (filterId, nextValue) => {
    setRuntimeFilterValues((prev) => ({
      ...prev,
      [filterId]: nextValue,
    }));
  };

  const handleMoveRuntimeColumn = (columnKey, direction) => {
    setRuntimeColumnOrder((prev) => {
      const baseOrder = prev.length > 0 ? prev : defaultTableColumnOrder;
      return moveOrderedValue(baseOrder, columnKey, direction);
    });
  };

  const handleResetRuntimeColumnOrder = () => {
    setRuntimeColumnOrder(defaultTableColumnOrder);

    if (id && typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(`report-column-order:${id}`);
      } catch (error) {
        console.warn('Failed to reset report column order:', error);
      }
    }
  };

  const handleRuntimeColumnWidthChange = (columnKey, nextWidth) => {
    const activeColumn = orderedTableColumns.find((column) => column.key === columnKey);
    if (!activeColumn) {
      return;
    }

    setRuntimeColumnWidths((prev) => ({
      ...prev,
      [columnKey]: clampReportColumnWidth(nextWidth, activeColumn),
    }));
  };

  const handleResetRuntimeColumnWidths = () => {
    setRuntimeColumnWidths({});

    if (id && typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(`report-column-widths:${id}`);
      } catch (error) {
        console.warn('Failed to reset report column widths:', error);
      }
    }
  };

  const handleRuntimeColumnCalculationChange = (columnKey, nextCalculation) => {
    setRuntimeColumnCalculations((prev) => {
      if (!nextCalculation || nextCalculation === 'none') {
        if (!Object.prototype.hasOwnProperty.call(prev, columnKey)) {
          return prev;
        }

        const { [columnKey]: _removed, ...rest } = prev;
        return rest;
      }

      return {
        ...prev,
        [columnKey]: nextCalculation,
      };
    });
  };

  const handleResetRuntimeColumnCalculations = () => {
    setRuntimeColumnCalculations({});

    if (id && typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(`report-column-calculations:${id}`);
      } catch (error) {
        console.warn('Failed to reset report column calculations:', error);
      }
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => navigate('/analytics/reports')}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-2xl font-bold text-gray-900">{report.name}</h1>
            <button
              onClick={handleToggleFavorite}
              className={`p-1 rounded ${report.isFavorite ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-500'}`}
            >
              <svg className="w-5 h-5" fill={report.isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </button>
          </div>
          {report.description && (
            <p className="text-gray-500">{report.description}</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/analytics/reports/${id}/edit`)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Edit
          </button>
          <button
            onClick={() => navigate(`/analytics/reports/advanced/${id}`)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Advanced
          </button>
          <div className="relative group">
            <button className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
              Export
            </button>
            <div className="hidden group-hover:block absolute right-0 top-full mt-1 bg-white shadow-lg rounded-lg border border-gray-200 py-1 z-10">
              <button
                onClick={() => handleExport('csv')}
                className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
              >
                Export as CSV
              </button>
              <button
                onClick={() => handleExport('pdf')}
                className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
              >
                Export as PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      <ReportRuntimeFilters
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        definitions={runtimeFilterModel.definitions}
        values={runtimeFilterValues}
        onValueChange={handleRuntimeFilterValueChange}
        onRun={handleRunReport}
        running={running}
      />

      {errorMessage && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {/* Results */}
      {data && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
            {dateRangeLabel && (
              <span>Showing data for: {dateRangeLabel}</span>
            )}
            {runtimeFilterSummaryEntries.map((entry) => (
              <span key={`${entry.label}-${entry.value}`}>
                {entry.label}: {entry.value}
              </span>
            ))}
            {recordCountSummary && (
              <span>
                {recordCountSummary.hasHiddenRows
                  ? `Showing ${formatNumber(recordCountSummary.start)}-${formatNumber(recordCountSummary.end)} of ${formatNumber(recordCountSummary.total)} records`
                  : `${formatNumber(recordCountSummary.total)} total records`}
              </span>
            )}
            {data?.metadata?.queryFallbackApplied && (
              <span>Showing a safe fallback view for this saved report configuration.</span>
            )}
            {data?.metadata?.chartSource === 'visible-rows-fallback' && (
              <span>Chart based on currently visible detail rows.</span>
            )}
          </div>

          {report.chartType === 'KPI' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {(data.metrics || []).map((metric, index) => (
                <KPICard
                  key={index}
                  title={metric.label}
                  value={metric.value}
                  previousValue={metric.previousValue}
                  format={metric.format || 'number'}
                  emptyStateContext={emptyStateContext}
                />
              ))}
            </div>
          )}

          {report.chartType === 'BAR' && (
            <BarChartWidget
              title={report.name}
              data={data.chartData || []}
              dataKey="value"
              nameKey="name"
              loading={running}
              emptyStateContext={emptyStateContext}
            />
          )}

          {report.chartType === 'PIE' && (
            <PieChartWidget
              title={report.name}
              data={data.chartData || []}
              dataKey="value"
              nameKey="name"
              loading={running}
              emptyStateContext={emptyStateContext}
            />
          )}

          {(report.chartType === 'LINE' || report.chartType === 'AREA') && (
            <LineChartWidget
              title={report.name}
              data={data.chartData || []}
              lines={data.series || [{ dataKey: 'value', name: 'Value', color: 'primary' }]}
              xAxisKey="date"
              loading={running}
              showArea={report.chartType === 'AREA'}
              emptyStateContext={emptyStateContext}
            />
          )}

          {shouldRenderDetailTable && (
            <div className="space-y-4">
              {orderedTableColumns.length > 1 && (
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">Arrange Columns</h3>
                      <p className="text-sm text-gray-500">
                        Reorder columns here, then drag a header edge in the table to resize it for this session.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleResetRuntimeColumnOrder}
                        disabled={!hasRuntimeColumnCustomization}
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Reset to Saved Order
                      </button>
                      <button
                        type="button"
                        onClick={handleResetRuntimeColumnWidths}
                        disabled={!hasRuntimeColumnWidthCustomization}
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Reset Widths
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {orderedTableColumns.map((column, index) => (
                      <div
                        key={column.key}
                        className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                      >
                        <span className="w-5 text-center text-xs font-semibold text-gray-500">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-gray-800">{column.label}</div>
                          <div className="text-xs text-gray-500">{column.key}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleMoveRuntimeColumn(column.key, 'up')}
                            disabled={index === 0}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Move Left
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveRuntimeColumn(column.key, 'down')}
                            disabled={index === orderedTableColumns.length - 1}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Move Right
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {calculableTableColumns.length > 0 && (
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">Calculations</h3>
                      <p className="text-sm text-gray-500">
                        Calculations use the currently visible report rows after filters, date range, and grouping.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleResetRuntimeColumnCalculations}
                      disabled={!hasRuntimeColumnCalculationCustomization}
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Reset Calculations
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {calculableTableColumns.map((column) => (
                      <label
                        key={column.key}
                        className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                      >
                        <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                          {column.label}
                        </span>
                        <select
                          value={normalizedColumnCalculations[column.key] || 'none'}
                          onChange={(event) => handleRuntimeColumnCalculationChange(column.key, event.target.value)}
                          className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-panda-primary focus:ring-2 focus:ring-panda-primary"
                        >
                          {REPORT_COLUMN_CALCULATION_OPTIONS.map((option) => (
                            <option key={`${column.key}-${option.value}`} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>

                  {overallCalculationEntries.length > 0 ? (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {overallCalculationEntries.map((entry) => (
                        <span
                          key={entry.key}
                          className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-200"
                        >
                          <span className="text-gray-500">{entry.label}</span>
                          <span className="text-gray-900">{formatReportCalculationValue(entry)}</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-gray-500">
                      Choose a calculation for any numeric column to see visible-row summaries here.
                    </p>
                  )}

                  {displayGroupedRows.length > 0 && hasRuntimeColumnCalculationCustomization && (
                    <p className="mt-3 text-xs text-gray-500">
                      Selected calculations also appear in each visible group summary when they add information beyond the default subtotal chips.
                    </p>
                  )}
                </div>
              )}

              <TableWidget
                data={tableRows}
                groups={displayGroupedRows}
                columns={sizedTableColumns}
                emptyStateContext={emptyStateContext}
                loading={running}
                recordModule={data?.recordModule || resolveReportModule(report)}
                showPagination={Boolean(recordCountSummary?.totalPages > 1)}
                pageSize={data?.metadata?.pageSize || TABLE_PAGE_SIZE}
                currentPage={data?.metadata?.page || tablePage}
                totalItems={data?.rowCount || 0}
                onPageChange={handleTablePageChange}
                serverSidePagination={true}
                sortable={false}
                resizableColumns={true}
                onColumnWidthChange={handleRuntimeColumnWidthChange}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
