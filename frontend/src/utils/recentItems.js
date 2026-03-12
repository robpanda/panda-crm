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

export const getRecentItems = (baseKey, userId) => {
  if (typeof window === 'undefined') return [];
  const storageKey = buildKey(baseKey, userId);
  const parsed = safeParse(window.localStorage.getItem(storageKey));
  return parsed
    .filter((item) => item?.id)
    .map((item) => ({
      ...item,
      label: item.label || item.title || 'Untitled',
      meta: item.meta || item.subtitle || '',
      path: item.path || item.url || '',
    }));
};

export const addRecentItem = (baseKey, userId, item, limit = DEFAULT_LIMIT) => {
  if (typeof window === 'undefined' || !item?.id) return;
  const storageKey = buildKey(baseKey, userId);
  const existing = getRecentItems(baseKey, userId);
  const filtered = existing.filter((entry) => entry?.id && entry.id !== item.id);
  const next = [{ ...item, viewedAt: new Date().toISOString() }, ...filtered].slice(0, limit);
  window.localStorage.setItem(storageKey, JSON.stringify(next));
};
