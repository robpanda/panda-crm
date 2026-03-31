import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAgreementRecord } from '../pandaSignService.js';

test('normalizeAgreementRecord maps agreement relation aliases and snake_case ids', () => {
  const normalized = normalizeAgreementRecord({
    id: 'agreement-1',
    opportunity_id: 'opp-1',
    account_id: 'acct-1',
    contact_id: 'contact-1',
    opportunities: { id: 'opp-1', name: 'Test Job' },
    accounts: { id: 'acct-1', name: 'Test Account' },
    contacts: { id: 'contact-1', email: 'customer@example.com' },
  });

  assert.equal(normalized.opportunityId, 'opp-1');
  assert.equal(normalized.accountId, 'acct-1');
  assert.equal(normalized.contactId, 'contact-1');
  assert.deepEqual(normalized.opportunity, { id: 'opp-1', name: 'Test Job' });
  assert.deepEqual(normalized.account, { id: 'acct-1', name: 'Test Account' });
  assert.deepEqual(normalized.contact, { id: 'contact-1', email: 'customer@example.com' });
});
