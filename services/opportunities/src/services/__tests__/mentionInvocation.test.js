import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const servicePath = path.resolve(process.cwd(), 'src/services/opportunityService.js');
const source = fs.readFileSync(servicePath, 'utf8');

test('opportunity mention dispatch is wired into note, reply, and internal comment entrypoints', () => {
  assert.match(source, /async\s+createOpportunityNote\([\s\S]*?notifyOpportunityMentions\(/, 'createOpportunityNote should dispatch mentions');
  assert.match(source, /async\s+addReplyWithMentions\([\s\S]*?notifyOpportunityMentions\(/, 'addReplyWithMentions should dispatch mentions');
  assert.match(source, /async\s+createOpportunityInternalComment\([\s\S]*?notifyOpportunityMentions\(/, 'createOpportunityInternalComment should dispatch mentions');
});
