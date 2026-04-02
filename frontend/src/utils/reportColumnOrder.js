function toArray(value) {
  return Array.isArray(value) ? value : [];
}

export function extractColumnKeys(columns = []) {
  return toArray(columns)
    .map((column) => column?.key)
    .filter(Boolean);
}

export function normalizeOrderedKeys(order = [], availableKeys = []) {
  const available = toArray(availableKeys).filter(Boolean);
  const availableSet = new Set(available);
  const normalized = [];
  const seen = new Set();

  toArray(order).forEach((key) => {
    if (!key || !availableSet.has(key) || seen.has(key)) {
      return;
    }

    normalized.push(key);
    seen.add(key);
  });

  available.forEach((key) => {
    if (seen.has(key)) {
      return;
    }

    normalized.push(key);
    seen.add(key);
  });

  return normalized;
}

export function moveOrderedValue(values = [], value, direction = 'up') {
  const orderedValues = toArray(values).filter(Boolean);
  const currentIndex = orderedValues.indexOf(value);

  if (currentIndex < 0) {
    return orderedValues;
  }

  const offset = direction === 'down' || direction === 'right' ? 1 : -1;
  const nextIndex = currentIndex + offset;

  if (nextIndex < 0 || nextIndex >= orderedValues.length) {
    return orderedValues;
  }

  const nextValues = [...orderedValues];
  [nextValues[currentIndex], nextValues[nextIndex]] = [nextValues[nextIndex], nextValues[currentIndex]];
  return nextValues;
}

export function applyColumnOrder(columns = [], order = []) {
  const columnMap = new Map(
    toArray(columns)
      .filter((column) => column?.key)
      .map((column) => [column.key, column]),
  );
  const normalizedKeys = normalizeOrderedKeys(order, extractColumnKeys(columns));

  return normalizedKeys
    .map((key) => columnMap.get(key))
    .filter(Boolean);
}

export function hasCustomColumnOrder(order = [], defaultOrder = []) {
  const normalizedDefault = normalizeOrderedKeys(defaultOrder, defaultOrder);
  const normalizedOrder = normalizeOrderedKeys(order, defaultOrder);
  return JSON.stringify(normalizedOrder) !== JSON.stringify(normalizedDefault);
}

export default {
  applyColumnOrder,
  extractColumnKeys,
  hasCustomColumnOrder,
  moveOrderedValue,
  normalizeOrderedKeys,
};
