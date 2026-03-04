/**
 * Anchor Detection Service (DocuSign-Style Text Anchoring)
 *
 * CRITICAL ARCHITECTURE:
 * This service detects text anchors in generated PDFs and returns NORMALIZED coordinates.
 * Text anchors have the format: [[SIG_ROLE_ANCHORID]]
 *
 * WHY TEXT ANCHORS?
 * - Pixel coordinates drift when layout changes (margins, headers, fonts)
 * - Text-based anchors are stable because they're embedded IN the document
 * - We find the anchor text, get its position, and normalize to 0-1 range
 * - At signing time: pdfX = normalizedX * pageWidth
 *
 * FLOW:
 * 1. HTML with anchor text → Gotenberg → PDF with embedded text
 * 2. This service finds anchor text in PDF → Returns normalized coords
 * 3. Coords stored in agreement.signaturePositions
 * 4. At signing: normalized coords → actual PDF coords → signature overlay
 */

import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const pdfjsWorker = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');

// Configure worker for Node.js environment (required for text extraction)
GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Standard page dimensions (US Letter at 72 DPI)
const PAGE_WIDTH_POINTS = 612;
const PAGE_HEIGHT_POINTS = 792;
const DEFAULT_SIGNATURE_WIDTH = 200;
const DEFAULT_SIGNATURE_HEIGHT = 50;
const DEFAULT_LABEL_OFFSET = 12;

const ROLE_LABELS = {
  CUSTOMER: 'Customer',
  AGENT: 'Agent',
  WITNESS: 'Witness',
  CO_SIGNER: 'Co-Signer',
  PM: 'Project Manager',
};

function normalizeRole(role) {
  return String(role || 'CUSTOMER').trim().toUpperCase();
}

function roleToLabel(role) {
  return ROLE_LABELS[normalizeRole(role)] || normalizeRole(role);
}

function extractOccurrenceFromAnchorId(anchorId) {
  if (!anchorId) return 0;
  const match = String(anchorId).match(/(?:_|-)(\d+)$/);
  if (match) {
    return Math.max(0, Number(match[1]) - 1);
  }
  const tailMatch = String(anchorId).match(/(\d+)$/);
  if (tailMatch) {
    return Math.max(0, Number(tailMatch[1]) - 1);
  }
  return 0;
}

function buildLabelCandidates(info, occurrence) {
  const candidates = [];
  const label = (info?.label || '').trim();
  if (label) candidates.push(label);

  const roleLabel = roleToLabel(info?.role);
  const numbered = `${roleLabel} Signature ${occurrence + 1}`;
  const base = `${roleLabel} Signature`;
  if (!candidates.includes(numbered)) candidates.push(numbered);
  if (!candidates.includes(base)) candidates.push(base);
  return Array.from(new Set(candidates.filter(Boolean)));
}

/**
 * Find text anchor positions in a PDF buffer
 *
 * @param {Buffer} pdfBuffer - The PDF file as a buffer
 * @param {Array<string>} anchorPatterns - Anchor text patterns to find (e.g., ['[[SIG_CUSTOMER_abc123]]'])
 * @returns {Promise<Array<Object>>} - Array of anchor positions with normalized coordinates
 */
export async function findAnchorPositions(pdfBuffer, anchorPatterns = [], options = {}) {
  const {
    debug = false,
    onDebug,
    signatureWidth = DEFAULT_SIGNATURE_WIDTH,
    signatureHeight = DEFAULT_SIGNATURE_HEIGHT,
  } = options;
  logger.info('[AnchorDetection] Starting anchor detection', {
    pdfSize: pdfBuffer.length,
    patternCount: anchorPatterns.length,
  });

  const positions = [];
  let page1TextSample = null;

  try {
    // Load PDF with pdf.js
    const data = new Uint8Array(pdfBuffer);
    const pdfDoc = await getDocument({
      data,
      useSystemFonts: true,
      standardFontDataUrl: path.join(__dirname, '../../node_modules/pdfjs-dist/standard_fonts/'),
    }).promise;
    const numPages = pdfDoc.numPages;

    logger.info(`[AnchorDetection] PDF loaded, ${numPages} pages`);

    // Scan each page for anchor text
    for (let pageIndex = 0; pageIndex < numPages; pageIndex++) {
      const page = await pdfDoc.getPage(pageIndex + 1); // pdf.js uses 1-based page numbers
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 }); // Get page dimensions

      const pageWidth = viewport.width;
      const pageHeight = viewport.height;

      logger.debug(`[AnchorDetection] Scanning page ${pageIndex + 1}, dimensions: ${pageWidth}x${pageHeight}`);

      const items = textContent.items || [];
      const itemStrings = items.map(item => item.str || '');
      const pageText = itemStrings.join('');

      // Capture page 1 text sample for debug (first 2000 chars)
      if (debug && pageIndex === 0 && !page1TextSample) {
        page1TextSample = pageText.slice(0, 2000);
      }

      // Search through concatenated text to allow patterns split across items
      for (const pattern of anchorPatterns) {
        let startIndex = 0;
        while (startIndex < pageText.length) {
          const idx = pageText.indexOf(pattern, startIndex);
          if (idx === -1) break;

          // Find the text item that contains the start of the pattern
          let cumulative = 0;
          let itemIndex = 0;
          for (; itemIndex < itemStrings.length; itemIndex += 1) {
            const next = cumulative + itemStrings[itemIndex].length;
            if (idx < next) break;
            cumulative = next;
          }

          const item = items[itemIndex];
          if (!item || !item.transform) {
            startIndex = idx + pattern.length;
            continue;
          }

          // Transform matrix: [scaleX, skewY, skewX, scaleY, translateX, translateY]
          const transform = item.transform;
          const x = transform[4]; // translateX
          const y = transform[5]; // translateY (PDF uses bottom-left origin)

          // Normalize coordinates (0-1 range)
          // Convert PDF bottom-left origin to TOP-LEFT origin for UI consistency
          const normalizedX = x / pageWidth;
          const normalizedWidth = signatureWidth / pageWidth;
          const normalizedHeight = signatureHeight / pageHeight;
          const anchorTopY = pageHeight - y;
          const normalizedY = Math.max(0, (anchorTopY - signatureHeight) / pageHeight);

          // Parse anchor pattern to extract role and ID
          // Format: [[SIG_ROLE_ANCHORID]]
          const match = pattern.match(/\[\[SIG_([A-Z_]+)_([a-zA-Z0-9_-]+)\]\]/);
          const role = match ? match[1] : 'CUSTOMER';
          const anchorId = match ? match[2] : pattern;

          const position = {
            anchorId,
            role,
            anchorText: pattern,
            page: pageIndex + 1,
            resolutionMethod: 'anchor_text',
            // Raw PDF coordinates (bottom-left origin)
            rawX: x,
            rawY: y,
            // Normalized coordinates (0-1 range)
            normalizedX,
            normalizedY,
            // Page dimensions at detection time
            pageWidth,
            pageHeight,
            // For convenience, also store as ready-to-use signature placement
            // Note: This assumes signature field is ~200pt wide, ~50pt tall
            signaturePlacement: {
              page: pageIndex + 1,
              x: normalizedX,
              y: normalizedY,
              width: normalizedWidth,
              height: normalizedHeight,
            },
          };

          logger.info(`[AnchorDetection] Found anchor "${pattern}" on page ${pageIndex + 1}`, {
            rawX: x.toFixed(2),
            rawY: y.toFixed(2),
            normalizedX: normalizedX.toFixed(4),
            normalizedY: normalizedY.toFixed(4),
          });

          positions.push(position);
          startIndex = idx + pattern.length;
        }
      }
    }

    logger.info(`[AnchorDetection] Detection complete, found ${positions.length} anchors`);

    if (debug) {
      const anchorsFound = positions.slice(0, 10).map((pos) => ({
        anchorText: pos.anchorText,
        page: pos.page,
      }));
      const debugInfo = {
        anchorsFoundCount: positions.length,
        anchorsFound,
        page1TextSample: positions.length === 0 ? page1TextSample : undefined,
      };

      if (typeof onDebug === 'function') {
        onDebug(debugInfo);
      } else {
        logger.info('[AnchorDetection][debug]', debugInfo);
      }
    }

    return positions;
  } catch (error) {
    logger.error('[AnchorDetection] Failed to detect anchors', { error: error.message });
    throw new Error(`Anchor detection failed: ${error.message}`);
  }
}

async function findLabelPositions(pdfBuffer, anchorInfoList = [], options = {}) {
  const {
    debug = false,
    onDebug,
    signatureWidth = DEFAULT_SIGNATURE_WIDTH,
    signatureHeight = DEFAULT_SIGNATURE_HEIGHT,
    labelOffset = DEFAULT_LABEL_OFFSET,
  } = options;

  if (!anchorInfoList.length) return [];

  logger.info('[AnchorDetection] Starting label-based detection', {
    pdfSize: pdfBuffer.length,
    anchorCount: anchorInfoList.length,
  });

  const positions = [];

  const data = new Uint8Array(pdfBuffer);
  const pdfDoc = await getDocument({
    data,
    useSystemFonts: true,
    standardFontDataUrl: path.join(__dirname, '../../node_modules/pdfjs-dist/standard_fonts/'),
  }).promise;

  const numPages = pdfDoc.numPages;

  for (const info of anchorInfoList) {
    const role = normalizeRole(info.role);
    const occurrence = Number.isFinite(info.occurrence) ? info.occurrence : extractOccurrenceFromAnchorId(info.anchorId);
    const candidates = buildLabelCandidates(info, occurrence);
    if (!candidates.length) continue;

    let matchFound = false;
    let occurrenceIndex = 0;

    for (let pageIndex = 0; pageIndex < numPages && !matchFound; pageIndex += 1) {
      const page = await pdfDoc.getPage(pageIndex + 1);
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });
      const pageWidth = viewport.width;
      const pageHeight = viewport.height;
      const items = textContent.items || [];
      const itemStrings = items.map(item => item.str || '');
      const pageText = itemStrings.join('');

      for (const label of candidates) {
        let startIndex = 0;
        const lowerPageText = pageText.toLowerCase();
        const lowerLabel = label.toLowerCase();
        while (startIndex < lowerPageText.length) {
          const idx = lowerPageText.indexOf(lowerLabel, startIndex);
          if (idx === -1) break;

          if (occurrenceIndex < occurrence) {
            occurrenceIndex += 1;
            startIndex = idx + lowerLabel.length;
            continue;
          }

          // Map to text item
          let cumulative = 0;
          let itemIndex = 0;
          for (; itemIndex < itemStrings.length; itemIndex += 1) {
            const next = cumulative + itemStrings[itemIndex].length;
            if (idx < next) break;
            cumulative = next;
          }

          const item = items[itemIndex];
          if (!item || !item.transform) {
            startIndex = idx + lowerLabel.length;
            continue;
          }

          const transform = item.transform;
          const x = transform[4];
          const y = transform[5];

          const normalizedWidth = signatureWidth / pageWidth;
          const normalizedHeight = signatureHeight / pageHeight;
          const anchorTopY = pageHeight - y;
          const normalizedY = Math.max(0, (anchorTopY - labelOffset - signatureHeight) / pageHeight);
          const normalizedX = x / pageWidth;

          positions.push({
            anchorId: info.anchorId,
            role,
            anchorText: label,
            page: pageIndex + 1,
            resolutionMethod: 'label_text',
            rawX: x,
            rawY: y,
            normalizedX,
            normalizedY,
            pageWidth,
            pageHeight,
            signaturePlacement: {
              page: pageIndex + 1,
              x: normalizedX,
              y: normalizedY,
              width: normalizedWidth,
              height: normalizedHeight,
            },
          });

          logger.info(`[AnchorDetection] Found label "${label}" on page ${pageIndex + 1}`, {
            anchorId: info.anchorId,
            rawX: x.toFixed(2),
            rawY: y.toFixed(2),
            normalizedX: normalizedX.toFixed(4),
            normalizedY: normalizedY.toFixed(4),
          });

          matchFound = true;
          break;
        }
        if (matchFound) break;
      }
    }

    if (!matchFound && debug) {
      const debugInfo = {
        anchorId: info.anchorId,
        role,
        labels: candidates,
      };
      if (typeof onDebug === 'function') onDebug({ labelNotFound: debugInfo });
      logger.info('[AnchorDetection][debug] Label not found', debugInfo);
    }
  }

  logger.info('[AnchorDetection] Label detection complete', { found: positions.length });
  return positions;
}

/**
 * Extract all anchor patterns from a Slate AST content
 * Looks for signature-anchor elements and builds the pattern list
 *
 * @param {Array} slateContent - Slate AST content
 * @returns {Array<{pattern: string, role: string, anchorId: string, label: string, required: boolean}>}
 */
export function extractAnchorPatternsFromSlate(slateContent) {
  const patterns = [];
  const roleCounts = {};

  const traverse = (nodes) => {
    if (!Array.isArray(nodes)) return;

    for (const node of nodes) {
      if (node.type === 'signature-anchor') {
        const role = normalizeRole(node.role);
        const required = node.required;
        roleCounts[role] = (roleCounts[role] || 0) + 1;
        const occurrence = roleCounts[role] - 1;
        const label = (node.label || '').trim() || `${roleToLabel(role)} Signature${occurrence > 0 ? ` ${occurrence + 1}` : ''}`;
        const anchorId = node.anchorId || `anchor_${Date.now()}`;
        const pattern = `[[SIG_${role}_${anchorId}]]`;
        patterns.push({
          pattern,
          role,
          anchorId,
          label,
          required: required !== false,
          occurrence,
        });
      }
      if (node.children) {
        traverse(node.children);
      }
    }
  };

  traverse(slateContent);
  return patterns;
}

/**
 * Detect anchors in a PDF and return signature positions ready for storage
 *
 * This is the main function to call after PDF generation.
 * Returns data in the format expected by agreement.signaturePositions
 *
 * @param {Buffer} pdfBuffer - The generated PDF
 * @param {Array} slateContent - The original Slate AST (to extract anchor patterns)
 * @returns {Promise<Array<Object>>} - Signature positions for storage
 */
export async function detectSignatureAnchors(pdfBuffer, slateContent, options = {}) {
  const {
    debug = false,
    onDebug,
    signatureWidth = DEFAULT_SIGNATURE_WIDTH,
    signatureHeight = DEFAULT_SIGNATURE_HEIGHT,
    labelOffset = DEFAULT_LABEL_OFFSET,
  } = options;
  // Extract anchor patterns from Slate content
  const anchorInfo = extractAnchorPatternsFromSlate(slateContent);
  const patterns = anchorInfo.map((a) => a.pattern);

  if (patterns.length === 0) {
    logger.info('[AnchorDetection] No signature anchors found in Slate content');
    return [];
  }

  logger.info(`[AnchorDetection] Looking for ${patterns.length} anchors: ${patterns.join(', ')}`);

  // Find anchor positions in the PDF
  const positions = await findAnchorPositions(pdfBuffer, patterns, {
    debug,
    onDebug,
    signatureWidth,
    signatureHeight,
  });

  const foundIds = new Set(positions.map((pos) => pos.anchorId));
  const missingAnchors = anchorInfo.filter((info) => !foundIds.has(info.anchorId));
  let labelPositions = [];

  if (missingAnchors.length > 0) {
    labelPositions = await findLabelPositions(pdfBuffer, missingAnchors, {
      debug,
      onDebug,
      signatureWidth,
      signatureHeight,
      labelOffset,
    });
  }

  // Merge anchor info with detected positions
  const mergedPositions = [...positions, ...labelPositions];

  const signaturePositions = mergedPositions.map((pos) => {
    const info = anchorInfo.find((a) => a.anchorId === pos.anchorId) || {};

    const normalizedWidth = pos.signaturePlacement?.width ?? (signatureWidth / pos.pageWidth);
    const normalizedHeight = pos.signaturePlacement?.height ?? (signatureHeight / pos.pageHeight);
    const width = normalizedWidth * pos.pageWidth;
    const height = normalizedHeight * pos.pageHeight;
    const x = pos.normalizedX * pos.pageWidth;
    const y = pos.normalizedY * pos.pageHeight;

    return {
      id: pos.anchorId,
      anchorId: pos.anchorId,
      role: pos.role || info.role,
      signerRole: pos.role || info.role,
      type: 'SIGNATURE',
      fieldType: 'SIGNATURE',
      label: info.label || `${pos.role} Signature`,
      required: info.required !== false,
      resolutionMethod: pos.resolutionMethod || 'anchor_text',
      // Store normalized coordinates (0-1 range)
      normalizedX: pos.normalizedX,
      normalizedY: pos.normalizedY,
      normalizedWidth,
      normalizedHeight,
      // Absolute coordinates for UI (TOP-LEFT origin, 612x792 baseline)
      x,
      y,
      width,
      height,
      // Page info
      page: pos.page,
      pageWidth: pos.pageWidth,
      pageHeight: pos.pageHeight,
      // Detection metadata
      detectedAt: new Date().toISOString(),
      anchorText: pos.anchorText,
    };
  });

  logger.info(`[AnchorDetection] Prepared ${signaturePositions.length} signature positions for storage`);
  return signaturePositions;
}

/**
 * Convert normalized coordinates to actual PDF coordinates at signing time
 *
 * CRITICAL: Call this at signing time to get actual pixel positions
 *
 * @param {Object} normalizedPosition - Position with normalizedX, normalizedY, etc.
 * @param {number} actualPageWidth - Actual PDF page width (usually 612 for Letter)
 * @param {number} actualPageHeight - Actual PDF page height (usually 792 for Letter)
 * @returns {Object} - Position with actual PDF coordinates
 */
export function denormalizePosition(normalizedPosition, actualPageWidth = PAGE_WIDTH_POINTS, actualPageHeight = PAGE_HEIGHT_POINTS) {
  const {
    normalizedX = 0,
    normalizedY = 0,
    normalizedWidth = 200 / PAGE_WIDTH_POINTS,
    normalizedHeight = 50 / PAGE_HEIGHT_POINTS,
    page = 1,
    role,
    anchorId,
    label,
    required,
  } = normalizedPosition;

  // Convert from normalized (0-1) to actual PDF coordinates
  const pdfX = normalizedX * actualPageWidth;
  const pdfWidth = normalizedWidth * actualPageWidth;
  const pdfHeight = normalizedHeight * actualPageHeight;
  // normalizedY is TOP-LEFT; convert to PDF bottom-left
  const pdfY = (1 - normalizedY - normalizedHeight) * actualPageHeight;

  return {
    id: normalizedPosition.id || anchorId,
    anchorId,
    role,
    signerRole: role,
    type: 'SIGNATURE',
    fieldType: 'SIGNATURE',
    label,
    required,
    page,
    // Actual PDF coordinates (use these for pdf-lib overlay)
    x: pdfX,
    y: pdfY,
    width: pdfWidth,
    height: pdfHeight,
    // Keep normalized for reference
    normalizedX,
    normalizedY,
  };
}

/**
 * Convert all positions in an array from normalized to actual coordinates
 *
 * @param {Array<Object>} normalizedPositions - Array of normalized positions
 * @param {number} actualPageWidth - Actual PDF page width
 * @param {number} actualPageHeight - Actual PDF page height
 * @returns {Array<Object>} - Array of denormalized positions
 */
export function denormalizeAllPositions(normalizedPositions, actualPageWidth = PAGE_WIDTH_POINTS, actualPageHeight = PAGE_HEIGHT_POINTS) {
  return normalizedPositions.map((pos) =>
    denormalizePosition(pos, actualPageWidth, actualPageHeight)
  );
}

export default {
  findAnchorPositions,
  extractAnchorPatternsFromSlate,
  detectSignatureAnchors,
  denormalizePosition,
  denormalizeAllPositions,
  PAGE_DIMENSIONS: {
    width: PAGE_WIDTH_POINTS,
    height: PAGE_HEIGHT_POINTS,
  },
};
