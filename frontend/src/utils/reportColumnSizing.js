const DEFAULT_REPORT_COLUMN_WIDTH = 180;
const MIN_REPORT_COLUMN_WIDTH = 120;
const MAX_REPORT_COLUMN_WIDTH = 640;

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function parseWidthValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized.endsWith('px')) {
    const numeric = Number(normalized.slice(0, -2));
    return Number.isFinite(numeric) ? numeric : null;
  }

  if (/^\d+(\.\d+)?$/.test(normalized)) {
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : null;
  }

  return null;
}

export function clampReportColumnWidth(width, column = {}) {
  const minWidth = parseWidthValue(column?.minWidth) ?? MIN_REPORT_COLUMN_WIDTH;
  const maxWidth = parseWidthValue(column?.maxWidth) ?? MAX_REPORT_COLUMN_WIDTH;
  const fallbackWidth = parseWidthValue(column?.width) ?? DEFAULT_REPORT_COLUMN_WIDTH;
  const numericWidth = Number.isFinite(Number(width)) ? Number(width) : fallbackWidth;

  return Math.min(maxWidth, Math.max(minWidth, Math.round(numericWidth)));
}

export function getDefaultReportColumnWidth(column = {}) {
  const configuredWidth = parseWidthValue(column?.width);
  return clampReportColumnWidth(
    configuredWidth ?? DEFAULT_REPORT_COLUMN_WIDTH,
    column,
  );
}

export function resolveReportColumnWidths(columns = [], storedWidths = {}) {
  const widthMap = toObject(storedWidths);

  return toArray(columns).reduce((resolved, column) => {
    if (!column?.key) {
      return resolved;
    }

    const storedWidth = widthMap[column.key];
    const defaultWidth = getDefaultReportColumnWidth(column);

    return {
      ...resolved,
      [column.key]: storedWidth == null
        ? defaultWidth
        : clampReportColumnWidth(storedWidth, column),
    };
  }, {});
}

export function applyReportColumnWidths(columns = [], storedWidths = {}) {
  const resolvedWidths = resolveReportColumnWidths(columns, storedWidths);

  return toArray(columns).map((column) => {
    if (!column?.key) {
      return column;
    }

    const width = resolvedWidths[column.key];
    const minWidth = parseWidthValue(column?.minWidth) ?? MIN_REPORT_COLUMN_WIDTH;
    const maxWidth = parseWidthValue(column?.maxWidth) ?? MAX_REPORT_COLUMN_WIDTH;

    return {
      ...column,
      width: `${width}px`,
      minWidth: `${minWidth}px`,
      maxWidth: `${maxWidth}px`,
    };
  });
}

export function buildPersistableReportColumnWidths(columns = [], storedWidths = {}) {
  const resolvedWidths = resolveReportColumnWidths(columns, storedWidths);

  return toArray(columns).reduce((persistable, column) => {
    if (!column?.key) {
      return persistable;
    }

    const defaultWidth = getDefaultReportColumnWidth(column);
    const resolvedWidth = resolvedWidths[column.key];

    if (resolvedWidth === defaultWidth) {
      return persistable;
    }

    return {
      ...persistable,
      [column.key]: resolvedWidth,
    };
  }, {});
}

export function hasCustomReportColumnWidths(columns = [], storedWidths = {}) {
  return Object.keys(buildPersistableReportColumnWidths(columns, storedWidths)).length > 0;
}

export function sumReportColumnWidths(columns = [], storedWidths = {}) {
  const resolvedWidths = resolveReportColumnWidths(columns, storedWidths);

  return toArray(columns).reduce((total, column) => {
    if (!column?.key) {
      return total;
    }

    return total + (resolvedWidths[column.key] || 0);
  }, 0);
}

export default {
  applyReportColumnWidths,
  buildPersistableReportColumnWidths,
  clampReportColumnWidth,
  getDefaultReportColumnWidth,
  hasCustomReportColumnWidths,
  resolveReportColumnWidths,
  sumReportColumnWidths,
};
