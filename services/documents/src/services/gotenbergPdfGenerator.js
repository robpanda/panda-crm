/**
 * Gotenberg PDF Generator (CSS @page Margin Architecture)
 *
 * ============================================================================
 * CORRECT DESIGN PRINCIPLES (LOCKED - DO NOT CHANGE):
 * ============================================================================
 * 1. ZERO GOTENBERG MARGINS - Let CSS @page rule control all margins
 * 2. CSS @PAGE MARGINS - Set in slateToHtml.js (30px top/bottom, 48px sides)
 * 3. HEADER/FOOTER IN PAGE BOX - Positioned with fixed top/bottom (no negative offsets)
 * 4. CONTENT IN CONTENT BOX - Body content lives inside the CSS margins
 * 5. TEXT-ANCHORED SIGNATURES - Use data-signature-anchor attributes
 * 6. NO MANUAL OFFSETS - pdf-lib uses normalized coords without adjustment
 *
 * ============================================================================
 * IMMUTABILITY GUARANTEE (CRITICAL):
 * ============================================================================
 * Once Gotenberg generates a PDF, it is LAYOUT-FINAL and IMMUTABLE:
 *
 * - NO re-rendering of HTML after PDF generation
 * - NO header/footer injection after PDF generation
 * - NO margin recalculation after PDF generation
 * - NO layout modifications whatsoever
 *
 * The PDF becomes the frozen artifact. Only pdf-lib may modify it to:
 * - Embed signature images at stored coordinates
 * - Append Certificate of Completion as new page
 *
 * Document integrity is verified via SHA-256 hash stored at generation time.
 * Any attempt to re-render or modify layout after signing starts is a
 * CRITICAL ERROR that will break signature positioning.
 *
 * ============================================================================
 * WHY ZERO GOTENBERG MARGINS:
 * ============================================================================
 * - CSS @page margins and Gotenberg margins would DOUBLE-APPLY
 * - CSS @page is the source of truth for margin sizing
 * - Gotenberg margins=0 means only CSS @page margins are used
 *
 * ============================================================================
 * CSS @PAGE VALUES (in slateToHtml.js - source of truth):
 * ============================================================================
 *   margin-top: 30px (breathing room)
 *   margin-bottom: 30px (breathing room)
 *   margin-left: 48px
 *   margin-right: 48px
 *
 * This ensures signature positions are stable because:
 * - Layout is deterministic with single margin source
 * - Header/footer positioned with fixed top/bottom
 * - Coordinates map directly to content box
 *
 * ============================================================================
 * ARCHITECTURE FLOW:
 * ============================================================================
 * HTML (with embedded header/footer) → Gotenberg → LAYOUT-FINAL PDF
 *                                                        ↓
 *                                              (immutable after this)
 *                                                        ↓
 *                                              PDF.js (view only)
 *                                                        ↓
 *                                              pdf-lib (signatures only)
 *                                                        ↓
 *                                              FINAL SIGNED PDF
 *
 * Gotenberg must be running: docker run -p 3100:3000 gotenberg/gotenberg:8
 */

import FormData from 'form-data';
import fetch from 'node-fetch';
import crypto from 'crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import logger from '../utils/logger.js';

// Gotenberg endpoint - can be configured via environment
const GOTENBERG_URL = process.env.GOTENBERG_URL || 'http://localhost:3100';
const GOTENBERG_TIMEOUT = parseInt(process.env.GOTENBERG_TIMEOUT || '60000', 10); // 60 seconds

// Standard US Letter dimensions at 72 DPI (PDF points)
const PAGE_WIDTH_POINTS = 612;  // 8.5 inches * 72
const PAGE_HEIGHT_POINTS = 792; // 11 inches * 72

async function stampPageNumbers(pdfBuffer, options = {}) {
  const {
    fontSize = 9,
    marginRight = 48,
    footerOffset = 20,
    color = rgb(0.42, 0.45, 0.5),
  } = options;

  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  const totalPages = pages.length;

  pages.forEach((page, index) => {
    const { width } = page.getSize();
    const label = `Page ${index + 1} of ${totalPages}`;
    const textWidth = font.widthOfTextAtSize(label, fontSize);
    const x = Math.max(0, width - marginRight - textWidth);
    const y = footerOffset;

    page.drawText(label, {
      x,
      y,
      size: fontSize,
      font,
      color,
    });
  });

  return Buffer.from(await pdfDoc.save());
}

/**
 * Convert HTML to PDF using Gotenberg with ZERO API MARGINS
 *
 * CORRECT ARCHITECTURE: Gotenberg margins=0, CSS @page rule controls margins.
 * This prevents double-margin issues and ensures predictable layout.
 *
 * CSS @PAGE RULE (source of truth in slateToHtml.js):
 *   margin-top: 30px
 *   margin-bottom: 30px
 *   margin-left: 48px
 *   margin-right: 48px
 *
 * @param {string} html - Complete HTML document
 * @param {Object} options - PDF generation options
 * @returns {Promise<Buffer>} - PDF buffer
 */
export async function htmlToPdf(html, options = {}) {
  const {
    paperWidth = '8.5',
    paperHeight = '11',
    printBackground = true,
    landscape = false,
    scale = '1',
    preferCssPageSize = true, // Let CSS @page rules control size
  } = options;

  logger.info('[Gotenberg] Starting HTML to PDF conversion (proper-margin mode)', {
    htmlLength: html.length,
    paperSize: `${paperWidth}x${paperHeight}`,
    mode: 'PROPER_PAGE_MARGINS',
  });

  const form = new FormData();

  // The HTML file must be named index.html for Gotenberg to process it
  form.append('files', Buffer.from(html, 'utf-8'), {
    filename: 'index.html',
    contentType: 'text/html',
  });

  // Paper size in inches
  form.append('paperWidth', String(paperWidth));
  form.append('paperHeight', String(paperHeight));

  // =============================================
  // ZERO MARGINS - Let CSS @page rule handle margins
  // The @page rule in slateToHtml.js sets:
  //   margin-top: 110px, margin-bottom: 90px
  //   margin-left: 48px, margin-right: 48px
  // Setting Gotenberg margins to 0 prevents double-margin issue
  // =============================================
  form.append('marginTop', '0');
  form.append('marginBottom', '0');
  form.append('marginLeft', '0');
  form.append('marginRight', '0');

  // Other options
  form.append('printBackground', String(printBackground));
  form.append('landscape', String(landscape));
  form.append('scale', String(scale));
  form.append('preferCssPageSize', String(preferCssPageSize));

  // Use print media type for accurate page rendering
  form.append('emulatedMediaType', 'print');

  // Wait for fonts to load
  form.append('waitDelay', '500ms');

  const url = `${GOTENBERG_URL}/forms/chromium/convert/html`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GOTENBERG_TIMEOUT);

    const response = await fetch(url, {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('[Gotenberg] PDF conversion failed', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      throw new Error(`Gotenberg PDF conversion failed: ${response.status} - ${errorText}`);
    }

    const pdfBuffer = Buffer.from(await response.arrayBuffer());

    logger.info('[Gotenberg] PDF conversion successful (proper-margin)', {
      pdfSize: pdfBuffer.length,
    });

    return pdfBuffer;
  } catch (error) {
    if (error.name === 'AbortError') {
      logger.error('[Gotenberg] PDF conversion timed out', { timeout: GOTENBERG_TIMEOUT });
      throw new Error(`Gotenberg PDF conversion timed out after ${GOTENBERG_TIMEOUT}ms`);
    }
    logger.error('[Gotenberg] PDF conversion error', { error: error.message });
    throw error;
  }
}

/**
 * Calculate SHA-256 hash of a buffer
 */
function calculateHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Get page count from PDF buffer (quick extraction from PDF structure)
 */
function getPdfPageCount(pdfBuffer) {
  const pdfString = pdfBuffer.toString('binary');
  const pageMatches = pdfString.match(/\/Type\s*\/Page[^s]/g);
  return pageMatches ? pageMatches.length : 1;
}

/**
 * Generate PDF from HTML with full metadata
 *
 * CRITICAL: This function ALWAYS uses zero margins.
 * Header/footer must be CSS fixed elements in the HTML body.
 *
 * @param {string} html - Complete HTML document with CSS-based layout
 * @param {Object} options - PDF generation options
 * @returns {Object} - { pdfBuffer, documentHash, pageCount, dimensions }
 */
export async function generatePdf(html, options = {}) {
  // Extract only valid options - margins are always zero
  const {
    extractSignatures = false,
    displayHeaderFooter = false,
    headerTemplate = '',
    footerTemplate = '',
    showPageNumbers = false,
    ...restOptions
  } = options;

  // If header/footer templates are provided, wrap them into the HTML
  // using CSS fixed positioning (DocuSign-style)
  let finalHtml = html;
  if (displayHeaderFooter && (headerTemplate || footerTemplate)) {
    finalHtml = wrapWithCssHeaderFooter(html, headerTemplate, footerTemplate);
  }

  let pdfBuffer = await htmlToPdf(finalHtml, restOptions);

  if (showPageNumbers) {
    pdfBuffer = await stampPageNumbers(pdfBuffer);
  }

  const documentHash = calculateHash(pdfBuffer);
  const pageCount = getPdfPageCount(pdfBuffer);

  logger.info('[Gotenberg] PDF generation complete (proper-margin)', {
    pdfSize: pdfBuffer.length,
    documentHash: documentHash.slice(0, 16) + '...',
    pageCount,
  });

  return {
    pdfBuffer,
    documentHash,
    signaturePositions: [], // Must be extracted via anchor detection
    pageCount,
    dimensions: {
      width: PAGE_WIDTH_POINTS,
      height: PAGE_HEIGHT_POINTS,
    },
  };
}

/**
 * Wrap HTML with CSS-based header/footer (Proper Margin Architecture)
 *
 * CORRECT APPROACH:
 * - Headers/footers positioned with fixed top/bottom (no negative offsets)
 * - Content lives in content box with padding to avoid overlap
 * - Coordinates map directly without manual offset adjustments
 */
function wrapWithCssHeaderFooter(html, headerTemplate, footerTemplate) {
  if (!headerTemplate && !footerTemplate) {
    return html;
  }

  const headerHeight = 120;
  const footerHeight = 80;
  const headerMargin = headerHeight + 30;
  const footerMargin = footerHeight + 30;

  // =============================================
  // LOCKED MARGIN CSS - VALUES MUST MATCH slateToHtml.js
  // =============================================
  const fixedStyles = `
<style>
  @page {
    size: Letter;
    margin-top: ${headerMargin}px;
    margin-bottom: ${footerMargin}px;
    margin-left: 48px;
    margin-right: 48px;
  }

  body {
    padding: 0;
  }

  /* Header positioned at TOP of page box - ID for uniqueness */
  #panda-header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: ${headerHeight}px;
    padding: 18px 0;
    box-sizing: border-box;
    border-bottom: 1px solid #e5e7eb;
    background: white;
    z-index: 1000;
  }

  /* Footer positioned at BOTTOM of page box - ID for uniqueness */
  #panda-footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: ${footerHeight}px;
    padding: 12px 0;
    box-sizing: border-box;
    border-top: 1px solid #e5e7eb;
    background: white;
    font-size: 10px;
    color: #6b7280;
    z-index: 1000;
  }

  /* Page number counters for Chromium print */
  .pageNumber::before {
    content: counter(page);
  }
  .totalPages::before {
    content: counter(pages);
  }

  /* Content wrapper - lives in content box */
  .panda-content-wrapper {
    min-height: 100vh;
    box-sizing: border-box;
  }
</style>
`;

  const headerDiv = headerTemplate
    ? `<div id="panda-header">${headerTemplate}</div>`
    : '';
  const footerDiv = footerTemplate
    ? `<div id="panda-footer">${footerTemplate}</div>`
    : '';

  // Check if HTML has proper structure
  const hasHead = html.includes('<head');
  const hasBody = html.includes('<body');

  if (hasHead && hasBody) {
    // Inject styles into head, header/footer + wrapper into body
    let result = html.replace('</head>', `${fixedStyles}</head>`);

    const bodyMatch = result.match(/<body[^>]*>/i);
    if (bodyMatch) {
      const bodyTagEnd = result.indexOf(bodyMatch[0]) + bodyMatch[0].length;
      const bodyCloseIndex = result.lastIndexOf('</body>');

      const beforeContent = result.slice(0, bodyTagEnd);
      const content = result.slice(bodyTagEnd, bodyCloseIndex);
      const afterContent = result.slice(bodyCloseIndex);

      result = `${beforeContent}${headerDiv}${footerDiv}<div class="panda-content-wrapper">${content}</div>${afterContent}`;
    }

    return result;
  }

  // No proper structure - wrap entirely
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  ${fixedStyles}
</head>
<body>
  ${headerDiv}
  ${footerDiv}
  <div class="panda-content-wrapper">
    ${html}
  </div>
</body>
</html>`;
}

/**
 * Generate preview PDF (same as full generation for Gotenberg)
 */
export async function generatePreviewPdf(html, options = {}) {
  return generatePdf(html, {
    ...options,
    extractSignatures: false,
  });
}

/**
 * Generate PDF from render result object
 *
 * PHASE 1 UPDATE: Headers/footers are now embedded in the HTML by slateToHtml.js
 * The render result format is now { html, branding } - headers/footers are IN the HTML body
 * No separate template parameters needed.
 */
export async function generatePdfFromRenderResult(renderResult, options = {}) {
  // PHASE 1: New format - headers/footers embedded in HTML
  const { html } = renderResult;
  return generatePdf(html, options);
}

/**
 * Generate document for signing (proper-margin, anchor-ready)
 *
 * CRITICAL: After calling this, use extractSignatureAnchors() to find
 * the text-anchored signature positions, then store NORMALIZED coordinates.
 * The pdf-lib formula for Y is: y = (1 - field.yPct - field.heightPct) * height
 */
export async function generateForSigning(html, options = {}) {
  const result = await generatePdf(html, options);

  return {
    ...result,
    signingFields: [], // Must be detected via anchor text extraction
  };
}

/**
 * Extract signature anchor positions from HTML before PDF generation
 *
 * Looks for elements with data-signature-anchor attribute and calculates
 * their approximate position on the page.
 *
 * @param {string} html - HTML with signature anchors
 * @returns {Array} - Array of anchor positions
 */
export function extractSignatureAnchorsFromHtml(html) {
  const anchors = [];
  const anchorRegex = /data-signature-anchor="([^"]+)"/g;
  let match;

  while ((match = anchorRegex.exec(html)) !== null) {
    anchors.push({
      anchorId: match[1],
      // Position will be determined by PDF.js anchor detection after PDF is generated
      requiresDetection: true,
    });
  }

  logger.info('[Gotenberg] Extracted signature anchors from HTML', {
    count: anchors.length,
    anchors: anchors.map(a => a.anchorId),
  });

  return anchors;
}

/**
 * Health check - verify Gotenberg is reachable
 */
export async function healthCheck() {
  try {
    const response = await fetch(`${GOTENBERG_URL}/health`, {
      method: 'GET',
      timeout: 5000,
    });

    if (response.ok) {
      const data = await response.json();
      return { healthy: true, gotenberg: data };
    }

    return { healthy: false, error: `Gotenberg returned ${response.status}` };
  } catch (error) {
    return { healthy: false, error: error.message };
  }
}

/**
 * No-op closeBrowser (Gotenberg manages its own browser)
 */
export async function closeBrowser() {
  // No-op - Gotenberg manages its own browser lifecycle
}

// Export page dimensions for coordinate normalization
export const PAGE_DIMENSIONS = {
  width: PAGE_WIDTH_POINTS,
  height: PAGE_HEIGHT_POINTS,
};

export default {
  htmlToPdf,
  generatePdf,
  generatePreviewPdf,
  generatePdfFromRenderResult,
  generateForSigning,
  extractSignatureAnchorsFromHtml,
  healthCheck,
  closeBrowser,
  PAGE_DIMENSIONS,
};
