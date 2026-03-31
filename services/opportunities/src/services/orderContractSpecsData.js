function isPlainObject(value) {
  return Boolean(value) && Object.prototype.toString.call(value) === '[object Object]';
}

function deepCloneJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

export function deepMergeJson(baseValue, patchValue) {
  if (patchValue === undefined) {
    return deepCloneJson(baseValue, baseValue);
  }

  if (Array.isArray(patchValue)) {
    return deepCloneJson(patchValue, []);
  }

  if (!isPlainObject(patchValue)) {
    return patchValue;
  }

  const baseObject = isPlainObject(baseValue) ? baseValue : {};
  const result = { ...deepCloneJson(baseObject, {}) };

  Object.entries(patchValue).forEach(([key, value]) => {
    if (value === undefined) return;

    if (Array.isArray(value)) {
      result[key] = deepCloneJson(value, []);
      return;
    }

    if (isPlainObject(value)) {
      result[key] = deepMergeJson(baseObject[key], value);
      return;
    }

    result[key] = value;
  });

  return result;
}

export function parseSpecsDataValue(rawValue) {
  if (!rawValue) return {};

  if (isPlainObject(rawValue)) {
    return deepCloneJson(rawValue, {});
  }

  if (typeof rawValue === 'string') {
    try {
      const parsed = JSON.parse(rawValue);
      return isPlainObject(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return {};
}

function normalizeLineItem(item, index) {
  if (!isPlainObject(item)) return null;

  return {
    id: item.id || `line-item-${index + 1}`,
    name: item.name || '',
    description: item.description || '',
    quantity: item.quantity ?? 1,
    unitPrice: item.unitPrice ?? null,
    total: item.total ?? null,
  };
}

function normalizeSignerPatch(signer) {
  if (!isPlainObject(signer)) return {};

  const normalized = {};

  ['name', 'email', 'phone', 'title', 'role', 'label'].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(signer, key)) {
      normalized[key] = signer[key] || '';
    }
  });

  if (Object.prototype.hasOwnProperty.call(signer, 'required')) {
    normalized.required = signer.required;
  }

  return normalized;
}

function normalizeNullableString(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeDateOnlyValue(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
    if (match) return match[1];
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return null;
}

export function normalizeOrderContractPatch(orderContractPatch = {}) {
  const patch = isPlainObject(orderContractPatch) ? orderContractPatch : {};

  const normalized = {};

  if (isPlainObject(patch.overview)) {
    normalized.overview = deepCloneJson(patch.overview, {});
  }

  if (isPlainObject(patch.pricing)) {
    normalized.pricing = {
      ...deepCloneJson(patch.pricing, {}),
    };

    if (Array.isArray(patch.pricing.lineItems)) {
      normalized.pricing.lineItems = patch.pricing.lineItems
        .map(normalizeLineItem)
        .filter(Boolean);
    }
  }

  if (isPlainObject(patch.signers)) {
    normalized.signers = {};

    if (isPlainObject(patch.signers.customer)) {
      normalized.signers.customer = normalizeSignerPatch(patch.signers.customer);
    }

    if (isPlainObject(patch.signers.agent)) {
      normalized.signers.agent = normalizeSignerPatch(patch.signers.agent);
    }

    if (Array.isArray(patch.signers.additional)) {
      normalized.signers.additional = patch.signers.additional
        .map(normalizeSignerPatch)
        .filter((signer) => Object.keys(signer).length > 0);
    }
  }

  return normalized;
}

export function normalizeInsuranceClaimPatch(insuranceClaimPatch = {}) {
  const patch = isPlainObject(insuranceClaimPatch) ? insuranceClaimPatch : {};
  const normalized = {};
  const adjusterPatch = isPlainObject(patch.adjuster) ? patch.adjuster : patch;
  const adjuster = {};

  const fieldMap = {
    adjusterName: 'name',
    adjusterOfficePhone: 'officePhone',
    adjusterOfficePhoneExt: 'officePhoneExt',
    adjusterMobilePhone: 'mobilePhone',
    adjusterEmail: 'email',
  };

  Object.entries(fieldMap).forEach(([sourceKey, targetKey]) => {
    if (Object.prototype.hasOwnProperty.call(adjusterPatch, sourceKey)) {
      adjuster[targetKey] = normalizeNullableString(adjusterPatch[sourceKey]);
    }
  });

  ['name', 'officePhone', 'officePhoneExt', 'mobilePhone', 'email'].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(adjusterPatch, key)) {
      adjuster[key] = normalizeNullableString(adjusterPatch[key]);
    }
  });

  if (Object.keys(adjuster).length > 0) {
    normalized.adjuster = adjuster;
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'adjusterAssigned')) {
    normalized.adjusterAssigned = Boolean(patch.adjusterAssigned);
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'adjusterMeetingComplete')) {
    normalized.adjusterMeetingComplete = Boolean(patch.adjusterMeetingComplete);
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'adjusterMeetingDate')) {
    normalized.adjusterMeetingDate = normalizeDateOnlyValue(patch.adjusterMeetingDate);
  }

  return normalized;
}

export function extractOrderContractFromSpecsData(specsDataValue) {
  const specsData = parseSpecsDataValue(specsDataValue);
  return isPlainObject(specsData.orderContract)
    ? deepCloneJson(specsData.orderContract, {})
    : {};
}

export function extractInsuranceClaimFromSpecsData(specsDataValue) {
  const specsData = parseSpecsDataValue(specsDataValue);
  const insuranceClaim = isPlainObject(specsData.insuranceClaim)
    ? deepCloneJson(specsData.insuranceClaim, {})
    : {};
  const adjuster = isPlainObject(insuranceClaim.adjuster) ? insuranceClaim.adjuster : {};

  return {
    adjusterName: normalizeNullableString(adjuster.name) ?? null,
    adjusterOfficePhone: normalizeNullableString(adjuster.officePhone) ?? null,
    adjusterOfficePhoneExt: normalizeNullableString(adjuster.officePhoneExt) ?? null,
    adjusterMobilePhone: normalizeNullableString(adjuster.mobilePhone) ?? null,
    adjusterEmail: normalizeNullableString(adjuster.email) ?? null,
    adjusterAssigned:
      typeof insuranceClaim.adjusterAssigned === 'boolean'
        ? insuranceClaim.adjusterAssigned
        : null,
    adjusterMeetingDate: normalizeDateOnlyValue(insuranceClaim.adjusterMeetingDate) ?? null,
    adjusterMeetingComplete:
      typeof insuranceClaim.adjusterMeetingComplete === 'boolean'
        ? insuranceClaim.adjusterMeetingComplete
        : null,
  };
}

export function mergeOrderContractIntoSpecsData(specsDataValue, orderContractPatch = {}) {
  const specsData = parseSpecsDataValue(specsDataValue);
  const existingOrderContract = extractOrderContractFromSpecsData(specsData);
  const normalizedPatch = normalizeOrderContractPatch(orderContractPatch);
  const mergedOrderContract = deepMergeJson(existingOrderContract, normalizedPatch);
  const mergedSpecsData = deepMergeJson(specsData, {
    orderContract: mergedOrderContract,
  });

  return {
    specsData: mergedSpecsData,
    orderContract: mergedOrderContract,
  };
}

export function mergeInsuranceClaimIntoSpecsData(specsDataValue, insuranceClaimPatch = {}) {
  const specsData = parseSpecsDataValue(specsDataValue);
  const existingInsuranceClaim = isPlainObject(specsData.insuranceClaim)
    ? deepCloneJson(specsData.insuranceClaim, {})
    : {};
  const normalizedPatch = normalizeInsuranceClaimPatch(insuranceClaimPatch);
  const mergedInsuranceClaim = deepMergeJson(existingInsuranceClaim, normalizedPatch);
  const mergedSpecsData = deepMergeJson(specsData, {
    insuranceClaim: mergedInsuranceClaim,
  });

  return {
    specsData: mergedSpecsData,
    insuranceClaim: mergedInsuranceClaim,
  };
}
