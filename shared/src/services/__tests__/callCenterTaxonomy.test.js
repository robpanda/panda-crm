import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getCallCenterDispositionCanonicalCode,
  getCallCenterDispositionCompatibleCodes,
} from '../callCenterTaxonomy.js';

test('getCallCenterDispositionCompatibleCodes preserves legacy callback filters under the canonical value', () => {
  assert.deepEqual(
    getCallCenterDispositionCompatibleCodes('CALL_BACK'),
    ['CALL_BACK', 'CALLBACK', 'CALLBACK_REQUESTED', 'FOLLOW_UP_SPECIFIC_DATE', 'CALL_BACK_LATER']
  );

  assert.deepEqual(
    getCallCenterDispositionCompatibleCodes('CALLBACK_REQUESTED'),
    ['CALL_BACK', 'CALLBACK', 'CALLBACK_REQUESTED', 'FOLLOW_UP_SPECIFIC_DATE', 'CALL_BACK_LATER']
  );
});

test('getCallCenterDispositionCanonicalCode resolves legacy lead detail values to their canonical labels', () => {
  assert.equal(getCallCenterDispositionCanonicalCode('LEFT_VOICEMAIL'), 'VOICEMAIL');
  assert.equal(getCallCenterDispositionCanonicalCode('APPOINTMENT_SET'), 'SCHEDULED');
  assert.equal(getCallCenterDispositionCanonicalCode('NO_PROSPECT'), 'NO_VALUE');
});

test('getCallCenterDispositionCompatibleCodes falls back to the original storage code for unknown values', () => {
  assert.deepEqual(getCallCenterDispositionCompatibleCodes('OUT_OF_SCOPE'), ['OUT_OF_SCOPE']);
});
