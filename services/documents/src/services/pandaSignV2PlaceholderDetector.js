const PLACEHOLDER_TAG_REGEX = /<([a-zA-Z0-9:-]+)\b([^>]*\bdata-ps-field\s*=\s*["'][^"']+["'][^>]*)>/gi;
const ATTRIBUTE_REGEX = /([a-zA-Z0-9:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

export const SIGNER_ROLES = {
  CUSTOMER: 'CUSTOMER',
  AGENT: 'AGENT',
};

export const SIGNATURE_FIELD_TYPES = {
  SIGNATURE: 'SIGNATURE',
  INITIAL: 'INITIAL',
};

export const DEFAULT_REQUIRED_SIGNATURE_ANCHORS = {
  [SIGNER_ROLES.CUSTOMER]: [
    SIGNATURE_FIELD_TYPES.SIGNATURE,
    SIGNATURE_FIELD_TYPES.INITIAL,
  ],
  [SIGNER_ROLES.AGENT]: [
    SIGNATURE_FIELD_TYPES.SIGNATURE,
    SIGNATURE_FIELD_TYPES.INITIAL,
  ],
};

function normalizeRole(input) {
  const value = String(input || '').trim().toUpperCase();
  if (value === SIGNER_ROLES.CUSTOMER) return SIGNER_ROLES.CUSTOMER;
  if (value === SIGNER_ROLES.AGENT) return SIGNER_ROLES.AGENT;
  return 'UNKNOWN';
}

function normalizeFieldType(input) {
  const value = String(input || '').trim().toUpperCase();
  if (value.includes('INITIAL')) return SIGNATURE_FIELD_TYPES.INITIAL;
  return SIGNATURE_FIELD_TYPES.SIGNATURE;
}

function parseAttributes(rawAttributes) {
  const attributes = {};
  ATTRIBUTE_REGEX.lastIndex = 0;
  let match = ATTRIBUTE_REGEX.exec(rawAttributes);
  while (match) {
    attributes[match[1]] = (match[3] ?? match[4] ?? '').trim();
    match = ATTRIBUTE_REGEX.exec(rawAttributes);
  }
  return attributes;
}

function createAutoId(index, role, type) {
  return `auto-${index}-${String(role || 'UNKNOWN').toLowerCase()}-${String(type || 'signature').toLowerCase()}`;
}

function dedupeKey(placeholder) {
  // Important: dedupe must include id+role+type so AGENT fields do not hide CUSTOMER fields.
  return `${placeholder.id}::${placeholder.role}::${placeholder.type}`;
}

export function detectPlaceholdersFromHtml(htmlBody) {
  const html = String(htmlBody || '');
  const placeholders = [];
  const duplicatePlaceholders = [];
  const warnings = [];

  const seen = new Set();
  let index = 0;

  PLACEHOLDER_TAG_REGEX.lastIndex = 0;
  let match = PLACEHOLDER_TAG_REGEX.exec(html);

  while (match) {
    index += 1;
    const tagName = match[1];
    const rawAttributes = match[2] || '';
    const attributes = parseAttributes(rawAttributes);

    const role = normalizeRole(attributes['data-ps-role']);
    const type = normalizeFieldType(attributes['data-ps-field']);
    const hasId = Boolean(attributes['data-ps-id']);
    const id = hasId ? attributes['data-ps-id'] : createAutoId(index, role, type);

    const placeholder = {
      id,
      role,
      type,
      anchorStatus: hasId ? 'FOUND' : 'MISSING_ID',
      tagName,
      attributes: {
        field: attributes['data-ps-field'] || '',
        role: attributes['data-ps-role'] || '',
        id: attributes['data-ps-id'] || '',
      },
      sourceIndex: index,
    };

    if (!hasId) {
      warnings.push({
        code: 'PLACEHOLDER_MISSING_ID',
        message: `Placeholder ${index} is missing data-ps-id and received an auto id.`,
        placeholder,
      });
    }

    const key = dedupeKey(placeholder);
    if (seen.has(key)) {
      duplicatePlaceholders.push(placeholder);
    } else {
      seen.add(key);
      placeholders.push(placeholder);
    }

    match = PLACEHOLDER_TAG_REGEX.exec(html);
  }

  return {
    placeholders,
    duplicatePlaceholders,
    placeholdersByRole: {
      [SIGNER_ROLES.CUSTOMER]: placeholders.filter((item) => item.role === SIGNER_ROLES.CUSTOMER),
      [SIGNER_ROLES.AGENT]: placeholders.filter((item) => item.role === SIGNER_ROLES.AGENT),
      UNKNOWN: placeholders.filter((item) => item.role === 'UNKNOWN'),
    },
    warnings,
    errors: [],
  };
}

export function validateRequiredSignatureAnchors(
  detectionReport,
  {
    requiredAnchorsByRole = DEFAULT_REQUIRED_SIGNATURE_ANCHORS,
    strictRequiredAnchors = false,
  } = {}
) {
  const report = detectionReport || {};
  const placeholders = Array.isArray(report.placeholders) ? report.placeholders : [];
  const requiredFieldFailures = [];

  for (const [role, requiredTypes] of Object.entries(requiredAnchorsByRole || {})) {
    const normalizedRole = normalizeRole(role);
    for (const type of requiredTypes || []) {
      const normalizedType = normalizeFieldType(type);
      const exists = placeholders.some(
        (item) => item.role === normalizedRole && item.type === normalizedType
      );

      if (!exists) {
        requiredFieldFailures.push({
          id: `${normalizedRole}_${normalizedType}_required`,
          role: normalizedRole,
          type: normalizedType,
          anchorStatus: 'MISSING_REQUIRED_ANCHOR',
          message: `Required ${normalizedRole} ${normalizedType.toLowerCase()} anchor is missing.`,
        });
      }
    }
  }

  const validation = {
    isValid: requiredFieldFailures.length === 0,
    requiredFieldFailures,
    warnings: report.warnings || [],
    errors: report.errors || [],
  };

  // Opt-in hard failure for strict preflight checks only.
  if (strictRequiredAnchors && requiredFieldFailures.length > 0) {
    const error = new Error('Required PandaSign signature placeholders are missing.');
    error.code = 'MISSING_REQUIRED_SIGNATURE_ANCHORS';
    error.details = requiredFieldFailures;
    throw error;
  }

  return validation;
}

export default {
  detectPlaceholdersFromHtml,
  validateRequiredSignatureAnchors,
};
