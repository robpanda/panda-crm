import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSalesRabbitLeadInput,
  extractProvidedSecret,
  getExpectedSecrets,
  isTrustedSalesRabbitAppRequest,
  pickFirstValue,
  shouldRequireSalesRabbitSecret,
  validateSalesRabbitLeadInput,
} from '../salesRabbitWebhookHelpers.js';

test('extractProvidedSecret accepts query token form used by SalesRabbit webhook URL', () => {
  const secret = extractProvidedSecret({
    query: { token: 'shared-token' },
    headers: {},
    body: {},
  });

  assert.equal(secret, 'shared-token');
});

test('extractProvidedSecret accepts ApiKey authorization header variants', () => {
  const direct = extractProvidedSecret({
    headers: { authorization: 'ApiKey direct-secret' },
    body: {},
  });
  const forwarded = extractProvidedSecret({
    headers: { 'x-forwarded-authorization': 'ApiKey forwarded-secret' },
    body: {},
  });

  assert.equal(direct, 'direct-secret');
  assert.equal(forwarded, 'forwarded-secret');
});

test('getExpectedSecrets collects configured secret aliases without blanks', () => {
  const secrets = getExpectedSecrets({
    SALESRABBIT_WEBHOOK_SECRET: 'one',
    SALESRABBIT_API_KEY: 'two',
    SALESRABBIT_WEBHOOK_TOKEN: '',
    SALESRABBIT_SECRET: 'three',
    SALESRABBIT_TOKEN: null,
    WEBHOOK_SECRET: 'four',
    INTERNAL_API_KEY: 'five',
  });

  assert.deepEqual(secrets, ['one', 'two', 'three', 'four', 'five']);
});

test('trusted SalesRabbit app requests can be accepted without a secret', () => {
  const trusted = isTrustedSalesRabbitAppRequest({
    headers: { 'user-agent': 'mint/1.5.1' },
    body: {
      leadId: 'sr-123',
      formData: {
        Name: 'Rabbit Test',
        EmailAddress: 'rabbit@example.com',
      },
    },
  });

  assert.equal(trusted, true);
});

test('trusted app fallback can be disabled with SALESRABBIT_REQUIRE_SECRET', () => {
  assert.equal(shouldRequireSalesRabbitSecret({ SALESRABBIT_REQUIRE_SECRET: 'true' }), true);

  const trusted = isTrustedSalesRabbitAppRequest({
    headers: { 'user-agent': 'mint/1.5.1' },
    body: {
      leadId: 'sr-123',
      formData: {
        Name: 'Rabbit Test',
        EmailAddress: 'rabbit@example.com',
      },
    },
  }, { SALESRABBIT_REQUIRE_SECRET: 'true' });

  assert.equal(trusted, false);
});

test('generic headerless requests are still rejected by trusted app detection', () => {
  const trusted = isTrustedSalesRabbitAppRequest({
    headers: { 'user-agent': 'curl/8.7.1' },
    body: {
      email: 'bad@example.com',
      firstName: 'Bad',
    },
  });

  assert.equal(trusted, false);
});

test('pickFirstValue handles empty path alias checks without treating blanks as valid', () => {
  assert.equal(pickFirstValue('', '  ', '/webhook'), '/webhook');
});

test('buildSalesRabbitLeadInput normalizes common SalesRabbit payload variants', () => {
  const payload = buildSalesRabbitLeadInput({
    leadId: 'sr-123',
    formData: {
      Name: 'Eddie Whelan',
      EmailAddress: 'EDDIE@Example.com',
      phonePrimary: '555-1111',
      streetAddress: '123 Main St',
      city: 'Baltimore',
      state: 'MD',
      zipCode: '21201',
      source: 'Canvassing',
      retailInsurance: 'Insurance',
      ShingleType: 'Architectural',
      note: 'Door knock lead',
      selfGen: 'yes',
      repEmail: 'rep@example.com',
    },
  });

  assert.equal(payload.salesRabbitId, 'sr-123');
  assert.equal(payload.firstName, 'Eddie');
  assert.equal(payload.lastName, 'Whelan');
  assert.equal(payload.email, 'eddie@example.com');
  assert.equal(payload.phone, '555-1111');
  assert.equal(payload.street, '123 Main St');
  assert.equal(payload.city, 'Baltimore');
  assert.equal(payload.state, 'MD');
  assert.equal(payload.postalCode, '21201');
  assert.equal(payload.source, 'Canvassing');
  assert.equal(payload.workType, 'Insurance');
  assert.equal(payload.salesRabbitUser, 'rep@example.com');
  assert.equal(payload.isSelfGen, true);
  assert.match(payload.leadNotes, /SalesRabbit ID: sr-123/);
  assert.match(payload.leadNotes, /Shingle Type: Architectural/);
  assert.match(payload.leadNotes, /Door knock lead/);
});

test('validateSalesRabbitLeadInput requires name and at least one contact method', () => {
  assert.equal(
    validateSalesRabbitLeadInput({ firstName: null, lastName: null, email: null, phone: null, mobilePhone: null }),
    'First name or last name is required',
  );

  assert.equal(
    validateSalesRabbitLeadInput({ firstName: 'Rob', lastName: null, email: null, phone: null, mobilePhone: null }),
    'At least one contact method is required',
  );

  assert.equal(
    validateSalesRabbitLeadInput({ firstName: 'Rob', lastName: null, email: 'rob@example.com', phone: null, mobilePhone: null }),
    null,
  );
});
