import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTemplateForPublishPayload } from '../validationService.js';

test('rejects checklist template publish when sections are missing', () => {
  assert.throws(
    () => validateTemplateForPublishPayload({ templateType: 'CHECKLIST', structure: {} }),
    /at least one section/
  );
});

test('rejects report template publish when configJson is missing', () => {
  assert.throws(
    () => validateTemplateForPublishPayload({ templateType: 'REPORT', configJson: null }),
    /require configJson/
  );
});

test('accepts valid checklist template publish payload', () => {
  assert.doesNotThrow(() => validateTemplateForPublishPayload({
    templateType: 'CHECKLIST',
    structure: { sections: [{ name: 'Roof' }] },
  }));
});
