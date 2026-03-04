export const VERIFICATION_STATUS = {
  verified: 'verified',
  needsReview: 'needs_review',
  unknown: 'unknown',
};

const LEGACY_STATUS_MAP = {
  pass: VERIFICATION_STATUS.verified,
  fail: VERIFICATION_STATUS.needsReview,
  healthy: VERIFICATION_STATUS.verified,
  warning: VERIFICATION_STATUS.needsReview,
  critical: VERIFICATION_STATUS.needsReview,
};

export function normalizeVerificationStatus(status) {
  if (!status) return VERIFICATION_STATUS.unknown;
  return LEGACY_STATUS_MAP[status] || (Object.values(VERIFICATION_STATUS).includes(status) ? status : VERIFICATION_STATUS.unknown);
}

const extractMissingTables = (healthData) => {
  const checks = Array.isArray(healthData?.checks) ? healthData.checks : [];
  const tablesCheck = checks.find((check) => check.id === 'analytics_tables');
  const missingTables = tablesCheck?.details?.missingTables || healthData?.missingTables || [];
  return Array.isArray(missingTables) ? missingTables : [];
};

const extractFailedChecks = (healthData) => {
  const checks = Array.isArray(healthData?.checks) ? healthData.checks : [];
  return checks.filter((check) => ['warning', 'critical', 'fail'].includes(check.status));
};

export function mapHealthToVerification(healthData) {
  if (!healthData || typeof healthData !== 'object') {
    return {
      status: VERIFICATION_STATUS.unknown,
      reason: 'Analytics health status is unavailable.',
      missingTables: [],
      failedChecks: [],
      lastRunAt: null,
    };
  }

  const rawStatus = healthData.status || (healthData.ok === true ? 'healthy' : healthData.ok === false ? 'warning' : 'unknown');
  const normalizedStatus = normalizeVerificationStatus(rawStatus);
  const missingTables = extractMissingTables(healthData);
  const failedChecks = extractFailedChecks(healthData);
  const lastRunAt = healthData?.summary?.lastRunAt || healthData?.lastRunAt || null;

  if (normalizedStatus === VERIFICATION_STATUS.verified) {
    return {
      status: VERIFICATION_STATUS.verified,
      reason: 'Analytics health checks passed.',
      missingTables: [],
      failedChecks,
      lastRunAt,
    };
  }

  if (normalizedStatus === VERIFICATION_STATUS.unknown) {
    const reason = healthData?.storage?.reason || 'Analytics health status is unavailable.';
    return {
      status: VERIFICATION_STATUS.unknown,
      reason,
      missingTables,
      failedChecks,
      lastRunAt,
    };
  }

  const reason = missingTables.length > 0
    ? `Missing required analytics tables: ${missingTables.join(', ')}`
    : failedChecks.length > 0
      ? `${failedChecks.length} health check${failedChecks.length === 1 ? '' : 's'} need review.`
      : 'Analytics health checks reported issues.';

  return {
    status: VERIFICATION_STATUS.needsReview,
    reason,
    missingTables,
    failedChecks,
    lastRunAt,
  };
}

export default mapHealthToVerification;
