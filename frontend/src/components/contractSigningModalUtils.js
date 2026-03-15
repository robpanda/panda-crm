export function normalizePreviewPayload(rawData) {
  if (!rawData || typeof rawData !== 'object') return {};
  const nested = rawData.data && typeof rawData.data === 'object' ? rawData.data : {};
  return { ...rawData, ...nested };
}

export function getPreviewUrl(previewData) {
  if (!previewData || typeof previewData !== 'object') return null;
  return (
    previewData.previewUrl ||
    previewData.documentUrl ||
    previewData.url ||
    previewData.pdfUrl ||
    previewData.preview?.previewUrl ||
    previewData.preview?.documentUrl ||
    previewData.preview?.url ||
    null
  );
}

export function getPreviewHash(previewData) {
  if (!previewData || typeof previewData !== 'object') return null;
  return (
    previewData.previewHash ||
    previewData.documentHash ||
    previewData.preview?.previewHash ||
    previewData.preview?.documentHash ||
    null
  );
}

export function getPreviewMissingTokens(previewData) {
  if (!previewData || typeof previewData !== 'object') return [];

  const candidates = [
    previewData.missingTokens,
    previewData.previewReport?.missingTokens,
    previewData.fieldMapReport?.missingTokens,
    previewData.tokenReport?.missingTokens,
    previewData.report?.missingTokens,
  ];

  return [...new Set(
    candidates
      .flatMap((candidate) => (Array.isArray(candidate) ? candidate : []))
      .map((token) => {
        if (!token) return null;
        if (typeof token === 'string') return token;
        return token.token || token.key || token.name || token.message || null;
      })
      .filter(Boolean)
  )];
}

export function getPreviewWarnings(previewData) {
  if (!previewData || typeof previewData !== 'object') return [];

  const candidates = [
    previewData.previewWarnings,
    previewData.warnings,
    previewData.previewReport?.previewWarnings,
    previewData.previewReport?.warnings,
    previewData.report?.warnings,
    previewData.fieldMapReport?.warnings,
  ];

  return [...new Set(
    candidates
      .flatMap((candidate) => (Array.isArray(candidate) ? candidate : []))
      .map((warning) => {
        if (!warning) return null;
        if (typeof warning === 'string') return warning;
        return warning.message || warning.warning || warning.code || null;
      })
      .filter(Boolean)
  )];
}

export function getPlaceholderSummaryByRole(previewData) {
  const summary = {
    CUSTOMER: { total: 0, signature: 0, initial: 0 },
    AGENT: { total: 0, signature: 0, initial: 0 },
    OTHER: { total: 0, signature: 0, initial: 0 },
  };

  if (!previewData || typeof previewData !== 'object') return summary;

  const placeholders = [
    ...getAsArray(previewData.fieldMapReport?.fields),
    ...getAsArray(previewData.fieldMapReport),
    ...getAsArray(previewData.previewReport?.fieldMapReport?.fields),
    ...getAsArray(previewData.previewReport?.fieldMapReport),
    ...getAsArray(previewData.signaturePlaceholders),
    ...getAsArray(previewData.placeholders),
  ];

  placeholders.forEach((placeholder) => {
    if (!placeholder || typeof placeholder !== 'object') return;
    const rawRole = String(
      placeholder.role ||
      placeholder.signerRole ||
      placeholder.dataPsRole ||
      placeholder.ownerRole ||
      'OTHER'
    ).toUpperCase();
    const role = rawRole === 'CUSTOMER' || rawRole === 'AGENT' ? rawRole : 'OTHER';

    const rawType = String(
      placeholder.type ||
      placeholder.fieldType ||
      placeholder.kind ||
      placeholder.inputType ||
      'FIELD'
    ).toUpperCase();

    summary[role].total += 1;
    if (rawType.includes('INITIAL')) {
      summary[role].initial += 1;
    } else if (rawType.includes('SIGN')) {
      summary[role].signature += 1;
    }
  });

  return summary;
}

function getAsArray(value) {
  return Array.isArray(value) ? value : [];
}

export function getChecklist(verification) {
  if (!verification || typeof verification !== 'object') return [];

  if (Array.isArray(verification.checklist)) return verification.checklist;
  if (Array.isArray(verification.validationChecklist)) return verification.validationChecklist;
  if (Array.isArray(verification.data?.checklist)) return verification.data.checklist;
  if (Array.isArray(verification.data?.validationChecklist)) return verification.data.validationChecklist;

  return [];
}

export function getMissingItems(verification) {
  if (!verification || typeof verification !== 'object') return [];

  const fromFailures = Array.isArray(verification.requiredFieldFailures)
    ? verification.requiredFieldFailures
    : Array.isArray(verification.data?.requiredFieldFailures)
      ? verification.data.requiredFieldFailures
      : [];

  const fromMissing = Array.isArray(verification.missingTokens)
    ? verification.missingTokens
    : Array.isArray(verification.data?.missingTokens)
      ? verification.data.missingTokens
      : [];

  const flattenedFailures = fromFailures
    .map((item) => {
      if (!item) return null;
      if (typeof item === 'string') return item;
      return item.field || item.key || item.name || item.message || null;
    })
    .filter(Boolean);

  const flattenedMissing = fromMissing
    .map((item) => {
      if (!item) return null;
      if (typeof item === 'string') return item;
      return item.token || item.key || item.name || item.message || null;
    })
    .filter(Boolean);

  return [...new Set([...flattenedFailures, ...flattenedMissing])];
}

export function unwrapApiEnvelope(payload) {
  if (!payload || typeof payload !== 'object') return payload ?? null;
  if (payload.data && typeof payload.data === 'object') return payload.data;
  return payload;
}

export function getAgreementId(agreement) {
  if (!agreement || typeof agreement !== 'object') return null;
  return agreement.id || agreement.agreementId || null;
}

export function mergeAgreementState(previousAgreement, nextAgreement) {
  if (!previousAgreement || typeof previousAgreement !== 'object') {
    return nextAgreement || null;
  }
  if (!nextAgreement || typeof nextAgreement !== 'object') {
    return previousAgreement;
  }
  return {
    ...previousAgreement,
    ...nextAgreement,
  };
}

export function normalizeAgreementStatus(status) {
  if (!status) return 'DRAFT';
  return String(status).trim().toUpperCase() || 'DRAFT';
}

export function formatAgreementStatusLabel(status) {
  return normalizeAgreementStatus(status)
    .toLowerCase()
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

export function getAgreementStatusClasses(status) {
  const normalized = normalizeAgreementStatus(status);
  if (normalized === 'COMPLETED') return 'bg-green-100 text-green-700';
  if (normalized === 'SIGNED' || normalized === 'PARTIALLY_SIGNED') return 'bg-blue-100 text-blue-700';
  if (normalized === 'VIEWED') return 'bg-amber-100 text-amber-700';
  if (normalized === 'SENT') return 'bg-indigo-100 text-indigo-700';
  if (normalized === 'VOIDED') return 'bg-red-100 text-red-700';
  return 'bg-gray-100 text-gray-700';
}

export function getAgreementDocumentUrl(agreement) {
  if (!agreement || typeof agreement !== 'object') return null;
  return agreement.signedDocumentUrl || agreement.documentUrl || null;
}

export function extractSigningToken(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const direct = [
    payload.signingToken,
    payload.customerSigningToken,
    payload.customerToken,
    payload.token,
    payload.tokens?.CUSTOMER,
    payload.tokens?.customer,
    payload.signingTokens?.CUSTOMER,
    payload.signingTokens?.customer,
  ];
  for (const token of direct) {
    const normalized = normalizeTokenValue(token);
    if (normalized) return normalized;
  }

  const links = [
    payload.customerSigningUrl,
    payload.customerLink,
    payload.signingUrl,
    payload.signingLinks?.CUSTOMER,
    payload.signingLinks?.customer,
    payload.links?.customer,
  ];
  for (const link of links) {
    const extracted = extractTokenFromUrl(link);
    if (extracted) return extracted;
  }

  return null;
}

export function extractHostSigningToken(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const direct = [
    payload.hostSigningToken,
    payload.hostToken,
    payload.token,
    payload.signingToken,
    payload.agentSigningToken,
    payload.agentToken,
  ];
  for (const token of direct) {
    const normalized = normalizeTokenValue(token);
    if (normalized) return normalized;
  }

  const links = [
    payload.hostSigningUrl,
    payload.hostLink,
    payload.agentSigningUrl,
    payload.signingUrl,
    payload.signingLinks?.AGENT,
    payload.signingLinks?.agent,
    payload.links?.agent,
  ];
  for (const link of links) {
    const extracted = extractTokenFromUrl(link);
    if (extracted) return extracted;
  }

  return null;
}

function normalizeTokenValue(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes('/')) return extractTokenFromUrl(trimmed);
  return trimmed;
}

function extractTokenFromUrl(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!trimmed.includes('/')) return trimmed;

  let path = trimmed;
  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      path = new URL(trimmed).pathname;
    }
  } catch {
    path = trimmed;
  }

  const segments = path.split('/').filter(Boolean);
  if (!segments.length) return null;
  const last = segments[segments.length - 1] || '';
  return last.split('?')[0] || null;
}

export function getCustomerDisplayName(contact) {
  if (!contact || typeof contact !== 'object') return 'Customer';
  const full = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();
  return contact.fullName || contact.name || full || 'Customer';
}

export function getAgentDisplayName(currentUser, fallbackEmail) {
  if (currentUser && typeof currentUser === 'object') {
    const full = [currentUser.firstName, currentUser.lastName].filter(Boolean).join(' ').trim();
    if (full) return full;
    if (typeof currentUser.fullName === 'string' && currentUser.fullName.trim()) return currentUser.fullName.trim();
    if (typeof currentUser.name === 'string' && currentUser.name.trim()) return currentUser.name.trim();
    if (typeof currentUser.email === 'string' && currentUser.email.includes('@')) {
      return currentUser.email.split('@')[0];
    }
  }
  if (typeof fallbackEmail === 'string' && fallbackEmail.includes('@')) {
    return fallbackEmail.split('@')[0];
  }
  return 'Agent';
}

export function getSignerRequiredFields(signSession, requestedRole) {
  if (!signSession || typeof signSession !== 'object') return [];

  const targetRole = normalizeRole(requestedRole);
  if (!targetRole) return [];

  const roleSpecificSources = targetRole === 'CUSTOMER'
    ? [
      signSession.customerFieldsToSign,
      signSession.customerRequiredFields,
      signSession.customerFields,
    ]
    : [
      signSession.agentFieldsToSign,
      signSession.agentRequiredFields,
      signSession.agentFields,
    ];

  const roleSpecific = roleSpecificSources
    .flatMap((value) => (Array.isArray(value) ? value : []))
    .filter((field) => field && typeof field === 'object');

  if (roleSpecific.length > 0) {
    return dedupeFieldList(roleSpecific.map((field, index) => normalizeFieldEntry(field, targetRole, index)));
  }

  const genericSources = [
    signSession.fieldsToSign,
    signSession.requiredFields,
    signSession.fields,
    signSession.signatureFields,
    signSession.fieldMapReport?.fields,
    signSession.previewReport?.fieldMapReport?.fields,
  ];

  const genericFields = genericSources
    .flatMap((value) => (Array.isArray(value) ? value : []))
    .filter((field) => field && typeof field === 'object');

  if (!genericFields.length) {
    return [];
  }

  const sessionRole = normalizeRole(
    signSession.signerRole ||
    signSession.role ||
    signSession.signer?.role
  );

  const hasRoleMetadata = genericFields.some((field) => normalizeRole(
    field.role ||
    field.signerRole ||
    field.ownerRole ||
    field.dataPsRole
  ));

  if (hasRoleMetadata) {
    const filtered = genericFields.filter((field) => normalizeRole(
      field.role ||
      field.signerRole ||
      field.ownerRole ||
      field.dataPsRole
    ) === targetRole);
    return dedupeFieldList(filtered.map((field, index) => normalizeFieldEntry(field, targetRole, index)));
  }

  if (sessionRole && sessionRole !== targetRole) {
    return [];
  }
  if (!sessionRole) {
    return [];
  }

  return dedupeFieldList(genericFields.map((field, index) => normalizeFieldEntry(field, targetRole, index)));
}

function normalizeRole(value) {
  if (!value) return null;
  const normalized = String(value).trim().toUpperCase();
  if (!normalized) return null;
  if (normalized === 'CUSTOMER') return 'CUSTOMER';
  if (normalized === 'AGENT') return 'AGENT';
  return normalized;
}

function normalizeFieldEntry(field, role, index) {
  const type = String(
    field.type ||
    field.fieldType ||
    field.kind ||
    field.inputType ||
    'FIELD'
  ).toUpperCase();

  return {
    ...field,
    role,
    type,
    id: field.id || field.fieldId || field.dataPsId || field.key || `${role}-field-${index + 1}`,
    key: field.key || field.id || field.fieldId || field.dataPsId || `${role}-field-${index + 1}`,
    label: field.label || field.name || field.key || field.id || `Required field ${index + 1}`,
  };
}

function dedupeFieldList(fields) {
  const seen = new Set();
  const result = [];
  for (const field of fields) {
    const dedupeKey = `${field.role || ''}:${field.id || field.key || field.label || ''}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    result.push(field);
  }
  return result;
}
