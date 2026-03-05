import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addRecentItem, getRecentItems } from '../recentItems';

function createStorageMock() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe('recentItems utility', () => {
  beforeEach(() => {
    global.window = { localStorage: createStorageMock() };
  });

  afterEach(() => {
    delete global.window;
  });

  it('normalizes legacy lead item shape and enforces 10-item max on read', () => {
    const legacyItems = Array.from({ length: 12 }).map((_, index) => ({
      id: `lead-${index}`,
      title: `Legacy Lead ${index}`,
      subtitle: `meta-${index}`,
      url: `/leads/lead-${index}`,
    }));

    window.localStorage.setItem('recent:leads:user-1', JSON.stringify(legacyItems));
    const items = getRecentItems('leads', 'user-1');

    expect(items).toHaveLength(10);
    expect(items[0]).toMatchObject({
      id: 'lead-0',
      label: 'Legacy Lead 0',
      meta: 'meta-0',
      path: '/leads/lead-0',
    });
  });

  it('dedupes and keeps newest item first when adding recents', () => {
    for (let i = 0; i < 12; i += 1) {
      addRecentItem('jobs', 'user-2', {
        id: `job-${i}`,
        label: `Job ${i}`,
        path: `/jobs/job-${i}`,
      });
    }

    let items = getRecentItems('jobs', 'user-2');
    expect(items).toHaveLength(10);
    expect(items[0].id).toBe('job-11');
    expect(items[9].id).toBe('job-2');

    addRecentItem('jobs', 'user-2', {
      id: 'job-5',
      label: 'Job 5 updated',
      path: '/jobs/job-5',
    });

    items = getRecentItems('jobs', 'user-2');
    expect(items).toHaveLength(10);
    expect(items[0]).toMatchObject({
      id: 'job-5',
      label: 'Job 5 updated',
      path: '/jobs/job-5',
    });
    expect(items.filter((item) => item.id === 'job-5')).toHaveLength(1);
  });
});
