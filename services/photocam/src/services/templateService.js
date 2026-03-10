// Template Service for Photocam
import prisma from '../prisma.js';
import { logger } from '../middleware/logger.js';
import { validateTemplateForPublishPayload } from './validationService.js';

const OPTIONAL_TEMPLATE_FIELDS = new Set([
  'templateType',
  'isPublished',
  'pandaPhotoOnly',
  'companyScope',
  'configJson',
]);

function parseUnknownPrismaFieldName(error) {
  const message = error?.message || '';
  const unknownFieldMatch = message.match(/Unknown (?:field|argument) `([^`]+)`/i);
  if (unknownFieldMatch?.[1]) return unknownFieldMatch[1];

  const missingColumnMatch = message.match(/column [^\"]*\"([^\"]+)\" does not exist/i);
  const missingColumn = missingColumnMatch?.[1];
  if (!missingColumn) return null;

  const byColumnName = {
    template_type: 'templateType',
    is_published: 'isPublished',
    panda_photo_only: 'pandaPhotoOnly',
    company_scope: 'companyScope',
    config_json: 'configJson',
  };

  return byColumnName[String(missingColumn).toLowerCase()] || null;
}

/**
 * Create a new checklist template
 */
export async function createTemplate(data, userId) {
  logger.info(`Creating checklist template: ${data.name}`);

  const createData = {
    name: data.name,
    description: data.description,
    category: data.category,
    templateType: data.templateType || 'CHECKLIST',
    isActive: true,
    isPublished: data.isPublished ?? false,
    pandaPhotoOnly: data.pandaPhotoOnly ?? false,
    companyScope: data.companyScope || null,
    createdById: userId,
    structure: data.structure, // JSON containing sections and items structure
    configJson: data.configJson || null,
  };

  let template = null;
  let payload = { ...createData };
  let lastError = null;
  for (let i = 0; i <= Object.keys(createData).length; i += 1) {
    try {
      template = await prisma.checklistTemplate.create({
        data: payload,
        include: {
          createdBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      });
      break;
    } catch (error) {
      lastError = error;
      const unknownField = parseUnknownPrismaFieldName(error);
      if (!unknownField || !OPTIONAL_TEMPLATE_FIELDS.has(unknownField) || !Object.prototype.hasOwnProperty.call(payload, unknownField)) {
        throw error;
      }
      logger.warn(`Template create fallback: dropping unsupported field "${unknownField}"`);
      delete payload[unknownField];
    }
  }
  if (!template && lastError) throw lastError;

  logger.info(`Created template ${template.id}`);
  return template;
}

/**
 * Get all templates
 */
export async function getTemplates(filters = {}) {
  const where = {};

  if (filters.category) {
    where.category = filters.category;
  }

  if (filters.isActive !== undefined) {
    where.isActive = filters.isActive;
  } else {
    where.isActive = true; // Default to active templates only
  }

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  if (filters.templateType) {
    where.templateType = filters.templateType;
  }

  let templates;
  try {
    templates = await prisma.checklistTemplate.findMany({
      where,
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        _count: {
          select: { checklists: true },
        },
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  } catch (error) {
    const unknownField = parseUnknownPrismaFieldName(error);
    if (!unknownField || !OPTIONAL_TEMPLATE_FIELDS.has(unknownField)) {
      throw error;
    }

    logger.warn(`Template list fallback: retrying without unsupported field "${unknownField}"`);
    const fallbackWhere = { ...where };
    delete fallbackWhere.templateType;

    templates = await prisma.checklistTemplate.findMany({
      where: fallbackWhere,
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        _count: {
          select: { checklists: true },
        },
      },
      orderBy: [{ name: 'asc' }],
    });
  }

  return templates;
}

/**
 * Get a template by ID
 */
export async function getTemplateById(templateId) {
  const template = await prisma.checklistTemplate.findUnique({
    where: { id: templateId },
    include: {
      createdBy: {
        select: { id: true, firstName: true, lastName: true },
      },
      _count: {
        select: { checklists: true },
      },
    },
  });

  return template;
}

/**
 * Update a template
 */
export async function updateTemplate(templateId, data, userId) {
  logger.info(`Updating template ${templateId}`);

  const updateData = {
    name: data.name,
    description: data.description,
    category: data.category,
    templateType: data.templateType,
    isActive: data.isActive,
    isPublished: data.isPublished,
    pandaPhotoOnly: data.pandaPhotoOnly,
    companyScope: data.companyScope,
    structure: data.structure,
    configJson: data.configJson,
  };

  let template = null;
  let payload = { ...updateData };
  let lastError = null;
  for (let i = 0; i <= Object.keys(updateData).length; i += 1) {
    try {
      template = await prisma.checklistTemplate.update({
        where: { id: templateId },
        data: payload,
        include: {
          createdBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      });
      break;
    } catch (error) {
      lastError = error;
      const unknownField = parseUnknownPrismaFieldName(error);
      if (!unknownField || !OPTIONAL_TEMPLATE_FIELDS.has(unknownField) || !Object.prototype.hasOwnProperty.call(payload, unknownField)) {
        throw error;
      }
      logger.warn(`Template update fallback: dropping unsupported field "${unknownField}"`);
      delete payload[unknownField];
    }
  }
  if (!template && lastError) throw lastError;

  return template;
}

export const validateTemplateForPublish = validateTemplateForPublishPayload;

export async function publishTemplate(templateId, userId) {
  const template = await prisma.checklistTemplate.findUnique({ where: { id: templateId } });
  if (!template) {
    const error = new Error('Template not found');
    error.code = 'NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  validateTemplateForPublish(template);

  return prisma.checklistTemplate.update({
    where: { id: templateId },
    data: {
      isPublished: true,
      isActive: true,
    },
  });
}

export async function archiveTemplate(templateId, userId) {
  const template = await prisma.checklistTemplate.findUnique({ where: { id: templateId } });
  if (!template) {
    const error = new Error('Template not found');
    error.code = 'NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  return prisma.checklistTemplate.update({
    where: { id: templateId },
    data: {
      isPublished: false,
      isActive: false,
    },
  });
}

/**
 * Delete a template (soft delete by setting isActive = false)
 */
export async function deleteTemplate(templateId, userId) {
  logger.info(`Deactivating template ${templateId}`);

  await prisma.checklistTemplate.update({
    where: { id: templateId },
    data: { isActive: false },
  });

  return { deleted: true };
}

/**
 * Permanently delete a template
 */
export async function permanentlyDeleteTemplate(templateId) {
  logger.info(`Permanently deleting template ${templateId}`);

  // Check if template is in use
  const usageCount = await prisma.photoChecklist.count({
    where: { templateId },
  });

  if (usageCount > 0) {
    const error = new Error('Cannot delete template that is in use by checklists');
    error.code = 'TEMPLATE_IN_USE';
    throw error;
  }

  await prisma.checklistTemplate.delete({
    where: { id: templateId },
  });

  return { deleted: true };
}

/**
 * Instantiate a checklist from a template
 */
export async function instantiateTemplate(templateId, projectId, data, userId) {
  logger.info(`Instantiating template ${templateId} for project ${projectId}`);

  const template = await getTemplateById(templateId);

  if (!template) {
    const error = new Error('Template not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  if (!template.isActive) {
    const error = new Error('Template is not active');
    error.code = 'TEMPLATE_INACTIVE';
    throw error;
  }

  // Import checklistService dynamically to avoid circular dependency
  const { checklistService } = await import('./checklistService.js');

  // Create checklist with template structure
  const checklist = await checklistService.createChecklist(
    projectId,
    {
      name: data.name || template.name,
      description: data.description || template.description,
      templateId: template.id,
      assignedToId: data.assignedToId,
      dueDate: data.dueDate,
      sections: template.structure?.sections || [],
    },
    userId
  );

  logger.info(`Created checklist ${checklist.id} from template ${templateId}`);
  return checklist;
}

/**
 * Get template categories with counts
 */
export async function getTemplateCategories() {
  const templates = await prisma.checklistTemplate.findMany({
    where: { isActive: true },
    select: { category: true },
  });

  const categories = {};
  for (const t of templates) {
    const cat = t.category || 'Uncategorized';
    categories[cat] = (categories[cat] || 0) + 1;
  }

  return Object.entries(categories).map(([name, count]) => ({ name, count }));
}

/**
 * Duplicate a template
 */
export async function duplicateTemplate(templateId, newName, userId) {
  logger.info(`Duplicating template ${templateId}`);

  const source = await getTemplateById(templateId);

  if (!source) {
    const error = new Error('Template not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  const template = await createTemplate(
    {
      name: newName || `${source.name} (Copy)`,
      description: source.description,
      category: source.category,
      structure: source.structure,
    },
    userId
  );

  return template;
}

function buildChecklistTemplateStructure(name) {
  return {
    sections: [
      {
        name: `${name} - Core Section`,
        isRequired: true,
        items: [
          { fieldType: 'REQUIRED_PHOTO', label: 'Primary angle', isRequired: true },
          { fieldType: 'NOTES', label: 'Inspector notes', isRequired: false },
        ],
      },
    ],
  };
}

function buildReportTemplateConfig(name) {
  return {
    title: name,
    sections: [
      { key: 'overview', label: 'Overview' },
      { key: 'photos', label: 'Photos' },
    ],
    defaults: {
      includeCaptions: true,
      includeTimestamp: true,
    },
  };
}

export function listRecommendedTemplateSeeds() {
  return {
    checklists: [...DEFAULT_CHECKLIST_TEMPLATE_NAMES],
    reports: DEFAULT_REPORT_TEMPLATES.map((item) => item.name),
  };
}

export async function seedRecommendedTemplates(userId, options = {}) {
  const companyScope = options.companyScope || null;
  const created = [];
  const existing = [];

  for (const name of DEFAULT_CHECKLIST_TEMPLATE_NAMES) {
    // eslint-disable-next-line no-await-in-loop
    const found = await prisma.checklistTemplate.findFirst({
      where: { name, templateType: 'CHECKLIST' },
      select: { id: true, name: true, templateType: true },
    });
    if (found) {
      existing.push(found);
      // eslint-disable-next-line no-continue
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const record = await prisma.checklistTemplate.create({
      data: {
        name,
        templateType: 'CHECKLIST',
        category: 'PhotoCam',
        isActive: true,
        isPublished: false,
        pandaPhotoOnly: false,
        companyScope,
        structure: buildChecklistTemplateStructure(name),
        createdById: userId || null,
      },
      select: { id: true, name: true, templateType: true },
    });
    created.push(record);
  }

  for (const item of DEFAULT_REPORT_TEMPLATES) {
    const name = item.name;
    // eslint-disable-next-line no-await-in-loop
    const found = await prisma.checklistTemplate.findFirst({
      where: { name, templateType: 'REPORT' },
      select: { id: true, name: true, templateType: true },
    });
    if (found) {
      existing.push(found);
      // eslint-disable-next-line no-continue
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const record = await prisma.checklistTemplate.create({
      data: {
        name,
        description: item.description || null,
        templateType: 'REPORT',
        category: 'PhotoCam Reports',
        isActive: true,
        isPublished: false,
        pandaPhotoOnly: false,
        companyScope,
        structure: { sections: [] },
        configJson: buildReportTemplateConfig(name),
        createdById: userId || null,
      },
      select: { id: true, name: true, templateType: true },
    });
    created.push(record);
  }

  return {
    createdCount: created.length,
    existingCount: existing.length,
    created,
    existing,
  };
}

// Default templates for seeding
export const DEFAULT_TEMPLATES = [
  {
    name: 'Roof Inspection Checklist',
    description: 'Standard checklist for roof inspections',
    category: 'Inspections',
    structure: {
      sections: [
        {
          name: 'Exterior Inspection',
          isRequired: true,
          items: [
            { fieldType: 'REQUIRED_PHOTO', label: 'Full roof overview', isRequired: true },
            { fieldType: 'REQUIRED_PHOTO', label: 'Shingle condition close-up', isRequired: true },
            { fieldType: 'YES_NO', label: 'Visible damage present', isRequired: true },
            { fieldType: 'NOTES', label: 'Damage description', isRequired: false },
          ],
        },
        {
          name: 'Gutters & Drainage',
          isRequired: true,
          items: [
            { fieldType: 'REQUIRED_PHOTO', label: 'Gutter condition', isRequired: true },
            { fieldType: 'YES_NO', label: 'Gutters clear of debris', isRequired: true },
            { fieldType: 'YES_NO', label: 'Downspouts attached and functional', isRequired: true },
          ],
        },
        {
          name: 'Flashing & Penetrations',
          isRequired: true,
          items: [
            { fieldType: 'REQUIRED_PHOTO', label: 'Chimney flashing', isRequired: false },
            { fieldType: 'REQUIRED_PHOTO', label: 'Vent boots', isRequired: true },
            { fieldType: 'YES_NO', label: 'Sealant intact around penetrations', isRequired: true },
          ],
        },
      ],
    },
  },
  {
    name: 'Installation Pre-Check',
    description: 'Pre-installation verification checklist',
    category: 'Installation',
    structure: {
      sections: [
        {
          name: 'Materials Verification',
          isRequired: true,
          items: [
            { fieldType: 'YES_NO', label: 'All materials delivered', isRequired: true },
            { fieldType: 'REQUIRED_PHOTO', label: 'Materials on site', isRequired: true },
            { fieldType: 'YES_NO', label: 'Material quantities match order', isRequired: true },
          ],
        },
        {
          name: 'Site Preparation',
          isRequired: true,
          items: [
            { fieldType: 'YES_NO', label: 'Dumpster positioned', isRequired: true },
            { fieldType: 'YES_NO', label: 'Vehicles moved from work area', isRequired: true },
            { fieldType: 'YES_NO', label: 'Landscaping protected', isRequired: true },
          ],
        },
      ],
    },
  },
  {
    name: 'Final Walkthrough',
    description: 'Post-installation quality check',
    category: 'Quality',
    structure: {
      sections: [
        {
          name: 'Roof Installation',
          isRequired: true,
          items: [
            { fieldType: 'REQUIRED_PHOTO', label: 'Completed roof overview', isRequired: true },
            { fieldType: 'YES_NO', label: 'Shingles properly aligned', isRequired: true },
            { fieldType: 'YES_NO', label: 'Ridge cap installed correctly', isRequired: true },
            { fieldType: 'RATING', label: 'Overall installation quality', isRequired: true },
          ],
        },
        {
          name: 'Cleanup',
          isRequired: true,
          items: [
            { fieldType: 'YES_NO', label: 'All debris removed', isRequired: true },
            { fieldType: 'YES_NO', label: 'Magnetic sweep completed', isRequired: true },
            { fieldType: 'YES_NO', label: 'Gutters cleaned', isRequired: true },
            { fieldType: 'REQUIRED_PHOTO', label: 'Property cleanup complete', isRequired: true },
          ],
        },
        {
          name: 'Customer Sign-off',
          isRequired: true,
          items: [
            { fieldType: 'YES_NO', label: 'Customer walkthrough completed', isRequired: true },
            { fieldType: 'NOTES', label: 'Customer feedback', isRequired: false },
            { fieldType: 'TEXT', label: 'Customer signature', isRequired: true },
          ],
        },
      ],
    },
  },
];

export const DEFAULT_REPORT_TEMPLATES = [
  { name: 'Completion Photos', description: 'Final completion report for project closeout' },
  { name: 'Roofing Tune Up Inspection Report', description: 'Inspection summary for tune-up jobs' },
  { name: 'Panda Interiors: Bathroom Report', description: 'Bathroom remodel visual report template' },
  { name: 'Remote PM Template Beta', description: 'Remote PM photo report with checklist sections' },
];

export const DEFAULT_CHECKLIST_TEMPLATE_NAMES = [
  'Panda Interiors: Bath Redesign',
  'Photos for Bath Redesign Agreement',
  'Insurance Inspection Checklist',
  'Panda Inspection Photos',
  'Installation Photos',
  'Material Pick Up',
  'Retail Checklist',
];

export const templateService = {
  createTemplate,
  getTemplates,
  getTemplateById,
  updateTemplate,
  deleteTemplate,
  permanentlyDeleteTemplate,
  instantiateTemplate,
  getTemplateCategories,
  duplicateTemplate,
  publishTemplate,
  archiveTemplate,
  listRecommendedTemplateSeeds,
  seedRecommendedTemplates,
  DEFAULT_TEMPLATES,
  DEFAULT_REPORT_TEMPLATES,
  DEFAULT_CHECKLIST_TEMPLATE_NAMES,
};

export default templateService;
