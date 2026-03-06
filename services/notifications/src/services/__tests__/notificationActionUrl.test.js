import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationService } from '../notificationService.js';

const originalCrmUrl = process.env.CRM_APP_URL;
const originalAppUrl = process.env.APP_URL;

test.afterEach(() => {
  if (originalCrmUrl === undefined) {
    delete process.env.CRM_APP_URL;
  } else {
    process.env.CRM_APP_URL = originalCrmUrl;
  }

  if (originalAppUrl === undefined) {
    delete process.env.APP_URL;
  } else {
    process.env.APP_URL = originalAppUrl;
  }
});

test('resolveExternalActionUrl falls back to production CRM host when base url is invalid', () => {
  process.env.CRM_APP_URL = 'http://';
  delete process.env.APP_URL;

  const url = notificationService.resolveExternalActionUrl('/leads/cmmcdrzib001rvmxtmvha7yv7');
  assert.equal(url, 'https://crm.pandaadmin.com/leads/cmmcdrzib001rvmxtmvha7yv7');
});

test('resolveExternalActionUrl uses configured valid host for relative paths', () => {
  process.env.CRM_APP_URL = 'https://crm.pandaadmin.com/';
  delete process.env.APP_URL;

  const url = notificationService.resolveExternalActionUrl('jobs/cmmb66c8t0008ceawmg8z12gi');
  assert.equal(url, 'https://crm.pandaadmin.com/jobs/cmmb66c8t0008ceawmg8z12gi');
});

test('resolveExternalActionUrl preserves already absolute urls', () => {
  process.env.CRM_APP_URL = 'http://';
  const url = notificationService.resolveExternalActionUrl('https://crm.pandaadmin.com/leads/abc');
  assert.equal(url, 'https://crm.pandaadmin.com/leads/abc');
});
