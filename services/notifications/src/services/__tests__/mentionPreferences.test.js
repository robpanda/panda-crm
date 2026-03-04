import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const servicePath = path.resolve(process.cwd(), 'src/services/notificationService.js');
const source = fs.readFileSync(servicePath, 'utf8');

test('mention channel gating includes smsMentions toggle', () => {
  assert.match(source, /mentionPrefs\.smsMentions/);
  assert.match(source, /\(!isMention \|\| mentionChannelPrefs\.sms !== false\)/);
});

test('mention channel gating includes pushMentions and emailMentions toggles', () => {
  assert.match(source, /mentionPrefs\.pushMentions/);
  assert.match(source, /mentionPrefs\.emailMentions/);
});

test('SMS delivery guard requires recipient mobilePhone', () => {
  assert.match(source, /if\s*\(!user\?\.mobilePhone\)\s*\{[\s\S]*?return false;/);
});
