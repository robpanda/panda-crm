const JOB_REFERENCE_COLUMN_KEYS = new Set([
  'jobid',
  'jobnumber',
  'jobreference',
  'jobref',
  'opportunityid',
]);

const JOB_REFERENCE_COLUMN_LABELS = new Set([
  'job',
  'job id',
  'job number',
  'job reference',
]);

const LAST_NAME_COLUMN_KEYS = new Set([
  'lastname',
  'customerlastname',
]);

const LAST_NAME_COLUMN_LABELS = new Set([
  'last name',
  'customer last name',
]);

const JOB_ROUTE_TARGET_KEYS = [
  'opportunityId',
  'convertedOpportunityId',
  'jobRecordId',
  'job.id',
  'opportunity.id',
];

const LEAD_ROUTE_TARGET_KEYS = [
  'leadId',
  'leadRecordId',
  'lead.id',
];

function hasDisplayValue(value) {
  if (typeof value === 'number') {
    return true;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  return value != null;
}

function normalizeRecordId(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue || null;
}

function normalizeColumnKey(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function normalizeColumnLabel(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function readRowValue(row, path) {
  if (!row || typeof row !== 'object' || !path) {
    return undefined;
  }

  if (Object.prototype.hasOwnProperty.call(row, path)) {
    return row[path];
  }

  if (!path.includes('.')) {
    return row[path];
  }

  return path
    .split('.')
    .reduce((current, segment) => (current && typeof current === 'object' ? current[segment] : undefined), row);
}

function getRouteTargetId(row, recordModule, relationKeys, ownModule) {
  for (const key of relationKeys) {
    const relatedId = normalizeRecordId(readRowValue(row, key));
    if (relatedId) {
      return relatedId;
    }
  }

  if (recordModule === ownModule) {
    return normalizeRecordId(row?.id) || normalizeRecordId(row?.recordId);
  }

  return null;
}

function isJobReferenceColumn(column) {
  const columnKey = normalizeColumnKey(column?.key);
  const columnLabel = normalizeColumnLabel(column?.label);

  return JOB_REFERENCE_COLUMN_KEYS.has(columnKey) || JOB_REFERENCE_COLUMN_LABELS.has(columnLabel);
}

function isLastNameColumn(column) {
  const columnKey = normalizeColumnKey(column?.key);
  const columnLabel = normalizeColumnLabel(column?.label);

  return LAST_NAME_COLUMN_KEYS.has(columnKey) || LAST_NAME_COLUMN_LABELS.has(columnLabel);
}

function getJobRouteTargetId(row, recordModule) {
  return getRouteTargetId(row, recordModule, JOB_ROUTE_TARGET_KEYS, 'jobs');
}

function getLeadRouteTargetId(row, recordModule) {
  return getRouteTargetId(row, recordModule, LEAD_ROUTE_TARGET_KEYS, 'leads');
}

export function resolveReportRowLink(recordModule, row, column) {
  if (!row || !column || !hasDisplayValue(row[column.key])) {
    return null;
  }

  if (isJobReferenceColumn(column)) {
    const jobRecordId = getJobRouteTargetId(row, recordModule);
    return jobRecordId ? `/jobs/${jobRecordId}` : null;
  }

  if (!isLastNameColumn(column)) {
    return null;
  }

  if (recordModule === 'jobs') {
    const jobRecordId = getJobRouteTargetId(row, recordModule);
    return jobRecordId ? `/jobs/${jobRecordId}` : null;
  }

  if (recordModule === 'leads') {
    const leadRecordId = getLeadRouteTargetId(row, recordModule);
    return leadRecordId ? `/leads/${leadRecordId}` : null;
  }

  const relatedJobId = getJobRouteTargetId(row, recordModule);
  if (relatedJobId) {
    return `/jobs/${relatedJobId}`;
  }

  const relatedLeadId = getLeadRouteTargetId(row, recordModule);
  if (relatedLeadId) {
    return `/leads/${relatedLeadId}`;
  }

  return null;
}

export default resolveReportRowLink;
