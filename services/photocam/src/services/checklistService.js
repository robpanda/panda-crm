// Checklist Service for Photocam
import prisma from '../prisma.js';
import { logger } from '../middleware/logger.js';

/**
 * Create a new checklist for a project
 */
export async function createChecklist(projectId, data, userId) {
  logger.info(`Creating checklist for project ${projectId}`);

  const checklist = await prisma.photoChecklist.create({
    data: {
      projectId,
      name: data.name,
      description: data.description,
      status: 'NOT_STARTED',
      createdById: userId,
      assignedToId: data.assignedToId,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      templateId: data.templateId,
    },
    include: {
      createdBy: {
        select: { id: true, firstName: true, lastName: true },
      },
      assignedTo: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  });

  // If sections/items are provided, create them
  if (data.sections && data.sections.length > 0) {
    for (let i = 0; i < data.sections.length; i++) {
      const section = data.sections[i];
      await createSection(checklist.id, { ...section, sortOrder: i }, userId);
    }
  }

  logger.info(`Created checklist ${checklist.id}`);
  return getChecklistById(checklist.id);
}

/**
 * Create a checklist section
 */
export async function createSection(checklistId, data, userId) {
  const section = await prisma.photoChecklistSection.create({
    data: {
      checklistId,
      name: data.name,
      description: data.description,
      sortOrder: data.sortOrder || 0,
      isRequired: data.isRequired ?? true,
    },
  });

  // Create items for the section
  if (data.items && data.items.length > 0) {
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      await createItem(section.id, { ...item, sortOrder: i }, userId);
    }
  }

  return section;
}

/**
 * Create a checklist item
 */
export async function createItem(sectionId, data, userId) {
  const item = await prisma.photoChecklistItem.create({
    data: {
      sectionId,
      fieldType: data.fieldType || 'NOTES',
      label: data.label,
      description: data.description,
      isRequired: data.isRequired ?? false,
      sortOrder: data.sortOrder || 0,
      options: data.options, // JSON for multiple choice options
    },
  });

  return item;
}

/**
 * Get a checklist by ID with all related data
 */
export async function getChecklistById(checklistId) {
  const checklist = await prisma.photoChecklist.findUnique({
    where: { id: checklistId },
    include: {
      project: {
        select: { id: true, name: true },
      },
      createdBy: {
        select: { id: true, firstName: true, lastName: true },
      },
      assignedTo: {
        select: { id: true, firstName: true, lastName: true },
      },
      sections: {
        orderBy: { sortOrder: 'asc' },
        include: {
          items: {
            orderBy: { sortOrder: 'asc' },
            include: {
              photos: {
                include: {
                  photo: {
                    select: {
                      id: true,
                      thumbnailUrl: true,
                      displayUrl: true,
                      caption: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
      template: {
        select: { id: true, name: true },
      },
    },
  });

  if (checklist) {
    // Calculate progress
    const progress = calculateChecklistProgress(checklist);
    return { ...checklist, progress };
  }

  return checklist;
}

/**
 * Calculate checklist completion progress
 */
function calculateChecklistProgress(checklist) {
  let totalItems = 0;
  let completedItems = 0;

  for (const section of checklist.sections) {
    for (const item of section.items) {
      totalItems++;
      if (item.isCompleted) {
        completedItems++;
      }
    }
  }

  return {
    total: totalItems,
    completed: completedItems,
    percentage: totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0,
  };
}

/**
 * Get checklists for a project
 */
export async function getProjectChecklists(projectId, filters = {}) {
  const where = { projectId };

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.assignedToId) {
    where.assignedToId = filters.assignedToId;
  }

  const checklists = await prisma.photoChecklist.findMany({
    where,
    include: {
      createdBy: {
        select: { id: true, firstName: true, lastName: true },
      },
      assignedTo: {
        select: { id: true, firstName: true, lastName: true },
      },
      sections: {
        include: {
          items: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Add progress to each checklist
  return checklists.map((cl) => ({
    ...cl,
    progress: calculateChecklistProgress(cl),
  }));
}

/**
 * Update a checklist
 */
export async function updateChecklist(checklistId, data, userId) {
  logger.info(`Updating checklist ${checklistId}`);

  const checklist = await prisma.photoChecklist.update({
    where: { id: checklistId },
    data: {
      name: data.name,
      description: data.description,
      status: data.status,
      assignedToId: data.assignedToId,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      completedAt: data.status === 'COMPLETED' ? new Date() : undefined,
      completedById: data.status === 'COMPLETED' ? userId : undefined,
    },
  });

  return getChecklistById(checklist.id);
}

/**
 * Update a checklist item (complete, add notes, etc.)
 */
export async function updateItem(itemId, data, userId) {
  logger.info(`Updating checklist item ${itemId}`);

  const item = await prisma.photoChecklistItem.update({
    where: { id: itemId },
    data: {
      isCompleted: data.isCompleted,
      completedAt: data.isCompleted ? new Date() : null,
      completedById: data.isCompleted ? userId : null,
      value: data.value, // JSON field for the response
      notes: data.notes,
    },
    include: {
      section: {
        include: {
          checklist: true,
        },
      },
    },
  });

  // Update checklist status based on progress
  await updateChecklistStatus(item.section.checklistId);

  return item;
}

/**
 * Attach a photo to a checklist item
 */
export async function attachPhotoToItem(itemId, photoId, userId) {
  logger.info(`Attaching photo ${photoId} to checklist item ${itemId}`);

  // Check if already attached
  const existing = await prisma.checklistItemPhoto.findFirst({
    where: { itemId, photoId },
  });

  if (existing) {
    return existing;
  }

  const attachment = await prisma.checklistItemPhoto.create({
    data: {
      itemId,
      photoId,
    },
    include: {
      photo: {
        select: {
          id: true,
          thumbnailUrl: true,
          displayUrl: true,
          caption: true,
        },
      },
    },
  });

  return attachment;
}

/**
 * Remove a photo from a checklist item
 */
export async function removePhotoFromItem(itemId, photoId) {
  await prisma.checklistItemPhoto.deleteMany({
    where: { itemId, photoId },
  });

  return { removed: true };
}

/**
 * Update checklist status based on item completion
 */
async function updateChecklistStatus(checklistId) {
  const checklist = await getChecklistById(checklistId);

  if (!checklist) return;

  let newStatus = checklist.status;

  if (checklist.progress.percentage === 100) {
    newStatus = 'COMPLETED';
  } else if (checklist.progress.completed > 0) {
    newStatus = 'IN_PROGRESS';
  }

  if (newStatus !== checklist.status) {
    await prisma.photoChecklist.update({
      where: { id: checklistId },
      data: { status: newStatus },
    });
  }
}

/**
 * Delete a checklist
 */
export async function deleteChecklist(checklistId, userId) {
  logger.info(`Deleting checklist ${checklistId}`);

  // Delete in order: item photos, items, sections, checklist
  const sections = await prisma.photoChecklistSection.findMany({
    where: { checklistId },
    select: { id: true },
  });

  const sectionIds = sections.map((s) => s.id);

  const items = await prisma.photoChecklistItem.findMany({
    where: { sectionId: { in: sectionIds } },
    select: { id: true },
  });

  const itemIds = items.map((i) => i.id);

  // Delete item photos
  await prisma.checklistItemPhoto.deleteMany({
    where: { itemId: { in: itemIds } },
  });

  // Delete items
  await prisma.photoChecklistItem.deleteMany({
    where: { sectionId: { in: sectionIds } },
  });

  // Delete sections
  await prisma.photoChecklistSection.deleteMany({
    where: { checklistId },
  });

  // Delete checklist
  await prisma.photoChecklist.delete({
    where: { id: checklistId },
  });

  logger.info(`Deleted checklist ${checklistId}`);
  return { deleted: true };
}

export const checklistService = {
  createChecklist,
  createSection,
  createItem,
  getChecklistById,
  getProjectChecklists,
  updateChecklist,
  updateItem,
  attachPhotoToItem,
  removePhotoFromItem,
  deleteChecklist,
};

export default checklistService;
