export const PANDASIGN_TERRITORIES = ['DE', 'MD', 'NJ', 'PA', 'NC', 'VA', 'FL', 'DEFAULT'];
export const PANDASIGN_DOCUMENT_TYPES = ['CONTRACT', 'CHANGE_ORDER', 'WORK_ORDER', 'FINANCING', 'OTHER'];
export const PANDASIGN_TEMPLATE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
export const DEFAULT_SIGNER_ROLES = [
  { role: 'CUSTOMER', label: 'Customer', required: true, order: 1 },
  { role: 'AGENT', label: 'Agent', required: true, order: 2 },
];
export const DEFAULT_REQUIRED_FIELD_TYPES = ['TEXT', 'DATE', 'CHECKBOX', 'SIGNATURE', 'INITIAL'];
export const DEFAULT_DYNAMIC_CONTENT_ITEM = {
  key: 'rescission_clause',
  name: 'Rescission Clause',
  territory: 'DEFAULT',
  content: '',
  description: '',
  isActive: true,
};
export const PANDASIGN_PAGE_SIZES = [
  { value: 'LETTER', label: 'Letter (8.5 x 11 in)' },
  { value: 'LEGAL', label: 'Legal (8.5 x 14 in)' },
  { value: 'A4', label: 'A4 (210 x 297 mm)' },
];
export const PANDASIGN_PAGE_ORIENTATIONS = [
  { value: 'PORTRAIT', label: 'Portrait' },
  { value: 'LANDSCAPE', label: 'Landscape' },
];
export const DEFAULT_TEMPLATE_PAGE_LAYOUT = {
  pageSize: 'LETTER',
  orientation: 'PORTRAIT',
  margins: {
    top: 0.75,
    right: 0.75,
    bottom: 0.75,
    left: 0.75,
  },
};
export const DEFAULT_TEMPLATE_DRAFT = {
  name: '',
  description: '',
  documentType: 'CONTRACT',
  territory: 'DEFAULT',
  status: 'DRAFT',
  content: '',
  pageLayout: DEFAULT_TEMPLATE_PAGE_LAYOUT,
  signerRoles: DEFAULT_SIGNER_ROLES,
  requiredFieldsConfig: [],
  branding: { headerId: '', footerId: '' },
  dynamicContentRefs: ['rescission_clause'],
  signatureFields: [],
  mergeFields: [],
};

export const TOKEN_GROUPS = [
  {
    label: 'Customer / Job',
    tokens: [
      '{{job.customer.name_full}}',
      '{{job.address.full}}',
      '{{job.number}}',
      '{{job.customer.email}}',
      '{{job.customer.phone}}',
    ],
  },
  {
    label: 'Contract Quick Fields',
    tokens: [
      '{{projectName}}',
      '{{projectAddress}}',
      '{{jobNumber}}',
      '{{contractDate}}',
      '{{effectiveDate}}',
      '{{contractAmount}}',
      '{{depositAmount}}',
      '{{financedAmount}}',
      '{{scopeOfWork}}',
      '{{lineItemsText}}',
      '{{lineItemsHtml}}',
      '{{salesRepName}}',
      '{{salesRepEmail}}',
      '{{salesRepPhone}}',
    ],
  },
  {
    label: 'Order Contract Overview',
    tokens: [
      '{{orderContract.overview.documentType}}',
      '{{orderContract.overview.territory}}',
      '{{orderContract.overview.projectName}}',
      '{{orderContract.overview.jobNumber}}',
      '{{orderContract.overview.projectAddress}}',
      '{{orderContract.overview.contractDate}}',
      '{{orderContract.overview.effectiveDate}}',
      '{{orderContract.overview.customerName}}',
      '{{orderContract.overview.customerEmail}}',
      '{{orderContract.overview.customerPhone}}',
      '{{orderContract.overview.salesRepName}}',
      '{{orderContract.overview.salesRepEmail}}',
      '{{orderContract.overview.salesRepPhone}}',
      '{{orderContract.overview.salesRepTitle}}',
      '{{orderContract.overview.notes}}',
    ],
  },
  {
    label: 'Order Contract Pricing',
    tokens: [
      '{{orderContract.pricing.contractAmount}}',
      '{{orderContract.pricing.depositAmount}}',
      '{{orderContract.pricing.financedAmount}}',
      '{{orderContract.pricing.scopeOfWork}}',
      '{{orderContract.pricing.lineItemsText}}',
      '{{orderContract.pricing.lineItemsHtml}}',
    ],
  },
  {
    label: 'Order Contract Signers',
    tokens: [
      '{{orderContract.signers.customer.name}}',
      '{{orderContract.signers.customer.email}}',
      '{{orderContract.signers.customer.phone}}',
      '{{orderContract.signers.customer.title}}',
      '{{orderContract.signers.agent.name}}',
      '{{orderContract.signers.agent.email}}',
      '{{orderContract.signers.agent.phone}}',
      '{{orderContract.signers.agent.title}}',
    ],
  },
  {
    label: 'Territory',
    tokens: [
      '{{territory.company_name}}',
      '{{territory.company_phone}}',
      '{{territory.company_address}}',
      '{{territory.company_email}}',
      '{{territory.company_license}}',
    ],
  },
  {
    label: 'Organization',
    tokens: [
      '{{organization.name}}',
      '{{organization.phone}}',
      '{{organization.address}}',
    ],
  },
  {
    label: 'Dynamic Content',
    tokens: [
      '{{dynamic.rescission_clause}}',
    ],
  },
  {
    label: 'Signature Placeholders',
    tokens: [
      '{{signatures.customer.signature}}',
      '{{signatures.customer.initials}}',
      '{{signatures.agent.signature}}',
      '{{signatures.agent.initials}}',
    ],
  },
];

export function normalizeApiList(payload) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
}

export function normalizeApiObject(payload) {
  if (payload?.data && typeof payload.data === 'object') return payload.data;
  return payload || null;
}

export function extractMergeFields(content = '') {
  const matches = String(content).match(/\{\{[^}]+\}\}/g) || [];
  return [...new Set(matches.map((match) => match.slice(2, -2).trim()).filter(Boolean))];
}

function normalizeMarginValue(value, fallback) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(2.5, Math.max(0, Math.round(numericValue * 100) / 100));
}

export function normalizeTemplatePageLayout(pageLayout = {}) {
  const margins = pageLayout?.margins || {};
  const pageSize = String(pageLayout?.pageSize || DEFAULT_TEMPLATE_PAGE_LAYOUT.pageSize).trim().toUpperCase();
  const orientation = String(pageLayout?.orientation || DEFAULT_TEMPLATE_PAGE_LAYOUT.orientation).trim().toUpperCase();

  return {
    pageSize: PANDASIGN_PAGE_SIZES.some((item) => item.value === pageSize)
      ? pageSize
      : DEFAULT_TEMPLATE_PAGE_LAYOUT.pageSize,
    orientation: PANDASIGN_PAGE_ORIENTATIONS.some((item) => item.value === orientation)
      ? orientation
      : DEFAULT_TEMPLATE_PAGE_LAYOUT.orientation,
    margins: {
      top: normalizeMarginValue(margins.top, DEFAULT_TEMPLATE_PAGE_LAYOUT.margins.top),
      right: normalizeMarginValue(margins.right, DEFAULT_TEMPLATE_PAGE_LAYOUT.margins.right),
      bottom: normalizeMarginValue(margins.bottom, DEFAULT_TEMPLATE_PAGE_LAYOUT.margins.bottom),
      left: normalizeMarginValue(margins.left, DEFAULT_TEMPLATE_PAGE_LAYOUT.margins.left),
    },
  };
}

export function normalizeTemplateDraft(template = {}) {
  return {
    ...DEFAULT_TEMPLATE_DRAFT,
    ...template,
    documentType: template.documentType || template.category || DEFAULT_TEMPLATE_DRAFT.documentType,
    territory: template.territory || DEFAULT_TEMPLATE_DRAFT.territory,
    status: template.status || DEFAULT_TEMPLATE_DRAFT.status,
    content: template.content || '',
    pageLayout: normalizeTemplatePageLayout(template.pageLayout),
    signerRoles: normalizeSignerRoles(template.signerRoles),
    requiredFieldsConfig: normalizeRequiredFieldsConfig(template.requiredFieldsConfig),
    branding: {
      headerId: template.branding?.headerId || '',
      footerId: template.branding?.footerId || '',
    },
    dynamicContentRefs: Array.isArray(template.dynamicContentRefs) ? template.dynamicContentRefs : DEFAULT_TEMPLATE_DRAFT.dynamicContentRefs,
    signatureFields: Array.isArray(template.signatureFields) ? template.signatureFields : [],
    mergeFields: Array.isArray(template.mergeFields) ? template.mergeFields : extractMergeFields(template.content || ''),
  };
}

export function normalizeSignerRoles(signerRoles) {
  const roles = Array.isArray(signerRoles) && signerRoles.length > 0 ? signerRoles : DEFAULT_SIGNER_ROLES;
  return roles.map((role, index) => ({
    id: role.id || `signer-role-${index + 1}`,
    role: String(role.role || role || '').trim().toUpperCase() || `SIGNER_${index + 1}`,
    label: String(role.label || role.role || role || `Signer ${index + 1}`).trim(),
    required: role.required !== false,
    order: Number.isFinite(Number(role.order)) ? Number(role.order) : index + 1,
  }));
}

export function normalizeRequiredFieldsConfig(requiredFieldsConfig) {
  if (!Array.isArray(requiredFieldsConfig)) return [];
  return requiredFieldsConfig
    .map((field, index) => {
      if (!field || typeof field !== 'object') return null;
      const role = String(field.role || '').trim().toUpperCase();
      const type = String(field.type || '').trim().toUpperCase();
      const label = String(field.label || field.name || '').trim();
      if (!role || !type || !label) return null;
      return {
        id: field.id || `required-field-${index + 1}`,
        role,
        type,
        label,
        required: field.required !== false,
      };
    })
    .filter(Boolean);
}

export function validateTemplateDraft(template, resources = {}) {
  const draft = normalizeTemplateDraft(template);
  const errors = [];
  const brandingItems = normalizeApiList(resources.brandingItems || resources?.data?.brandingItems || resources.branding || []);

  if (!draft.name.trim()) errors.push('Template name is required.');
  if (!draft.content.trim()) errors.push('Template body content is required.');
  if (!draft.documentType) errors.push('Document type is required.');
  if (!draft.territory) errors.push('Territory is required.');
  if (!draft.branding.headerId) errors.push('A header must be selected.');
  if (!draft.branding.footerId) errors.push('A footer must be selected.');
  if (!draft.signerRoles.length) errors.push('At least one signer role is required.');
  if (!PANDASIGN_PAGE_SIZES.some((item) => item.value === draft.pageLayout.pageSize)) {
    errors.push('A valid page size is required.');
  }
  if (!PANDASIGN_PAGE_ORIENTATIONS.some((item) => item.value === draft.pageLayout.orientation)) {
    errors.push('A valid page orientation is required.');
  }

  Object.entries(draft.pageLayout.margins || {}).forEach(([side, value]) => {
    if (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 2.5) {
      errors.push(`${side.charAt(0).toUpperCase()}${side.slice(1)} margin must be between 0 and 2.5 inches.`);
    }
  });

  const header = brandingItems.find((item) => item.id === draft.branding.headerId && item.kind === 'HEADER' && item.isActive !== false);
  const footer = brandingItems.find((item) => item.id === draft.branding.footerId && item.kind === 'FOOTER' && item.isActive !== false);
  if (!header && draft.branding.headerId) errors.push('Selected header is not valid.');
  if (!footer && draft.branding.footerId) errors.push('Selected footer is not valid.');

  if (!Array.isArray(draft.requiredFieldsConfig)) {
    errors.push('Required field configuration is invalid.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function buildTemplatePayload(template) {
  const draft = normalizeTemplateDraft(template);
  return {
    ...draft,
    category: draft.documentType,
    mergeFields: extractMergeFields(draft.content),
  };
}

export function getTokenLabel(token) {
  return token.replace(/\{\{|\}\}/g, '');
}

export function renderTemplatePreview(template, resources = {}, sampleMergeData = {}) {
  const draft = normalizeTemplateDraft(template);
  const previewLayout = normalizeTemplatePageLayout(draft.pageLayout);
  const brandingItems = normalizeApiList(resources.brandingItems || []);
  const dynamicContentItems = normalizeApiList(resources.dynamicContentItems || []);
  const territoryProfiles = normalizeApiList(resources.territoryProfiles || []);
  const territoryProfile = territoryProfiles.find((item) => item.territory === draft.territory)
    || territoryProfiles.find((item) => item.territory === 'DEFAULT')
    || {};

  const replacements = {
    orderContract: {
      overview: {
        documentType: 'CONTRACT',
        territory: draft.territory || 'DEFAULT',
        projectName: 'Kitchen Renovation Agreement',
        jobNumber: 'JOB-1001',
        projectAddress: '123 Panda Way, Philadelphia, PA',
        contractDate: '03/23/2026',
        effectiveDate: '03/24/2026',
        customerName: 'Jamie Customer',
        customerEmail: 'jamie@example.com',
        customerPhone: '(555) 867-5309',
        salesRepName: 'Alex Advisor',
        salesRepEmail: 'alex@pandaexteriors.com',
        salesRepPhone: '(215) 555-0101',
        salesRepTitle: 'Sales Representative',
        notes: 'Install premium materials and complete final walkthrough with customer.',
      },
      pricing: {
        contractAmount: '$15,250.00',
        depositAmount: '$2,500.00',
        financedAmount: '$12,750.00',
        scopeOfWork: 'Remove existing materials, install new system, and complete cleanup.',
        lineItemsText: 'Premium Roofing Package - Qty: 1 - Total: $15,250.00',
        lineItemsHtml: '<ul><li><strong>Premium Roofing Package</strong> - Qty: 1 | Total: $15,250.00</li></ul>',
      },
      signers: {
        customer: {
          name: 'Jamie Customer',
          email: 'jamie@example.com',
          phone: '(555) 867-5309',
          title: 'Homeowner',
        },
        agent: {
          name: 'Alex Advisor',
          email: 'alex@pandaexteriors.com',
          phone: '(215) 555-0101',
          title: 'Sales Representative',
        },
      },
    },
    projectName: 'Kitchen Renovation Agreement',
    projectAddress: '123 Panda Way, Philadelphia, PA',
    jobNumber: 'JOB-1001',
    contractDate: '03/23/2026',
    effectiveDate: '03/24/2026',
    contractAmount: '$15,250.00',
    depositAmount: '$2,500.00',
    financedAmount: '$12,750.00',
    scopeOfWork: 'Remove existing materials, install new system, and complete cleanup.',
    lineItemsText: 'Premium Roofing Package - Qty: 1 - Total: $15,250.00',
    lineItemsHtml: '<ul><li><strong>Premium Roofing Package</strong> - Qty: 1 | Total: $15,250.00</li></ul>',
    salesRepName: 'Alex Advisor',
    salesRepEmail: 'alex@pandaexteriors.com',
    salesRepPhone: '(215) 555-0101',
    organization: {
      name: 'Panda Exteriors',
      phone: territoryProfile.company_phone || '(000) 000-0000',
      address: territoryProfile.company_address || '123 Panda Way',
    },
    territory: {
      company_name: territoryProfile.company_name || 'Panda Exteriors',
      company_phone: territoryProfile.company_phone || '(000) 000-0000',
      company_address: territoryProfile.company_address || '123 Panda Way',
      company_email: territoryProfile.company_email || 'sales@pandaexteriors.com',
      company_license: territoryProfile.company_license || '',
    },
    dynamic: buildDynamicReplacementMap(dynamicContentItems, draft.territory),
    job: {
      number: 'JOB-1001',
      address: { full: '123 Panda Way, Philadelphia, PA' },
      customer: {
        name_full: 'Jamie Customer',
        email: 'jamie@example.com',
        phone: '(555) 867-5309',
      },
    },
    ...sampleMergeData,
  };

  const headerHtml = brandingItems.find((item) => item.id === draft.branding.headerId)?.content || '';
  const footerHtml = brandingItems.find((item) => item.id === draft.branding.footerId)?.content || '';
  const documentHtml = [headerHtml, draft.content, footerHtml]
    .filter(Boolean)
    .map((segment) => interpolateHtml(segment, replacements))
    .join('<hr class="my-4 border-gray-200" />');
  const { maxWidth, minHeight } = getPreviewPageDimensions(previewLayout);
  const previewPadding = {
    top: Math.round(previewLayout.margins.top * 44),
    right: Math.round(previewLayout.margins.right * 44),
    bottom: Math.round(previewLayout.margins.bottom * 44),
    left: Math.round(previewLayout.margins.left * 44),
  };

  return `
    <div style="display:flex; justify-content:center;">
      <div style="width:100%; max-width:${maxWidth}px;">
        <div style="margin-bottom:12px; display:flex; justify-content:space-between; gap:12px; font-size:12px; color:#6b7280;">
          <span>${previewLayout.pageSize} · ${previewLayout.orientation === 'LANDSCAPE' ? 'Landscape' : 'Portrait'}</span>
          <span>Margins ${previewLayout.margins.top}" / ${previewLayout.margins.right}" / ${previewLayout.margins.bottom}" / ${previewLayout.margins.left}"</span>
        </div>
        <div style="min-height:${minHeight}px; background:#ffffff; border:1px solid #d1d5db; border-radius:18px; box-shadow:0 18px 48px rgba(15,23,42,0.08); padding:${previewPadding.top}px ${previewPadding.right}px ${previewPadding.bottom}px ${previewPadding.left}px; box-sizing:border-box;">
          ${documentHtml}
        </div>
      </div>
    </div>
  `;
}

function getPreviewPageDimensions(pageLayout) {
  const baseDimensions = {
    LETTER: { width: 612, height: 792 },
    LEGAL: { width: 612, height: 1008 },
    A4: { width: 595, height: 842 },
  };
  const base = baseDimensions[pageLayout.pageSize] || baseDimensions.LETTER;
  const pageWidth = pageLayout.orientation === 'LANDSCAPE' ? base.height : base.width;
  const pageHeight = pageLayout.orientation === 'LANDSCAPE' ? base.width : base.height;

  return {
    maxWidth: Math.round(pageWidth * 0.78),
    minHeight: Math.round(pageHeight * 0.5),
  };
}

function buildDynamicReplacementMap(items, territory) {
  const result = {};
  items.forEach((item) => {
    if (!item?.key) return;
    if (item.territory === territory || (!result[item.key] && item.territory === 'DEFAULT')) {
      result[item.key] = item.content;
    }
  });
  return result;
}

function interpolateHtml(html, replacements) {
  return String(html || '').replace(/\{\{([^}]+)\}\}/g, (_match, fieldPath) => {
    const parts = fieldPath.trim().split('.');
    let value = replacements;
    for (const part of parts) {
      if (value === null || value === undefined) return '';
      value = value[part];
    }
    return value ?? '';
  });
}
