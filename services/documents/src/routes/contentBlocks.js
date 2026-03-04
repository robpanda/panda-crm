// Content Blocks Routes - State-specific dynamic content for templates
// Supports rescission clauses, cancellation policies, warranty terms, etc.

import express from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { logger } from '../middleware/logger.js';

const router = express.Router();

// ============================================================================
// PUBLIC ENDPOINTS (for template resolution)
// ============================================================================

/**
 * GET /content-blocks/resolve/:mergeToken
 * Resolve a merge token to content based on state
 * Query params: state (required)
 *
 * This is called during template preview and document generation
 */
router.get('/resolve/:mergeToken', async (req, res) => {
  try {
    const { mergeToken } = req.params;
    const { state } = req.query;

    if (!state) {
      return res.status(400).json({
        success: false,
        error: 'State parameter is required',
      });
    }

    // Normalize state to uppercase
    const normalizedState = state.toUpperCase().trim();

    // Format the merge token to match database format
    const formattedToken = mergeToken.startsWith('{{') ? mergeToken : `{{${mergeToken}}}`;

    // First try to find exact state match
    let block = await prisma.templateContentBlock.findFirst({
      where: {
        mergeToken: formattedToken,
        state: normalizedState,
        isActive: true,
      },
      orderBy: { priority: 'desc' },
    });

    // If no exact match, try DEFAULT fallback
    if (!block) {
      block = await prisma.templateContentBlock.findFirst({
        where: {
          mergeToken: formattedToken,
          state: 'DEFAULT',
          isActive: true,
        },
        orderBy: { priority: 'desc' },
      });
    }

    if (!block) {
      return res.status(404).json({
        success: false,
        error: `No content block found for token ${mergeToken} and state ${normalizedState}`,
      });
    }

    res.json({
      success: true,
      data: {
        content: block.content,
        name: block.name,
        state: block.state,
        contentType: block.contentType,
        resolvedFor: normalizedState,
        isDefault: block.state === 'DEFAULT',
      },
    });
  } catch (error) {
    logger.error('Failed to resolve content block:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /content-blocks/resolve-all
 * Resolve multiple merge tokens at once for a given state
 * Body: { state: 'MD', tokens: ['{{rescission_clause}}', '{{cancellation_policy}}'] }
 */
router.post('/resolve-all', async (req, res) => {
  try {
    const { state, tokens } = req.body;

    if (!state || !tokens || !Array.isArray(tokens)) {
      return res.status(400).json({
        success: false,
        error: 'State and tokens array are required',
      });
    }

    const normalizedState = state.toUpperCase().trim();
    const resolved = {};

    for (const token of tokens) {
      const formattedToken = token.startsWith('{{') ? token : `{{${token}}}`;

      // Try exact state match first
      let block = await prisma.templateContentBlock.findFirst({
        where: {
          mergeToken: formattedToken,
          state: normalizedState,
          isActive: true,
        },
        orderBy: { priority: 'desc' },
      });

      // Fall back to DEFAULT
      if (!block) {
        block = await prisma.templateContentBlock.findFirst({
          where: {
            mergeToken: formattedToken,
            state: 'DEFAULT',
            isActive: true,
          },
          orderBy: { priority: 'desc' },
        });
      }

      if (block) {
        resolved[token] = {
          content: block.content,
          name: block.name,
          state: block.state,
          isDefault: block.state === 'DEFAULT',
        };
      } else {
        resolved[token] = null;
      }
    }

    res.json({
      success: true,
      data: resolved,
      resolvedFor: normalizedState,
    });
  } catch (error) {
    logger.error('Failed to resolve content blocks:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /content-blocks/available-tokens
 * List all available merge tokens (for template editor)
 */
router.get('/available-tokens', async (req, res) => {
  try {
    const blocks = await prisma.templateContentBlock.findMany({
      where: { isActive: true },
      select: {
        mergeToken: true,
        contentType: true,
        name: true,
      },
      distinct: ['mergeToken'],
    });

    // Group by content type
    const tokensByType = {};
    for (const block of blocks) {
      if (!tokensByType[block.contentType]) {
        tokensByType[block.contentType] = [];
      }
      tokensByType[block.contentType].push({
        token: block.mergeToken,
        name: block.name,
        description: `Inserts state-specific ${block.contentType.toLowerCase().replace(/_/g, ' ')}`,
      });
    }

    res.json({
      success: true,
      data: tokensByType,
    });
  } catch (error) {
    logger.error('Failed to get available tokens:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// ADMIN ENDPOINTS (require authentication)
// ============================================================================

/**
 * GET /content-blocks
 * List all content blocks with filtering
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { contentType, state, isActive, search } = req.query;

    const where = {};
    if (contentType) where.contentType = contentType;
    if (state) where.state = state.toUpperCase();
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ];
    }

    const blocks = await prisma.templateContentBlock.findMany({
      where,
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: [
        { contentType: 'asc' },
        { priority: 'desc' },
        { state: 'asc' },
      ],
    });

    res.json({
      success: true,
      data: blocks,
      total: blocks.length,
    });
  } catch (error) {
    logger.error('Failed to list content blocks:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /content-blocks/types
 * Get all unique content types
 */
router.get('/types', authMiddleware, async (req, res) => {
  try {
    const types = await prisma.templateContentBlock.findMany({
      select: { contentType: true },
      distinct: ['contentType'],
    });

    res.json({
      success: true,
      data: types.map(t => t.contentType),
    });
  } catch (error) {
    logger.error('Failed to get content types:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /content-blocks/states
 * Get all unique states
 */
router.get('/states', authMiddleware, async (req, res) => {
  try {
    const states = await prisma.templateContentBlock.findMany({
      select: { state: true },
      distinct: ['state'],
      orderBy: { state: 'asc' },
    });

    res.json({
      success: true,
      data: states.map(s => s.state),
    });
  } catch (error) {
    logger.error('Failed to get states:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /content-blocks/:id
 * Get a single content block
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const block = await prisma.templateContentBlock.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    if (!block) {
      return res.status(404).json({
        success: false,
        error: 'Content block not found',
      });
    }

    res.json({
      success: true,
      data: block,
    });
  } catch (error) {
    logger.error('Failed to get content block:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /content-blocks
 * Create a new content block
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, contentType, state, content, mergeToken, priority, notes, workTypes, isActive } = req.body;
    const userId = req.user?.userId || req.user?.id;

    // Validate required fields
    if (!name || !contentType || !state || !content || !mergeToken) {
      return res.status(400).json({
        success: false,
        error: 'name, contentType, state, content, and mergeToken are required',
      });
    }

    // Normalize state
    const normalizedState = (state || 'DEFAULT').toUpperCase().trim();

    // Format merge token
    const formattedToken = mergeToken.startsWith('{{') ? mergeToken : `{{${mergeToken}}}`;

    // Check for duplicate
    const existing = await prisma.templateContentBlock.findFirst({
      where: {
        contentType,
        state: normalizedState,
      },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: `A content block already exists for ${contentType} in ${normalizedState}. Use PUT to update.`,
        data: existing,
      });
    }

    const block = await prisma.templateContentBlock.create({
      data: {
        id: `tcb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name,
        contentType,
        state: normalizedState,
        content,
        mergeToken: formattedToken,
        priority: priority || 100,
        notes,
        isActive: isActive !== undefined ? !!isActive : true,
        workTypes: Array.isArray(workTypes) ? workTypes : [],
        createdById: userId,
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    logger.info(`Content block created: ${block.id} (${contentType} - ${normalizedState})`);

    res.status(201).json({
      success: true,
      data: block,
    });
  } catch (error) {
    logger.error('Failed to create content block:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * PUT /content-blocks/:id
 * Update a content block
 */
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      contentType,
      state,
      content,
      mergeToken,
      priority,
      notes,
      workTypes,
      isActive,
    } = req.body;

    const existing = await prisma.templateContentBlock.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Content block not found',
      });
    }

    const normalizedState = state !== undefined
      ? (state || 'DEFAULT').toUpperCase().trim()
      : undefined;
    const formattedToken = mergeToken !== undefined
      ? (mergeToken.startsWith('{{') ? mergeToken : `{{${mergeToken}}}`)
      : undefined;

    const nextContentType = contentType !== undefined ? contentType : existing.contentType;
    const nextState = normalizedState !== undefined ? normalizedState : existing.state;

    if (nextContentType && nextState) {
      const uniquenessChanged =
        nextContentType !== existing.contentType || nextState !== existing.state;

      if (uniquenessChanged) {
        const conflict = await prisma.templateContentBlock.findFirst({
          where: {
            contentType: nextContentType,
            state: nextState,
            NOT: { id },
          },
        });

        if (conflict) {
          return res.status(409).json({
            success: false,
            error: `A content block already exists for ${nextContentType} in ${nextState}.`,
          });
        }
      }
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (contentType !== undefined) updateData.contentType = contentType;
    if (normalizedState !== undefined) updateData.state = normalizedState;
    if (content !== undefined) updateData.content = content;
    if (formattedToken !== undefined) updateData.mergeToken = formattedToken;
    if (priority !== undefined) updateData.priority = priority;
    if (notes !== undefined) updateData.notes = notes;
    if (workTypes !== undefined) updateData.workTypes = Array.isArray(workTypes) ? workTypes : [];
    if (isActive !== undefined) updateData.isActive = !!isActive;

    const block = await prisma.templateContentBlock.update({
      where: { id },
      data: updateData,
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    logger.info(`Content block updated: ${block.id}`);

    res.json({
      success: true,
      data: block,
    });
  } catch (error) {
    logger.error('Failed to update content block:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * DELETE /content-blocks/:id
 * Delete a content block
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.templateContentBlock.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Content block not found',
      });
    }

    await prisma.templateContentBlock.delete({
      where: { id },
    });

    logger.info(`Content block deleted: ${id}`);

    res.json({
      success: true,
      message: 'Content block deleted successfully',
    });
  } catch (error) {
    logger.error('Failed to delete content block:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /content-blocks/preview
 * Preview how content will be resolved for a specific context
 * Body: { state, opportunity: { id, accountId }, templateContent }
 */
router.post('/preview', authMiddleware, async (req, res) => {
  try {
    const { state, templateContent } = req.body;

    if (!state || !templateContent) {
      return res.status(400).json({
        success: false,
        error: 'state and templateContent are required',
      });
    }

    const normalizedState = state.toUpperCase().trim();

    // Find all merge tokens in the template content
    const tokenRegex = /\{\{([^}]+)\}\}/g;
    const tokens = [...templateContent.matchAll(tokenRegex)].map(m => m[0]);

    // Resolve each token
    let resolvedContent = templateContent;
    const resolutions = {};

    for (const token of tokens) {
      // Try exact state match
      let block = await prisma.templateContentBlock.findFirst({
        where: {
          mergeToken: token,
          state: normalizedState,
          isActive: true,
        },
        orderBy: { priority: 'desc' },
      });

      // Fall back to DEFAULT
      if (!block) {
        block = await prisma.templateContentBlock.findFirst({
          where: {
            mergeToken: token,
            state: 'DEFAULT',
            isActive: true,
          },
          orderBy: { priority: 'desc' },
        });
      }

      if (block) {
        resolvedContent = resolvedContent.replace(new RegExp(token.replace(/[{}]/g, '\\$&'), 'g'), block.content);
        resolutions[token] = {
          resolved: true,
          state: block.state,
          name: block.name,
        };
      } else {
        resolutions[token] = {
          resolved: false,
          state: null,
          name: null,
        };
      }
    }

    res.json({
      success: true,
      data: {
        originalContent: templateContent,
        resolvedContent,
        resolutions,
        targetState: normalizedState,
      },
    });
  } catch (error) {
    logger.error('Failed to preview content resolution:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
