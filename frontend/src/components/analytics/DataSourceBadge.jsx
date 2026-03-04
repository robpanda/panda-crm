const SOURCE_STYLES = {
  native: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  legacy: 'bg-amber-50 text-amber-700 border-amber-200',
  metabase: 'bg-sky-50 text-sky-700 border-sky-200',
  unknown: 'bg-gray-50 text-gray-600 border-gray-200',
};

const SOURCE_LABELS = {
  native: 'Native',
  legacy: 'Legacy',
  metabase: 'Metabase',
  unknown: 'Unknown',
};

const SOURCE_TITLES = {
  native: 'Native (Reports Engine)',
  legacy: 'Legacy (Salesforce Migration)',
  metabase: 'Metabase',
  unknown: 'Source unknown',
};

const normalizeSource = (source) => {
  if (!source) return 'unknown';
  const value = String(source).toLowerCase();
  if (value.includes('meta')) return 'metabase';
  if (value.includes('legacy') || value.includes('salesforce')) return 'legacy';
  if (value.includes('native') || value.includes('report')) return 'native';
  return value;
};

export default function DataSourceBadge({ source = 'unknown', size = 'xs' }) {
  const normalized = normalizeSource(source);
  const label = SOURCE_LABELS[normalized] || source || SOURCE_LABELS.unknown;
  const title = SOURCE_TITLES[normalized] || SOURCE_TITLES.unknown;

  const sizeClasses = size === 'sm' ? 'text-xs px-2.5 py-1' : 'text-[11px] px-2 py-0.5';

  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full border ${sizeClasses} font-medium ${SOURCE_STYLES[normalized] || SOURCE_STYLES.unknown}`}
    >
      Source: {label}
    </span>
  );
}
