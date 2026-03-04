/**
 * Slate to HTML Renderer
 *
 * Converts Slate AST to HTML for PDF generation.
 * Applies branding CSS and renders tokens as plain text.
 */

import { prisma } from '../lib/prisma.js';
import logger from '../utils/logger.js';

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  if (typeof text !== 'string') {
    return String(text || '');
  }
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj, path) {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    return acc[key];
  }, obj);
}

/**
 * Format values for header/footer token replacement
 */
function formatHeaderFooterValue(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    return value.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
  return String(value);
}

/**
 * Resolve header/footer tokens using context data
 */
function resolveHeaderFooterTokens(html, contextData, options = {}) {
  const { allowPageTokens = true } = options;
  if (!html || !contextData) return html || '';

  const tokenRegex = /\{\{\s*([^}]+)\s*\}\}/g;

  return html.replace(tokenRegex, (match, tokenPath) => {
    const trimmedPath = tokenPath.trim();

    if (!allowPageTokens && (trimmedPath === 'pageNumber' || trimmedPath === 'totalPages')) {
      return match;
    }
    if (trimmedPath === 'pageNumber') {
      return '<span class="pageNumber"></span>';
    }
    if (trimmedPath === 'totalPages') {
      return '<span class="totalPages"></span>';
    }
    if (trimmedPath === 'currentDate') {
      return escapeHtml(formatHeaderFooterValue(contextData.system?.currentDate || new Date()));
    }
    if (trimmedPath === 'currentDateTime') {
      return escapeHtml(formatHeaderFooterValue(contextData.system?.currentDateTime || new Date()));
    }

    const value = getNestedValue(contextData, trimmedPath);
    if (value === undefined || value === null) {
      return match; // leave unresolved tokens intact
    }
    return escapeHtml(formatHeaderFooterValue(value));
  });
}

/**
 * Render text leaf with marks (bold, italic, underline)
 */
function renderLeaf(leaf) {
  let text = escapeHtml(leaf.text);

  if (leaf.bold) {
    text = `<strong>${text}</strong>`;
  }
  if (leaf.italic) {
    text = `<em>${text}</em>`;
  }
  if (leaf.underline) {
    text = `<u>${text}</u>`;
  }
  if (leaf.strikethrough) {
    text = `<del>${text}</del>`;
  }
  if (leaf.code) {
    text = `<code>${text}</code>`;
  }

  return text;
}

/**
 * Get alignment style
 */
function getAlignStyle(align) {
  if (!align || align === 'left') return '';
  return ` style="text-align: ${align};"`;
}

/**
 * Render a single Slate element to HTML
 */
function renderElement(element, renderChildren) {
  const alignStyle = getAlignStyle(element.align);

  switch (element.type) {
    case 'heading-1':
      return `<h1${alignStyle}>${renderChildren()}</h1>`;

    case 'heading-2':
      return `<h2${alignStyle}>${renderChildren()}</h2>`;

    case 'heading-3':
      return `<h3${alignStyle}>${renderChildren()}</h3>`;

    case 'section':
      return `<section${alignStyle}>${renderChildren()}</section>`;

    case 'bulleted-list':
      return `<ul${alignStyle}>${renderChildren()}</ul>`;

    case 'numbered-list':
      return `<ol${alignStyle}>${renderChildren()}</ol>`;

    case 'list-item':
      return `<li${alignStyle}>${renderChildren()}</li>`;

    case 'table':
      return `<table class="contract-table">${renderChildren()}</table>`;

    case 'table-row':
      return `<tr>${renderChildren()}</tr>`;

    case 'table-cell':
      return `<td>${renderChildren()}</td>`;

    case 'token':
      // Render resolved value or fallback
      const tokenValue = element.resolvedValue !== undefined
        ? element.resolvedValue
        : element.fallback || `{{${element.tokenPath}}}`;
      return `<span class="token-value">${escapeHtml(tokenValue)}</span>`;

    case 'signature-anchor':
      // Render signature placeholder with data attributes for position extraction
      // CRITICAL: The anchor text MUST be positioned where the signature image should appear
      // The anchor text is placed INSIDE the signature-line div at the bottom (on the line)
      // This ensures PDF.js detects coordinates that match where signatures should render
      const { anchorId, role, label, required } = element;
      const anchorText = `[[SIG_${escapeHtml(role)}_${escapeHtml(anchorId)}]]`;
      return `<div class="signature-anchor"
        data-signature-anchor="${escapeHtml(anchorId)}"
        data-anchor-id="${escapeHtml(anchorId)}"
        data-role="${escapeHtml(role)}"
        data-label="${escapeHtml(label || '')}"
        data-required="${required ? 'true' : 'false'}">
        <div class="signature-line">
          <span class="anchor-marker">${anchorText}</span>
        </div>
        <div class="signature-label">${escapeHtml(label || `${role} Signature`)}</div>
      </div>`;

    case 'page-break':
      return `<div data-pagebreak="true" class="page-break wysiwyg-pagebreak"></div>`;

    case 'paragraph':
    default:
      return `<p${alignStyle}>${renderChildren()}</p>`;
  }
}

/**
 * Recursively render Slate nodes to HTML
 */
function renderNodes(nodes) {
  if (!Array.isArray(nodes)) {
    return '';
  }

  return nodes.map(node => {
    // Text node (leaf)
    if ('text' in node) {
      return renderLeaf(node);
    }

    // Element node
    if (node.type) {
      const renderChildren = () => {
        if (node.children && Array.isArray(node.children)) {
          return renderNodes(node.children);
        }
        return '';
      };
      return renderElement(node, renderChildren);
    }

    return '';
  }).join('');
}

/**
 * Generate CSS for the document based on branding profile
 *
 * CORRECT ARCHITECTURE: Stable Header/Footer Layout
 * ================================================
 * - PDF margins are set via @page { margin: ... }
 * - Header/footer are positioned with fixed top/bottom (NO negative offsets)
 * - Content lives in the content box with padding to avoid overlap
 * - This ensures signature coordinates are stable without manual offsets
 *
 * Layout values (LOCKED - DO NOT CHANGE):
 *   header height: 80px
 *   footer height: 60px
 *   top margin: 30px (breathing room)
 *   bottom margin: 30px (breathing room)
 *   left/right margins: 48px
 *
 * @param {Object} branding - Branding profile settings
 * @param {Object} options - { hasHeader, hasFooter }
 */
function generateBrandingCss(branding, { hasHeader = false, hasFooter = false } = {}) {
  const {
    primaryColor = '#667eea',
    secondaryColor = '#764ba2',
    headingFont = 'Helvetica Bold, Helvetica, Arial, sans-serif',
    bodyFont = 'Helvetica, Arial, sans-serif',
    fontSize = 11,
    lineHeight = 1.5,
    marginTop = 50,
    marginBottom = 50,
    marginLeft = 50,
    marginRight = 50,
  } = branding || {};
  const safeNumber = (value, fallback) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  };

  const topMargin = safeNumber(marginTop, 50);
  const bottomMargin = safeNumber(marginBottom, 50);
  const leftMargin = safeNumber(marginLeft, 48);
  const rightMargin = safeNumber(marginRight, 48);

  const headerHeight = hasHeader ? topMargin : 0;
  const footerHeight = hasFooter ? bottomMargin : 0;
  // NOTE: We reserve space ONLY via @page margins.
  // Body padding is intentionally zero to avoid per-page overlap issues.

  // =============================================
  // LOCKED @page margins (match gotenbergPdfGenerator.js)
  // =============================================
  const pageRule = `@page {
      size: Letter;
      margin-top: ${hasHeader ? headerHeight : topMargin}px;
      margin-bottom: ${hasFooter ? footerHeight : bottomMargin}px;
      margin-left: ${leftMargin}px;
      margin-right: ${rightMargin}px;
    }`;

  return `
    ${pageRule}

    * {
      box-sizing: border-box;
    }

    body {
      font-family: ${bodyFont};
      font-size: ${fontSize}pt;
      line-height: ${lineHeight};
      color: #333;
      margin: 0;
      padding: 0;
    }

    /* Content wrapper - NO extra padding needed, content lives in content box */
    .document-content {
      min-height: 100vh;
      box-sizing: border-box;
    }

    /* Header positioned at TOP of page box (no negative offsets) */
    #panda-header {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: ${headerHeight}px;
      padding: 12px 0;
      box-sizing: border-box;
      border-bottom: 1px solid #e5e7eb;
      background: white;
      overflow: hidden;
      z-index: 1000;
    }

    /* Footer positioned at BOTTOM of page box (no negative offsets) */
    #panda-footer {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: ${footerHeight}px;
      padding: 10px 0;
      box-sizing: border-box;
      border-top: 1px solid #e5e7eb;
      background: white;
      font-size: 10px;
      color: #6b7280;
      overflow: hidden;
      z-index: 1000;
    }

    /* Page number counters for Chromium print */
    .pageNumber::before {
      content: counter(page);
    }
    .totalPages::before {
      content: counter(pages);
    }

    h1, h2, h3, h4, h5, h6 {
      font-family: ${headingFont};
      color: ${primaryColor};
      margin-top: 1.5em;
      margin-bottom: 0.5em;
      page-break-after: avoid;
    }

    h1 {
      font-size: 24pt;
      border-bottom: 2px solid ${primaryColor};
      padding-bottom: 0.25em;
    }

    h2 {
      font-size: 18pt;
    }

    h3 {
      font-size: 14pt;
    }

    p {
      margin: 0 0 1em 0;
      orphans: 3;
      widows: 3;
    }

    ul, ol {
      margin: 0 0 1em 0;
      padding-left: 2em;
    }

    li {
      margin-bottom: 0.25em;
    }

    section {
      margin-bottom: 2em;
    }

    .contract-table {
      width: 100%;
      border-collapse: collapse;
      margin: 1em 0;
      page-break-inside: avoid;
    }

    .contract-table td,
    .contract-table th {
      border: 1px solid #ddd;
      padding: 8pt;
      text-align: left;
    }

    .contract-table th {
      background-color: ${primaryColor};
      color: white;
      font-weight: bold;
    }

    .contract-table tr:nth-child(even) {
      background-color: #f9f9f9;
    }

    .token-value {
      /* Tokens are rendered inline as plain text */
    }

    .signature-anchor {
      display: inline-block;
      width: 250px;
      margin: 1.5em 0;
      padding: 0.5em;
      page-break-inside: avoid;
      position: relative;
    }

    .signature-line {
      border-bottom: 2px solid #333;
      height: 40px;
      margin-bottom: 0.25em;
      position: relative;
    }

    /* CRITICAL: Anchor marker positioning for DocuSign-style coordinate detection
     * - Positioned at BOTTOM of signature line (where the actual line is)
     * - Font size tiny but still extractable by PDF.js text content
     * - Must be real text (not pseudo-elements) and NOT fully transparent
     * - PDF.js will find this text and return coordinates matching the signature line position
     */
    .anchor-marker {
      position: absolute;
      bottom: 0;
      left: 0;
      font-size: 1px;
      line-height: 1;
      color: #fff;
      opacity: 1;
      white-space: nowrap;
      user-select: none;
      pointer-events: none;
    }

    .signature-label {
      font-size: 9pt;
      color: #666;
    }

    .page-break,
    .wysiwyg-pagebreak {
      display: block;
      break-before: page;
      page-break-before: always;
      height: 0;
      margin: 0;
      padding: 0;
    }

    /* Header/Footer styles */
    .document-header {
      margin-bottom: 2em;
    }

    .document-footer {
      margin-top: 2em;
      padding-top: 1em;
      border-top: 1px solid #ddd;
      font-size: 9pt;
      color: #666;
    }

    /* Print optimization */
    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  `;
}

function replacePageNumberTokens(html) {
  if (!html) return html;
  return html
    .replace(/{{\s*(system\.)?pageNumber\s*}}/gi, '<span class="pageNumber"></span>')
    .replace(/{{\s*(system\.)?totalPages\s*}}/gi, '<span class="totalPages"></span>');
}

function stripPageNumberTokens(html) {
  if (!html) return html;
  return html
    .replace(/Page\s*{{\s*(system\.)?pageNumber\s*}}\s*of\s*{{\s*(system\.)?totalPages\s*}}/gi, '')
    .replace(/{{\s*(system\.)?pageNumber\s*}}/gi, '')
    .replace(/{{\s*(system\.)?totalPages\s*}}/gi, '')
    .replace(/<span[^>]*class=["']pageNumber["'][^>]*>.*?<\/span>/gi, '')
    .replace(/<span[^>]*class=["']totalPages["'][^>]*>.*?<\/span>/gi, '')
    .replace(/Page\s+of/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Get branding profile from database
 */
async function getBrandingProfile(brandingProfileId) {
  if (brandingProfileId) {
    const profile = await prisma.brandingProfile.findUnique({
      where: { id: brandingProfileId },
    });
    if (profile) return profile;
  }

  // Fall back to default branding profile
  const defaultProfile = await prisma.brandingProfile.findFirst({
    where: { isDefault: true },
  });

  return defaultProfile || {};
}

/**
 * Generate Playwright-compatible header template
 * Supports special classes: pageNumber, totalPages, title, date, url
 *
 * IMPORTANT: Playwright header/footer templates are rendered in a separate context.
 * They must include proper CSS resets and use -webkit-print-color-adjust for backgrounds.
 *
 * ============================================================================
 * PHASE 0 ARCHIVED - SEPARATE HEADER TEMPLATE CONTEXT
 * This function generates a SEPARATE Playwright header template that is rendered
 * in its own context outside the main document HTML. This violates the non-negotiable
 * rule: "Gotenberg is the ONLY component allowed to create or paginate the PDF"
 * and "Headers/footers must be in the original HTML before Gotenberg runs."
 *
 * WILL BE REPLACED IN PHASE 1 with embedded <header id="panda-header"> in main HTML
 * using CSS @page margins and position: fixed; top: -90px positioning.
 * ============================================================================
 */
function generateHeaderTemplate(headerHtml, branding) {
  if (!headerHtml) return '';

  const { primaryColor = '#667eea', headingFont = 'Helvetica, Arial, sans-serif' } = branding || {};

  // Playwright header templates need:
  // 1. CSS reset (margin: 0, padding: 0)
  // 2. Explicit width: 100% on container
  // 3. -webkit-print-color-adjust for backgrounds to print
  // 4. Height constraint to fit within margin
  return `
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
    </style>
    <div style="
      width: 100%;
      height: 100%;
      max-height: 110px;
      overflow: hidden;
      font-size: 9pt;
      font-family: ${headingFont};
      padding: 10px 50px;
      border-bottom: 1px solid ${primaryColor};
      display: flex;
      align-items: center;
      justify-content: space-between;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    ">
      ${headerHtml}
    </div>
  `;
}

/**
 * Generate Playwright-compatible footer template
 * Supports special classes: pageNumber, totalPages, title, date, url
 *
 * IMPORTANT: Playwright header/footer templates are rendered in a separate context.
 * They must include proper CSS resets.
 *
 * ============================================================================
 * PHASE 0 ARCHIVED - SEPARATE FOOTER TEMPLATE CONTEXT
 * This function generates a SEPARATE Playwright footer template that is rendered
 * in its own context outside the main document HTML. This violates the non-negotiable
 * rule: "Gotenberg is the ONLY component allowed to create or paginate the PDF"
 * and "Headers/footers must be in the original HTML before Gotenberg runs."
 *
 * WILL BE REPLACED IN PHASE 1 with embedded <footer id="panda-footer"> in main HTML
 * using CSS @page margins and position: fixed; bottom: -70px positioning.
 * ============================================================================
 */
function generateFooterTemplate(footerHtml, branding, showPageNumbers = true) {
  const { bodyFont = 'Helvetica, Arial, sans-serif' } = branding || {};

  // Build footer content
  let footerContent = footerHtml || '';

  // Add page numbers if requested
  const pageNumberHtml = showPageNumbers
    ? '<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>'
    : '';

  // If footer is empty but we want page numbers, just show page numbers
  if (!footerContent && pageNumberHtml) {
    footerContent = pageNumberHtml;
  } else if (footerContent && pageNumberHtml) {
    // Both footer content and page numbers - put page numbers on right
    footerContent = `<span>${footerContent}</span><span style="margin-left: auto;">${pageNumberHtml}</span>`;
  }

  if (!footerContent) return '';

  // Playwright footer templates need CSS reset like headers
  return `
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
    </style>
    <div style="
      width: 100%;
      height: 100%;
      max-height: 80px;
      overflow: hidden;
      font-size: 8pt;
      font-family: ${bodyFont};
      padding: 10px 50px;
      border-top: 1px solid #ddd;
      color: #666;
      display: flex;
      align-items: center;
      justify-content: space-between;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    ">
      ${footerContent}
    </div>
  `;
}

/**
 * Main render function - converts Slate AST to complete HTML document
 *
 * @param {Array} slateContent - Slate AST content (resolved tokens)
 * @param {Object} options - Rendering options
 * @returns {Object} - { html, headerTemplate, footerTemplate, displayHeaderFooter, branding }
 */
export async function render(slateContent, options = {}) {
  const {
    brandingProfileId,
    title = 'Document',
    headerHtml: explicitHeaderHtml,
    footerHtml: explicitFooterHtml,
    showPageNumbers,
    contextData,
  } = options;

  try {
    logger.info('Starting Slate to HTML render', {
      nodeCount: slateContent?.length || 0,
      brandingProfileId,
    });

    // Get branding configuration
    const branding = await getBrandingProfile(brandingProfileId);

    // Use explicit header/footer if provided, otherwise use branding profile
    const headerHtmlRaw = explicitHeaderHtml !== undefined ? explicitHeaderHtml : (branding.headerHtml || '');
    const footerHtmlRaw = explicitFooterHtml !== undefined ? explicitFooterHtml : (branding.footerHtml || '');
    const wantsPageNumbers = (showPageNumbers !== undefined ? showPageNumbers : (branding.showPageNumbers !== false));
    const allowPageTokens = !wantsPageNumbers;
    const headerHtml = resolveHeaderFooterTokens(headerHtmlRaw, contextData, { allowPageTokens });
    const rawFooterHtml = resolveHeaderFooterTokens(footerHtmlRaw, contextData, { allowPageTokens });
    const normalizedFooterHtml = stripPageNumberTokens(rawFooterHtml);
    const shouldShowPageNumbers = false; // Page numbers are stamped into the PDF, not rendered in HTML.

    // ========================================================================
    // PHASE 1: EMBEDDED HEADER/FOOTER IN HTML BODY
    // Headers and footers are embedded directly in the HTML using CSS
    // position: fixed with top/bottom placement (no negative offsets).
    // This is the ONLY correct approach per the non-negotiable rules:
    // - Gotenberg is the ONLY component allowed to create/paginate PDFs
    // - Headers/footers MUST be in the original HTML before Gotenberg runs
    // - CSS @page margins are source of truth (30px top/bottom breathing room)
    // ========================================================================

    // Determine if we have header/footer content
    const hasHeader = !!headerHtml;
    const hasFooter = !!normalizedFooterHtml || wantsPageNumbers;

    // Generate CSS (pass header/footer presence for padding)
    const css = generateBrandingCss(branding, { hasHeader, hasFooter });

    // Render main content
    const contentHtml = renderNodes(slateContent);

    // Build embedded header element (positioned with CSS into top margin)
    const { primaryColor = '#667eea', headingFont = 'Helvetica, Arial, sans-serif' } = branding || {};
    const embeddedHeader = hasHeader ? `
    <header id="panda-header">
      <div style="font-family: ${headingFont}; color: ${primaryColor};">
        ${headerHtml}
      </div>
    </header>` : '';

    // Build embedded footer element (positioned with CSS into bottom margin)
    const { bodyFont = 'Helvetica, Arial, sans-serif' } = branding || {};
    const pageNumberHtml = '';

    let footerContentHtml = '';
    if (normalizedFooterHtml) {
      footerContentHtml = normalizedFooterHtml;
    }

    const embeddedFooter = hasFooter ? `
    <footer id="panda-footer">
      <div style="font-family: ${bodyFont}; display: flex; justify-content: space-between; align-items: center; width: 100%;">
        ${footerContentHtml}
      </div>
    </footer>` : '';

    // Build complete HTML document with embedded header/footer
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    ${css}
  </style>
</head>
<body>
  ${embeddedHeader}
  ${embeddedFooter}
  <main class="document-content">
    ${contentHtml}
  </main>
</body>
</html>`;

    logger.info('[PHASE 1] Slate to HTML render complete (embedded header/footer)', {
      htmlLength: html.length,
      hasEmbeddedHeader: hasHeader,
      hasEmbeddedFooter: hasFooter,
      showPageNumbers: shouldShowPageNumbers,
      architecture: 'EMBEDDED_HEADER_FOOTER',
    });

    // PHASE 1: Return simplified object - header/footer are now embedded in HTML
    // No separate templates needed since Gotenberg renders the complete HTML
    return {
      html,
      branding,
      pageNumbersEnabled: wantsPageNumbers,
    };
  } catch (error) {
    logger.error('Slate to HTML render failed', { error: error.message });
    throw error;
  }
}

/**
 * Render Slate content to HTML fragment (without full document wrapper)
 */
export function renderFragment(slateContent) {
  return renderNodes(slateContent);
}

/**
 * Extract signature anchor positions from HTML using DOM parsing
 * This is done after PDF generation (Gotenberg)
 */
export function extractSignatureAnchorsFromContent(slateContent) {
  const anchors = [];

  const extract = (nodes) => {
    if (!Array.isArray(nodes)) return;

    for (const node of nodes) {
      if (node.type === 'signature-anchor') {
        anchors.push({
          anchorId: node.anchorId,
          role: node.role,
          label: node.label,
          required: node.required,
        });
      }
      if (node.children) {
        extract(node.children);
      }
    }
  };

  extract(slateContent);
  return anchors;
}

export default {
  render,
  renderFragment,
  extractSignatureAnchorsFromContent,
  generateBrandingCss,
};
