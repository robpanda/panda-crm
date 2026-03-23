import test from 'node:test';
import assert from 'node:assert/strict';
import { pandaSignService } from '../pandaSignService.js';

test('buildTemplateDocumentText converts html sections into readable document text', async () => {
  const originalGetBrandingItems = pandaSignService.getBrandingItems;
  const originalBuildTemplateMergeData = pandaSignService.buildTemplateMergeData;

  pandaSignService.getBrandingItems = async () => ([
    {
      id: 'header-1',
      kind: 'HEADER',
      content: '<div><strong>{{territory.company_name}}</strong><br>{{territory.company_phone}}</div>',
      isActive: true,
    },
    {
      id: 'footer-1',
      kind: 'FOOTER',
      content: '<p>Footer {{territory.company_license}}</p>',
      isActive: true,
    },
  ]);

  pandaSignService.buildTemplateMergeData = async () => ({
    territory: {
      company_name: 'Panda Exteriors NJ',
      company_phone: '(555) 111-2222',
      company_license: 'LIC-99',
    },
    job: {
      customer: {
        name_full: 'Jane Doe',
      },
    },
    dynamic: {
      rescission_clause: '<p>Three business day rescission period.</p>',
    },
  });

  try {
    const output = await pandaSignService.buildTemplateDocumentText({
      content: '<h1>Contract</h1><p>Hello {{job.customer.name_full}}</p><ul><li>One</li><li>Two</li></ul><div>{{dynamic.rescission_clause}}</div>',
      signatureFields: {
        branding: {
          headerId: 'header-1',
          footerId: 'footer-1',
        },
      },
    });

    assert.match(output, /Panda Exteriors NJ/);
    assert.match(output, /\(555\) 111-2222/);
    assert.match(output, /Hello Jane Doe/);
    assert.match(output, /• One/);
    assert.match(output, /• Two/);
    assert.match(output, /Three business day rescission period\./);
    assert.match(output, /Footer LIC-99/);
    assert.equal(output.includes('<'), false);
  } finally {
    pandaSignService.getBrandingItems = originalGetBrandingItems;
    pandaSignService.buildTemplateMergeData = originalBuildTemplateMergeData;
  }
});

test('wrapText preserves paragraph breaks for document rendering', () => {
  const lines = pandaSignService.wrapText('Alpha beta gamma\n\nDelta epsilon zeta', 12);

  assert.deepEqual(lines, [
    'Alpha beta',
    'gamma',
    '',
    'Delta epsilon',
    'zeta',
  ]);
  assert.equal(lines[2], '');
});

test('buildTemplateDocumentText prefers mergeData templateContentOverride when provided', async () => {
  const originalGetBrandingItems = pandaSignService.getBrandingItems;
  const originalBuildTemplateMergeData = pandaSignService.buildTemplateMergeData;

  pandaSignService.getBrandingItems = async () => [];
  pandaSignService.buildTemplateMergeData = async (_template, mergeData) => ({
    ...mergeData,
    customerName: 'Jamie Customer',
  });

  try {
    const output = await pandaSignService.buildTemplateDocumentText(
      {
        content: '<p>Original body</p>',
        signatureFields: {},
      },
      {
        templateContentOverride: '<p>Edited {{customerName}} body</p>',
      }
    );

    assert.match(output, /Edited Jamie Customer body/);
    assert.doesNotMatch(output, /Original body/);
  } finally {
    pandaSignService.getBrandingItems = originalGetBrandingItems;
    pandaSignService.buildTemplateMergeData = originalBuildTemplateMergeData;
  }
});
