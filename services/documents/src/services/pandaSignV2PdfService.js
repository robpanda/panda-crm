export const DEFAULT_SAFE_AREA = {
  topPx: 104,
  bottomPx: 88,
  leftPx: 24,
  rightPx: 24,
};

export const MIN_SAFE_AREA = {
  topPx: 64,
  bottomPx: 56,
};

function sanitizeText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizePositiveNumber(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

export function buildPageNumberLabel(currentPage, totalPages) {
  const safeCurrent = normalizePositiveNumber(currentPage, 1);
  const safeTotal = Number(totalPages);

  // Never emit invalid "0 of 0". If total is unknown/invalid, degrade to "Page N".
  if (!Number.isFinite(safeTotal) || safeTotal < 1) {
    return `Page ${safeCurrent}`;
  }

  return `Page ${safeCurrent} of ${Math.floor(safeTotal)}`;
}

export function buildPageNumberSeries(totalPages) {
  const safeTotal = Number(totalPages);
  if (!Number.isFinite(safeTotal) || safeTotal < 1) {
    return [buildPageNumberLabel(1, null)];
  }

  const count = Math.floor(safeTotal);
  return Array.from({ length: count }, (_, index) => buildPageNumberLabel(index + 1, count));
}

export function validateHeaderFooterSafeArea({
  headerHtml = '',
  footerHtml = '',
  safeArea = DEFAULT_SAFE_AREA,
} = {}) {
  const warnings = [];
  const normalizedSafeArea = {
    topPx: Number(safeArea.topPx ?? DEFAULT_SAFE_AREA.topPx),
    bottomPx: Number(safeArea.bottomPx ?? DEFAULT_SAFE_AREA.bottomPx),
    leftPx: Number(safeArea.leftPx ?? DEFAULT_SAFE_AREA.leftPx),
    rightPx: Number(safeArea.rightPx ?? DEFAULT_SAFE_AREA.rightPx),
  };

  if (normalizedSafeArea.topPx < MIN_SAFE_AREA.topPx) {
    warnings.push({
      code: 'SAFE_AREA_TOP_TOO_SMALL',
      message: `Top safe area ${normalizedSafeArea.topPx}px is below recommended minimum ${MIN_SAFE_AREA.topPx}px.`,
    });
  }

  if (normalizedSafeArea.bottomPx < MIN_SAFE_AREA.bottomPx) {
    warnings.push({
      code: 'SAFE_AREA_BOTTOM_TOO_SMALL',
      message: `Bottom safe area ${normalizedSafeArea.bottomPx}px is below recommended minimum ${MIN_SAFE_AREA.bottomPx}px.`,
    });
  }

  const headerRegionInjectedIntoFooter = /data-ps-region\s*=\s*["']header["']/i.test(footerHtml);
  if (headerRegionInjectedIntoFooter) {
    warnings.push({
      code: 'HEADER_CONTENT_IN_FOOTER',
      message: 'Detected header region markup inside footer HTML.',
    });
  } else {
    const headerText = sanitizeText(headerHtml).slice(0, 120);
    const footerText = sanitizeText(footerHtml);
    if (headerText && footerText && footerText.includes(headerText)) {
      warnings.push({
        code: 'HEADER_CONTENT_IN_FOOTER',
        message: 'Footer appears to include duplicated header content.',
      });
    }
  }

  return {
    safeArea: normalizedSafeArea,
    warnings,
    isSafe: warnings.length === 0,
  };
}

export function buildPreviewPdfRenderConfig({
  headerHtml = '',
  footerHtml = '',
  safeArea = DEFAULT_SAFE_AREA,
} = {}) {
  const safeAreaReport = validateHeaderFooterSafeArea({ headerHtml, footerHtml, safeArea });

  return {
    displayHeaderFooter: true,
    margin: {
      top: `${safeAreaReport.safeArea.topPx}px`,
      bottom: `${safeAreaReport.safeArea.bottomPx}px`,
      left: `${safeAreaReport.safeArea.leftPx}px`,
      right: `${safeAreaReport.safeArea.rightPx}px`,
    },
    headerTemplate: headerHtml || '<div></div>',
    footerTemplate:
      footerHtml ||
      '<div style="width:100%;text-align:right;font-size:10px;padding:0 12px;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    safeAreaReport,
  };
}

export default {
  buildPageNumberLabel,
  buildPageNumberSeries,
  validateHeaderFooterSafeArea,
  buildPreviewPdfRenderConfig,
};
