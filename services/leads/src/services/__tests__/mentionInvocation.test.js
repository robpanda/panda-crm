import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const servicePath = path.resolve(process.cwd(), 'src/services/leadService.js');
const source = fs.readFileSync(servicePath, 'utf8');

test('lead mention dispatch is wired into note and internal comment entrypoints', () => {
  assert.match(source, /async\s+addLeadNote\([\s\S]*?notifyLeadMentions\(/, 'addLeadNote should dispatch mentions');
  assert.match(source, /async\s+addLeadNoteReply\([\s\S]*?notifyLeadMentions\(/, 'addLeadNoteReply should dispatch mentions');
  assert.match(source, /async\s+createLeadInternalComment\([\s\S]*?notifyLeadMentions\(/, 'createLeadInternalComment should dispatch mentions');
});
