import crypto from 'crypto';
import XLSX from 'xlsx';
import {
  deriveCallCenterStatus,
  normalizeCallCenterDispositionCode,
  requiresCallbackAt,
  toSystemLeadStatusFromDisposition,
} from '../../../../shared/src/services/callCenterTaxonomy.js';
import { logger } from '../middleware/logger.js';

const IMPORT_SOURCE = 'call_center_import';
const DEFAULT_OPPORTUNITY_STAGE = 'LEAD_ASSIGNED';
const APPOINTMENT_DURATION_MINUTES = 120;
const PREVIEW_TOKEN_TTL_MS = 30 * 60 * 1000;
const PREVIEW_ANALYZE_CONCURRENCY = 16;
const REPORTING_CREDIT_TOTAL = 100;
const NON_USER_ALIAS_SENTINEL = '__NON_USER__';
const DEFAULT_SYSTEM_LABEL_ASSIGNEE = 'Company Lead';
const SYSTEM_LABEL_ASSIGNEE_ALIAS_KEY = '__SYSTEM_LABEL_ASSIGNEE__';
const PREVIEW_PLAN_SETTING_CATEGORY = 'call_center_import_preview';
const PREVIEW_PLAN_SETTING_PREFIX = 'call_center_import.preview.';
const PREVIEW_PLAN_SETTING_DESCRIPTION = 'Durable reviewed preview plan lock for call-center import';

const DEFAULT_USER_ALIAS_MAP = {};
const SPLIT_OWNER_INPUT_PATTERN = /[\/,&]| and /i;

const KNOWN_SYSTEM_LABELS = new Set([
  '',
  '-',
  'n/a',
  'na',
  'none',
  'unknown',
  'unassigned',
  'telemarketing',
  'businessdevelopment',
  'reset',
  'ai',
  'admin',
  'office',
  'callcenter',
  'teamlead',
  'house',
  'queue',
  'noccrep',
  'scheduled',
  'leadset',
  'canceled',
  'cancelled',
  'confirmed',
  'rescheduled',
  'phonecall',
]);

const SHEET_CATEGORY_PATTERNS = [
  { pattern: /confirm/i, category: 'confirmation' },
  { pattern: /appointment/i, category: 'appointments' },
  { pattern: /lead|set/i, category: 'lead_set' },
];

const PHONE_PATTERN = /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const CURRENCY_PATTERN = /\$?\s*(-?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|-?\d+(?:\.\d{1,2})?)/;
const NAME_SPLIT_PATTERN = /\s+/;
const EXPLICIT_EVENT_TYPES = new Set([
  'LEAD_CREATED',
  'APPOINTMENT_SET',
  'CONFIRMATION',
  'APPOINTMENT_RAN',
  'SALE',
  'REVENUE',
]);

const previewPlanRegistry = new Map();
let defaultPrismaClient = null;

async function resolvePrismaClient(client = null) {
  if (client) return client;
  if (!defaultPrismaClient) {
    const prismaModule = await import('../prisma.js');
    defaultPrismaClient = prismaModule.default;
  }
  return defaultPrismaClient;
}

function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeNameKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function roundCreditPercent(value) {
  return Math.round(Number(value) * 100) / 100;
}

function connectById(id) {
  return id ? { connect: { id } } : undefined;
}

function hasValue(value) {
  return value !== null && value !== undefined && normalizeText(value) !== '';
}

function normalizeSheetName(name) {
  return normalizeText(name || 'Sheet');
}

function inferSheetCategory(sheetName) {
  const normalized = normalizeSheetName(sheetName);
  const match = SHEET_CATEGORY_PATTERNS.find(({ pattern }) => pattern.test(normalized));
  return match?.category || 'generic';
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return null;
  if (['yes', 'y', 'true', '1', 'set', 'scheduled', 'confirmed'].includes(normalized)) return true;
  if (['no', 'n', 'false', '0', 'cancelled', 'canceled'].includes(normalized)) return false;
  return null;
}

function parseCurrency(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const normalized = normalizeText(value);
  if (!normalized) return null;
  const match = normalized.replace(/,/g, '').match(CURRENCY_PATTERN);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseEmail(...values) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized) continue;
    const match = normalized.match(EMAIL_PATTERN);
    if (match?.[0]) return match[0].toLowerCase();
  }
  return null;
}

function parsePhone(...values) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized) continue;
    const match = normalized.match(PHONE_PATTERN);
    if (match?.[0]) {
      const digits = match[0].replace(/\D/g, '');
      if (digits.length === 10) return digits;
      if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
    }
  }
  return null;
}

function phoneVariants(phone) {
  const digits = normalizeText(phone).replace(/\D/g, '');
  if (digits.length < 10) return [];
  const base = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  const variants = new Set([digits, base]);
  if (base.length === 10) {
    variants.add(`(${base.slice(0, 3)}) ${base.slice(3, 6)}-${base.slice(6)}`);
    variants.add(`${base.slice(0, 3)}-${base.slice(3, 6)}-${base.slice(6)}`);
    variants.add(`${base.slice(0, 3)} ${base.slice(3, 6)} ${base.slice(6)}`);
    variants.add(`+1${base}`);
    variants.add(`1${base}`);
  }
  return [...variants];
}

function parseDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const normalized = normalizeText(value);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function parseTimeParts(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return {
      hours: value.getUTCHours(),
      minutes: value.getUTCMinutes(),
      seconds: value.getUTCSeconds(),
      display: value.toISOString().slice(11, 16),
    };
  }

  const normalized = normalizeText(value).toUpperCase().replace(/\./g, '');
  if (!normalized) return null;

  const meridiemMatch = normalized.match(/^(\d{1,2})(?::?(\d{2}))?\s*(AM|PM)$/);
  if (meridiemMatch) {
    let hours = Number(meridiemMatch[1]);
    const minutes = Number(meridiemMatch[2] || '0');
    const suffix = meridiemMatch[3];
    if (suffix === 'PM' && hours < 12) hours += 12;
    if (suffix === 'AM' && hours === 12) hours = 0;
    return {
      hours,
      minutes,
      seconds: 0,
      display: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
    };
  }

  const compactMeridiemMatch = normalized.match(/^(\d{1,2})(\d{2})(AM|PM)$/);
  if (compactMeridiemMatch) {
    let hours = Number(compactMeridiemMatch[1]);
    const minutes = Number(compactMeridiemMatch[2]);
    const suffix = compactMeridiemMatch[3];
    if (suffix === 'PM' && hours < 12) hours += 12;
    if (suffix === 'AM' && hours === 12) hours = 0;
    return {
      hours,
      minutes,
      seconds: 0,
      display: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
    };
  }

  const militaryMatch = normalized.match(/^(\d{1,2})(?::?(\d{2}))$/);
  if (militaryMatch) {
    const hours = Number(militaryMatch[1]);
    const minutes = Number(militaryMatch[2] || '0');
    if (hours <= 23 && minutes <= 59) {
      return {
        hours,
        minutes,
        seconds: 0,
        display: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
      };
    }
  }

  return null;
}

function combineDateAndTime(dateValue, timeValue) {
  const dateOnly = parseDateOnly(dateValue);
  if (!dateOnly) return null;
  const timeParts = parseTimeParts(timeValue) || { hours: 9, minutes: 0, seconds: 0, display: '09:00' };
  const combined = new Date(dateOnly);
  combined.setUTCHours(timeParts.hours, timeParts.minutes, timeParts.seconds, 0);
  return {
    value: combined,
    displayTime: timeParts.display,
  };
}

function splitFullName(fullName) {
  const normalized = normalizeText(fullName);
  if (!normalized) return { firstName: null, lastName: null };
  const parts = normalized.split(NAME_SPLIT_PATTERN).filter(Boolean);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: 'Unknown' };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

function normalizeExplicitEventType(value) {
  const normalized = normalizeText(value).toUpperCase().replace(/[^A-Z]+/g, '_');
  return EXPLICIT_EVENT_TYPES.has(normalized) ? normalized : null;
}

function dispositionToEventType(disposition, sheetCategory) {
  const normalized = normalizeText(disposition).toLowerCase();

  if (!normalized) {
    if (sheetCategory === 'confirmation') return 'CONFIRMATION';
    if (sheetCategory === 'lead_set') return 'APPOINTMENT_SET';
    return 'LEAD_CREATED';
  }

  if (normalized.includes('closed won') || normalized.includes('sold')) return 'SALE';
  if (normalized.includes('revenue')) return 'REVENUE';
  if (normalized.includes('no demo') || normalized.includes('ran') || normalized.includes('inspected')) return 'APPOINTMENT_RAN';
  if (normalized.includes('confirm')) return 'CONFIRMATION';
  if (normalized.includes('scheduled') || normalized.includes('lead set') || normalized === 'set') return 'APPOINTMENT_SET';
  if (normalized.includes('rescheduled') || normalized.includes('canceled') || normalized.includes('cancelled')) {
    return sheetCategory === 'confirmation' ? 'CONFIRMATION' : 'APPOINTMENT_SET';
  }
  if (normalized.includes('lead not set') || normalized.includes('not set')) return 'LEAD_CREATED';
  return sheetCategory === 'confirmation' ? 'CONFIRMATION' : 'LEAD_CREATED';
}

function inferEventType(row, sheetCategory) {
  const explicit = normalizeExplicitEventType(row.eventType);
  if (explicit) return explicit;
  if (hasValue(row.amount) || hasValue(row.contractTotal)) {
    return row.amount || row.contractTotal ? 'REVENUE' : 'SALE';
  }
  return dispositionToEventType(row.disposition || row.status || row.value, sheetCategory);
}

function deriveNormalizedDisposition(row) {
  const normalized = normalizeCallCenterDispositionCode(row.disposition);
  if (normalized) return normalized;
  if (row.eventType === 'CONFIRMATION') return 'CONFIRMED';
  if (row.eventType === 'APPOINTMENT_SET') return 'SCHEDULED';
  return null;
}

function extractHeaderValue(record, keys) {
  for (const key of keys) {
    if (hasValue(record[key])) return record[key];
  }
  return null;
}

function buildWorkbookRows(buffer, fileName = 'workbook.xlsx') {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const rows = [];

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;

    const matrix = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    });

    const headerRow = matrix.find((row) => Array.isArray(row) && row.some((cell) => hasValue(cell)));
    if (!headerRow) return;
    const headerIndex = matrix.indexOf(headerRow);
    const headers = headerRow.map((value, index) => normalizeKey(value) || `column${index + 1}`);

    matrix.slice(headerIndex + 1).forEach((rawRow, offset) => {
      if (!Array.isArray(rawRow)) return;
      if (!rawRow.some((cell) => hasValue(cell))) return;
      const record = {};
      headers.forEach((header, index) => {
        record[header] = rawRow[index] ?? null;
      });
      rows.push({
        sourceFileName: fileName,
        sourceSheet: sheetName,
        sourceRowNumber: headerIndex + offset + 2,
        rawRecord: record,
      });
    });
  });

  return rows;
}

function normalizeJsonRows(rows = [], sourceFileName = 'json') {
  return rows.map((rawRecord, index) => {
    const normalizedRecord = {};
    for (const [key, value] of Object.entries(rawRecord || {})) {
      normalizedRecord[normalizeKey(key) || key] = value;
    }
    return {
      sourceFileName,
      sourceSheet: normalizeSheetName(rawRecord.sourceSheet || rawRecord.sheetName || 'JSON'),
      sourceRowNumber: Number(rawRecord.sourceRowNumber || index + 1),
      rawRecord: normalizedRecord,
    };
  });
}

function parseStructuredNoteAmount(notes) {
  const normalized = normalizeText(notes);
  if (!normalized) return null;
  if (!/\$|\b(amount|revenue|total|contract)\b/i.test(normalized)) {
    return null;
  }
  return parseCurrency(normalized);
}

function normalizeWorkbookRecord(sourceRecord) {
  const { rawRecord, sourceFileName, sourceSheet, sourceRowNumber } = sourceRecord;
  const category = inferSheetCategory(sourceSheet);
  const name = extractHeaderValue(rawRecord, ['homeownername', 'column1', 'name']);
  const notes = extractHeaderValue(rawRecord, [
    'additionalnotes',
    'additionalnotes:',
    'setnotes',
    'notes',
    'notestransferred',
  ]);
  const dateValue = extractHeaderValue(rawRecord, ['date', 'appointmentdate']);
  const timeValue = extractHeaderValue(rawRecord, ['time', 'appointmenttime']);
  const eventAt = combineDateAndTime(dateValue, timeValue);
  const disposition = extractHeaderValue(rawRecord, ['disposition', 'status', 'value']);
  const representative = extractHeaderValue(rawRecord, ['representative', 'bdrep', 'rep', '2ndvisitrep']);
  const leadCreator = extractHeaderValue(rawRecord, ['leadcreator', 'assignedby', 'assignedby:']);
  const callCenterRep = extractHeaderValue(rawRecord, ['callcenterrep']);
  const assignedTo = extractHeaderValue(rawRecord, ['assignedto', 'rep']);
  const workType = extractHeaderValue(rawRecord, ['worktype']);
  const state = extractHeaderValue(rawRecord, ['state']);
  const confirmed60 = parseBoolean(extractHeaderValue(rawRecord, ['confirmed60mins', 'needconfirmed']));
  const confirmedRoofAge = parseBoolean(extractHeaderValue(rawRecord, ['confirmedroofage']));
  const inNewCrm = parseBoolean(extractHeaderValue(rawRecord, ['innewcrm']));
  const email = parseEmail(rawRecord.email, notes);
  const phone = parsePhone(rawRecord.phone, rawRecord.mobilephone, notes, name);
  const amount = parseCurrency(rawRecord.amount) ?? parseStructuredNoteAmount(notes);
  const repName = normalizeText(callCenterRep || leadCreator || assignedTo || representative);
  const row = {
    rowId: createDeterministicRowId({ sourceFileName, sourceSheet, sourceRowNumber, rawRecord }),
    sourceFileName,
    sourceSheet: normalizeSheetName(sourceSheet),
    sourceRowNumber: Number(sourceRowNumber || 0),
    sheetCategory: category,
    name: normalizeText(name),
    phone,
    email,
    date: eventAt?.value?.toISOString()?.slice(0, 10) || null,
    time: eventAt?.displayTime || (parseTimeParts(timeValue)?.display || null),
    eventAt: eventAt?.value?.toISOString() || null,
    repName,
    eventType: null,
    value: amount ?? normalizeText(disposition || workType || notes),
    workType: normalizeText(workType) || null,
    state: normalizeText(state) || null,
    disposition: normalizeText(disposition) || null,
    normalizedDisposition: null,
    callCenterStatus: null,
    callbackScheduledAt: null,
    representative: normalizeText(representative) || null,
    leadCreator: normalizeText(leadCreator) || null,
    callCenterRep: normalizeText(callCenterRep) || null,
    assignedTo: normalizeText(assignedTo) || null,
    notes: normalizeText(notes) || null,
    confirmed60,
    confirmedRoofAge,
    inNewCrm,
    amount,
    raw: rawRecord,
  };
  row.eventType = inferEventType(row, category);
  row.normalizedDisposition = deriveNormalizedDisposition(row);
  row.callCenterStatus = deriveCallCenterStatus({
    status: row.disposition,
    disposition: row.normalizedDisposition,
    eventType: row.eventType,
  });
  row.callbackScheduledAt = row.normalizedDisposition === 'CALL_BACK' && row.eventAt
    ? row.eventAt
    : null;
  return row;
}

function normalizeInputRows({ fileBuffer, fileName, rows }) {
  if (fileBuffer) {
    return buildWorkbookRows(fileBuffer, fileName).map(normalizeWorkbookRecord);
  }
  if (Array.isArray(rows)) {
    return normalizeJsonRows(rows).map(normalizeWorkbookRecord);
  }
  throw new Error('Provide either an uploaded workbook file or rows[] payload');
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((acc, key) => {
    acc[key] = sortKeysDeep(value[key]);
    return acc;
  }, {});
}

function stableStringify(value) {
  return JSON.stringify(sortKeysDeep(value));
}

function hashValue(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : stableStringify(value)).digest('hex');
}

function createDeterministicRowId({ sourceFileName, sourceSheet, sourceRowNumber, rawRecord }) {
  const seed = {
    sourceFileName: normalizeText(sourceFileName || 'workbook'),
    sourceSheet: normalizeSheetName(sourceSheet || 'Sheet'),
    sourceRowNumber: Number(sourceRowNumber || 0),
    rawRecord: sortKeysDeep(rawRecord || {}),
  };

  return `ccir_${hashValue(seed).slice(0, 24)}`;
}

function computeWorkbookHash({ fileBuffer, fileName, rows }) {
  if (fileBuffer) return hashValue(fileBuffer);
  return hashValue({ fileName: fileName || 'rows', rows: sortKeysDeep(rows || []) });
}

function computeNormalizedRowsHash(rows) {
  return hashValue(rows.map(serializeNormalizedRow));
}

function serializeNormalizedRow(row) {
  return {
    sourceFileName: row.sourceFileName,
    sourceSheet: row.sourceSheet,
    sourceRowNumber: row.sourceRowNumber,
    sheetCategory: row.sheetCategory,
    name: row.name,
    phone: row.phone,
    email: row.email,
    date: row.date,
    time: row.time,
    eventAt: row.eventAt,
    repName: row.repName,
    eventType: row.eventType,
    value: row.value,
    workType: row.workType,
    state: row.state,
    disposition: row.disposition,
    normalizedDisposition: row.normalizedDisposition,
    callCenterStatus: row.callCenterStatus,
    callbackScheduledAt: row.callbackScheduledAt,
    representative: row.representative,
    leadCreator: row.leadCreator,
    callCenterRep: row.callCenterRep,
    assignedTo: row.assignedTo,
    notes: row.notes,
    confirmed60: row.confirmed60,
    confirmedRoofAge: row.confirmedRoofAge,
    inNewCrm: row.inNewCrm,
    amount: row.amount,
  };
}

function createImportSignature(row) {
  return createRowFingerprint(row) || [
    normalizeNameKey(row.name),
    row.date || '',
    row.time || '',
    row.eventType || '',
    normalizeNameKey(row.state),
    normalizeNameKey(row.repName),
  ].join('|');
}

function createRowFingerprint(row) {
  const fingerprintSeed = {
    name: normalizeNameKey(row.name),
    phone: row.phone || '',
    email: row.email || '',
    date: row.date || '',
    time: row.time || '',
    eventType: row.eventType || '',
    state: normalizeNameKey(row.state),
    workType: normalizeNameKey(row.workType),
  };

  if (!fingerprintSeed.name || !fingerprintSeed.date || !fingerprintSeed.eventType) {
    return null;
  }

  return hashValue(fingerprintSeed);
}

function getRowCompletenessScore(row) {
  return [
    row.name,
    row.phone,
    row.email,
    row.eventAt,
    row.notes,
    row.assignedTo,
    row.leadCreator,
    row.callCenterRep,
    row.workType,
    row.amount,
  ].filter(hasValue).length;
}

function compareRowsForDuplicatePrimary(a, b) {
  const scoreDelta = getRowCompletenessScore(b) - getRowCompletenessScore(a);
  if (scoreDelta !== 0) return scoreDelta;
  const sheetDelta = a.sourceSheet.localeCompare(b.sourceSheet);
  if (sheetDelta !== 0) return sheetDelta;
  return a.sourceRowNumber - b.sourceRowNumber;
}

function buildDuplicateMetadata(rows) {
  const groups = new Map();
  const rowMetadata = new Map();

  rows.forEach((row) => {
    const fingerprint = createRowFingerprint(row);
    if (!fingerprint) {
      rowMetadata.set(row.rowId, null);
      return;
    }
    if (!groups.has(fingerprint)) groups.set(fingerprint, []);
    groups.get(fingerprint).push(row);
  });

  const duplicateGroups = [];
  for (const [fingerprint, groupRows] of groups.entries()) {
    if (groupRows.length === 1) {
      rowMetadata.set(groupRows[0].rowId, {
        fingerprint,
        isPrimary: true,
        suppressed: false,
        duplicateCount: 1,
        primaryRowId: groupRows[0].rowId,
      });
      continue;
    }

    const ordered = [...groupRows].sort(compareRowsForDuplicatePrimary);
    const primary = ordered[0];
    const suppressedRows = ordered.slice(1);

    duplicateGroups.push({
      fingerprint,
      groupSize: ordered.length,
      primaryRowId: primary.rowId,
      primarySourceSheet: primary.sourceSheet,
      primarySourceRowNumber: primary.sourceRowNumber,
      suppressedRowIds: suppressedRows.map((row) => row.rowId),
    });

    rowMetadata.set(primary.rowId, {
      fingerprint,
      isPrimary: true,
      suppressed: false,
      duplicateCount: ordered.length,
      primaryRowId: primary.rowId,
    });

    suppressedRows.forEach((row) => {
      rowMetadata.set(row.rowId, {
        fingerprint,
        isPrimary: false,
        suppressed: true,
        duplicateCount: ordered.length,
        primaryRowId: primary.rowId,
      });
    });
  }

  return {
    rowMetadata,
    duplicateGroups,
    summary: {
      duplicateGroups: duplicateGroups.length,
      suppressedRows: duplicateGroups.reduce((sum, group) => sum + group.suppressedRowIds.length, 0),
      duplicateRows: duplicateGroups.reduce((sum, group) => sum + group.groupSize, 0),
    },
  };
}

function normalizeAliasMap(aliasMap = {}) {
  return Object.entries(aliasMap || {}).reduce((acc, [key, value]) => {
    const normalizedKey = normalizeNameKey(key);
    const normalizedValue = normalizeText(value);
    if (normalizedKey && normalizedValue) {
      acc[normalizedKey] = normalizedValue;
    }
    return acc;
  }, {});
}

function isNonUserAliasTarget(value) {
  return normalizeText(value).toUpperCase() === NON_USER_ALIAS_SENTINEL;
}

function getSystemLabelAssigneeTarget(aliasMap = {}) {
  const envTarget = normalizeText(process.env.CALL_CENTER_IMPORT_SYSTEM_LABEL_ASSIGNEE);
  const aliasTarget = normalizeText(aliasMap[normalizeNameKey(SYSTEM_LABEL_ASSIGNEE_ALIAS_KEY)]);
  return aliasTarget || envTarget || DEFAULT_SYSTEM_LABEL_ASSIGNEE;
}

function buildUserAliasMap(overrideMap = null) {
  const envMap = (() => {
    try {
      return process.env.CALL_CENTER_IMPORT_USER_ALIAS_MAP
        ? JSON.parse(process.env.CALL_CENTER_IMPORT_USER_ALIAS_MAP)
        : {};
    } catch {
      return {};
    }
  })();

  return {
    ...normalizeAliasMap(DEFAULT_USER_ALIAS_MAP),
    ...normalizeAliasMap(envMap),
    ...normalizeAliasMap(overrideMap || {}),
  };
}

function expandUserTokens(value) {
  const normalized = normalizeText(value);
  if (!normalized) return [];
  return [...new Set(
    normalized
      .split(/[\/,&]| and /i)
      .map((token) => token.replace(/\(.*?\)/g, '').replace(/\bself gen\b.*$/i, '').trim())
      .filter(Boolean)
  )];
}

function buildUserLookup(users) {
  const byExact = new Map();
  const byFirst = new Map();
  const byFirstLastInitial = new Map();
  const byEmail = new Map();
  const byEmailLocalPart = new Map();

  users.forEach((user) => {
    const fullName = normalizeText(user.fullName || [user.firstName, user.lastName].filter(Boolean).join(' '));
    const exactKey = normalizeNameKey(fullName);
    if (exactKey) {
      if (!byExact.has(exactKey)) byExact.set(exactKey, []);
      byExact.get(exactKey).push(user);
    }

    const firstKey = normalizeNameKey(user.firstName);
    if (firstKey) {
      if (!byFirst.has(firstKey)) byFirst.set(firstKey, []);
      byFirst.get(firstKey).push(user);
    }

    const firstLastInitialKey = normalizeNameKey(
      `${normalizeText(user.firstName)} ${normalizeText(user.lastName).slice(0, 1)}`
    );
    if (firstLastInitialKey) {
      if (!byFirstLastInitial.has(firstLastInitialKey)) byFirstLastInitial.set(firstLastInitialKey, []);
      byFirstLastInitial.get(firstLastInitialKey).push(user);
    }

    if (user.email) {
      const normalizedEmail = normalizeText(user.email).toLowerCase();
      byEmail.set(normalizedEmail, user);
      const localPart = normalizedEmail.split('@')[0];
      if (localPart) {
        if (!byEmailLocalPart.has(localPart)) byEmailLocalPart.set(localPart, []);
        byEmailLocalPart.get(localPart).push(user);
      }
    }
  });

  return { byExact, byFirst, byFirstLastInitial, byEmail, byEmailLocalPart };
}

function isSystemLabelToken(token) {
  const normalized = normalizeNameKey(token);
  return !normalized || KNOWN_SYSTEM_LABELS.has(normalized);
}

function formatUserCandidate(user) {
  return {
    userId: user.id,
    name: normalizeText(user.fullName || `${user.firstName || ''} ${user.lastName || ''}`),
    email: user.email || null,
    isActive: user.isActive !== false,
    status: user.status || null,
  };
}

function resolveConfiguredUserTarget(target, lookup) {
  const normalizedTarget = normalizeText(target);
  if (!normalizedTarget) return null;

  const email = parseEmail(normalizedTarget);
  if (email && lookup.byEmail.has(email)) {
    return { user: lookup.byEmail.get(email), matchedBy: 'configuredEmail' };
  }

  const exactCandidates = lookup.byExact.get(normalizeNameKey(normalizedTarget)) || [];
  if (exactCandidates.length === 1) {
    return { user: exactCandidates[0], matchedBy: 'configuredFullName' };
  }

  const emailLocalPart = normalizedTarget.includes('@')
    ? normalizedTarget.toLowerCase().split('@')[0]
    : null;
  if (emailLocalPart) {
    const localPartCandidates = lookup.byEmailLocalPart.get(emailLocalPart) || [];
    if (localPartCandidates.length === 1) {
      return { user: localPartCandidates[0], matchedBy: 'configuredEmailLocalPart' };
    }
  }

  return null;
}

function buildResolvedMapping({
  role,
  input,
  token,
  user = null,
  matchType,
  confidence,
  matchedBy,
  aliasTarget = null,
  candidates = [],
  classification = null,
  reason = null,
}) {
  return {
    role,
    input: normalizeText(input),
    normalized: normalizeNameKey(token || input),
    userId: user?.id || null,
    displayName: user ? normalizeText(user.fullName || `${user.firstName || ''} ${user.lastName || ''}`) : null,
    isActive: user ? user.isActive !== false : null,
    userStatus: user?.status || null,
    matchType,
    confidence,
    matchedBy,
    aliasTarget,
    classification,
    reason,
    candidates: candidates.map(formatUserCandidate),
  };
}

function buildSystemLabelMapping({
  role,
  input,
  token,
  matchedBy = 'knownSystemLabel',
  aliasTarget = null,
  reason = 'Matched known non-user/system label',
  user = null,
}) {
  return buildResolvedMapping({
    role,
    input,
    token,
    user,
    matchType: 'system_label',
    confidence: 1,
    matchedBy,
    aliasTarget,
    classification: 'system',
    reason,
  });
}

function buildUnresolvedTokenMapping({ role, input, token, matchedBy = 'none' }) {
  return buildResolvedMapping({
    role,
    input,
    token,
    matchType: 'unresolved',
    confidence: 0,
    matchedBy,
    classification: 'person',
    reason: 'No canonical user mapping found',
  });
}

function resolveSystemLabelAssignee(lookup, aliasMap) {
  const target = getSystemLabelAssigneeTarget(aliasMap);
  const resolved = resolveConfiguredUserTarget(target, lookup);
  if (!resolved?.user) {
    return {
      user: null,
      target,
      matchedBy: null,
    };
  }

  return {
    user: resolved.user,
    target,
    matchedBy: resolved.matchedBy,
  };
}

function resolveUserToken(token, lookup, aliasMap, role, originalInput) {
  const normalized = normalizeText(token);
  if (!normalized) return null;

  const normalizedToken = normalizeNameKey(normalized);
  const systemLabelAssignee = resolveSystemLabelAssignee(lookup, aliasMap);
  const aliasTarget = aliasMap[normalizedToken];
  if (isNonUserAliasTarget(aliasTarget)) {
    return buildSystemLabelMapping({
      role,
      input: originalInput,
      token: normalized,
      user: systemLabelAssignee.user,
      matchedBy: systemLabelAssignee.user ? 'reviewedNonUserOverrideConfiguredAssignee' : 'reviewedNonUserOverride',
      aliasTarget,
      reason: systemLabelAssignee.user
        ? `Matched reviewed non-user label and assigned ${systemLabelAssignee.target}`
        : 'Matched reviewed non-user label',
    });
  }
  if (isSystemLabelToken(normalized)) {
    return buildSystemLabelMapping({
      role,
      input: originalInput,
      token: normalized,
      user: systemLabelAssignee.user,
      matchedBy: systemLabelAssignee.user ? 'knownSystemLabelConfiguredAssignee' : 'knownSystemLabel',
      reason: systemLabelAssignee.user
        ? `Matched known non-user/system label and assigned ${systemLabelAssignee.target}`
        : 'Matched known non-user/system label',
    });
  }
  if (aliasTarget) {
    const aliasEmail = parseEmail(aliasTarget);
    const aliasCandidates = aliasEmail
      ? (lookup.byEmail.has(aliasEmail) ? [lookup.byEmail.get(aliasEmail)] : [])
      : (lookup.byExact.get(normalizeNameKey(aliasTarget)) || []);
    if (aliasCandidates.length === 1) {
      return buildResolvedMapping({
        role,
        input: originalInput,
        token: normalized,
        user: aliasCandidates[0],
        matchType: 'alias',
        confidence: 0.98,
        matchedBy: 'aliasMap',
        aliasTarget,
        classification: 'person',
        reason: 'Matched reviewed alias',
      });
    }
    if (aliasCandidates.length > 1) {
      return buildResolvedMapping({
        role,
        input: originalInput,
        token: normalized,
        matchType: 'low_confidence',
        confidence: 0.6,
        matchedBy: 'aliasMap',
        aliasTarget,
        candidates: aliasCandidates,
        classification: 'person',
        reason: 'Alias matched multiple CRM users',
      });
    }
  }

  const email = parseEmail(normalized);
  if (email && lookup.byEmail.has(email)) {
    return buildResolvedMapping({
      role,
      input: originalInput,
      token: normalized,
      user: lookup.byEmail.get(email),
      matchType: 'exact',
      confidence: 1,
      matchedBy: 'email',
      classification: 'person',
      reason: 'Matched CRM user by exact email',
    });
  }

  const emailLocalPart = normalized.includes('@')
    ? normalizeText(normalized).toLowerCase().split('@')[0]
    : null;
  if (emailLocalPart) {
    const localPartCandidates = lookup.byEmailLocalPart.get(emailLocalPart) || [];
    if (localPartCandidates.length === 1) {
      return buildResolvedMapping({
        role,
        input: originalInput,
        token: normalized,
        user: localPartCandidates[0],
        matchType: 'exact',
        confidence: 0.97,
        matchedBy: 'emailLocalPart',
        classification: 'person',
        reason: 'Matched CRM user by normalized email local part',
      });
    }
    if (localPartCandidates.length > 1) {
      return buildResolvedMapping({
        role,
        input: originalInput,
        token: normalized,
        matchType: 'low_confidence',
        confidence: 0.5,
        matchedBy: 'emailLocalPart',
        candidates: localPartCandidates,
        classification: 'person',
        reason: 'Normalized email local part matched multiple CRM users',
      });
    }
  }

  const exactCandidates = lookup.byExact.get(normalizedToken) || [];
  if (exactCandidates.length === 1) {
    return buildResolvedMapping({
      role,
      input: originalInput,
      token: normalized,
      user: exactCandidates[0],
      matchType: 'exact',
      confidence: 0.99,
      matchedBy: 'fullName',
      classification: 'person',
      reason: 'Matched CRM user by full name',
    });
  }
  if (exactCandidates.length > 1) {
    return buildResolvedMapping({
      role,
      input: originalInput,
      token: normalized,
      matchType: 'low_confidence',
      confidence: 0.55,
      matchedBy: 'fullName',
      candidates: exactCandidates,
      classification: 'person',
      reason: 'Full name matched multiple CRM users',
    });
  }

  const firstLastInitialCandidates = lookup.byFirstLastInitial.get(normalizedToken) || [];
  if (firstLastInitialCandidates.length === 1) {
    return buildResolvedMapping({
      role,
      input: originalInput,
      token: normalized,
      user: firstLastInitialCandidates[0],
      matchType: 'low_confidence',
      confidence: 0.8,
      matchedBy: 'firstLastInitial',
      classification: 'person',
      reason: 'Matched CRM user by first name and last initial',
    });
  }
  if (firstLastInitialCandidates.length > 1) {
    return buildResolvedMapping({
      role,
      input: originalInput,
      token: normalized,
      matchType: 'low_confidence',
      confidence: 0.45,
      matchedBy: 'firstLastInitial',
      candidates: firstLastInitialCandidates,
      classification: 'person',
      reason: 'First name and last initial matched multiple CRM users',
    });
  }

  const firstCandidates = lookup.byFirst.get(normalizedToken) || [];
  if (firstCandidates.length === 1) {
    return buildResolvedMapping({
      role,
      input: originalInput,
      token: normalized,
      user: firstCandidates[0],
      matchType: 'low_confidence',
      confidence: 0.72,
      matchedBy: 'firstName',
      classification: 'person',
      reason: 'Matched CRM user by first name only',
    });
  }
  if (firstCandidates.length > 1) {
    return buildResolvedMapping({
      role,
      input: originalInput,
      token: normalized,
      matchType: 'low_confidence',
      confidence: 0.35,
      matchedBy: 'firstName',
      candidates: firstCandidates,
      classification: 'person',
      reason: 'First name matched multiple CRM users',
    });
  }

  return buildResolvedMapping({
    role,
    input: originalInput,
    token: normalized,
    matchType: 'unresolved',
    confidence: 0,
    matchedBy: 'none',
    classification: 'person',
    reason: 'No canonical user mapping found',
  });
}

function hasSplitOwnerInput(value) {
  const normalized = normalizeText(value);
  if (!normalized || !SPLIT_OWNER_INPUT_PATTERN.test(normalized)) {
    return false;
  }

  return expandUserTokens(normalized).length > 1;
}

function buildReportingCreditsFromMappings(mappings = []) {
  const uniqueMappings = [];
  const seen = new Set();

  for (const mapping of mappings) {
    if (!mapping?.userId || seen.has(mapping.userId)) continue;
    seen.add(mapping.userId);
    uniqueMappings.push(mapping);
  }

  if (uniqueMappings.length < 2) {
    return [];
  }

  const baseShare = REPORTING_CREDIT_TOTAL / uniqueMappings.length;
  let assigned = 0;

  return uniqueMappings.map((mapping, index) => {
    const remaining = REPORTING_CREDIT_TOTAL - assigned;
    const creditPercent = index === uniqueMappings.length - 1
      ? roundCreditPercent(remaining)
      : roundCreditPercent(baseShare);
    assigned += creditPercent;

    return {
      userId: mapping.userId,
      userName: mapping.displayName || mapping.input || mapping.userId,
      creditPercent,
      isActive: mapping.isActive,
      userStatus: mapping.userStatus,
      matchType: mapping.matchType,
      matchedBy: mapping.matchedBy,
    };
  });
}

function resolveOwnerReportingCredits(values, lookup, aliasMap) {
  for (const value of values) {
    if (!hasSplitOwnerInput(value)) continue;

    const tokens = expandUserTokens(value);
    const tokenMappings = tokens.map((token) => {
      const resolved = resolveUserToken(token, lookup, aliasMap, 'ownerReportingCredits', value);
      if (resolved) return resolved;
      return buildUnresolvedTokenMapping({
        role: 'ownerReportingCredits',
        input: value,
        token,
        matchedBy: isSystemLabelToken(token) ? 'knownSystemLabel' : 'none',
      });
    });

    const unresolvedMappings = tokenMappings.filter((mapping) => mapping.matchType === 'unresolved');
    if (unresolvedMappings.length > 0) {
      return {
        input: normalizeText(value),
        status: 'unresolved',
        credits: [],
        tokenMappings,
      };
    }

    const systemLabelMappings = tokenMappings.filter((mapping) => mapping.matchType === 'system_label');
    if (systemLabelMappings.length > 0) {
      return {
        input: normalizeText(value),
        status: 'unresolved',
        credits: [],
        tokenMappings,
      };
    }

    const lowConfidenceMappings = tokenMappings.filter((mapping) => mapping.matchType === 'low_confidence');
    if (lowConfidenceMappings.length > 0) {
      return {
        input: normalizeText(value),
        status: 'low_confidence',
        credits: [],
        tokenMappings,
      };
    }

    const credits = buildReportingCreditsFromMappings(tokenMappings);
    if (credits.length < 2 || credits.length !== tokenMappings.length) {
      return {
        input: normalizeText(value),
        status: 'unresolved',
        credits: [],
        tokenMappings,
      };
    }

    return {
      input: normalizeText(value),
      status: 'resolved',
      credits,
      tokenMappings,
    };
  }

  return null;
}

function rankMapping(mapping) {
  if (!mapping) return 0;
  if (mapping.matchType === 'exact') return 4;
  if (mapping.matchType === 'alias') return 3;
  if (mapping.matchType === 'low_confidence') return 2;
  if (mapping.matchType === 'system_label') return 1;
  if (mapping.matchType === 'unresolved') return 1;
  return 0;
}

function resolveUserCandidates(values, lookup, aliasMap, role) {
  let fallbackReviewMapping = null;

  for (const value of values) {
    let valueBest = null;
    const tokens = expandUserTokens(value);
    for (const token of tokens) {
      const mapping = resolveUserToken(token, lookup, aliasMap, role, value);
      if (!mapping) continue;
      if (['unresolved', 'system_label'].includes(mapping.matchType)) {
        if (!fallbackReviewMapping || rankMapping(mapping) > rankMapping(fallbackReviewMapping)) {
          fallbackReviewMapping = mapping;
        }
      }
      if (!valueBest || rankMapping(mapping) > rankMapping(valueBest) || (rankMapping(mapping) === rankMapping(valueBest) && mapping.confidence > valueBest.confidence)) {
        valueBest = mapping;
      }
    }

    if (valueBest && !['unresolved', 'system_label'].includes(valueBest.matchType)) {
      return valueBest;
    }
  }

  return fallbackReviewMapping;
}

function deriveUserMappings(row, userLookup, aliasMap = {}) {
  const normalizedAliasMap = normalizeAliasMap(aliasMap);
  const ownerInputs = [row.assignedTo, row.representative, row.callCenterRep, row.repName];
  const ownerReportingCredits = resolveOwnerReportingCredits(ownerInputs, userLookup, normalizedAliasMap);
  const assignedOwner = resolveUserCandidates(
    [row.assignedTo],
    userLookup,
    normalizedAliasMap,
    'owner'
  );
  const owner = assignedOwner?.matchType === 'system_label'
    ? assignedOwner
    : resolveUserCandidates(
        ownerInputs,
        userLookup,
        normalizedAliasMap,
        'owner'
      );
  const leadSetBy = resolveUserCandidates(
    [row.leadCreator, row.callCenterRep, row.repName],
    userLookup,
    normalizedAliasMap,
    'leadSetBy'
  );
  return { owner, leadSetBy, ownerReportingCredits };
}

function summarizeUserMappings(analysis) {
  const summary = {
    exact: 0,
    exactMatched: 0,
    alias: 0,
    aliasMatched: 0,
    lowConfidence: 0,
    unresolved: 0,
    systemLabel: 0,
    systemLabels: 0,
    inactiveMatched: 0,
    splitResolved: 0,
    splitIssues: 0,
  };

  for (const item of analysis) {
    for (const mapping of [item.userMappings.owner, item.userMappings.leadSetBy]) {
      if (!mapping) continue;
      if (mapping.matchType === 'exact') {
        summary.exact += 1;
        summary.exactMatched += 1;
      }
      if (mapping.matchType === 'alias') {
        summary.alias += 1;
        summary.aliasMatched += 1;
      }
      if (mapping.matchType === 'low_confidence') summary.lowConfidence += 1;
      if (mapping.matchType === 'unresolved') summary.unresolved += 1;
      if (mapping.matchType === 'system_label') {
        summary.systemLabel += 1;
        summary.systemLabels += 1;
      }
      if (mapping.userId && mapping.isActive === false) summary.inactiveMatched += 1;
    }

    if (item.userMappings.ownerReportingCredits?.status === 'resolved') summary.splitResolved += 1;
    if (item.userMappings.ownerReportingCredits?.status === 'unresolved' || item.userMappings.ownerReportingCredits?.status === 'low_confidence') {
      summary.splitIssues += 1;
    }
  }

  return summary;
}

function toLeadStatus(row) {
  const fallbackStatus = ['APPOINTMENT_SET', 'CONFIRMATION', 'APPOINTMENT_RAN', 'SALE', 'REVENUE'].includes(row.eventType)
    ? 'QUALIFIED'
    : 'NEW';
  return toSystemLeadStatusFromDisposition(row.normalizedDisposition, fallbackStatus);
}

function toOpportunityStage(eventType) {
  if (eventType === 'SALE' || eventType === 'REVENUE') return 'CLOSED_WON';
  if (eventType === 'APPOINTMENT_RAN') return 'INSPECTED';
  if (eventType === 'CONFIRMATION' || eventType === 'APPOINTMENT_SET') return 'SCHEDULED';
  return DEFAULT_OPPORTUNITY_STAGE;
}

function sanitizeImportNotes(row) {
  const notes = [];
  if (row.notes) notes.push(row.notes);
  if (row.confirmed60 === true) notes.push('Confirmed 60 mins');
  if (row.confirmedRoofAge === true) notes.push('Confirmed roof age');
  return notes.join(' | ') || null;
}

function determineAppointmentStatus(row) {
  const disposition = normalizeCallCenterDispositionCode(row.normalizedDisposition || row.disposition);
  if (row.eventType === 'APPOINTMENT_RAN') return 'COMPLETED';
  if (disposition === 'CANCELED') return 'CANCELED';
  return 'SCHEDULED';
}

function summarizeWarnings(warnings) {
  return warnings.filter(Boolean);
}

function shouldCreateOpportunity(row) {
  return ['APPOINTMENT_SET', 'CONFIRMATION', 'APPOINTMENT_RAN', 'SALE', 'REVENUE'].includes(row.eventType);
}

function shouldCreateAppointment(row) {
  return ['APPOINTMENT_SET', 'CONFIRMATION', 'APPOINTMENT_RAN'].includes(row.eventType);
}

function buildConflict(message, code = 'CONFLICT') {
  return { code, message };
}

function buildWarning(message, code = 'WARNING', severity = 'warning') {
  return { code, message, severity };
}

function createAuditEntry(tx, {
  tableName,
  recordId,
  action,
  oldValues = null,
  newValues = null,
  userId = null,
  userEmail = null,
}) {
  const changedFields = new Set([
    ...Object.keys(oldValues || {}),
    ...Object.keys(newValues || {}),
  ].filter((key) => JSON.stringify(oldValues?.[key]) !== JSON.stringify(newValues?.[key])));

  return tx.auditLog.create({
    data: {
      tableName,
      recordId,
      action,
      oldValues: oldValues || undefined,
      newValues: newValues || undefined,
      changedFields: [...changedFields],
      userId,
      userEmail,
      source: IMPORT_SOURCE,
    },
  });
}

function cleanupExpiredPreviewPlans(now = Date.now()) {
  for (const [token, record] of previewPlanRegistry.entries()) {
    if (new Date(record.expiresAt).getTime() <= now) {
      previewPlanRegistry.delete(token);
    }
  }
}

function getPreviewPlanSettingKey(previewToken) {
  return `${PREVIEW_PLAN_SETTING_PREFIX}${previewToken}`;
}

function supportsPreviewPlanPersistence(prismaClient) {
  return Boolean(prismaClient?.systemSetting);
}

function parsePersistedPreviewPlan(setting) {
  if (!setting?.value) return null;
  try {
    const parsed = JSON.parse(setting.value);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.previewToken !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function persistPreviewPlanRecord(prismaClient, record) {
  if (!supportsPreviewPlanPersistence(prismaClient)) return false;

  await prismaClient.systemSetting.upsert({
    where: { key: getPreviewPlanSettingKey(record.previewToken) },
    create: {
      key: getPreviewPlanSettingKey(record.previewToken),
      value: JSON.stringify(record),
      category: PREVIEW_PLAN_SETTING_CATEGORY,
      description: PREVIEW_PLAN_SETTING_DESCRIPTION,
    },
    update: {
      value: JSON.stringify(record),
      category: PREVIEW_PLAN_SETTING_CATEGORY,
      description: PREVIEW_PLAN_SETTING_DESCRIPTION,
    },
  });

  return true;
}

async function loadPersistedPreviewPlan(prismaClient, previewToken) {
  if (!supportsPreviewPlanPersistence(prismaClient)) return null;

  const setting = await prismaClient.systemSetting.findUnique({
    where: { key: getPreviewPlanSettingKey(previewToken) },
    select: { key: true, value: true, category: true },
  });

  return parsePersistedPreviewPlan(setting);
}

async function cleanupExpiredPersistedPreviewPlans(prismaClient, now = Date.now()) {
  if (!supportsPreviewPlanPersistence(prismaClient)) return 0;

  const settings = await prismaClient.systemSetting.findMany({
    where: { category: PREVIEW_PLAN_SETTING_CATEGORY },
    select: { key: true, value: true },
  });

  const keysToDelete = [];
  for (const setting of settings) {
    const record = parsePersistedPreviewPlan(setting);
    if (!record) {
      keysToDelete.push(setting.key);
      continue;
    }

    if (new Date(record.expiresAt).getTime() <= now) {
      previewPlanRegistry.delete(record.previewToken);
      keysToDelete.push(setting.key);
    }
  }

  if (keysToDelete.length > 0) {
    await prismaClient.systemSetting.deleteMany({
      where: {
        key: { in: keysToDelete },
      },
    });
  }

  return keysToDelete.length;
}

async function loadApprovedPreviewPlan(prismaClient, previewToken) {
  if (supportsPreviewPlanPersistence(prismaClient)) {
    const persisted = await loadPersistedPreviewPlan(prismaClient, previewToken);
    if (persisted) {
      previewPlanRegistry.set(previewToken, persisted);
      return persisted;
    }
  }

  return previewPlanRegistry.get(previewToken) || null;
}

async function markPreviewTokenConsumed(previewToken, prismaClient) {
  const existing = await loadApprovedPreviewPlan(prismaClient, previewToken);
  if (!existing) return null;

  const consumedAt = new Date().toISOString();
  const updated = { ...existing, consumedAt };
  previewPlanRegistry.set(previewToken, updated);
  await persistPreviewPlanRecord(prismaClient, updated);
  return updated;
}

function createPreviewToken(record) {
  const checksum = hashValue({
    workbookHash: record.workbookHash,
    normalizedRowsHash: record.normalizedRowsHash,
    analysisSummaryHash: record.analysisSummaryHash,
    createdAt: record.createdAt,
  }).slice(0, 16);
  const nonce = crypto.randomBytes(4).toString('hex');
  return `cci_${new Date(record.createdAt).getTime().toString(36)}_${checksum}_${nonce}`;
}

function resetPreviewPlanRegistryForTest() {
  previewPlanRegistry.clear();
}

function getExecutionThresholds(totalRows) {
  return {
    maxBlockingConflicts: Math.max(5, Math.ceil(totalRows * 0.005)),
    maxUnresolvedUserMappings: Math.max(3, Math.ceil(totalRows * 0.005)),
    maxLowConfidenceUserMappings: Math.max(10, Math.ceil(totalRows * 0.01)),
  };
}

function buildExecutionGuards(analysis) {
  const thresholds = getExecutionThresholds(analysis.length);
  const blockingConflicts = analysis.filter((item) => item.conflicts.length > 0 && !item.suppressedDuplicate).length;

  let unresolvedUserMappings = 0;
  let lowConfidenceUserMappings = 0;
  let systemLabelMappings = 0;
  let inactiveMatchedUsers = 0;
  let splitOwnerMappingIssues = 0;
  for (const item of analysis) {
    if (item.suppressedDuplicate) continue;
    for (const mapping of [item.userMappings.owner, item.userMappings.leadSetBy]) {
      if (!mapping) continue;
      if (mapping.matchType === 'unresolved') unresolvedUserMappings += 1;
      if (mapping.matchType === 'low_confidence') lowConfidenceUserMappings += 1;
      if (mapping.matchType === 'system_label') systemLabelMappings += 1;
      if (mapping.userId && mapping.isActive === false) inactiveMatchedUsers += 1;
    }
    if (item.userMappings.ownerReportingCredits && item.userMappings.ownerReportingCredits.status !== 'resolved') {
      splitOwnerMappingIssues += 1;
    }
  }

  const blockers = [];
  if (blockingConflicts > thresholds.maxBlockingConflicts) {
    blockers.push({
      code: 'BLOCKING_CONFLICT_THRESHOLD_EXCEEDED',
      message: `Blocking conflicts (${blockingConflicts}) exceed threshold (${thresholds.maxBlockingConflicts})`,
    });
  }
  if (unresolvedUserMappings > thresholds.maxUnresolvedUserMappings) {
    blockers.push({
      code: 'UNRESOLVED_USER_MAPPING_THRESHOLD_EXCEEDED',
      message: `Unresolved user mappings (${unresolvedUserMappings}) exceed threshold (${thresholds.maxUnresolvedUserMappings})`,
    });
  }
  if (lowConfidenceUserMappings > thresholds.maxLowConfidenceUserMappings) {
    blockers.push({
      code: 'LOW_CONFIDENCE_USER_MAPPING_THRESHOLD_EXCEEDED',
      message: `Low-confidence user mappings (${lowConfidenceUserMappings}) exceed threshold (${thresholds.maxLowConfidenceUserMappings})`,
    });
  }
  if (splitOwnerMappingIssues > 0) {
    blockers.push({
      code: 'SPLIT_OWNER_MAPPING_ISSUES_PRESENT',
      message: `Split-owner labels with unresolved or low-confidence mappings (${splitOwnerMappingIssues}) must be reviewed before execution`,
    });
  }

  return {
    thresholds,
    counts: {
      blockingConflicts,
      unresolvedUserMappings,
      lowConfidenceUserMappings,
      systemLabelMappings,
      inactiveMatchedUsers,
      splitOwnerMappingIssues,
      suppressedDuplicateRows: analysis.filter((item) => item.suppressedDuplicate).length,
    },
    blockers,
    requiresManualOverride: blockers.length > 0,
  };
}

function buildApprovedPlanRows(analysis) {
  return analysis.map((item) => ({
    rowId: item.row.rowId,
    rowFingerprint: item.rowFingerprint,
    sourceSheet: item.row.sourceSheet,
    sourceRowNumber: item.row.sourceRowNumber,
    eventType: item.row.eventType,
    normalizedDisposition: item.row.normalizedDisposition,
    callCenterStatus: item.row.callCenterStatus,
    callbackScheduledAt: item.row.callbackScheduledAt,
    duplicateHandling: {
      suppressed: item.suppressedDuplicate,
      duplicateCount: item.duplicateMetadata?.duplicateCount || 1,
      primaryRowId: item.duplicateMetadata?.primaryRowId || item.row.rowId,
    },
    actions: {
      lead: item.executionActions.lead,
      opportunity: item.executionActions.opportunity,
      appointment: item.executionActions.appointment,
    },
    matches: {
      leadId: item.leadMatch.record?.id || null,
      opportunityId: item.opportunityMatch.record?.id || null,
      appointmentId: item.appointmentMatch?.id || null,
    },
    userMappings: {
      owner: item.userMappings.owner
        ? {
            userId: item.userMappings.owner.userId,
            isActive: item.userMappings.owner.isActive,
            userStatus: item.userMappings.owner.userStatus,
            matchType: item.userMappings.owner.matchType,
            matchedBy: item.userMappings.owner.matchedBy,
          }
        : null,
      ownerReportingCredits: item.userMappings.ownerReportingCredits
        ? {
            input: item.userMappings.ownerReportingCredits.input,
            status: item.userMappings.ownerReportingCredits.status,
            credits: item.userMappings.ownerReportingCredits.credits.map((credit) => ({
              userId: credit.userId,
              creditPercent: credit.creditPercent,
            })),
          }
        : null,
      leadSetBy: item.userMappings.leadSetBy
        ? {
            userId: item.userMappings.leadSetBy.userId,
            isActive: item.userMappings.leadSetBy.isActive,
            userStatus: item.userMappings.leadSetBy.userStatus,
            matchType: item.userMappings.leadSetBy.matchType,
            matchedBy: item.userMappings.leadSetBy.matchedBy,
          }
        : null,
    },
    conflicts: item.conflicts.map((conflict) => conflict.code),
    warnings: item.warnings.map((warning) => warning.code),
  }));
}

function buildExecutionPlanSummary(analysisResult) {
  return {
    summary: analysisResult.summary,
    duplicateSummary: analysisResult.duplicateSummary,
    userMappingSummary: analysisResult.userMappingSummary,
    executionGuards: analysisResult.executionGuards,
  };
}

function buildAnalysisSummaryHash(analysisSummary) {
  return hashValue(analysisSummary);
}

function createLeadMatchCacheKey(row) {
  const { firstName, lastName } = splitFullName(row.name);
  return [
    'lead',
    row.phone || '',
    row.email || '',
    normalizeNameKey(firstName),
    normalizeNameKey(lastName),
    normalizeNameKey(row.state),
  ].join('|');
}

function createOpportunityMatchCacheKey(row, leadMatch) {
  return [
    'opportunity',
    leadMatch?.record?.convertedOpportunityId || '',
    row.email || '',
    row.phone || '',
  ].join('|');
}

function createAppointmentMatchCacheKey(opportunityId, row) {
  if (!opportunityId || !row.eventAt) return null;
  return ['appointment', opportunityId, row.eventAt].join('|');
}

async function getCachedMatch(cache, key, resolver) {
  if (!key) return resolver();
  if (!cache.has(key)) {
    cache.set(key, resolver());
  }
  return cache.get(key);
}

async function mapWithConcurrencyLimit(items, limit, mapper) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const results = new Array(items.length);
  const workerCount = Math.max(1, Math.min(limit, items.length));
  let nextIndex = 0;

  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) break;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
}

async function findLeadMatch(row, prismaClient) {
  const matchMeta = { method: null, confidence: 0, record: null, warnings: [] };

  if (row.phone) {
    const variants = phoneVariants(row.phone);
    const matches = await prismaClient.lead.findMany({
      where: {
        deleted_at: null,
        OR: variants.flatMap((variant) => ([
          { phone: { contains: variant } },
          { mobilePhone: { contains: variant } },
        ])),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        mobilePhone: true,
        ownerId: true,
        leadSetById: true,
        reportingCredits: true,
        isConverted: true,
        convertedOpportunityId: true,
        street: true,
        city: true,
        state: true,
        postalCode: true,
        source: true,
        workType: true,
        tentativeAppointmentDate: true,
      },
      take: 3,
    });

    if (matches.length === 1) {
      matchMeta.method = 'phone';
      matchMeta.confidence = 0.98;
      matchMeta.record = matches[0];
      return matchMeta;
    }

    if (matches.length > 1) {
      matchMeta.warnings.push(buildWarning('Multiple leads matched by phone; falling back to email/name checks', 'AMBIGUOUS_PHONE', 'high'));
    }
  }

  if (row.email) {
    const matches = await prismaClient.lead.findMany({
      where: {
        deleted_at: null,
        email: { equals: row.email, mode: 'insensitive' },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        mobilePhone: true,
        ownerId: true,
        leadSetById: true,
        reportingCredits: true,
        isConverted: true,
        convertedOpportunityId: true,
        street: true,
        city: true,
        state: true,
        postalCode: true,
        source: true,
        workType: true,
        tentativeAppointmentDate: true,
      },
      take: 3,
    });

    if (matches.length === 1) {
      matchMeta.method = 'email';
      matchMeta.confidence = 0.96;
      matchMeta.record = matches[0];
      return matchMeta;
    }

    if (matches.length > 1) {
      matchMeta.warnings.push(buildWarning('Multiple leads matched by email; falling back to name checks', 'AMBIGUOUS_EMAIL', 'high'));
    }
  }

  const { firstName, lastName } = splitFullName(row.name);
  if (firstName && lastName) {
    const matches = await prismaClient.lead.findMany({
      where: {
        deleted_at: null,
        firstName: { equals: firstName, mode: 'insensitive' },
        lastName: { equals: lastName, mode: 'insensitive' },
        ...(row.state ? { state: { equals: row.state, mode: 'insensitive' } } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        mobilePhone: true,
        ownerId: true,
        leadSetById: true,
        reportingCredits: true,
        isConverted: true,
        convertedOpportunityId: true,
        street: true,
        city: true,
        state: true,
        postalCode: true,
        source: true,
        workType: true,
        tentativeAppointmentDate: true,
      },
      take: 3,
    });

    if (matches.length === 1) {
      matchMeta.method = 'name';
      matchMeta.confidence = row.state ? 0.84 : 0.72;
      matchMeta.record = matches[0];
      return matchMeta;
    }

    if (matches.length > 1) {
      matchMeta.warnings.push(buildWarning('Multiple leads matched by name; import row requires manual review', 'AMBIGUOUS_NAME', 'high'));
    }
  }

  return matchMeta;
}

async function findOpportunityMatch(row, leadMatch, prismaClient) {
  if (leadMatch?.record?.convertedOpportunityId) {
    const byLead = await prismaClient.opportunity.findUnique({
      where: { id: leadMatch.record.convertedOpportunityId },
      select: {
        id: true,
        accountId: true,
        contactId: true,
        ownerId: true,
        stage: true,
        soldDate: true,
        appointmentDate: true,
        contractTotal: true,
      },
    });
    if (byLead) {
      return { method: 'leadConversion', confidence: 1, record: byLead };
    }
  }

  if (row.email || row.phone) {
    const contacts = await prismaClient.contact.findMany({
      where: {
        OR: [
          ...(row.email ? [{ email: { equals: row.email, mode: 'insensitive' } }] : []),
          ...(row.phone ? phoneVariants(row.phone).flatMap((variant) => ([
            { phone: { contains: variant } },
            { mobilePhone: { contains: variant } },
          ])) : []),
        ],
      },
      select: {
        id: true,
        opportunities: {
          where: { deletedAt: null },
          select: {
            id: true,
            accountId: true,
            contactId: true,
            ownerId: true,
            stage: true,
            soldDate: true,
            appointmentDate: true,
            contractTotal: true,
          },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
      take: 3,
    });
    const opportunity = contacts.find((contact) => contact.opportunities[0])?.opportunities?.[0];
    if (opportunity) {
      return { method: 'contact', confidence: 0.9, record: opportunity };
    }
  }

  return { method: null, confidence: 0, record: null };
}

async function findAppointmentMatch(opportunityId, row, prismaClient) {
  if (!opportunityId || !row.eventAt) return null;
  const eventAt = new Date(row.eventAt);
  const startOfDay = new Date(eventAt);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(eventAt);
  endOfDay.setUTCHours(23, 59, 59, 999);

  const appointments = await prismaClient.serviceAppointment.findMany({
    where: {
      workOrder: { opportunityId },
      scheduledStart: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    select: {
      id: true,
      workOrderId: true,
      scheduledStart: true,
      scheduledEnd: true,
      status: true,
      actualStart: true,
    },
    take: 5,
    orderBy: { scheduledStart: 'asc' },
  });

  if (appointments.length === 0) return null;
  const exact = appointments.find((appointment) => {
    const minutes = Math.abs(new Date(appointment.scheduledStart).getTime() - eventAt.getTime()) / 60000;
    return minutes <= 60;
  });
  return exact || appointments[0];
}

async function findAccountMatch(tx, row) {
  if (!row.name) return null;
  return tx.account.findFirst({
    where: {
      deletedAt: null,
      name: { equals: row.name, mode: 'insensitive' },
      ...(row.state ? { billingState: { equals: row.state, mode: 'insensitive' } } : {}),
    },
    select: { id: true, name: true },
  });
}

async function findContactMatch(tx, row, accountId = null) {
  const { firstName, lastName } = splitFullName(row.name);
  if (!firstName || !lastName) return null;

  const orClauses = [];
  if (row.email) {
    orClauses.push({ email: { equals: row.email, mode: 'insensitive' } });
  }
  if (row.phone) {
    orClauses.push(...phoneVariants(row.phone).flatMap((variant) => ([
      { phone: { contains: variant } },
      { mobilePhone: { contains: variant } },
    ])));
  }
  orClauses.push({
    firstName: { equals: firstName, mode: 'insensitive' },
    lastName: { equals: lastName, mode: 'insensitive' },
  });

  return tx.contact.findFirst({
    where: {
      ...(accountId ? { accountId } : {}),
      OR: orClauses,
    },
    select: { id: true, accountId: true },
  });
}

class CallCenterImportService {
  constructor(prismaClient = null) {
    this.prisma = prismaClient;
  }

  async loadUsers() {
    const prismaClient = await resolvePrismaClient(this.prisma);
    const users = await prismaClient.user.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        fullName: true,
        email: true,
        isActive: true,
        status: true,
      },
    });
    return buildUserLookup(users);
  }

  async analyzeRows(rows, options = {}) {
    const prismaClient = await resolvePrismaClient(this.prisma);
    const userLookup = await this.loadUsers();
    const aliasMap = buildUserAliasMap(options.userAliasMap);
    const duplicateMetadata = buildDuplicateMetadata(rows);
    const matchCaches = {
      lead: new Map(),
      opportunity: new Map(),
      appointment: new Map(),
    };
    const duplicates = new Map();

    rows.forEach((row) => {
      const signature = createImportSignature(row);
      if (!duplicates.has(signature)) duplicates.set(signature, []);
      duplicates.get(signature).push(row.rowId);
    });

    const analysis = await mapWithConcurrencyLimit(rows, PREVIEW_ANALYZE_CONCURRENCY, async (row) => {
      const userMappings = deriveUserMappings(row, userLookup, aliasMap);
      const warnings = [];
      const conflicts = [];
      const duplicateRowIds = duplicates.get(createImportSignature(row)) || [];
      const duplicateRowMetadata = duplicateMetadata.rowMetadata.get(row.rowId) || null;
      const suppressedDuplicate = Boolean(duplicateRowMetadata?.suppressed);

      if (!row.name) conflicts.push(buildConflict('Missing homeowner name', 'MISSING_NAME'));
      if (shouldCreateAppointment(row) && !row.eventAt) {
        conflicts.push(buildConflict('Appointment-like row is missing date/time', 'MISSING_APPOINTMENT_TIME'));
      }
      if (requiresCallbackAt(row.normalizedDisposition) && !row.callbackScheduledAt) {
        conflicts.push(buildConflict('Call Back row is missing callback date/time', 'MISSING_CALLBACK_TIME'));
      }

      if (userMappings.owner?.matchType === 'unresolved') {
        warnings.push(buildWarning(`Could not resolve owner user from "${userMappings.owner.input}"`, 'OWNER_UNRESOLVED', 'high'));
      } else if (userMappings.owner?.matchType === 'system_label') {
        warnings.push(buildWarning(
          userMappings.owner.userId
            ? `Owner value "${userMappings.owner.input}" is classified as a system/non-user label and will assign owner credit to "${userMappings.owner.displayName}"`
            : `Owner value "${userMappings.owner.input}" is classified as a system/non-user label and no Company Lead assignee is configured`,
          'OWNER_SYSTEM_LABEL',
          userMappings.owner.userId ? 'info' : 'medium'
        ));
      } else if (userMappings.owner?.matchType === 'low_confidence') {
        warnings.push(buildWarning(`Owner user mapping is low confidence for "${userMappings.owner.input}"`, 'OWNER_LOW_CONFIDENCE', 'high'));
      } else if (userMappings.owner?.userId && userMappings.owner.isActive === false) {
        warnings.push(buildWarning(
          `Owner user "${userMappings.owner.displayName}" is currently inactive but will be preserved for historical attribution`,
          'OWNER_INACTIVE_USER',
          'medium'
        ));
      }

      if (userMappings.ownerReportingCredits?.status === 'resolved') {
        warnings.push(buildWarning(
          `Split owner credit resolved for "${userMappings.ownerReportingCredits.input}"`,
          'OWNER_SPLIT_CREDIT_RESOLVED',
          'info'
        ));
      } else if (userMappings.ownerReportingCredits?.status === 'low_confidence') {
        warnings.push(buildWarning(
          `Split owner credit mapping is low confidence for "${userMappings.ownerReportingCredits.input}"`,
          'OWNER_SPLIT_CREDIT_LOW_CONFIDENCE',
          'high'
        ));
      } else if (userMappings.ownerReportingCredits?.status === 'unresolved') {
        warnings.push(buildWarning(
          `Split owner credit could not be resolved for "${userMappings.ownerReportingCredits.input}"`,
          'OWNER_SPLIT_CREDIT_UNRESOLVED',
          'high'
        ));
      }

      if (userMappings.leadSetBy?.matchType === 'unresolved') {
        warnings.push(buildWarning(`Could not resolve lead-setter user from "${userMappings.leadSetBy.input}"`, 'LEAD_SETTER_UNRESOLVED', 'high'));
      } else if (userMappings.leadSetBy?.matchType === 'system_label') {
        warnings.push(buildWarning(
          userMappings.leadSetBy.userId
            ? `Lead-setter value "${userMappings.leadSetBy.input}" is classified as a system/non-user label and will assign lead-setter credit to "${userMappings.leadSetBy.displayName}"`
            : `Lead-setter value "${userMappings.leadSetBy.input}" is classified as a system/non-user label and no Company Lead assignee is configured`,
          'LEAD_SETTER_SYSTEM_LABEL',
          userMappings.leadSetBy.userId ? 'info' : 'medium'
        ));
      } else if (userMappings.leadSetBy?.matchType === 'low_confidence') {
        warnings.push(buildWarning(`Lead-setter user mapping is low confidence for "${userMappings.leadSetBy.input}"`, 'LEAD_SETTER_LOW_CONFIDENCE', 'high'));
      } else if (userMappings.leadSetBy?.userId && userMappings.leadSetBy.isActive === false) {
        warnings.push(buildWarning(
          `Lead-setter user "${userMappings.leadSetBy.displayName}" is currently inactive but will be preserved for historical attribution`,
          'LEAD_SETTER_INACTIVE_USER',
          'medium'
        ));
      }

      if (duplicateRowMetadata?.duplicateCount > 1) {
        const code = duplicateRowMetadata.suppressed ? 'DUPLICATE_ROW_SUPPRESSED' : 'DUPLICATE_ROW_PRIMARY';
        const message = duplicateRowMetadata.suppressed
          ? `Suppressed duplicate workbook row in group of ${duplicateRowMetadata.duplicateCount}`
          : `Primary workbook row selected from duplicate group of ${duplicateRowMetadata.duplicateCount}`;
        warnings.push(buildWarning(message, code, duplicateRowMetadata.suppressed ? 'high' : 'info'));
      } else if (duplicateRowIds.length > 1) {
        warnings.push(buildWarning(`Duplicate workbook rows detected (${duplicateRowIds.length})`, 'DUPLICATE_IMPORT_ROW', 'info'));
      }

      const leadMatch = await getCachedMatch(
        matchCaches.lead,
        createLeadMatchCacheKey(row),
        () => findLeadMatch(row, prismaClient)
      );
      warnings.push(...leadMatch.warnings);
      const opportunityMatch = await getCachedMatch(
        matchCaches.opportunity,
        createOpportunityMatchCacheKey(row, leadMatch),
        () => findOpportunityMatch(row, leadMatch, prismaClient)
      );
      const appointmentMatch = opportunityMatch.record
        ? await getCachedMatch(
            matchCaches.appointment,
            createAppointmentMatchCacheKey(opportunityMatch.record.id, row),
            () => findAppointmentMatch(opportunityMatch.record.id, row, prismaClient)
          )
        : null;

      if (row.eventType === 'REVENUE' && !row.amount) {
        warnings.push(buildWarning('Revenue row has no parsed amount; execution will skip revenue update', 'MISSING_REVENUE_AMOUNT', 'high'));
      }

      const executionActions = suppressedDuplicate
        ? {
            lead: 'suppress_duplicate',
            opportunity: 'suppress_duplicate',
            appointment: 'suppress_duplicate',
          }
        : {
            lead: leadMatch.record ? 'match' : 'create',
            opportunity: shouldCreateOpportunity(row)
              ? (opportunityMatch.record ? 'match' : 'create')
              : 'skip',
            appointment: shouldCreateAppointment(row)
              ? (appointmentMatch ? 'match' : 'create')
              : 'skip',
          };

      return {
        row,
        rowFingerprint: duplicateRowMetadata?.fingerprint || createRowFingerprint(row),
        duplicateMetadata: duplicateRowMetadata,
        suppressedDuplicate,
        userMappings,
        leadMatch,
        opportunityMatch,
        appointmentMatch,
        duplicateRowIds,
        warnings: summarizeWarnings(warnings),
        conflicts,
        actionable: conflicts.length === 0 && !suppressedDuplicate,
        executionActions,
      };
    });

    const duplicateSummary = duplicateMetadata.summary;
    const userMappingSummary = summarizeUserMappings(analysis);
    const summary = this.buildPreviewSummary(analysis, duplicateSummary, userMappingSummary);
    const executionGuards = buildExecutionGuards(analysis);

    return {
      analysis,
      duplicateSummary,
      duplicateGroups: duplicateMetadata.duplicateGroups,
      userMappingSummary,
      summary,
      executionGuards,
      aliasMapUsed: aliasMap,
    };
  }

  buildPreviewSummary(analysis, duplicateSummary = null, userMappingSummary = null) {
    const summary = {
      totalRows: analysis.length,
      actionableRows: 0,
      conflicts: 0,
      duplicateRows: duplicateSummary?.duplicateRows || 0,
      duplicateGroups: duplicateSummary?.duplicateGroups || 0,
      suppressedDuplicateRows: duplicateSummary?.suppressedRows || 0,
      matchedLeads: 0,
      newLeads: 0,
      matchedOpportunities: 0,
      newOpportunities: 0,
      matchedAppointments: 0,
      newAppointments: 0,
      userMappings: userMappingSummary || {
        exact: 0,
        exactMatched: 0,
        alias: 0,
        aliasMatched: 0,
        lowConfidence: 0,
        unresolved: 0,
        systemLabel: 0,
        systemLabels: 0,
        inactiveMatched: 0,
        splitResolved: 0,
        splitIssues: 0,
      },
    };

    for (const item of analysis) {
      if (item.actionable) summary.actionableRows += 1;
      if (item.conflicts.length > 0) summary.conflicts += 1;
      if (item.suppressedDuplicate) continue;
      if (item.leadMatch.record) summary.matchedLeads += 1;
      else summary.newLeads += 1;
      if (item.opportunityMatch.record) summary.matchedOpportunities += 1;
      else if (shouldCreateOpportunity(item.row)) summary.newOpportunities += 1;
      if (item.appointmentMatch) summary.matchedAppointments += 1;
      else if (shouldCreateAppointment(item.row)) summary.newAppointments += 1;
    }

    return summary;
  }

  formatPreviewRows(analysis) {
    return analysis.map((item) => ({
      rowId: item.row.rowId,
      rowFingerprint: item.rowFingerprint,
      sourceSheet: item.row.sourceSheet,
      sourceRowNumber: item.row.sourceRowNumber,
      name: item.row.name,
      phone: item.row.phone,
      email: item.row.email,
      date: item.row.date,
      time: item.row.time,
      repName: item.row.repName,
      eventType: item.row.eventType,
      value: item.row.value,
      workType: item.row.workType,
      disposition: item.row.disposition,
      normalizedDisposition: item.row.normalizedDisposition,
      callCenterStatus: item.row.callCenterStatus,
      callbackScheduledAt: item.row.callbackScheduledAt,
      systemLeadStatus: toLeadStatus(item.row),
      actions: item.executionActions,
      matches: {
        lead: item.leadMatch.record
          ? {
              id: item.leadMatch.record.id,
              method: item.leadMatch.method,
              confidence: item.leadMatch.confidence,
            }
          : null,
        opportunity: item.opportunityMatch.record
          ? {
              id: item.opportunityMatch.record.id,
              method: item.opportunityMatch.method,
              confidence: item.opportunityMatch.confidence,
            }
          : null,
        appointment: item.appointmentMatch
          ? {
              id: item.appointmentMatch.id,
              status: item.appointmentMatch.status,
            }
          : null,
      },
      userMappings: item.userMappings,
      duplicateHandling: {
        fingerprint: item.rowFingerprint,
        suppressed: item.suppressedDuplicate,
        isPrimary: item.duplicateMetadata?.isPrimary ?? true,
        duplicateCount: item.duplicateMetadata?.duplicateCount || 1,
        primaryRowId: item.duplicateMetadata?.primaryRowId || item.row.rowId,
      },
      warnings: item.warnings,
      conflicts: item.conflicts,
      actionable: item.actionable,
    }));
  }

  buildPreviewLockHashes(analysisResult) {
    const approvedPlanRows = buildApprovedPlanRows(analysisResult.analysis);
    const analysisSummary = buildExecutionPlanSummary(analysisResult);
    const analysisSummaryHash = buildAnalysisSummaryHash(analysisSummary);
    const planHash = hashValue(approvedPlanRows);

    return { analysisSummaryHash, planHash };
  }

  buildPreviewLockRecord({
    fileName,
    workbookHash,
    normalizedRowsHash,
    analysisResult,
    createdAt = new Date().toISOString(),
    expiresAt = new Date(Date.now() + PREVIEW_TOKEN_TTL_MS).toISOString(),
    previewToken = null,
    consumedAt = null,
  }) {
    const { analysisSummaryHash, planHash } = this.buildPreviewLockHashes(analysisResult);

    const record = {
      fileName,
      workbookHash,
      normalizedRowsHash,
      analysisSummaryHash,
      planHash,
      createdAt,
      expiresAt,
      executionGuards: analysisResult.executionGuards,
      consumedAt,
    };

    return {
      ...record,
      previewToken: previewToken || createPreviewToken(record),
    };
  }

  async buildPreviewLock({ fileName, workbookHash, normalizedRowsHash, analysisResult }, prismaClient) {
    const record = this.buildPreviewLockRecord({
      fileName,
      workbookHash,
      normalizedRowsHash,
      analysisResult,
    });

    cleanupExpiredPreviewPlans();
    await cleanupExpiredPersistedPreviewPlans(prismaClient);
    previewPlanRegistry.set(record.previewToken, record);
    await persistPreviewPlanRecord(prismaClient, record);

    return record;
  }

  buildPreviewPackage(input, analysisResult, lockRecord) {
    const normalizedRowsHash = computeNormalizedRowsHash(input.normalizedRows);

    return {
      source: {
        fileName: input.fileName,
        totalRows: input.normalizedRows.length,
        workbookHash: input.workbookHash,
        normalizedRowsHash,
      },
      previewToken: lockRecord.previewToken,
      previewTokenCreatedAt: lockRecord.createdAt,
      previewTokenExpiresAt: lockRecord.expiresAt,
      summary: analysisResult.summary,
      diagnostics: {
        reviewedPlanLock: {
          createdAt: lockRecord.createdAt,
          expiresAt: lockRecord.expiresAt,
          workbookHash: input.workbookHash,
          normalizedRowsHash,
          analysisSummaryHash: lockRecord.analysisSummaryHash,
          planHash: lockRecord.planHash,
          singleUse: true,
        },
        duplicates: {
          summary: analysisResult.duplicateSummary,
          groups: analysisResult.duplicateGroups,
        },
        userMappings: {
          aliasMapKeys: Object.keys(analysisResult.aliasMapUsed),
          summary: analysisResult.userMappingSummary,
        },
        executionGuards: analysisResult.executionGuards,
      },
      rows: this.formatPreviewRows(analysisResult.analysis),
    };
  }

  async buildPersistedPreviewPackage(input, analysisResult, prismaClient) {
    const normalizedRowsHash = computeNormalizedRowsHash(input.normalizedRows);
    const lockRecord = await this.buildPreviewLock({
      fileName: input.fileName,
      workbookHash: input.workbookHash,
      normalizedRowsHash,
      analysisResult,
    }, prismaClient);

    return this.buildPreviewPackage(input, analysisResult, lockRecord);
  }

  buildComparablePreviewPackage(input, analysisResult, approvedPreview = null) {
    const normalizedRowsHash = computeNormalizedRowsHash(input.normalizedRows);
    const currentLock = this.buildPreviewLockRecord({
      fileName: input.fileName,
      workbookHash: input.workbookHash,
      normalizedRowsHash,
      analysisResult,
      createdAt: approvedPreview?.createdAt || new Date().toISOString(),
      expiresAt: approvedPreview?.expiresAt || new Date(Date.now() + PREVIEW_TOKEN_TTL_MS).toISOString(),
      previewToken: approvedPreview?.previewToken || null,
      consumedAt: approvedPreview?.consumedAt || null,
    });

    return this.buildPreviewPackage(input, analysisResult, currentLock);
  }

  async preparePreview(inputPayload) {
    const normalizedRows = normalizeInputRows(inputPayload);
    const workbookHash = computeWorkbookHash(inputPayload);
    const analysisResult = await this.analyzeRows(normalizedRows, inputPayload);
    return {
      fileName: inputPayload.fileName || 'rows',
      workbookHash,
      normalizedRows,
      analysisResult,
    };
  }

  async previewImport({ fileBuffer, fileName, rows, userAliasMap = null }) {
    const prepared = await this.preparePreview({ fileBuffer, fileName, rows, userAliasMap });
    const prismaClient = await resolvePrismaClient(this.prisma);
    return this.buildPersistedPreviewPackage(prepared, prepared.analysisResult, prismaClient);
  }

  async validatePreviewTokenOrThrow(previewToken, currentPreview, allowRiskOverride, prismaClient) {
    if (!previewToken) {
      const error = new Error('Execution requires previewToken from a reviewed preview');
      error.statusCode = 400;
      error.code = 'PREVIEW_TOKEN_REQUIRED';
      throw error;
    }

    cleanupExpiredPreviewPlans();
    await cleanupExpiredPersistedPreviewPlans(prismaClient);
    const approved = await loadApprovedPreviewPlan(prismaClient, previewToken);
    if (!approved) {
      const error = new Error('Preview token is invalid, expired, or no longer available');
      error.statusCode = 409;
      error.code = 'PREVIEW_TOKEN_INVALID';
      throw error;
    }

    if (new Date(approved.expiresAt).getTime() <= Date.now()) {
      previewPlanRegistry.delete(previewToken);
      if (supportsPreviewPlanPersistence(prismaClient)) {
        await prismaClient.systemSetting.deleteMany({
          where: { key: getPreviewPlanSettingKey(previewToken) },
        });
      }
      const error = new Error('Preview token expired; generate a new preview before executing');
      error.statusCode = 409;
      error.code = 'PREVIEW_TOKEN_EXPIRED';
      throw error;
    }

    if (approved.consumedAt) {
      const error = new Error('Preview token has already been used; generate a new preview before re-executing');
      error.statusCode = 409;
      error.code = 'PREVIEW_TOKEN_ALREADY_USED';
      throw error;
    }

    const currentLock = currentPreview.diagnostics.reviewedPlanLock;
    if (approved.workbookHash !== currentLock.workbookHash) {
      const error = new Error('Workbook hash differs from the approved preview');
      error.statusCode = 409;
      error.code = 'PREVIEW_WORKBOOK_MISMATCH';
      throw error;
    }
    if (approved.normalizedRowsHash !== currentLock.normalizedRowsHash) {
      const error = new Error('Normalized row set differs from the approved preview');
      error.statusCode = 409;
      error.code = 'PREVIEW_NORMALIZED_ROWS_MISMATCH';
      throw error;
    }
    if (approved.analysisSummaryHash !== currentLock.analysisSummaryHash) {
      const error = new Error('Analysis summary differs from the approved preview');
      error.statusCode = 409;
      error.code = 'PREVIEW_SUMMARY_MISMATCH';
      throw error;
    }
    if (approved.planHash !== currentLock.planHash) {
      const error = new Error('Analyzed execution plan differs from the approved preview');
      error.statusCode = 409;
      error.code = 'PREVIEW_PLAN_MISMATCH';
      throw error;
    }

    const executionGuards = currentPreview.diagnostics.executionGuards;
    if (executionGuards.requiresManualOverride && !allowRiskOverride) {
      const error = new Error(`Execution blocked by guardrails: ${executionGuards.blockers.map((blocker) => blocker.code).join(', ')}`);
      error.statusCode = 409;
      error.code = 'EXECUTION_GUARDRAIL_BLOCK';
      throw error;
    }

    return approved;
  }

  async generateJobId(tx) {
    const currentYear = new Date().getUTCFullYear();
    const sequences = await tx.$queryRaw`
      SELECT id, year, last_number
      FROM job_id_sequences
      WHERE year = ${currentYear}
      FOR UPDATE
    `;

    let nextNumber;
    if (!sequences || sequences.length === 0) {
      await tx.jobIdSequence.create({
        data: {
          id: crypto.randomUUID(),
          year: currentYear,
          lastNumber: 1000,
        },
      });
      nextNumber = 1000;
    } else {
      nextNumber = Number(sequences[0].last_number) + 1;
      await tx.jobIdSequence.update({
        where: { year: currentYear },
        data: { lastNumber: nextNumber },
      });
    }

    return `${currentYear}-${nextNumber}`;
  }

  async generatePrefixedNumber(tx, modelName, fieldName, prefix) {
    const lastRecord = await tx[modelName].findFirst({
      orderBy: { createdAt: 'desc' },
      select: { [fieldName]: true },
    });
    const lastValue = lastRecord?.[fieldName];
    const match = typeof lastValue === 'string' ? lastValue.match(new RegExp(`^${prefix}-(\\d+)$`)) : null;
    const nextNumber = match ? Number.parseInt(match[1], 10) + 1 : 1;
    return `${prefix}-${String(nextNumber).padStart(6, '0')}`;
  }

  buildLeadCreateData(row, userMappings) {
    const { firstName, lastName } = splitFullName(row.name);
    const tentativeAppointmentDate = shouldCreateAppointment(row) && row.eventAt
      ? new Date(row.eventAt)
      : null;
    return {
      firstName: firstName || 'Unknown',
      lastName: lastName || 'Unknown',
      email: row.email,
      phone: row.phone,
      mobilePhone: row.phone,
      state: row.state,
      source: 'Call Center Import',
      workType: row.workType,
      ownerId: userMappings.owner?.userId || null,
      leadSetById: userMappings.leadSetBy?.userId || null,
      reportingCredits: userMappings.ownerReportingCredits?.status === 'resolved'
        ? userMappings.ownerReportingCredits.credits.map((credit) => ({
          userId: credit.userId,
          userName: credit.userName,
          creditPercent: credit.creditPercent,
        }))
        : null,
      status: toLeadStatus(row),
      disposition: row.normalizedDisposition || null,
      callback_scheduled_at: row.callbackScheduledAt ? new Date(row.callbackScheduledAt) : null,
      tentativeAppointmentDate,
      tentativeAppointmentTime: tentativeAppointmentDate ? row.time || null : null,
      leadNotes: sanitizeImportNotes(row),
      description: sanitizeImportNotes(row),
      isSelfGen: /self gen/i.test(row.notes || ''),
    };
  }

  buildLeadWriteData(candidate) {
    const data = { ...candidate };
    if ('ownerId' in data) {
      data.owner = connectById(data.ownerId);
      delete data.ownerId;
    }
    if ('leadSetById' in data) {
      data.leadSetBy = connectById(data.leadSetById);
      delete data.leadSetById;
    }
    return data;
  }

  buildLeadPatch(existingLead, row, userMappings) {
    const patch = {};
    const candidate = this.buildLeadCreateData(row, userMappings);

    for (const [key, value] of Object.entries(candidate)) {
      if (!hasValue(existingLead[key]) && hasValue(value)) {
        patch[key] = value;
      }
    }

    if (
      !Array.isArray(existingLead.reportingCredits)
      && Array.isArray(candidate.reportingCredits)
      && candidate.reportingCredits.length > 0
    ) {
      patch.reportingCredits = candidate.reportingCredits;
    }

    return patch;
  }

  async ensureLead(tx, analysisItem, auditUser) {
    if (analysisItem.leadMatch.record) {
      const patch = this.buildLeadPatch(analysisItem.leadMatch.record, analysisItem.row, analysisItem.userMappings);
      if (Object.keys(patch).length === 0) {
        return { record: analysisItem.leadMatch.record, action: 'matched' };
      }

      const updated = await tx.lead.update({
        where: { id: analysisItem.leadMatch.record.id },
        data: this.buildLeadWriteData(patch),
      });

      await createAuditEntry(tx, {
        tableName: 'leads',
        recordId: updated.id,
        action: 'UPDATE',
        oldValues: analysisItem.leadMatch.record,
        newValues: patch,
        userId: auditUser.userId,
        userEmail: auditUser.userEmail,
      });

      return { record: updated, action: 'updated' };
    }

    const created = await tx.lead.create({
      data: this.buildLeadWriteData(this.buildLeadCreateData(analysisItem.row, analysisItem.userMappings)),
    });

    await createAuditEntry(tx, {
      tableName: 'leads',
      recordId: created.id,
      action: 'CREATE',
      newValues: {
        firstName: created.firstName,
        lastName: created.lastName,
        email: created.email,
        phone: created.phone,
        ownerId: created.ownerId,
        reportingCredits: created.reportingCredits || null,
      },
      userId: auditUser.userId,
      userEmail: auditUser.userEmail,
    });

    return { record: created, action: 'created' };
  }

  async ensureAccountAndContact(tx, row, leadRecord, ownerUserId) {
    let account = await findAccountMatch(tx, row);
    if (!account) {
      account = await tx.account.create({
        data: {
          name: row.name || `${leadRecord.firstName} ${leadRecord.lastName}`.trim() || 'Imported Account',
          billingState: row.state,
          phone: row.phone,
          email: row.email,
          owner: connectById(ownerUserId || leadRecord.ownerId || null),
          type: 'RESIDENTIAL',
          status: 'NEW',
        },
        select: { id: true, name: true },
      });
    }

    let contact = await findContactMatch(tx, row, account.id);
    if (!contact) {
      const { firstName, lastName } = splitFullName(row.name);
      contact = await tx.contact.create({
        data: {
          firstName: firstName || leadRecord.firstName || 'Unknown',
          lastName: lastName || leadRecord.lastName || 'Unknown',
          fullName: row.name || `${leadRecord.firstName} ${leadRecord.lastName}`.trim(),
          email: row.email || leadRecord.email,
          phone: row.phone || leadRecord.phone,
          mobilePhone: row.phone || leadRecord.mobilePhone,
          account: { connect: { id: account.id } },
          isPrimary: true,
        },
        select: { id: true, accountId: true },
      });
    }

    return { account, contact };
  }

  buildOpportunityPatch(existingOpportunity, row, ownerUserId) {
    const patch = {};
    const desiredStage = toOpportunityStage(row.eventType);
    const desiredAppointmentDate = row.eventAt ? new Date(row.eventAt) : null;

    if (!existingOpportunity.ownerId && ownerUserId) patch.ownerId = ownerUserId;
    if (!existingOpportunity.appointmentDate && desiredAppointmentDate && shouldCreateAppointment(row)) {
      patch.appointmentDate = desiredAppointmentDate;
    }
    if ((row.eventType === 'SALE' || row.eventType === 'REVENUE') && desiredAppointmentDate && !existingOpportunity.soldDate) {
      patch.soldDate = desiredAppointmentDate;
    }
    if (row.amount && !existingOpportunity.contractTotal) {
      patch.contractTotal = row.amount;
      patch.amount = row.amount;
    }
    if (!existingOpportunity.stage || existingOpportunity.stage === DEFAULT_OPPORTUNITY_STAGE) {
      patch.stage = desiredStage;
    } else if (row.eventType === 'SALE' || row.eventType === 'REVENUE') {
      patch.stage = 'CLOSED_WON';
    } else if (row.eventType === 'APPOINTMENT_RAN' && existingOpportunity.stage === 'SCHEDULED') {
      patch.stage = 'INSPECTED';
    }
    return patch;
  }

  buildOpportunityWriteData(candidate) {
    const data = { ...candidate };
    if ('ownerId' in data) {
      data.owner = connectById(data.ownerId);
      delete data.ownerId;
    }
    return data;
  }

  async ensureOpportunity(tx, analysisItem, leadRecord, auditUser) {
    const ownerUserId = analysisItem.userMappings.owner?.userId || leadRecord.ownerId || null;
    if (analysisItem.opportunityMatch.record) {
      const patch = this.buildOpportunityPatch(analysisItem.opportunityMatch.record, analysisItem.row, ownerUserId);
      if (Object.keys(patch).length === 0) {
        return { record: analysisItem.opportunityMatch.record, action: 'matched' };
      }

      const updated = await tx.opportunity.update({
        where: { id: analysisItem.opportunityMatch.record.id },
        data: this.buildOpportunityWriteData(patch),
      });

      await createAuditEntry(tx, {
        tableName: 'opportunities',
        recordId: updated.id,
        action: 'UPDATE',
        oldValues: analysisItem.opportunityMatch.record,
        newValues: patch,
        userId: auditUser.userId,
        userEmail: auditUser.userEmail,
      });

      return { record: updated, action: 'updated' };
    }

    const { account, contact } = await this.ensureAccountAndContact(tx, analysisItem.row, leadRecord, ownerUserId);
    const jobId = await this.generateJobId(tx);
    const created = await tx.opportunity.create({
      data: {
        name: analysisItem.row.name || `${leadRecord.firstName} ${leadRecord.lastName}`.trim() || 'Imported Job',
        jobId: jobId,
        account: { connect: { id: account.id } },
        contact: { connect: { id: contact.id } },
        owner: connectById(ownerUserId),
        stage: toOpportunityStage(analysisItem.row.eventType),
        leadSource: leadRecord.source || 'Call Center Import',
        workType: analysisItem.row.workType || leadRecord.workType || undefined,
        appointmentDate: shouldCreateAppointment(analysisItem.row) && analysisItem.row.eventAt ? new Date(analysisItem.row.eventAt) : null,
        soldDate: ['SALE', 'REVENUE'].includes(analysisItem.row.eventType) && analysisItem.row.eventAt ? new Date(analysisItem.row.eventAt) : null,
        contractTotal: analysisItem.row.amount || undefined,
        amount: analysisItem.row.amount || undefined,
      },
    });

    if (!leadRecord.isConverted) {
      await tx.lead.update({
        where: { id: leadRecord.id },
        data: {
          isConverted: true,
          convertedDate: new Date(),
          convertedAccountId: account.id,
          convertedContactId: contact.id,
          convertedOpportunityId: created.id,
        },
      });
    }

    await createAuditEntry(tx, {
      tableName: 'opportunities',
      recordId: created.id,
      action: 'CREATE',
      newValues: {
        name: created.name,
        accountId: created.accountId,
        contactId: created.contactId,
        ownerId: created.ownerId,
        stage: created.stage,
      },
      userId: auditUser.userId,
      userEmail: auditUser.userEmail,
    });

    return { record: created, action: 'created' };
  }

  async ensureWorkOrder(tx, opportunityId, accountId, row) {
    const existing = await tx.workOrder.findFirst({
      where: { opportunityId },
      select: { id: true, workOrderNumber: true, status: true },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return { record: existing, action: 'matched' };

    const workOrderNumber = await this.generatePrefixedNumber(tx, 'workOrder', 'workOrderNumber', 'WO');
    const created = await tx.workOrder.create({
      data: {
        workOrderNumber,
        subject: `${row.workType || 'Inspection'} - ${row.name}`,
        description: sanitizeImportNotes(row),
        account: { connect: { id: accountId } },
        opportunity: connectById(opportunityId),
        status: 'SCHEDULED',
        startDate: row.eventAt ? new Date(row.eventAt) : null,
        endDate: row.eventAt ? new Date(new Date(row.eventAt).getTime() + APPOINTMENT_DURATION_MINUTES * 60000) : null,
      },
      select: { id: true, workOrderNumber: true, status: true },
    });
    return { record: created, action: 'created' };
  }

  async ensureAppointment(tx, analysisItem, opportunityRecord, auditUser) {
    const accountId = opportunityRecord.accountId;
    const workOrderResult = await this.ensureWorkOrder(tx, opportunityRecord.id, accountId, analysisItem.row);
    const desiredStatus = determineAppointmentStatus(analysisItem.row);

    if (analysisItem.appointmentMatch) {
      const patch = {};
      if (analysisItem.row.eventType === 'APPOINTMENT_RAN') {
        patch.status = 'COMPLETED';
        if (!analysisItem.appointmentMatch.actualStart && analysisItem.row.eventAt) {
          patch.actualStart = new Date(analysisItem.row.eventAt);
        }
      } else if (desiredStatus === 'CANCELED') {
        patch.status = 'CANCELED';
      }

      if (Object.keys(patch).length === 0) {
        return { record: analysisItem.appointmentMatch, action: 'matched', workOrder: workOrderResult.record };
      }

      const updated = await tx.serviceAppointment.update({
        where: { id: analysisItem.appointmentMatch.id },
        data: patch,
      });

      await createAuditEntry(tx, {
        tableName: 'service_appointments',
        recordId: updated.id,
        action: 'UPDATE',
        oldValues: analysisItem.appointmentMatch,
        newValues: patch,
        userId: auditUser.userId,
        userEmail: auditUser.userEmail,
      });

      return { record: updated, action: 'updated', workOrder: workOrderResult.record };
    }

    const appointmentNumber = await this.generatePrefixedNumber(tx, 'serviceAppointment', 'appointmentNumber', 'SA');
    const scheduledStart = analysisItem.row.eventAt ? new Date(analysisItem.row.eventAt) : new Date();
    const scheduledEnd = new Date(scheduledStart.getTime() + APPOINTMENT_DURATION_MINUTES * 60000);
    const created = await tx.serviceAppointment.create({
      data: {
        appointmentNumber,
        subject: `${analysisItem.row.workType || 'Inspection'} - ${analysisItem.row.name}`,
        description: sanitizeImportNotes(analysisItem.row),
        workOrder: { connect: { id: workOrderResult.record.id } },
        status: desiredStatus,
        earliestStart: scheduledStart,
        dueDate: scheduledEnd,
        scheduledStart,
        scheduledEnd,
        actualStart: analysisItem.row.eventType === 'APPOINTMENT_RAN' ? scheduledStart : null,
        actualEnd: analysisItem.row.eventType === 'APPOINTMENT_RAN' ? scheduledEnd : null,
        duration: APPOINTMENT_DURATION_MINUTES,
        state: analysisItem.row.state || null,
      },
    });

    await createAuditEntry(tx, {
      tableName: 'service_appointments',
      recordId: created.id,
      action: 'CREATE',
      newValues: {
        workOrderId: created.workOrderId,
        status: created.status,
        scheduledStart: created.scheduledStart,
      },
      userId: auditUser.userId,
      userEmail: auditUser.userEmail,
    });

    return { record: created, action: 'created', workOrder: workOrderResult.record };
  }

  async applyRow(analysisItem, auditUser) {
    if (!analysisItem.actionable) {
      return {
        rowId: analysisItem.row.rowId,
        status: analysisItem.suppressedDuplicate ? 'suppressed_duplicate' : 'skipped',
        reason: analysisItem.suppressedDuplicate ? 'Suppressed duplicate workbook row' : 'Row has blocking conflicts',
        conflicts: analysisItem.conflicts,
      };
    }

    const prismaClient = await resolvePrismaClient(this.prisma);
    return prismaClient.$transaction(async (tx) => {
      const leadResult = await this.ensureLead(tx, analysisItem, auditUser);
      let opportunityResult = null;
      let appointmentResult = null;

      if (shouldCreateOpportunity(analysisItem.row)) {
        opportunityResult = await this.ensureOpportunity(tx, analysisItem, leadResult.record, auditUser);
      }

      if (shouldCreateAppointment(analysisItem.row) && opportunityResult?.record) {
        appointmentResult = await this.ensureAppointment(tx, analysisItem, opportunityResult.record, auditUser);
      }

      return {
        rowId: analysisItem.row.rowId,
        status: 'applied',
        eventType: analysisItem.row.eventType,
        lead: { id: leadResult.record.id, action: leadResult.action },
        opportunity: opportunityResult
          ? { id: opportunityResult.record.id, action: opportunityResult.action }
          : null,
        appointment: appointmentResult
          ? { id: appointmentResult.record.id, action: appointmentResult.action }
          : null,
      };
    }, {
      maxWait: 10_000,
      timeout: 30_000,
    });
  }

  summarizeExecution(results) {
    const summary = {
      totalRows: results.length,
      appliedRows: 0,
      skippedRows: 0,
      failedRows: 0,
      suppressedDuplicateRows: 0,
      createdLeads: 0,
      updatedLeads: 0,
      createdOpportunities: 0,
      updatedOpportunities: 0,
      createdAppointments: 0,
      updatedAppointments: 0,
    };

    for (const result of results) {
      if (result.status === 'applied') summary.appliedRows += 1;
      if (result.status === 'skipped') summary.skippedRows += 1;
      if (result.status === 'failed') summary.failedRows += 1;
      if (result.status === 'suppressed_duplicate') summary.suppressedDuplicateRows += 1;
      if (result.lead?.action === 'created') summary.createdLeads += 1;
      if (result.lead?.action === 'updated') summary.updatedLeads += 1;
      if (result.opportunity?.action === 'created') summary.createdOpportunities += 1;
      if (result.opportunity?.action === 'updated') summary.updatedOpportunities += 1;
      if (result.appointment?.action === 'created') summary.createdAppointments += 1;
      if (result.appointment?.action === 'updated') summary.updatedAppointments += 1;
    }

    return summary;
  }

  async executeImport({
    fileBuffer,
    fileName,
    rows,
    confirm = false,
    previewToken = null,
    allowRiskOverride = false,
    userAliasMap = null,
  }, userContext = {}) {
    if (!confirm) {
      const error = new Error('Execution requires confirm=true');
      error.statusCode = 400;
      error.code = 'CONFIRM_REQUIRED';
      throw error;
    }

    const prepared = await this.preparePreview({ fileBuffer, fileName, rows, userAliasMap });
    const prismaClient = await resolvePrismaClient(this.prisma);
    const approvedPreview = await loadApprovedPreviewPlan(prismaClient, previewToken);
    const currentPreview = this.buildComparablePreviewPackage(prepared, prepared.analysisResult, approvedPreview);
    const validatedPreview = await this.validatePreviewTokenOrThrow(previewToken, currentPreview, allowRiskOverride, prismaClient);
    const auditUser = {
      userId: userContext.id || null,
      userEmail: userContext.email || null,
    };

    const results = [];
    for (const item of prepared.analysisResult.analysis) {
      if (item.suppressedDuplicate) {
        results.push({
          rowId: item.row.rowId,
          status: 'suppressed_duplicate',
          reason: 'Suppressed duplicate workbook row',
        });
        continue;
      }

      if (item.conflicts.length > 0) {
        results.push({
          rowId: item.row.rowId,
          status: 'skipped',
          reason: 'Row has blocking conflicts',
          conflicts: item.conflicts,
        });
        continue;
      }

      try {
        const result = await this.applyRow(item, auditUser);
        results.push(result);
      } catch (error) {
        logger.error('Call center import row failed', {
          rowId: item.row.rowId,
          sourceSheet: item.row.sourceSheet,
          sourceRowNumber: item.row.sourceRowNumber,
          error: error.message,
        });
        results.push({
          rowId: item.row.rowId,
          status: 'failed',
          error: error.message,
          eventType: item.row.eventType,
        });
      }
    }

    const consumedPreview = await markPreviewTokenConsumed(previewToken, prismaClient) || validatedPreview;

    return {
      source: currentPreview.source,
      summary: this.summarizeExecution(results),
      results,
      preview: {
        previewToken,
        approvedAt: validatedPreview.createdAt,
        expiresAt: validatedPreview.expiresAt,
        consumedAt: consumedPreview.consumedAt || null,
        summary: currentPreview.summary,
        diagnostics: currentPreview.diagnostics,
      },
      overrideApplied: allowRiskOverride,
    };
  }
}

export {
  CallCenterImportService,
  resetPreviewPlanRegistryForTest,
  buildWorkbookRows,
  normalizeInputRows,
  normalizeWorkbookRecord,
  inferSheetCategory,
  inferEventType,
  splitFullName,
  parsePhone,
  parseEmail,
  combineDateAndTime,
  buildUserLookup,
  buildUserAliasMap,
  deriveUserMappings,
  createRowFingerprint,
};

export const callCenterImportService = new CallCenterImportService();
export default callCenterImportService;
