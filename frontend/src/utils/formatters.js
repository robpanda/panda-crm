/**
 * Number and currency formatting utilities
 * Use these throughout the app for consistent number display
 */

/**
 * Format a number with commas (e.g., 1234 -> "1,234")
 * @param {number|string} value - The number to format
 * @returns {string} Formatted number string
 */
export function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '-';
  return new Intl.NumberFormat('en-US').format(num);
}

/**
 * Format a number as currency (e.g., 1234 -> "$1,234")
 * @param {number|string} value - The number to format
 * @param {boolean} showCents - Whether to show cents (default: false)
 * @returns {string} Formatted currency string
 */
export function formatCurrency(value, showCents = false) {
  if (value === null || value === undefined || value === '') return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  }).format(num);
}

/**
 * Format a large number in compact form (e.g., 1234000 -> "$1.2M")
 * @param {number|string} value - The number to format
 * @param {boolean} isCurrency - Whether to show as currency (default: true)
 * @returns {string} Formatted compact string
 */
export function formatCompact(value, isCurrency = true) {
  if (value === null || value === undefined || value === '') return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '-';

  const absNum = Math.abs(num);
  const prefix = isCurrency ? '$' : '';
  const sign = num < 0 ? '-' : '';

  if (absNum >= 1000000) {
    return `${sign}${prefix}${(absNum / 1000000).toFixed(1)}M`;
  }
  if (absNum >= 1000) {
    return `${sign}${prefix}${(absNum / 1000).toFixed(0)}K`;
  }
  return isCurrency ? formatCurrency(num) : formatNumber(num);
}

/**
 * Format a number as percentage (e.g., 0.45 -> "45%", 45 -> "45%")
 * @param {number|string} value - The number to format (can be 0-1 or 0-100)
 * @param {number} decimals - Number of decimal places (default: 1)
 * @returns {string} Formatted percentage string
 */
export function formatPercent(value, decimals = 1) {
  if (value === null || value === undefined || value === '') return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '-';
  // If value is between -1 and 1 (exclusive), assume it's a decimal
  const pct = Math.abs(num) < 1 && num !== 0 ? num * 100 : num;
  return `${pct.toFixed(decimals)}%`;
}

/**
 * Smart value formatter - automatically detects and formats based on type
 * @param {any} value - The value to format
 * @param {'number'|'currency'|'percent'|'compact'} type - Format type
 * @returns {string} Formatted string
 */
export function formatValue(value, type = 'number') {
  switch (type) {
    case 'currency':
      return formatCurrency(value);
    case 'percent':
      return formatPercent(value);
    case 'compact':
      return formatCompact(value);
    default:
      return formatNumber(value);
  }
}

/**
 * Validate phone number format
 * Accepts common US formats: (XXX) XXX-XXXX, XXX-XXX-XXXX, XXXXXXXXXX, XXX.XXX.XXXX
 * @param {string} phone - The phone number to validate
 * @returns {boolean} True if valid format or empty, false otherwise
 */
export function isValidPhoneFormat(phone) {
  if (!phone || phone.trim() === '') return true; // Empty is not a format error
  const phoneRegex = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/;
  const cleaned = phone.replace(/\s/g, '');
  return phoneRegex.test(cleaned) || cleaned.length === 10 || cleaned.length === 11;
}

/**
 * Validate email format
 * @param {string} email - The email to validate
 * @returns {boolean} True if valid format or empty, false otherwise
 */
export function isValidEmailFormat(email) {
  if (!email || email.trim() === '') return true; // Empty is not a format error
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Format phone number to standard (XXX) XXX-XXXX format
 * @param {string} phone - The phone number to format
 * @returns {string} Formatted phone number or original if can't format
 */
export function formatPhoneNumber(phone) {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return phone; // Return original if can't format
}

export default {
  formatNumber,
  formatCurrency,
  formatCompact,
  formatPercent,
  formatValue,
  isValidPhoneFormat,
  isValidEmailFormat,
  formatPhoneNumber,
};
