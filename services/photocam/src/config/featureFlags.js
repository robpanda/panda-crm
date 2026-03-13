const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

function isEnabled(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') {
    return defaultValue;
  }
  return TRUE_VALUES.has(String(raw).trim().toLowerCase());
}

export const featureFlags = {
  bulkActionsV2: isEnabled('PHOTOCAM_V2_BULK_ACTIONS', false),
  reportsEnabled: isEnabled('PHOTOCAM_REPORTS_ENABLED', false),
  portalGalleryHardened: isEnabled('PHOTOCAM_PORTAL_GALLERY_HARDENED', false),
  pandaPhotoEnforcement: isEnabled('PHOTOCAM_PANDAPHOTO_ENFORCEMENT', false),
};

export function requireFeature(flagEnabled, featureName) {
  if (!flagEnabled) {
    const err = new Error(`${featureName} is currently disabled`);
    err.statusCode = 503;
    err.code = 'FEATURE_DISABLED';
    throw err;
  }
}

export default featureFlags;
