import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// List message templates
export async function listTemplates(req, res, next) {
  try {
    // Support both 'channel' (frontend) and 'type' (schema) for filtering
    const { channel, type, category, isActive, search } = req.query;
    const typeFilter = channel || type; // 'channel' is alias for 'type'

    const where = {
      ...(typeFilter && { type: typeFilter }),
      ...(category && { category }),
      ...(isActive !== undefined && { isActive: isActive === 'true' }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { subject: { contains: search, mode: 'insensitive' } },
          { body: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const templates = await prisma.messageTemplate.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    // Map 'type' to 'channel' in response for frontend compatibility
    const mappedTemplates = templates.map(t => ({
      ...t,
      channel: t.type, // Alias for frontend
    }));

    res.json(mappedTemplates);
  } catch (error) {
    next(error);
  }
}

// Get single template
export async function getTemplate(req, res, next) {
  try {
    const { id } = req.params;

    const template = await prisma.messageTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Add channel alias in response for frontend
    res.json({ ...template, channel: template.type });
  } catch (error) {
    next(error);
  }
}

// Create template
export async function createTemplate(req, res, next) {
  try {
    const {
      name,
      channel, // Frontend sends 'channel'
      type,    // Also accept 'type' directly
      category,
      subject,
      body,
      bodyHtml,
      variables,
      isActive = true,
    } = req.body;

    // Use channel or type (channel is alias for type)
    const templateType = channel || type;

    // Validate required fields
    if (!name || !templateType || !body) {
      return res.status(400).json({
        error: 'name, channel/type, and body are required',
      });
    }

    // Email requires subject
    if (templateType === 'EMAIL' && !subject) {
      return res.status(400).json({ error: 'Subject is required for email templates' });
    }

    // Extract variables from template
    const extractedVariables = extractVariables(body + (bodyHtml || ''));

    const template = await prisma.messageTemplate.create({
      data: {
        name,
        type: templateType, // Use 'type' for Prisma schema
        category: category || 'GENERAL',
        subject,
        body,
        variables: variables || extractedVariables,
        isActive,
      },
    });

    // Add channel alias in response for frontend
    res.status(201).json({ ...template, channel: template.type });
  } catch (error) {
    next(error);
  }
}

// Update template
export async function updateTemplate(req, res, next) {
  try {
    const { id } = req.params;
    const {
      name,
      channel, // Frontend sends 'channel'
      type,    // Also accept 'type' directly
      category,
      subject,
      body,
      bodyHtml,
      variables,
      isActive,
    } = req.body;

    // Use channel or type (channel is alias for type)
    const templateType = channel || type;

    const existing = await prisma.messageTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Re-extract variables if body changed
    let updatedVariables = variables;
    if (body && !variables) {
      updatedVariables = extractVariables(body + (bodyHtml || ''));
    }

    const template = await prisma.messageTemplate.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(templateType && { type: templateType }), // Use 'type' for Prisma schema
        ...(category && { category }),
        ...(subject !== undefined && { subject }),
        ...(body && { body }),
        ...(updatedVariables && { variables: updatedVariables }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    // Add channel alias in response for frontend
    res.json({ ...template, channel: template.type });
  } catch (error) {
    next(error);
  }
}

// Delete template
export async function deleteTemplate(req, res, next) {
  try {
    const { id } = req.params;

    await prisma.messageTemplate.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Template not found' });
    }
    next(error);
  }
}

// Preview template with data
export async function previewTemplate(req, res, next) {
  try {
    const { id } = req.params;
    const { data } = req.body;

    const template = await prisma.messageTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const preview = {
      subject: template.subject ? interpolate(template.subject, data) : null,
      body: interpolate(template.body, data),
      bodyHtml: template.bodyHtml ? interpolate(template.bodyHtml, data) : null,
    };

    res.json(preview);
  } catch (error) {
    next(error);
  }
}

/**
 * Extract variables from template string
 * Supports {{variable}} and {variable} syntax
 */
function extractVariables(template) {
  const regex = /\{\{?(\w+)\}?\}/g;
  const variables = new Set();
  let match;

  while ((match = regex.exec(template)) !== null) {
    variables.add(match[1]);
  }

  return Array.from(variables);
}

/**
 * Interpolate template with data
 */
function interpolate(template, data = {}) {
  if (!template) return '';

  return template.replace(/\{\{?(\w+)\}?\}/g, (match, key) => {
    return data[key] !== undefined ? data[key] : match;
  });
}

// Export interpolation helper for use in other modules
export { interpolate, extractVariables };
