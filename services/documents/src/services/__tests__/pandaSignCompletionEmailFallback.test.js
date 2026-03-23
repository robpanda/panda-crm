import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sendCompletionEmailsSafely,
  sendHostSigningCompletionEmailsSafely,
} from '../pandaSignService.js';

test('sendCompletionEmailsSafely returns ok=true when email delivery succeeds', async () => {
  let called = 0;
  const loggerInstance = {
    warn() {
      throw new Error('warn should not be called on success');
    },
  };

  const result = await sendCompletionEmailsSafely({
    sendCompletionEmails: async () => {
      called += 1;
    },
    agreement: { id: 'agreement-1' },
    signature: { id: 'signature-1' },
    loggerInstance,
  });

  assert.equal(called, 1);
  assert.equal(result.ok, true);
  assert.equal('error' in result, false);
});

test('sendCompletionEmailsSafely swallows delivery failures and logs a warning', async () => {
  const error = new Error('Email address is not verified');
  const warnings = [];

  const result = await sendCompletionEmailsSafely({
    sendCompletionEmails: async () => {
      throw error;
    },
    agreement: { id: 'agreement-2' },
    signature: { id: 'signature-2' },
    loggerInstance: {
      warn(message) {
        warnings.push(message);
      },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, error);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /agreement-2/i);
  assert.match(warnings[0], /Email address is not verified/);
});

test('sendHostSigningCompletionEmailsSafely returns ok=true when email delivery succeeds', async () => {
  let called = 0;
  const loggerInstance = {
    warn() {
      throw new Error('warn should not be called on success');
    },
  };

  const result = await sendHostSigningCompletionEmailsSafely({
    sendHostSigningCompletionEmails: async () => {
      called += 1;
    },
    agreement: { id: 'agreement-3' },
    hostSignature: { id: 'signature-3' },
    loggerInstance,
  });

  assert.equal(called, 1);
  assert.equal(result.ok, true);
  assert.equal('error' in result, false);
});

test('sendHostSigningCompletionEmailsSafely swallows delivery failures and logs a warning', async () => {
  const error = new Error('Email address is not verified');
  const warnings = [];

  const result = await sendHostSigningCompletionEmailsSafely({
    sendHostSigningCompletionEmails: async () => {
      throw error;
    },
    agreement: { id: 'agreement-4' },
    hostSignature: { id: 'signature-4' },
    loggerInstance: {
      warn(message) {
        warnings.push(message);
      },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, error);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /agreement-4/i);
  assert.match(warnings[0], /Email address is not verified/);
});
