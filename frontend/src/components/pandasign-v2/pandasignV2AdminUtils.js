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
export const DEFAULT_TEMPLATE_DRAFT = {
  name: '',
  description: '',
  documentType: 'CONTRACT',
  territory: 'DEFAULT',
  status: 'DRAFT',
  content: '',
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

export function normalizeTemplateDraft(template = {}) {
  return {
    ...DEFAULT_TEMPLATE_DRAFT,
    ...template,
    documentType: template.documentType || template.category || DEFAULT_TEMPLATE_DRAFT.documentType,
    territory: template.territory || DEFAULT_TEMPLATE_DRAFT.territory,
    status: template.status || DEFAULT_TEMPLATE_DRAFT.status,
    content: template.content || '',
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
  const brandingItems = normalizeApiList(resources.brandingItems || []);
  const dynamicContentItems = normalizeApiList(resources.dynamicContentItems || []);
  const territoryProfiles = normalizeApiList(resources.territoryProfiles || []);
  const territoryProfile = territoryProfiles.find((item) => item.territory === draft.territory)
    || territoryProfiles.find((item) => item.territory === 'DEFAULT')
    || {};

  const replacements = {
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

  return [headerHtml, draft.content, footerHtml]
    .filter(Boolean)
    .map((segment) => interpolateHtml(segment, replacements))
    .join('<hr class="my-4 border-gray-200" />');
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
