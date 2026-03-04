export function sanitizeFilename(value, maxLength = 150) {
  const cleaned = String(value || '')
    .replace(/[\/\\:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned.substring(0, maxLength);
}

export function buildAgreementFilenameParts({ jobNumber, agreementName, customerName }) {
  const parts = [jobNumber, agreementName, customerName]
    .map((part) => sanitizeFilename(part))
    .filter(Boolean);

  const displayName = sanitizeFilename(parts.join(' - ') || 'document');
  const keyName = displayName.replace(/\s+/g, '-').replace(/-+/g, '-');

  return { displayName, keyName };
}

export function buildAgreementFolderName(jobNumber, agreementId) {
  const base = sanitizeFilename(jobNumber || agreementId || 'agreement').replace(/\s+/g, '-');
  return base || agreementId || 'agreement';
}

export function buildContentDisposition(filename, mode = 'attachment') {
  if (!filename) return undefined;
  return `${mode}; filename="${filename}"`;
}
