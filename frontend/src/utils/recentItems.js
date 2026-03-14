const DEFAULT_LIMIT = 10;

const buildKey = (baseKey, userId) => `recent:${baseKey}:${userId || 'anon'}`;

const safeParse = (value) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
};

const normalizeRecentItem = (item) => {
  if (!item?.id) return null;
  const label = item.label || item.title || item.name || '';
  const meta = item.meta || item.subtitle || '';
  const path = item.path || item.url || '';

  return {
    ...item,
    label,
    meta,
    path,
  };
};

export const getRecentItems = (baseKey, userId) => {
  if (typeof window === 'undefined') return [];
  const storageKey = buildKey(baseKey, userId);
  return safeParse(window.localStorage.getItem(storageKey))
    .map(normalizeRecentItem)
    .filter(Boolean);
};

export const addRecentItem = (baseKey, userId, item, limit = DEFAULT_LIMIT) => {
  if (typeof window === 'undefined' || !item?.id) return;
  const storageKey = buildKey(baseKey, userId);
  const existing = getRecentItems(baseKey, userId);
  const normalizedItem = normalizeRecentItem(item);
  if (!normalizedItem) return;
  const filtered = existing.filter((entry) => entry?.id && entry.id !== normalizedItem.id);
  const next = [{ ...normalizedItem, viewedAt: new Date().toISOString() }, ...filtered].slice(0, limit);
  window.localStorage.setItem(storageKey, JSON.stringify(next));
};
