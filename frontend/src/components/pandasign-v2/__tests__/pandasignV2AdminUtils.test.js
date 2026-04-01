import { describe, expect, it } from 'vitest';
import {
  buildTemplatePayload,
  extractMergeFields,
  normalizeTemplateDraft,
  renderTemplatePreview,
  validateTemplateDraft,
} from '../pandasignV2AdminUtils';

describe('pandasignV2AdminUtils', () => {
  it('extracts merge fields from template content', () => {
    expect(extractMergeFields('Hi {{job.customer.name_full}} {{dynamic.rescission_clause}}')).toEqual([
      'job.customer.name_full',
      'dynamic.rescission_clause',
    ]);
  });

  it('fails validation when publish requirements are missing', () => {
    const result = validateTemplateDraft({
      name: '',
      content: '',
      branding: { headerId: '', footerId: '' },
    }, {
      brandingItems: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Template name is required.');
    expect(result.errors).toContain('Template body content is required.');
    expect(result.errors).toContain('A header must be selected.');
    expect(result.errors).toContain('A footer must be selected.');
  });

  it('builds a template payload with document type category and merge fields', () => {
    const payload = buildTemplatePayload({
      name: 'NJ Contract',
      documentType: 'CONTRACT',
      territory: 'NJ',
      pageLayout: {
        pageSize: 'LEGAL',
        orientation: 'LANDSCAPE',
        margins: {
          top: 1,
          right: 0.5,
          bottom: 0.75,
          left: 1.25,
        },
      },
      branding: { headerId: 'hdr-1', footerId: 'ftr-1' },
      signerRoles: [{ role: 'CUSTOMER', label: 'Customer', required: true, order: 1 }],
      content: '<p>{{job.customer.name_full}} {{territory.company_phone}}</p>',
    });

    expect(payload.category).toBe('CONTRACT');
    expect(payload.mergeFields).toEqual([
      'job.customer.name_full',
      'territory.company_phone',
    ]);
    expect(payload.pageLayout).toEqual({
      pageSize: 'LEGAL',
      orientation: 'LANDSCAPE',
      margins: {
        top: 1,
        right: 0.5,
        bottom: 0.75,
        left: 1.25,
      },
    });
  });

  it('renders preview using territory and dynamic content replacements', () => {
    const html = renderTemplatePreview({
      name: 'PA Contract',
      territory: 'PA',
      content: '<p>{{territory.company_phone}}</p><div>{{dynamic.rescission_clause}}</div>',
    }, {
      brandingItems: [],
      dynamicContentItems: [
        {
          id: 'dyn-1',
          key: 'rescission_clause',
          name: 'Rescission Clause',
          territory: 'PA',
          content: '<p>PA rescission language</p>',
          isActive: true,
        },
      ],
      territoryProfiles: [
        {
          id: 'territory-pa',
          territory: 'PA',
          company_phone: '(215) 555-1212',
          company_address: '123 Market St',
          company_email: 'pa@example.com',
          company_name: 'Panda Exteriors PA',
          company_license: 'LIC-1',
        },
      ],
    });

    expect(html).toContain('(215) 555-1212');
    expect(html).toContain('PA rescission language');
  });

  it('renders order contract tokens in the admin preview', () => {
    const html = renderTemplatePreview({
      name: 'Contract',
      territory: 'PA',
      content: [
        '<p>{{projectName}}</p>',
        '<p>{{orderContract.overview.customerName}}</p>',
        '<p>{{orderContract.pricing.contractAmount}}</p>',
        '<div>{{orderContract.pricing.lineItemsHtml}}</div>',
        '<p>{{orderContract.signers.agent.email}}</p>',
      ].join(''),
    }, {
      brandingItems: [],
      dynamicContentItems: [],
      territoryProfiles: [],
    });

    expect(html).toContain('Kitchen Renovation Agreement');
    expect(html).toContain('Jamie Customer');
    expect(html).toContain('$15,250.00');
    expect(html).toContain('Premium Roofing Package');
    expect(html).toContain('alex@pandaexteriors.com');
  });

  it('normalizes page layout defaults for template drafts', () => {
    const draft = normalizeTemplateDraft({
      name: 'Layout Test',
      pageLayout: {
        pageSize: 'legal',
        orientation: 'landscape',
        margins: {
          top: 1,
          right: '0.5',
          bottom: 0.25,
          left: 3,
        },
      },
    });

    expect(draft.pageLayout).toEqual({
      pageSize: 'LEGAL',
      orientation: 'LANDSCAPE',
      margins: {
        top: 1,
        right: 0.5,
        bottom: 0.25,
        left: 2.5,
      },
    });
  });
});
