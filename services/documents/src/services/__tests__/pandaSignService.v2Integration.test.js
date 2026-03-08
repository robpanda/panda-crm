import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { buildPageNumberLabel } from '../pandaSignV2PdfService.js';
import { resolveSignaturePlacement } from '../pandaSignV2PdfBurnInService.js';

const servicePath = path.resolve(process.cwd(), 'src/services/pandaSignService.js');
const routesPath = path.resolve(process.cwd(), 'src/routes/agreements.js');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('service integration wires preview report fields additively into token fetch flows', () => {
  const source = read(servicePath);

  const previewAssignments = source.match(/agreement\.previewReport\s*=\s*buildPipelinePreviewArtifacts\(agreement\);/g) || [];
  assert.equal(previewAssignments.length >= 2, true);
  assert.match(source, /const previewReport = buildPipelinePreviewArtifacts\(\{/);
  assert.match(source, /previewReport,/);
});

test('role isolation keeps CUSTOMER and AGENT selection independent in integration logic', () => {
  const source = read(servicePath);

  assert.match(source, /buildRoleIsolatedFieldSet\(normalizedFields,\s*normalizedRole\)/);
  assert.match(source, /if\s*\(normalizedRole\s*===\s*SIGNER_ROLE\.CUSTOMER\)\s*\{/);
  assert.match(source, /Customer fallback must never use AGENT placeholders\./);
  assert.match(source, /field\.role\s*!==\s*SIGNER_ROLE\.AGENT/);
});

test('page numbering integration uses fallback helper and never renders 0 of 0 label', () => {
  const source = read(servicePath);

  assert.match(source, /const label = resolvePipelinePageNumberLabel\(index \+ 1,\s*pages\.length\);/);
  assert.equal(buildPageNumberLabel(2, 0), 'Page 2');
  assert.equal(buildPageNumberLabel(1, null), 'Page 1');
  assert.equal(buildPageNumberLabel(1, 3), 'Page 1 of 3');
  assert.equal(buildPageNumberLabel(1, 0).includes('0 of 0'), false);
});

test('drift handling is advisory normalization and returns placement report without hard rejection', () => {
  const source = read(servicePath);

  assert.match(source, /resolveSignaturePlacementForPipeline\(/);
  assert.match(source, /placementReport:\s*signatureEmbed\.placementReport/);
  assert.equal(/driftExceeded[\s\S]*throw\s+new\s+Error/.test(source), false);

  const normalized = resolveSignaturePlacement({
    expectedRect: { x: 100, y: 150, w: 200, h: 50, page: 1 },
    submittedRect: { x: 400, y: 330, w: 320, h: 120, page: 2 },
  });
  assert.equal(normalized.snapped, true);
  assert.equal(normalized.placement.x, 100);
  assert.equal(normalized.placement.page, 1);
});

test('routes keep existing shapes and only add new integration fields', () => {
  const source = read(routesPath);

  assert.match(source, /const \{ signatureData, signerName, signerEmail, signatureRect \} = req\.body;/);
  assert.match(source, /signatureRect,/);
  assert.match(source, /placementReport:\s*result\.placementReport\s*\|\|\s*null/);
  assert.match(source, /fieldMapReport:\s*agreement\.previewReport\?\.fieldMapReport/);
  assert.match(source, /checklist:\s*agreement\.previewReport\?\.checklist/);
});
