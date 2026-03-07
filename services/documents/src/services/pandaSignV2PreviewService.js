import {
  detectPlaceholdersFromHtml,
  validateRequiredSignatureAnchors,
  DEFAULT_REQUIRED_SIGNATURE_ANCHORS,
  SIGNER_ROLES,
} from './pandaSignV2PlaceholderDetector.js';

function normalizeTokenReport(tokenReport) {
  const source = tokenReport || {};
  return {
    resolvedTokens: source.resolvedTokens || {},
    missingTokens: Array.isArray(source.missingTokens) ? source.missingTokens : [],
    requiredFieldFailures: Array.isArray(source.requiredFieldFailures)
      ? source.requiredFieldFailures
      : [],
    // Additive placeholder for downstream consumers.
    warnings: Array.isArray(source.warnings) ? source.warnings : [],
  };
}

export function buildPreviewFieldMapReport({
  htmlBody,
  tokenReport = {},
  requiredAnchorsByRole = DEFAULT_REQUIRED_SIGNATURE_ANCHORS,
  strictRequiredAnchors = false,
} = {}) {
  const placeholderDetection = detectPlaceholdersFromHtml(htmlBody);
  const anchorValidation = validateRequiredSignatureAnchors(placeholderDetection, {
    requiredAnchorsByRole,
    strictRequiredAnchors,
  });
  const normalizedTokenReport = normalizeTokenReport(tokenReport);

  const signaturePlaceholdersByRole = {
    [SIGNER_ROLES.CUSTOMER]: placeholderDetection.placeholdersByRole[SIGNER_ROLES.CUSTOMER] || [],
    [SIGNER_ROLES.AGENT]: placeholderDetection.placeholdersByRole[SIGNER_ROLES.AGENT] || [],
  };

  return {
    fieldMapReport: {
      placeholders: placeholderDetection.placeholders,
      duplicatePlaceholders: placeholderDetection.duplicatePlaceholders,
      signaturePlaceholdersByRole,
      missingRequiredAnchors: anchorValidation.requiredFieldFailures,
      anchorValidation: {
        isValid: anchorValidation.isValid,
        requiredFieldFailures: anchorValidation.requiredFieldFailures,
      },
      // Additive report flags for regression visibility.
      reportFlags: {
        hasDuplicatePlaceholders: placeholderDetection.duplicatePlaceholders.length > 0,
        missingCustomerAnchors:
          anchorValidation.requiredFieldFailures.filter((item) => item.role === SIGNER_ROLES.CUSTOMER)
            .length > 0,
        missingAgentAnchors:
          anchorValidation.requiredFieldFailures.filter((item) => item.role === SIGNER_ROLES.AGENT)
            .length > 0,
      },
      warnings: [
        ...(placeholderDetection.warnings || []),
        ...(normalizedTokenReport.warnings || []),
      ],
      errors: placeholderDetection.errors || [],
    },
    tokenReport: normalizedTokenReport,
    checklist: {
      missingTokens: normalizedTokenReport.missingTokens,
      signaturePlaceholdersByRole,
      missingRequiredAnchors: anchorValidation.requiredFieldFailures,
    },
    safeToProceed:
      normalizedTokenReport.requiredFieldFailures.length === 0 &&
      anchorValidation.requiredFieldFailures.length === 0,
  };
}

export default {
  buildPreviewFieldMapReport,
};
