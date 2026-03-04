/**
 * Editable Region Validator
 *
 * Validates editable regions in Slate documents and provides
 * preview hash generation/verification for document integrity.
 */

import crypto from 'crypto';

/**
 * Protected element types that cannot be added by users in editable regions
 */
const PROTECTED_ELEMENT_TYPES = [
  'token',
  'signature-anchor',
  'signature-field',
];

/**
 * Validates all editable regions against template definitions
 *
 * @param {Object} editableRegions - { [regionId]: content }
 * @param {Array} templateRegions - Template's editable region definitions
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAllEditableRegions(editableRegions, templateRegions = []) {
  const errors = [];

  // Build a map of allowed region IDs from template
  const allowedRegionIds = new Set(templateRegions.map(r => r.id));

  // Check each provided region
  for (const [regionId, content] of Object.entries(editableRegions)) {
    // Verify region is defined in template
    if (!allowedRegionIds.has(regionId)) {
      errors.push(`Unknown editable region: '${regionId}'`);
      continue;
    }

    // Get region definition
    const regionDef = templateRegions.find(r => r.id === regionId);

    // Validate max length if specified
    if (regionDef.maxLength) {
      const contentLength = getContentLength(content);
      if (contentLength > regionDef.maxLength) {
        errors.push(`Region '${regionId}' exceeds max length (${contentLength}/${regionDef.maxLength})`);
      }
    }

    // Validate content type matches region type
    if (regionDef.type === 'text' && Array.isArray(content)) {
      errors.push(`Region '${regionId}' expects text but received rich content`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get content length from string or Slate content array
 */
function getContentLength(content) {
  if (typeof content === 'string') {
    return content.length;
  }
  if (Array.isArray(content)) {
    // Walk Slate AST and count text
    let length = 0;
    const walk = (nodes) => {
      for (const node of nodes) {
        if ('text' in node) {
          length += node.text.length;
        }
        if (node.children) {
          walk(node.children);
        }
      }
    };
    walk(content);
    return length;
  }
  return 0;
}

/**
 * Validates that content does not contain protected elements
 * Protected elements include tokens and signature anchors
 *
 * @param {Array} content - Slate AST content array
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateNoProtectedElements(content) {
  const errors = [];

  if (!Array.isArray(content)) {
    return { valid: true, errors: [] };
  }

  const walk = (nodes, path = '') => {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const nodePath = path ? `${path}[${i}]` : `[${i}]`;

      // Check if node type is protected
      if (node.type && PROTECTED_ELEMENT_TYPES.includes(node.type)) {
        errors.push(`Protected element '${node.type}' found at ${nodePath}`);
      }

      // Recursively check children
      if (node.children && Array.isArray(node.children)) {
        walk(node.children, nodePath);
      }
    }
  };

  walk(content);

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generates a preview hash for document integrity verification
 * This hash is used to detect if the document has changed since preview
 *
 * @param {Object} params - Parameters to hash
 * @param {string} params.templateId - Template ID
 * @param {number} params.templateVersion - Template version
 * @param {Array} params.resolvedContent - Resolved Slate content
 * @param {Object} params.editableRegions - Editable region values
 * @param {Object} params.mergeOverrides - Merge field overrides
 * @returns {string} SHA-256 hash
 */
export function generatePreviewHash(params) {
  const {
    templateId,
    templateVersion,
    resolvedContent,
    editableRegions = {},
    mergeOverrides = {},
  } = params;

  // Create a deterministic string representation
  const hashInput = JSON.stringify({
    templateId,
    templateVersion,
    // Sort keys for deterministic output
    content: resolvedContent,
    editableRegions: sortObjectKeys(editableRegions),
    mergeOverrides: sortObjectKeys(mergeOverrides),
  });

  return crypto.createHash('sha256').update(hashInput).digest('hex');
}

/**
 * Verifies a preview hash matches the expected hash
 *
 * @param {string} hash - Hash to verify
 * @param {Object} params - Parameters that were used to generate the original hash
 * @returns {boolean} True if hash matches
 */
export function verifyPreviewHash(hash, params) {
  const expectedHash = generatePreviewHash(params);
  return hash === expectedHash;
}

/**
 * Helper to sort object keys for deterministic JSON stringification
 */
function sortObjectKeys(obj) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }

  const sorted = {};
  const keys = Object.keys(obj).sort();
  for (const key of keys) {
    sorted[key] = sortObjectKeys(obj[key]);
  }
  return sorted;
}

export default {
  validateAllEditableRegions,
  validateNoProtectedElements,
  generatePreviewHash,
  verifyPreviewHash,
};
