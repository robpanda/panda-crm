import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const servicePath = path.resolve(process.cwd(), 'src/services/notificationService.js');
const source = fs.readFileSync(servicePath, 'utf8');

test('mention SMS appends action link when available', () => {
  assert.match(source, /notification\.type === 'MENTION'/);
  assert.match(source, /View:\s*\$\{actionUrl\}/);
});

test('relative action URLs are resolved to CRM base URL', () => {
  assert.match(source, /resolveActionUrl\(actionUrl\)/);
  assert.match(source, /if\s*\(value\.startsWith\('\/'\)\)\s*return\s*`\$\{CRM_BASE_URL\}\$\{value\}`;/);
});
