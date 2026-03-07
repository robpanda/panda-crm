// Permissive default to avoid false negatives on minor browser/PDF rounding differences.
// Tighten only after field evidence from production samples.
export const SIGNATURE_SNAP_DRIFT_TOLERANCE_PX = 24;

function asRect(rect = {}) {
  return {
    x: Number(rect.x || 0),
    y: Number(rect.y || 0),
    w: Number(rect.w || 0),
    h: Number(rect.h || 0),
    page: Number(rect.page || 1),
  };
}

export function calculateSignatureSnapDrift(expectedRectInput, submittedRectInput) {
  const expected = asRect(expectedRectInput);
  const submitted = asRect(submittedRectInput);

  return {
    dx: submitted.x - expected.x,
    dy: submitted.y - expected.y,
    dw: submitted.w - expected.w,
    dh: submitted.h - expected.h,
    pageDelta: submitted.page - expected.page,
    maxAbsDelta: Math.max(
      Math.abs(submitted.x - expected.x),
      Math.abs(submitted.y - expected.y),
      Math.abs(submitted.w - expected.w),
      Math.abs(submitted.h - expected.h)
    ),
  };
}

export function resolveSignaturePlacement({
  expectedRect,
  submittedRect,
  tolerancePx = SIGNATURE_SNAP_DRIFT_TOLERANCE_PX,
} = {}) {
  const expected = asRect(expectedRect);
  const drift = calculateSignatureSnapDrift(expectedRect, submittedRect);
  const driftExceeded = drift.maxAbsDelta > Number(tolerancePx || SIGNATURE_SNAP_DRIFT_TOLERANCE_PX);

  // Always snap back to expected placeholder coordinates to protect signature placement.
  const placement = { ...expected };
  const warnings = [];

  if (driftExceeded || drift.pageDelta !== 0) {
    warnings.push({
      code: 'SIGNATURE_SNAP_DRIFT_EXCEEDED',
      message: `Submitted signature drift exceeded tolerance (${tolerancePx}px) and was snapped to placeholder coordinates.`,
      drift,
    });
  }

  return {
    placement,
    snapped: true,
    tolerancePx,
    drift,
    driftExceeded,
    warnings,
  };
}

export function buildRoleIsolatedFieldSet(fields = [], signerRole) {
  const normalizedRole = String(signerRole || '').trim().toUpperCase();
  return (Array.isArray(fields) ? fields : []).filter(
    (field) => String(field?.role || '').trim().toUpperCase() === normalizedRole
  );
}

export default {
  SIGNATURE_SNAP_DRIFT_TOLERANCE_PX,
  calculateSignatureSnapDrift,
  resolveSignaturePlacement,
  buildRoleIsolatedFieldSet,
};
