function normalizeCallCenterKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const CALL_CENTER_DISPOSITION_DEFINITIONS = [
  {
    code: 'SCHEDULED',
    name: 'Scheduled',
    category: 'POSITIVE',
    color: '#22c55e',
    sortOrder: 1,
    removeFromList: true,
    updateLeadStatus: 'QUALIFIED',
    description: 'Appointment has been set.',
    aliases: ['scheduled', 'appointment set', 'lead set', 'set', 'appointment_set', 'apointment set', 'interested'],
  },
  {
    code: 'CONFIRMED',
    name: 'Confirmed',
    category: 'POSITIVE',
    color: '#10b981',
    sortOrder: 2,
    removeFromList: true,
    updateLeadStatus: 'QUALIFIED',
    updateOppStage: 'SCHEDULED',
    description: 'Appointment confirmed by the homeowner.',
    aliases: ['confirmed', 'confirm', 'confirmation'],
  },
  {
    code: 'CALL_BACK',
    name: 'Call Back',
    category: 'CALLBACK',
    color: '#2563eb',
    sortOrder: 10,
    scheduleCallback: true,
    updateLeadStatus: 'NURTURING',
    description: 'Lead asked for a callback at a specific date/time.',
    aliases: ['call back', 'callback', 'callback requested', 'follow up specific date', 'call back later', 'callbackrequested', 'followupspecificdate', 'callbacklater'],
  },
  {
    code: 'NOT_INTERESTED',
    name: 'Not Interested',
    category: 'NEGATIVE',
    color: '#f97316',
    sortOrder: 20,
    cooldownDays: 90,
    moveToListName: 'Cool Down',
    updateLeadStatus: 'NURTURING',
    description: 'Lead is not interested right now.',
    aliases: ['not interested', 'not_interested'],
  },
  {
    code: 'WRONG_NUMBER',
    name: 'Wrong Number',
    category: 'OTHER',
    color: '#6b7280',
    sortOrder: 21,
    removeFromList: true,
    updateLeadStatus: 'UNQUALIFIED',
    description: 'Phone number is invalid or disconnected.',
    aliases: ['wrong number', 'wrong_number', 'disconnected', 'bad number', 'bad_number'],
  },
  {
    code: 'MISSING_PARTY',
    name: 'Missing Party',
    category: 'NO_CONTACT',
    color: '#94a3b8',
    sortOrder: 22,
    updateLeadStatus: 'NURTURING',
    description: 'Reached someone other than the decision maker.',
    aliases: ['missing party', 'missing_party', 'not home owner', 'not homeowner'],
  },
  {
    code: 'CANT_AFFORD',
    name: "Can't Afford",
    category: 'NEGATIVE',
    color: '#ea580c',
    sortOrder: 23,
    cooldownDays: 30,
    moveToListName: 'Cool Down',
    updateLeadStatus: 'NURTURING',
    description: 'Lead says the project is out of budget.',
    aliases: ["can't afford", 'cant afford', 'cant_afford', 'cannot afford'],
  },
  {
    code: 'NO_VALUE',
    name: 'No Value',
    category: 'NEGATIVE',
    color: '#fb7185',
    sortOrder: 24,
    cooldownDays: 30,
    moveToListName: 'Cool Down',
    updateLeadStatus: 'NURTURING',
    description: 'Lead does not see value in moving forward.',
    aliases: ['no value', 'no_value', 'no prospect', 'no_prospect'],
  },
  {
    code: 'WEATHER_RELATED',
    name: 'Weather Related',
    category: 'CALLBACK',
    color: '#0ea5e9',
    sortOrder: 25,
    moveToListName: 'Reset',
    updateLeadStatus: 'NURTURING',
    description: 'Weather is blocking the next step and needs follow-up.',
    aliases: ['weather related', 'weather_related', 'weather'],
  },
  {
    code: 'THINKING_ABOUT_IT',
    name: 'Thinking About It',
    category: 'CALLBACK',
    color: '#8b5cf6',
    sortOrder: 26,
    cooldownDays: 14,
    moveToListName: 'Cool Down',
    updateLeadStatus: 'NURTURING',
    description: 'Lead needs more time before deciding.',
    aliases: ['thinking about it', 'thinking_about_it', 'thinking'],
  },
  {
    code: 'DO_NOT_CALL',
    name: 'Do Not Call',
    category: 'NEGATIVE',
    color: '#ef4444',
    sortOrder: 27,
    removeFromList: true,
    addToDNC: true,
    updateLeadStatus: 'UNQUALIFIED',
    description: 'Lead requested no more calls.',
    aliases: ['do not call', 'do_not_call', 'dnc'],
  },
  {
    code: 'CANCELED',
    name: 'Canceled',
    category: 'NEGATIVE',
    color: '#dc2626',
    sortOrder: 30,
    moveToListName: 'Reset',
    updateLeadStatus: 'NURTURING',
    description: 'Appointment was canceled and needs follow-up.',
    aliases: ['canceled', 'cancelled', 'appointment cancelled', 'appointment canceled', 'appointment_cancelled', 'appointment_canceled'],
  },
  {
    code: 'NEED_RESET',
    name: 'Need Reset',
    category: 'CALLBACK',
    color: '#7c3aed',
    sortOrder: 31,
    moveToListName: 'Reset',
    updateLeadStatus: 'NURTURING',
    description: 'Lead needs to be reset and worked again later.',
    aliases: ['need reset', 'need_reset', 'reset', 'rescheduled', 'appointment rescheduled', 'appointment_rescheduled', 'no demo', 'no_demo', '2nd visit needed', '2nd_visit_needed', 'second visit needed'],
  },
];

const CANONICAL_DISPOSITION_INDEX = new Map(
  CALL_CENTER_DISPOSITION_DEFINITIONS.map((definition) => [definition.code, definition])
);

const DISPOSITION_ALIAS_INDEX = new Map();
for (const definition of CALL_CENTER_DISPOSITION_DEFINITIONS) {
  DISPOSITION_ALIAS_INDEX.set(normalizeCallCenterKey(definition.code), definition.code);
  DISPOSITION_ALIAS_INDEX.set(normalizeCallCenterKey(definition.name), definition.code);
  for (const alias of definition.aliases || []) {
    DISPOSITION_ALIAS_INDEX.set(normalizeCallCenterKey(alias), definition.code);
  }
}

const CALL_CENTER_DISPOSITION_COMPATIBILITY_GROUPS = new Map([
  ['SCHEDULED', { name: 'Scheduled', codes: ['SCHEDULED', 'APPOINTMENT_SET'] }],
  ['CONFIRMED', { name: 'Confirmed', codes: ['CONFIRMED'] }],
  ['CALL_BACK', { name: 'Call Back', codes: ['CALL_BACK', 'CALLBACK', 'CALLBACK_REQUESTED', 'FOLLOW_UP_SPECIFIC_DATE', 'CALL_BACK_LATER'] }],
  ['NOT_INTERESTED', { name: 'Not Interested', codes: ['NOT_INTERESTED'] }],
  ['WRONG_NUMBER', { name: 'Wrong Number', codes: ['WRONG_NUMBER', 'BAD_NUMBER', 'DISCONNECTED'] }],
  ['MISSING_PARTY', { name: 'Missing Party', codes: ['MISSING_PARTY', 'NOT_HOME_OWNER', 'NOT_HOMEOWNER'] }],
  ['CANT_AFFORD', { name: "Can't Afford", codes: ['CANT_AFFORD'] }],
  ['NO_VALUE', { name: 'No Value', codes: ['NO_VALUE', 'NO_PROSPECT'] }],
  ['WEATHER_RELATED', { name: 'Weather Related', codes: ['WEATHER_RELATED'] }],
  ['THINKING_ABOUT_IT', { name: 'Thinking About It', codes: ['THINKING_ABOUT_IT'] }],
  ['DO_NOT_CALL', { name: 'Do Not Call', codes: ['DO_NOT_CALL', 'DNC'] }],
  ['CANCELED', { name: 'Canceled', codes: ['CANCELED', 'APPOINTMENT_CANCELLED', 'APPOINTMENT_CANCELED'] }],
  ['NEED_RESET', { name: 'Need Reset', codes: ['NEED_RESET', 'APPOINTMENT_RESCHEDULED', 'NO_DEMO', '2ND_VISIT_NEEDED'] }],
  ['NO_ANSWER', { name: 'No Answer', codes: ['NO_ANSWER'] }],
  ['VOICEMAIL', { name: 'Voicemail', codes: ['VOICEMAIL', 'LEFT_VOICEMAIL'] }],
]);

const DISPOSITION_COMPATIBILITY_INDEX = new Map();
for (const [canonicalCode, group] of CALL_CENTER_DISPOSITION_COMPATIBILITY_GROUPS.entries()) {
  for (const code of group.codes) {
    DISPOSITION_COMPATIBILITY_INDEX.set(code, canonicalCode);
  }
}

const CALLBACK_DISPOSITION_CODES = ['CALL_BACK', 'CALLBACK_REQUESTED', 'FOLLOW_UP_SPECIFIC_DATE', 'CALL_BACK_LATER'];
const COOLDOWN_DISPOSITION_CODES = [
  'NOT_INTERESTED',
  'CALL_BACK',
  'CALLBACK',
  'CALL_BACK_LATER',
  'CANT_AFFORD',
  'NO_VALUE',
  'THINKING_ABOUT_IT',
  'WEATHER_RELATED',
];

function normalizeCallCenterDispositionCode(value) {
  const normalized = normalizeCallCenterKey(value);
  if (!normalized) return null;
  return DISPOSITION_ALIAS_INDEX.get(normalized) || null;
}

function normalizeDispositionStorageCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getCallCenterDispositionCanonicalCode(value) {
  const normalizedCanonicalCode = normalizeCallCenterDispositionCode(value);
  if (normalizedCanonicalCode && CALL_CENTER_DISPOSITION_COMPATIBILITY_GROUPS.has(normalizedCanonicalCode)) {
    return normalizedCanonicalCode;
  }

  const storageCode = normalizeDispositionStorageCode(value);
  if (!storageCode) return normalizedCanonicalCode || null;
  if (CALL_CENTER_DISPOSITION_COMPATIBILITY_GROUPS.has(storageCode)) return storageCode;
  return DISPOSITION_COMPATIBILITY_INDEX.get(storageCode) || normalizedCanonicalCode || null;
}

function getCallCenterDispositionCompatibleCodes(value) {
  const canonicalCode = getCallCenterDispositionCanonicalCode(value);
  if (canonicalCode && CALL_CENTER_DISPOSITION_COMPATIBILITY_GROUPS.has(canonicalCode)) {
    return [...CALL_CENTER_DISPOSITION_COMPATIBILITY_GROUPS.get(canonicalCode).codes];
  }

  const storageCode = normalizeDispositionStorageCode(value);
  return storageCode ? [storageCode] : [];
}

function getCallCenterDispositionDefinition(code) {
  const normalizedCode = normalizeCallCenterDispositionCode(code) || code;
  return CANONICAL_DISPOSITION_INDEX.get(normalizedCode) || null;
}

function requiresCallbackAt(dispositionCode) {
  return normalizeCallCenterDispositionCode(dispositionCode) === 'CALL_BACK';
}

function toSystemLeadStatusFromDisposition(dispositionCode, fallbackStatus = 'NEW') {
  const canonicalCode = normalizeCallCenterDispositionCode(dispositionCode);
  if (!canonicalCode) return fallbackStatus;
  const definition = getCallCenterDispositionDefinition(canonicalCode);
  return definition?.updateLeadStatus || fallbackStatus;
}

function deriveCallCenterStatus({ status = null, disposition = null, eventType = null } = {}) {
  const canonicalDisposition = normalizeCallCenterDispositionCode(disposition);
  if (canonicalDisposition === 'CONFIRMED' || eventType === 'CONFIRMATION') return 'CONFIRMED';
  if (canonicalDisposition === 'CANCELED') return 'CANCELED';
  if (canonicalDisposition === 'NEED_RESET') return 'NEED_RESET';
  if (canonicalDisposition === 'SCHEDULED' || eventType === 'APPOINTMENT_SET') return 'SET';

  const normalizedStatus = String(status || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');

  if (['QUALIFIED', 'CONVERTED', 'SET'].includes(normalizedStatus)) return 'SET';
  if (['CONFIRMED'].includes(normalizedStatus)) return 'CONFIRMED';
  if (['CANCELED', 'CANCELLED'].includes(normalizedStatus)) return 'CANCELED';
  if (['NEED_RESET', 'RESET'].includes(normalizedStatus)) return 'NEED_RESET';
  if (canonicalDisposition) return 'NOT_SET';
  if (['CONTACTED', 'NURTURING', 'UNQUALIFIED'].includes(normalizedStatus)) return 'NOT_SET';
  return 'NEW';
}

export {
  CALL_CENTER_DISPOSITION_DEFINITIONS,
  CALLBACK_DISPOSITION_CODES,
  COOLDOWN_DISPOSITION_CODES,
  deriveCallCenterStatus,
  getCallCenterDispositionCanonicalCode,
  getCallCenterDispositionCompatibleCodes,
  getCallCenterDispositionDefinition,
  normalizeCallCenterDispositionCode,
  normalizeCallCenterKey,
  requiresCallbackAt,
  toSystemLeadStatusFromDisposition,
};
