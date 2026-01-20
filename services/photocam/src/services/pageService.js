// Page Service for Photocam (Notebook-style pages)
import prisma from '../prisma.js';
import { logger } from '../middleware/logger.js';
import crypto from 'crypto';

/**
 * Create a new page for a project
 */
export async function createPage(projectId, data, userId) {
  logger.info(`Creating page for project ${projectId}`);

  // Get max page number for ordering
  const maxOrder = await prisma.photoPage.aggregate({
    where: { projectId },
    _max: { pageNumber: true },
  });

  const page = await prisma.photoPage.create({
    data: {
      projectId,
      title: data.title || 'Untitled Page',
      content: data.content || '',
      pageType: data.pageType || 'NOTE',
      pageNumber: (maxOrder._max.pageNumber || 0) + 1,
      createdById: userId,
    },
    include: {
      createdBy: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  });

  logger.info(`Created page ${page.id}`);
  return page;
}

/**
 * Get a page by ID
 */
export async function getPageById(pageId) {
  const page = await prisma.photoPage.findUnique({
    where: { id: pageId },
    include: {
      project: {
        select: { id: true, name: true },
      },
      createdBy: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  });

  return page;
}

/**
 * Get all pages for a project
 */
export async function getProjectPages(projectId, filters = {}) {
  const where = { projectId };

  if (filters.pageType) {
    where.pageType = filters.pageType;
  }

  const pages = await prisma.photoPage.findMany({
    where,
    include: {
      createdBy: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
    orderBy: { pageNumber: 'asc' },
  });

  return pages;
}

/**
 * Update a page
 */
export async function updatePage(pageId, data, userId) {
  logger.info(`Updating page ${pageId}`);

  const page = await prisma.photoPage.update({
    where: { id: pageId },
    data: {
      title: data.title,
      content: data.content,
      pageType: data.pageType,
    },
    include: {
      createdBy: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  });

  return page;
}

/**
 * Delete a page
 */
export async function deletePage(pageId, userId) {
  logger.info(`Deleting page ${pageId}`);

  await prisma.photoPage.delete({
    where: { id: pageId },
  });

  logger.info(`Deleted page ${pageId}`);
  return { deleted: true };
}

/**
 * Reorder pages in a project
 */
export async function reorderPages(projectId, pageIds) {
  logger.info(`Reordering pages in project ${projectId}`);

  // Update page numbers based on new order
  await Promise.all(
    pageIds.map((pageId, index) =>
      prisma.photoPage.update({
        where: { id: pageId },
        data: { pageNumber: index + 1 },
      })
    )
  );

  return { reordered: true };
}

/**
 * Create a shareable link for a page
 */
export async function createPageShareLink(pageId, options = {}) {
  logger.info(`Creating share link for page ${pageId}`);

  const page = await prisma.photoPage.findUnique({
    where: { id: pageId },
  });

  if (!page) {
    const error = new Error('Page not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  // Generate unique share token
  const shareToken = crypto.randomBytes(16).toString('hex');
  const expiresAt = options.expiresInDays
    ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  await prisma.photoPage.update({
    where: { id: pageId },
    data: {
      shareToken,
      shareExpiresAt: expiresAt,
      isPublic: true,
    },
  });

  const shareUrl = `${process.env.FRONTEND_URL || 'https://crm.pandaadmin.com'}/share/page/${shareToken}`;

  return { shareUrl, shareToken, expiresAt };
}

/**
 * Get a page by share token (public access)
 */
export async function getPageByShareToken(shareToken) {
  const page = await prisma.photoPage.findFirst({
    where: {
      shareToken,
      isPublic: true,
    },
    include: {
      project: {
        select: { id: true, name: true },
      },
    },
  });

  if (!page) {
    return null;
  }

  // Check if expired
  if (page.shareExpiresAt && new Date() > page.shareExpiresAt) {
    return { expired: true };
  }

  return page;
}

/**
 * Revoke page share link
 */
export async function revokePageShareLink(pageId) {
  logger.info(`Revoking share link for page ${pageId}`);

  await prisma.photoPage.update({
    where: { id: pageId },
    data: {
      shareToken: null,
      shareExpiresAt: null,
      isPublic: false,
    },
  });

  return { revoked: true };
}

/**
 * Duplicate a page
 */
export async function duplicatePage(pageId, userId) {
  logger.info(`Duplicating page ${pageId}`);

  const original = await prisma.photoPage.findUnique({
    where: { id: pageId },
  });

  if (!original) {
    const error = new Error('Page not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  // Get max page number for ordering
  const maxOrder = await prisma.photoPage.aggregate({
    where: { projectId: original.projectId },
    _max: { pageNumber: true },
  });

  const duplicate = await prisma.photoPage.create({
    data: {
      projectId: original.projectId,
      title: `${original.title} (Copy)`,
      content: original.content,
      pageType: original.pageType,
      pageNumber: (maxOrder._max.pageNumber || 0) + 1,
      createdById: userId,
    },
    include: {
      createdBy: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  });

  logger.info(`Duplicated page ${pageId} to ${duplicate.id}`);
  return duplicate;
}

/**
 * Search pages by content
 */
export async function searchPages(projectId, searchTerm) {
  const pages = await prisma.photoPage.findMany({
    where: {
      projectId,
      OR: [
        { title: { contains: searchTerm, mode: 'insensitive' } },
        { content: { contains: searchTerm, mode: 'insensitive' } },
      ],
    },
    include: {
      createdBy: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
    orderBy: { pageNumber: 'asc' },
  });

  return pages;
}

/**
 * Export page as PDF (returns data for PDF generation)
 */
export async function exportPageData(pageId) {
  const page = await prisma.photoPage.findUnique({
    where: { id: pageId },
    include: {
      project: {
        select: { id: true, name: true },
      },
      createdBy: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  });

  if (!page) {
    const error = new Error('Page not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  return {
    title: page.title,
    content: page.content,
    pageType: page.pageType,
    projectName: page.project?.name,
    createdBy: `${page.createdBy.firstName} ${page.createdBy.lastName}`,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
  };
}

export const pageService = {
  createPage,
  getPageById,
  getProjectPages,
  updatePage,
  deletePage,
  reorderPages,
  createPageShareLink,
  getPageByShareToken,
  revokePageShareLink,
  duplicatePage,
  searchPages,
  exportPageData,
};

export default pageService;
