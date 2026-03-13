const DEFAULT_LIMIT = 10;

const buildKey = (baseKey, userId) => `recent:${baseKey}:${userId || 'anon'}`;

const normalizeUserAliases = (userRef) => {
  if (!userRef) return ['anon'];

  if (typeof userRef === 'string' || typeof userRef === 'number') {
    return [String(userRef)];
  }

  if (typeof userRef !== 'object') {
    return ['anon'];
  }

  const candidates = [
    userRef.id,
    userRef.userId,
    userRef.cognitoId,
    userRef.sub,
    userRef.email ? String(userRef.email).trim().toLowerCase() : null,
  ]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean);

  return candidates.length > 0 ? [...new Set(candidates)] : ['anon'];
};

const buildKeys = (baseKey, userRef) => normalizeUserAliases(userRef).map((alias) => buildKey(baseKey, alias));

const safeParse = (value) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
};

export const getRecentItems = (baseKey, userRef) => {
  if (typeof window === 'undefined') return [];
  const parsed = buildKeys(baseKey, userRef)
    .flatMap((storageKey) => safeParse(window.localStorage.getItem(storageKey)));

  return parsed
    .filter((item) => item?.id)
    .sort((a, b) => new Date(b?.viewedAt || 0).getTime() - new Date(a?.viewedAt || 0).getTime())
    .filter((item, index, collection) => collection.findIndex((entry) => entry?.id === item.id) === index)
    .slice(0, DEFAULT_LIMIT)
    .map((item) => ({
      ...item,
      label: item.label || item.title || 'Untitled',
      meta: item.meta || item.subtitle || '',
      path: item.path || item.url || '',
    }));
};

export const addRecentItem = (baseKey, userRef, item, limit = DEFAULT_LIMIT) => {
  if (typeof window === 'undefined' || !item?.id) return;
  const storageKeys = buildKeys(baseKey, userRef);
  const existing = getRecentItems(baseKey, userRef);
  const filtered = existing.filter((entry) => entry?.id && entry.id !== item.id);
  const next = [{ ...item, viewedAt: new Date().toISOString() }, ...filtered].slice(0, limit);
  storageKeys.forEach((storageKey) => {
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  });
};
