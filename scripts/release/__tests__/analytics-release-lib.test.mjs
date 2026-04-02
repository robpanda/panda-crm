import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildArtifactClassification,
  classifySourceChanges,
  diffNormalizedArtifacts,
  globToRegExp,
  normalizeHashedPath,
  summarizeArtifactBlastRadius,
} from '../analytics-release-lib.mjs';

const policy = {
  allowedSourceGlobs: [
    'frontend/src/pages/Reports.jsx',
    'frontend/src/components/reports/**',
    'frontend/src/pages/analytics/**',
  ],
  allowedOutputGlobs: [
    'analytics/index.html',
    'analytics/manifest.json',
    'analytics/release-manifest.json',
    'analytics-assets/**',
  ],
  forbiddenOutputFamilies: [
    { label: 'root-html', globs: ['index.html'] },
    { label: 'root-assets', globs: ['assets/**'] },
  ],
};

test('normalizeHashedPath replaces hashed suffixes', () => {
  assert.equal(
    normalizeHashedPath('analytics-assets/index-B6z0ChsT.js'),
    'analytics-assets/index-[hash].js',
  );
  assert.equal(
    normalizeHashedPath('analytics-assets/vendor-core-BMUH4_c9.js'),
    'analytics-assets/vendor-core-[hash].js',
  );
});

test('globToRegExp handles nested globs', () => {
  const regex = globToRegExp('frontend/src/components/reports/**');
  assert.equal(regex.test('frontend/src/components/reports/charts/TableWidget.jsx'), true);
  assert.equal(regex.test('frontend/src/pages/Reports.jsx'), false);
});

test('diffNormalizedArtifacts ignores hash-only changes', () => {
  const diff = diffNormalizedArtifacts(
    ['analytics-assets/index-AAAA1111.js', 'analytics/index.html'],
    ['analytics-assets/index-BBBB2222.js', 'analytics/index.html'],
  );

  assert.deepEqual(diff, { added: [], removed: [] });
});

test('buildArtifactClassification flags non-analytics artifacts', () => {
  const classification = buildArtifactClassification(
    ['analytics/index.html', 'analytics-assets/index-AAAA1111.js', 'index.html', 'assets/index-BBBB2222.js'],
    policy,
  );

  assert.deepEqual(
    classification.map((entry) => [entry.relativePath, entry.status, entry.family]),
    [
      ['analytics/index.html', 'allowed', 'analytics'],
      ['analytics-assets/index-AAAA1111.js', 'allowed', 'analytics'],
      ['index.html', 'forbidden', 'root-html'],
      ['assets/index-BBBB2222.js', 'forbidden', 'root-assets'],
    ],
  );
});

test('classifySourceChanges blocks non-reporting files', () => {
  const result = classifySourceChanges(
    [
      'frontend/src/pages/Reports.jsx',
      'frontend/src/components/reports/charts/TableWidget.jsx',
      'frontend/src/pages/LeadDetail.jsx',
    ],
    policy,
  );

  assert.deepEqual(result.allowed, [
    'frontend/src/pages/Reports.jsx',
    'frontend/src/components/reports/charts/TableWidget.jsx',
  ]);
  assert.deepEqual(result.forbidden, ['frontend/src/pages/LeadDetail.jsx']);
});

test('summarizeArtifactBlastRadius allows first analytics cutover with empty baseline', () => {
  const result = summarizeArtifactBlastRadius(
    [],
    ['analytics/index.html', 'analytics-assets/index-AAAA1111.js'],
    policy,
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.forbiddenCurrent, []);
  assert.deepEqual(result.diff.added, [
    'analytics-assets/index-[hash].js',
    'analytics/index.html',
  ]);
});
