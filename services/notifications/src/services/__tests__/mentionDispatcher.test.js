import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchMentions, normalizeMentionRecipients } from '../mentionDispatcher.js';

test('normalizeMentionRecipients dedupes recipients and skips actor', () => {
  const result = normalizeMentionRecipients([
    'u1',
    { id: 'u2' },
    { userId: 'u2' },
    { userId: 'actor-1' },
    null,
  ], 'actor-1');

  assert.deepEqual(result.recipientIds.sort(), ['u1', 'u2']);
  assert.equal(result.skippedSelf, 1);
});

test('dispatchMentions creates notifications even when one recipient fails', async () => {
  const created = [];
  const notificationService = {
    async createFromTemplate(_type, userId, _data, _relations, options) {
      created.push({ userId, forceInApp: options?.forceInApp === true });
      if (userId === 'fail-user') {
        throw new Error('delivery failed downstream');
      }
      return { id: `notif-${userId}` };
    },
  };

  const result = await dispatchMentions({
    notificationService,
    actorId: 'actor-1',
    actorName: 'Actor User',
    recipients: ['ok-1', 'fail-user', 'ok-2', 'actor-1'],
    entityType: 'lead',
    entityId: 'lead-123',
    bodyPreview: 'Hello @team',
    actionPath: '/leads/lead-123',
    correlationId: 'corr-123',
  });

  assert.equal(result.attempted, 3);
  assert.equal(result.dispatched, 2);
  assert.equal(result.skippedSelf, 1);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].recipientId, 'fail-user');
  assert.ok(created.every((entry) => entry.forceInApp));
});

test('dispatchMentions returns empty result when no valid recipients', async () => {
  const notificationService = {
    async createFromTemplate() {
      throw new Error('should not be called');
    },
  };

  const result = await dispatchMentions({
    notificationService,
    actorId: 'u1',
    recipients: [{ id: 'u1' }, null, undefined],
    entityType: 'opportunity',
    entityId: 'opp-1',
  });

  assert.equal(result.attempted, 0);
  assert.equal(result.dispatched, 0);
  assert.equal(result.skippedSelf, 1);
  assert.deepEqual(result.notificationIds, []);
});
