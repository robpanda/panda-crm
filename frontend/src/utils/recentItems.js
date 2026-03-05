const DEFAULT_LIMIT = 10;

const buildKey = (baseKey, userId) => `recent:${baseKey}:${userId || 'anon'}`;

const getDefaultPath = (baseKey, id) => {
  if (!id) return '';
  if (baseKey === 'leads') return `/leads/${id}`;
  if (baseKey === 'jobs') return `/jobs/${id}`;
  return '';
};

const getFallbackLabel = (baseKey, id) => {
  if (baseKey === 'leads') return `Lead ${String(id).slice(0, 8)}`;
  if (baseKey === 'jobs') return `Job ${String(id).slice(0, 8)}`;
  return 'Record';
};

const normalizeRecentItem = (baseKey, item) => {
  if (!item || typeof item !== 'object') return null;

  const id = item.id || item.recordId || item.leadId || item.opportunityId;
  if (!id) return null;

  const label = String(item.label || item.title || item.name || '').trim() || getFallbackLabel(baseKey, id);
  const meta = String(item.meta || item.subtitle || '').trim();
  const path = String(item.path || item.url || getDefaultPath(baseKey, id)).trim();

  return {
    id,
    label,
    meta,
    path: path || getDefaultPath(baseKey, id),
    viewedAt: item.viewedAt || null,
  };
};

const dedupeById = (items) => {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
};

const safeParse = (value) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
};

export const getRecentItems = (baseKey, userId, limit = DEFAULT_LIMIT) => {
  if (typeof window === 'undefined') return [];
  const storageKey = buildKey(baseKey, userId);
  const parsed = safeParse(window.localStorage.getItem(storageKey));
  return dedupeById(
    parsed
      .map((entry) => normalizeRecentItem(baseKey, entry))
      .filter(Boolean)
  ).slice(0, limit);
};

export const addRecentItem = (baseKey, userId, item, limit = DEFAULT_LIMIT) => {
  if (typeof window === 'undefined') return;
  const normalized = normalizeRecentItem(baseKey, item);
  if (!normalized?.id) return;

  const storageKey = buildKey(baseKey, userId);
  const existing = getRecentItems(baseKey, userId, limit);
  const filtered = existing.filter((entry) => entry.id !== normalized.id);
  const next = [{ ...normalized, viewedAt: new Date().toISOString() }, ...filtered].slice(0, limit);
  window.localStorage.setItem(storageKey, JSON.stringify(next));
};
