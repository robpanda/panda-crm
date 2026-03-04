const STATUS_STYLES = {
  verified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  needs_review: 'bg-rose-50 text-rose-700 border-rose-200',
  unknown: 'bg-gray-50 text-gray-600 border-gray-200',
};

const STATUS_LABELS = {
  verified: 'Verified',
  needs_review: 'Needs Review',
  unknown: 'Unknown',
};

const LEGACY_STATUS_MAP = {
  pass: 'verified',
  fail: 'needs_review',
  healthy: 'verified',
  warning: 'needs_review',
  critical: 'needs_review',
};

const normalizeStatus = (status) => {
  if (!status) return 'unknown';
  const normalized = LEGACY_STATUS_MAP[status] || status;
  return STATUS_STYLES[normalized] ? normalized : 'unknown';
};

export default function VerifiedBadge({ status = 'unknown', reason = 'Verification unavailable.', size = 'xs' }) {
  const normalized = normalizeStatus(status);
  const label = STATUS_LABELS[normalized] || STATUS_LABELS.unknown;
  const sizeClasses = size === 'sm' ? 'text-xs px-2.5 py-1' : 'text-[11px] px-2 py-0.5';

  return (
    <span
      title={reason || 'Verification unavailable.'}
      className={`inline-flex items-center rounded-full border ${sizeClasses} font-medium ${STATUS_STYLES[normalized]}`}
    >
      {label}
    </span>
  );
}
