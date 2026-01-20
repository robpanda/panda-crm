// Setup Service - Custom Fields, Validation Rules, Page Layouts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const setupService = {
  // ============================================================================
  // CUSTOM FIELDS
  // ============================================================================

  /**
   * Get all custom fields for an object
   */
  async getCustomFields(objectName) {
    const fields = await prisma.customField.findMany({
      where: {
        objectName,
        isActive: true,
      },
      orderBy: [
        { sortOrder: 'asc' },
        { createdAt: 'asc' },
      ],
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return fields.map(field => ({
      id: field.id,
      name: field.name,
      apiName: field.apiName,
      type: field.type.toLowerCase(),
      description: field.description,
      required: field.required,
      unique: field.unique,
      defaultValue: field.defaultValue,
      helpText: field.helpText,
      config: field.config,
      sortOrder: field.sortOrder,
      createdBy: field.createdBy,
      createdAt: field.createdAt,
      updatedAt: field.updatedAt,
      // Extract type-specific values from config
      ...(field.config && typeof field.config === 'object' ? {
        length: field.config.length,
        precision: field.config.precision,
        scale: field.config.scale,
        picklistValues: field.config.values || [],
        lookupObject: field.config.relatedObject,
      } : {}),
    }));
  },

  /**
   * Create a new custom field
   */
  async createCustomField(objectName, data, userId) {
    // Build config based on field type
    const config = {};
    const type = data.type?.toUpperCase() || 'TEXT';

    if (type === 'TEXT' || type === 'TEXTAREA') {
      config.length = data.length || (type === 'TEXTAREA' ? 32000 : 255);
    }

    if (type === 'NUMBER' || type === 'CURRENCY' || type === 'PERCENT') {
      config.precision = data.precision || 18;
      config.scale = data.scale || 2;
    }

    if (type === 'PICKLIST' || type === 'MULTIPICKLIST') {
      config.values = data.picklistValues || [];
    }

    if (type === 'LOOKUP') {
      config.relatedObject = data.lookupObject;
      config.relationshipName = data.relationshipName;
    }

    const field = await prisma.customField.create({
      data: {
        objectName,
        name: data.name,
        apiName: data.apiName,
        type,
        description: data.description,
        required: data.required || false,
        unique: data.unique || false,
        defaultValue: data.defaultValue,
        helpText: data.helpText,
        config,
        createdById: userId,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return {
      id: field.id,
      name: field.name,
      apiName: field.apiName,
      type: field.type.toLowerCase(),
      description: field.description,
      required: field.required,
      unique: field.unique,
      defaultValue: field.defaultValue,
      helpText: field.helpText,
      config: field.config,
      createdBy: field.createdBy,
      createdAt: field.createdAt,
    };
  },

  /**
   * Update a custom field
   */
  async updateCustomField(objectName, fieldId, data) {
    // Get existing field to preserve config
    const existing = await prisma.customField.findUnique({
      where: { id: fieldId },
    });

    if (!existing || existing.objectName !== objectName) {
      throw new Error('Field not found');
    }

    // Update config if type-specific values provided
    const config = { ...(existing.config || {}) };

    if (data.length !== undefined) {
      config.length = data.length;
    }
    if (data.precision !== undefined) {
      config.precision = data.precision;
    }
    if (data.scale !== undefined) {
      config.scale = data.scale;
    }
    if (data.picklistValues !== undefined) {
      config.values = data.picklistValues;
    }
    if (data.lookupObject !== undefined) {
      config.relatedObject = data.lookupObject;
    }

    const field = await prisma.customField.update({
      where: { id: fieldId },
      data: {
        name: data.name,
        description: data.description,
        required: data.required,
        unique: data.unique,
        defaultValue: data.defaultValue,
        helpText: data.helpText,
        config,
        sortOrder: data.sortOrder,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return {
      id: field.id,
      name: field.name,
      apiName: field.apiName,
      type: field.type.toLowerCase(),
      description: field.description,
      required: field.required,
      unique: field.unique,
      defaultValue: field.defaultValue,
      helpText: field.helpText,
      config: field.config,
      createdBy: field.createdBy,
      updatedAt: field.updatedAt,
    };
  },

  /**
   * Delete a custom field (soft delete)
   */
  async deleteCustomField(objectName, fieldId) {
    const existing = await prisma.customField.findUnique({
      where: { id: fieldId },
    });

    if (!existing || existing.objectName !== objectName) {
      throw new Error('Field not found');
    }

    await prisma.customField.update({
      where: { id: fieldId },
      data: { isActive: false },
    });

    return { success: true };
  },

  // ============================================================================
  // PICKLIST VALUES
  // ============================================================================

  /**
   * Get picklist values for a field
   */
  async getPicklistValues(objectName, fieldApiName) {
    const field = await prisma.customField.findUnique({
      where: {
        objectName_apiName: {
          objectName,
          apiName: fieldApiName,
        },
      },
    });

    if (!field) {
      throw new Error('Field not found');
    }

    if (field.type !== 'PICKLIST' && field.type !== 'MULTIPICKLIST') {
      throw new Error('Field is not a picklist');
    }

    return field.config?.values || [];
  },

  /**
   * Update picklist values for a field
   */
  async updatePicklistValues(objectName, fieldApiName, values) {
    const field = await prisma.customField.findUnique({
      where: {
        objectName_apiName: {
          objectName,
          apiName: fieldApiName,
        },
      },
    });

    if (!field) {
      throw new Error('Field not found');
    }

    if (field.type !== 'PICKLIST' && field.type !== 'MULTIPICKLIST') {
      throw new Error('Field is not a picklist');
    }

    const config = { ...(field.config || {}), values };

    const updated = await prisma.customField.update({
      where: { id: field.id },
      data: { config },
    });

    return {
      id: updated.id,
      apiName: updated.apiName,
      picklistValues: config.values,
    };
  },

  // ============================================================================
  // VALIDATION RULES
  // ============================================================================

  /**
   * Get all validation rules for an object
   */
  async getValidationRules(objectName) {
    const rules = await prisma.validationRule.findMany({
      where: {
        objectName,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return rules;
  },

  /**
   * Create a validation rule
   */
  async createValidationRule(objectName, data, userId) {
    const rule = await prisma.validationRule.create({
      data: {
        objectName,
        name: data.name,
        description: data.description,
        errorMessage: data.errorMessage,
        errorLocation: data.errorLocation,
        formula: data.formula,
        createdById: userId,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return rule;
  },

  /**
   * Update a validation rule
   */
  async updateValidationRule(objectName, ruleId, data) {
    const existing = await prisma.validationRule.findUnique({
      where: { id: ruleId },
    });

    if (!existing || existing.objectName !== objectName) {
      throw new Error('Validation rule not found');
    }

    const rule = await prisma.validationRule.update({
      where: { id: ruleId },
      data: {
        name: data.name,
        description: data.description,
        errorMessage: data.errorMessage,
        errorLocation: data.errorLocation,
        formula: data.formula,
        isActive: data.isActive,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return rule;
  },

  /**
   * Delete a validation rule (soft delete)
   */
  async deleteValidationRule(objectName, ruleId) {
    const existing = await prisma.validationRule.findUnique({
      where: { id: ruleId },
    });

    if (!existing || existing.objectName !== objectName) {
      throw new Error('Validation rule not found');
    }

    await prisma.validationRule.update({
      where: { id: ruleId },
      data: { isActive: false },
    });

    return { success: true };
  },

  // ============================================================================
  // PAGE LAYOUTS
  // ============================================================================

  /**
   * Get all page layouts for an object
   */
  async getPageLayouts(objectName) {
    const layouts = await prisma.pageLayout.findMany({
      where: {
        objectName,
        isActive: true,
      },
      orderBy: [
        { isDefault: 'desc' },
        { name: 'asc' },
      ],
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return layouts;
  },

  /**
   * Update a page layout
   */
  async updatePageLayout(objectName, layoutId, data) {
    const existing = await prisma.pageLayout.findUnique({
      where: { id: layoutId },
    });

    if (!existing || existing.objectName !== objectName) {
      throw new Error('Page layout not found');
    }

    // If setting as default, unset other defaults
    if (data.isDefault) {
      await prisma.pageLayout.updateMany({
        where: {
          objectName,
          isDefault: true,
          id: { not: layoutId },
        },
        data: { isDefault: false },
      });
    }

    const layout = await prisma.pageLayout.update({
      where: { id: layoutId },
      data: {
        name: data.name,
        description: data.description,
        isDefault: data.isDefault,
        config: data.config,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return layout;
  },
};

export default setupService;
