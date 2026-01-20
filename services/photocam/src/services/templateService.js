// Template Service for Photocam
import prisma from '../prisma.js';
import { logger } from '../middleware/logger.js';

/**
 * Create a new checklist template
 */
export async function createTemplate(data, userId) {
  logger.info(`Creating checklist template: ${data.name}`);

  const template = await prisma.checklistTemplate.create({
    data: {
      name: data.name,
      description: data.description,
      category: data.category,
      isActive: true,
      createdById: userId,
      structure: data.structure, // JSON containing sections and items structure
    },
    include: {
      createdBy: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  });

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

  const templates = await prisma.checklistTemplate.findMany({
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

  const template = await prisma.checklistTemplate.update({
    where: { id: templateId },
    data: {
      name: data.name,
      description: data.description,
      category: data.category,
      isActive: data.isActive,
      structure: data.structure,
    },
    include: {
      createdBy: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  });

  return template;
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
  DEFAULT_TEMPLATES,
};

export default templateService;
