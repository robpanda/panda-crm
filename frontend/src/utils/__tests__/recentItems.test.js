import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addRecentItem, getRecentItems } from '../recentItems';

function createLocalStorageMock() {
  const store = new Map();

  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    clear() {
      store.clear();
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

describe('recentItems', () => {
  beforeEach(() => {
    global.window = {
      localStorage: createLocalStorageMock(),
    };
  });

  afterEach(() => {
    delete global.window;
  });

  it('stores recent items across CRM and Cognito identity aliases', () => {
    const user = {
      id: 'crm-user-id',
      cognitoId: 'cognito-sub',
      email: 'Rob.Winters@PandaExteriors.com',
    };

    addRecentItem('jobs', user, {
      id: 'job-1',
      label: 'Job One',
      path: '/jobs/job-1',
    });

    expect(getRecentItems('jobs', { id: 'crm-user-id' })).toHaveLength(1);
    expect(getRecentItems('jobs', { cognitoId: 'cognito-sub' })).toHaveLength(1);
    expect(getRecentItems('jobs', { email: 'rob.winters@pandaexteriors.com' })).toHaveLength(1);
  });

  it('deduplicates merged recent lists by item id and keeps newest items first', () => {
    const user = {
      id: 'crm-user-id',
      userId: 'legacy-user-id',
    };

    addRecentItem('leads', { id: 'crm-user-id' }, {
      id: 'lead-1',
      label: 'Lead One',
      path: '/leads/lead-1',
    });

    addRecentItem('leads', { userId: 'legacy-user-id' }, {
      id: 'lead-2',
      label: 'Lead Two',
      path: '/leads/lead-2',
    });

    addRecentItem('leads', { id: 'crm-user-id' }, {
      id: 'lead-1',
      label: 'Lead One Updated',
      path: '/leads/lead-1',
    });

    const items = getRecentItems('leads', user);
    expect(items.map((item) => item.id)).toEqual(['lead-1', 'lead-2']);
    expect(items[0].label).toBe('Lead One Updated');
  });
});
