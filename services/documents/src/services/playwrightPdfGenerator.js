/**
 * Playwright PDF Generator
 *
 * Generates PDFs from HTML using Playwright's Chromium browser.
 * Supports signature anchor position extraction and document hashing.
 */

import { chromium } from 'playwright';
import crypto from 'crypto';
import logger from '../utils/logger.js';

// Browser instance for reuse
let browserInstance = null;
let browserLaunchPromise = null;

// Configuration - Base options
const PDF_OPTIONS = {
  format: 'Letter',
  printBackground: true,
  preferCSSPageSize: false, // Use format over CSS @page
};

// Margin configurations
const MARGIN_NO_HEADER_FOOTER = {
  top: '50px',
  right: '50px',
  bottom: '50px',
  left: '50px',
};

const MARGIN_WITH_HEADER_FOOTER = {
  top: '130px',   // Extra space for header with logo
  right: '50px',
  bottom: '100px', // Extra space for footer with page numbers
  left: '50px',
};

/**
 * Get or create browser instance
 */
async function getBrowser() {
  // If we have a connected browser, return it
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }

  // If a launch is in progress, wait for it
  if (browserLaunchPromise) {
    try {
      const browser = await browserLaunchPromise;
      if (browser && browser.isConnected()) {
        return browser;
      }
    } catch (error) {
      // Launch failed, will try again below
    }
    browserLaunchPromise = null;
  }

  // Reset instance if it's disconnected
  if (browserInstance && !browserInstance.isConnected()) {
    browserInstance = null;
  }

  // Launch a new browser
  browserLaunchPromise = (async () => {
    try {
      logger.info('Launching Chromium browser');

      const browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--font-render-hinting=none', // Faster font rendering
        ],
      });

      // Handle browser disconnection
      browser.on('disconnected', () => {
        logger.warn('Browser disconnected');
        if (browserInstance === browser) {
          browserInstance = null;
          browserLaunchPromise = null;
        }
      });

      browserInstance = browser;
      browserLaunchPromise = null; // Reset promise after successful launch
      logger.info('Chromium browser launched successfully');
      return browser;
    } catch (error) {
      logger.error('Failed to launch browser', { error: error.message, stack: error.stack });
      browserLaunchPromise = null;
      browserInstance = null;
      throw error;
    }
  })();

  return browserLaunchPromise;
}

/**
 * Close the browser instance
 */
export async function closeBrowser() {
  if (browserInstance) {
    try {
      await browserInstance.close();
      browserInstance = null;
      browserLaunchPromise = null;
      logger.info('Browser closed');
    } catch (error) {
      logger.error('Error closing browser', { error: error.message });
    }
  }
}

/**
 * Calculate SHA-256 hash of a buffer
 */
function calculateHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Extract signature anchor positions from the rendered page
 * Returns positions relative to the document content area (not viewport)
 * Coordinates are in PDF points (1/72 inch), matching Letter size: 612x792
 *
 * IMPORTANT: This function requires the viewport to be set to the full document height
 * before calling, so that all signature anchors across all pages are visible.
 */
async function extractSignaturePositions(page) {
  return page.evaluate(() => {
    const anchors = document.querySelectorAll('.signature-anchor');
    const positions = [];

    // Get the document body's bounding rect as reference point
    const bodyRect = document.body.getBoundingClientRect();

    // Get the full document dimensions
    // CRITICAL: Use the maximum of all height measurements to get true content height
    const contentWidth = Math.max(
      document.body.scrollWidth || 0,
      document.documentElement.scrollWidth || 0,
      bodyRect.width || 0,
      612
    );
    const contentHeight = Math.max(
      document.body.scrollHeight || 0,
      document.documentElement.scrollHeight || 0,
      bodyRect.height || 0,
      792
    );

    // PDF dimensions in points
    const PDF_WIDTH = 612;
    const PDF_HEIGHT = 792;

    // Calculate number of pages based on content height
    // The viewport should already be resized to full document height
    const numPages = Math.max(1, Math.ceil(contentHeight / PDF_HEIGHT));

    // Scale factor for X (width should be 612)
    // Y scaling is per-page (each page content maps to 792 points)
    const scaleX = PDF_WIDTH / contentWidth;

    // Debug info
    console.log('[extractSignaturePositions] Debug:', {
      anchorCount: anchors.length,
      bodyRect: { left: bodyRect.left, top: bodyRect.top, width: bodyRect.width, height: bodyRect.height },
      contentWidth,
      contentHeight,
      numPages,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });

    anchors.forEach((anchor, index) => {
      const rect = anchor.getBoundingClientRect();
      const signatureLine = anchor.querySelector('.signature-line');
      const lineRect = signatureLine ? signatureLine.getBoundingClientRect() : rect;

      // Calculate position relative to document body (not viewport)
      const relativeX = lineRect.left - bodyRect.left;
      const relativeY = lineRect.top - bodyRect.top;
      const relativeWidth = lineRect.width;
      const relativeHeight = lineRect.height;

      // Scale X to PDF coordinate space
      const pdfX = relativeX * scaleX;
      const pdfWidth = relativeWidth * scaleX;
      const pdfHeight = relativeHeight * scaleX; // Use same scale for consistency

      // Determine page number based on Y position in the document
      // Each page is contentHeight/numPages tall in the rendered view
      const pageHeightInPixels = contentHeight / numPages;
      const pageNumber = Math.floor(relativeY / pageHeightInPixels) + 1;

      // Calculate Y position relative to the page it's on
      // Position within page (0 to pageHeightInPixels) maps to (0 to 792)
      const positionInPage = relativeY - ((pageNumber - 1) * pageHeightInPixels);
      const pageRelativeY = (positionInPage / pageHeightInPixels) * PDF_HEIGHT;

      console.log(`[extractSignaturePositions] Anchor ${index}:`, {
        anchorId: anchor.dataset.anchorId,
        role: anchor.dataset.role,
        raw: { left: lineRect.left, top: lineRect.top, width: lineRect.width, height: lineRect.height },
        relative: { x: relativeX, y: relativeY },
        document: { contentHeight, numPages, pageHeightInPixels },
        calculated: { pageNumber, positionInPage, pageRelativeY },
        final: { page: pageNumber, x: Math.round(pdfX), y: Math.round(pageRelativeY) },
      });

      positions.push({
        anchorId: anchor.dataset.anchorId,
        role: anchor.dataset.role,
        label: anchor.dataset.label,
        required: anchor.dataset.required === 'true',
        type: anchor.dataset.type || 'signature',
        position: {
          page: Math.min(pageNumber, numPages), // Ensure page doesn't exceed document pages
          x: Math.round(pdfX),
          y: Math.round(pageRelativeY),
          width: Math.max(100, Math.round(pdfWidth)),
          height: Math.max(40, Math.round(pdfHeight)),
        },
      });
    });

    return positions;
  });
}

/**
 * Get page count from PDF buffer
 */
function getPdfPageCount(pdfBuffer) {
  // Quick page count extraction from PDF structure
  const pdfString = pdfBuffer.toString('binary');
  const pageMatches = pdfString.match(/\/Type\s*\/Page[^s]/g);
  return pageMatches ? pageMatches.length : 1;
}

/**
 * Generate PDF from HTML
 *
 * @param {string} html - Complete HTML document
 * @param {Object} options - PDF generation options
 * @returns {Object} - { pdfBuffer, documentHash, signaturePositions, pageCount }
 */
export async function generatePdf(html, options = {}) {
  const {
    format = 'Letter',
    printBackground = true,
    extractSignatures = true,
    headerTemplate = '',
    footerTemplate = '',
    displayHeaderFooter = false,
    marginTop,
    marginBottom,
    marginLeft,
    marginRight,
  } = options;

  let browser;
  let page;

  try {
    logger.info('Starting PDF generation', {
      htmlLength: html.length,
      extractSignatures,
      displayHeaderFooter,
      hasHeader: !!headerTemplate,
      hasFooter: !!footerTemplate,
    });

    // Get browser instance
    browser = await getBrowser();

    // Create new page
    page = await browser.newPage();

    // Set initial viewport size matching Letter paper width
    // Height will be adjusted after loading content to see full document
    await page.setViewportSize({
      width: 612,
      height: 792,
    });

    // Set content
    await page.setContent(html, {
      waitUntil: 'networkidle',
    });

    // Wait for any fonts to load
    await page.evaluate(() => document.fonts.ready);

    // CRITICAL: Get full document height and resize viewport to see ALL pages
    // This ensures signature anchors on later pages are visible and correctly positioned
    const fullDocumentHeight = await page.evaluate(() => {
      return Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.offsetHeight
      );
    });

    // Calculate number of pages based on document height
    const estimatedPages = Math.ceil(fullDocumentHeight / 792);

    logger.info('Document dimensions detected', {
      fullDocumentHeight,
      estimatedPages,
      viewportWidth: 612,
    });

    // If document is multi-page, resize viewport to see all content
    // This allows extractSignaturePositions to correctly calculate page numbers
    if (fullDocumentHeight > 792) {
      await page.setViewportSize({
        width: 612,
        height: fullDocumentHeight,
      });

      // Wait for layout reflow after resize
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

      logger.info('Viewport resized to full document height for multi-page extraction', {
        newHeight: fullDocumentHeight,
      });
    }

    // Determine margins FIRST (needed for position adjustment)
    const hasHeaderFooter = displayHeaderFooter && (headerTemplate || footerTemplate);
    const defaultMargins = hasHeaderFooter ? MARGIN_WITH_HEADER_FOOTER : MARGIN_NO_HEADER_FOOTER;

    // Parse margin values (convert from '50px' to 50)
    const actualMargins = {
      top: parseInt(marginTop || defaultMargins.top, 10) || 50,
      right: parseInt(marginRight || defaultMargins.right, 10) || 50,
      bottom: parseInt(marginBottom || defaultMargins.bottom, 10) || 50,
      left: parseInt(marginLeft || defaultMargins.left, 10) || 50,
    };

    logger.info('PDF margins determined', {
      hasHeaderFooter,
      margins: actualMargins
    });

    // Extract signature positions before generating PDF
    let signaturePositions = [];
    if (extractSignatures) {
      const rawPositions = await extractSignaturePositions(page);

      // CRITICAL: Adjust positions by adding PDF margins
      // The browser content is placed inside the PDF margins, so we need to offset
      // coordinates from content-relative to page-relative
      signaturePositions = rawPositions.map(pos => ({
        ...pos,
        position: {
          ...pos.position,
          // Add left margin to x position
          x: Math.round(pos.position.x + actualMargins.left),
          // Add top margin to y position (account for multi-page by using page-relative y)
          y: Math.round(pos.position.y + actualMargins.top),
        },
      }));

      logger.info('Extracted and adjusted signature positions', {
        count: signaturePositions.length,
        rawPositions: rawPositions.map(p => ({
          anchorId: p.anchorId,
          rawX: p.position?.x,
          rawY: p.position?.y,
        })),
        adjustedPositions: signaturePositions.map(p => ({
          anchorId: p.anchorId,
          role: p.role,
          x: p.position?.x,
          y: p.position?.y,
          width: p.position?.width,
          height: p.position?.height,
        })),
        marginsApplied: actualMargins,
      });
    }

    // Generate PDF options
    const pdfOptions = {
      ...PDF_OPTIONS,
      format,
      printBackground,
      margin: {
        top: marginTop || defaultMargins.top,
        right: marginRight || defaultMargins.right,
        bottom: marginBottom || defaultMargins.bottom,
        left: marginLeft || defaultMargins.left,
      },
    };

    // Add header/footer if provided
    if (displayHeaderFooter) {
      pdfOptions.displayHeaderFooter = true;
      pdfOptions.headerTemplate = headerTemplate || '<span></span>';
      pdfOptions.footerTemplate = footerTemplate || '<span></span>';
    }

    const pdfBuffer = await page.pdf(pdfOptions);

    // Calculate document hash
    const documentHash = calculateHash(pdfBuffer);

    // Get page count
    const pageCount = getPdfPageCount(pdfBuffer);

    logger.info('PDF generation complete', {
      pdfSize: pdfBuffer.length,
      documentHash: documentHash.slice(0, 16) + '...',
      pageCount,
      signatureCount: signaturePositions.length,
      displayHeaderFooter: hasHeaderFooter,
    });

    return {
      pdfBuffer,
      documentHash,
      signaturePositions,
      pageCount,
    };
  } catch (error) {
    logger.error('PDF generation failed', { error: error.message });
    throw error;
  } finally {
    // Close the page but keep browser alive for reuse
    if (page) {
      try {
        await page.close();
      } catch (e) {
        // Ignore close errors
      }
    }
  }
}

/**
 * Generate PDF preview (lower quality, faster)
 * Accepts header/footer options
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
 * Embed signature image onto PDF at specified position
 * Note: For actual signature embedding, we'll use pdf-lib
 */
export async function embedSignatureImage(pdfBuffer, signatureImage, position) {
  // This would use pdf-lib to overlay the signature
  // For now, return the original buffer
  // TODO: Implement signature overlay with pdf-lib
  logger.warn('Signature embedding not yet implemented');
  return pdfBuffer;
}

/**
 * Generate document with signature positions for signing UI
 */
export async function generateForSigning(html, options = {}) {
  const result = await generatePdf(html, {
    ...options,
    extractSignatures: true,
  });

  // Enhance signature positions with page-relative coordinates
  // This is needed for the signing UI to overlay fields correctly
  const signingFields = result.signaturePositions.map(pos => ({
    ...pos,
    // Convert to percentage-based positions for responsive display
    relativePosition: {
      page: pos.position.page,
      xPercent: (pos.position.x / 612) * 100, // 612 = Letter width in points
      yPercent: (pos.position.y / 792) * 100, // 792 = Letter height in points
      widthPercent: (pos.position.width / 612) * 100,
      heightPercent: (pos.position.height / 792) * 100,
    },
  }));

  return {
    ...result,
    signingFields,
  };
}

/**
 * Health check - verify browser can be launched
 */
export async function healthCheck() {
  try {
    const browser = await getBrowser();
    const page = await browser.newPage();
    await page.setContent('<html><body>Test</body></html>');
    await page.close();
    return { healthy: true };
  } catch (error) {
    return { healthy: false, error: error.message };
  }
}

// Cleanup on process exit
process.on('beforeExit', async () => {
  await closeBrowser();
});

process.on('SIGTERM', async () => {
  await closeBrowser();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await closeBrowser();
  process.exit(0);
});

export default {
  generatePdf,
  generatePreviewPdf,
  generatePdfFromRenderResult,
  generateForSigning,
  embedSignatureImage,
  closeBrowser,
  healthCheck,
};
