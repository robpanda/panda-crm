import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Get all order templates
export const getOrderTemplates = async (req, res) => {
  try {
    const { category, supplier, isActive = 'true' } = req.query;

    const where = {};

    if (category) {
      where.category = category;
    }

    if (supplier) {
      where.supplier = supplier;
    }

    if (isActive !== 'all') {
      where.isActive = isActive === 'true';
    }

    const templates = await prisma.orderTemplate.findMany({
      where,
      include: {
        pricebook: true,
      },
      orderBy: [
        { sortOrder: 'asc' },
        { name: 'asc' },
      ],
    });

    res.json({
      success: true,
      data: templates,
    });
  } catch (error) {
    console.error('Error fetching order templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch order templates'
    });
  }
};

// Get a single order template by ID
export const getOrderTemplate = async (req, res) => {
  try {
    const { id } = req.params;

    const template = await prisma.orderTemplate.findUnique({
      where: { id },
      include: {
        pricebook: {
          include: {
            entries: {
              include: {
                product: true,
              },
            },
          },
        },
      },
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Order template not found'
      });
    }

    res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    console.error('Error fetching order template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch order template'
    });
  }
};

// Create a new order template
export const createOrderTemplate = async (req, res) => {
  try {
    const {
      name,
      code,
      description,
      category = 'ROOFING',
      supplier,
      isAbcTemplate = false,
      isSrsTemplate = false,
      structure,
      pricebookId,
      isDefault = false,
      sortOrder = 0,
    } = req.body;

    // If this is the default template, unset any existing defaults
    if (isDefault) {
      await prisma.orderTemplate.updateMany({
        where: { category, isDefault: true },
        data: { isDefault: false },
      });
    }

    const template = await prisma.orderTemplate.create({
      data: {
        name,
        code,
        description,
        category,
        supplier,
        isAbcTemplate,
        isSrsTemplate,
        structure,
        pricebookId,
        isDefault,
        sortOrder,
      },
      include: {
        pricebook: true,
      },
    });

    res.status(201).json({
      success: true,
      data: template,
    });
  } catch (error) {
    console.error('Error creating order template:', error);

    if (error.code === 'P2002') {
      return res.status(400).json({
        success: false,
        error: 'An order template with this code already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create order template'
    });
  }
};

// Update an order template
export const updateOrderTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      code,
      description,
      category,
      supplier,
      isAbcTemplate,
      isSrsTemplate,
      structure,
      pricebookId,
      isActive,
      isDefault,
      sortOrder,
    } = req.body;

    // Check if template exists
    const existing = await prisma.orderTemplate.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Order template not found'
      });
    }

    // If setting as default, unset any existing defaults in same category
    if (isDefault && !existing.isDefault) {
      await prisma.orderTemplate.updateMany({
        where: {
          category: category || existing.category,
          isDefault: true,
          id: { not: id },
        },
        data: { isDefault: false },
      });
    }

    const template = await prisma.orderTemplate.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(code !== undefined && { code }),
        ...(description !== undefined && { description }),
        ...(category !== undefined && { category }),
        ...(supplier !== undefined && { supplier }),
        ...(isAbcTemplate !== undefined && { isAbcTemplate }),
        ...(isSrsTemplate !== undefined && { isSrsTemplate }),
        ...(structure !== undefined && { structure }),
        ...(pricebookId !== undefined && { pricebookId }),
        ...(isActive !== undefined && { isActive }),
        ...(isDefault !== undefined && { isDefault }),
        ...(sortOrder !== undefined && { sortOrder }),
      },
      include: {
        pricebook: true,
      },
    });

    res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    console.error('Error updating order template:', error);

    if (error.code === 'P2002') {
      return res.status(400).json({
        success: false,
        error: 'An order template with this code already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update order template'
    });
  }
};

// Delete an order template
export const deleteOrderTemplate = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if template exists
    const existing = await prisma.orderTemplate.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Order template not found'
      });
    }

    // Check if template is in use
    const usageCount = await prisma.materialOrder.count({
      where: { orderTemplateId: id },
    });

    if (usageCount > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete template - it is used by ${usageCount} material order(s)`,
      });
    }

    await prisma.orderTemplate.delete({ where: { id } });

    res.json({
      success: true,
      message: 'Order template deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting order template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete order template'
    });
  }
};

// Get product categories for material ordering UI
export const getProductCategories = async (req, res) => {
  try {
    const { isActive = 'true' } = req.query;

    const where = {};
    if (isActive !== 'all') {
      where.isActive = isActive === 'true';
    }

    const categories = await prisma.productCategory.findMany({
      where,
      include: {
        products: {
          include: {
            product: true,
          },
        },
        children: true,
      },
      orderBy: [
        { sortOrder: 'asc' },
        { name: 'asc' },
      ],
    });

    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    console.error('Error fetching product categories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch product categories'
    });
  }
};

// Seed default order templates (for initial setup)
export const seedOrderTemplates = async (req, res) => {
  try {
    const defaultTemplates = [
      {
        name: 'Standard Package',
        code: 'STANDARD',
        description: 'Standard roofing package with basic materials',
        category: 'ROOFING',
        supplier: 'ABC',
        isAbcTemplate: true,
        isDefault: true,
        sortOrder: 1,
      },
      {
        name: 'Gold Pledge',
        code: 'GOLD_PLEDGE',
        description: 'Gold Pledge warranty package with premium materials',
        category: 'ROOFING',
        supplier: 'ABC',
        isAbcTemplate: true,
        sortOrder: 2,
      },
      {
        name: 'Presidential Package',
        code: 'PRESIDENTIAL',
        description: 'Presidential package with top-tier materials',
        category: 'ROOFING',
        supplier: 'ABC',
        isAbcTemplate: true,
        sortOrder: 3,
      },
      {
        name: 'ABC Supply Price Book',
        code: 'ABC_PRICEBOOK',
        description: 'Custom materials from ABC Supply price book',
        category: 'ROOFING',
        supplier: 'ABC',
        isAbcTemplate: true,
        sortOrder: 4,
      },
      {
        name: 'Siding ABC Template',
        code: 'SIDING_ABC',
        description: 'Siding materials template for ABC Supply',
        category: 'SIDING',
        supplier: 'ABC',
        isAbcTemplate: true,
        sortOrder: 5,
      },
      {
        name: 'SRS Standard Package',
        code: 'SRS_STANDARD',
        description: 'Standard package from SRS Distribution (Coming Soon)',
        category: 'ROOFING',
        supplier: 'SRS',
        isSrsTemplate: true,
        isActive: false, // Coming soon
        sortOrder: 10,
      },
    ];

    const created = [];
    for (const template of defaultTemplates) {
      const existing = await prisma.orderTemplate.findFirst({
        where: { code: template.code },
      });

      if (!existing) {
        const newTemplate = await prisma.orderTemplate.create({
          data: template,
        });
        created.push(newTemplate);
      }
    }

    res.json({
      success: true,
      message: `Created ${created.length} order templates`,
      data: created,
    });
  } catch (error) {
    console.error('Error seeding order templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to seed order templates'
    });
  }
};

// Seed default product categories (for initial setup)
export const seedProductCategories = async (req, res) => {
  try {
    const defaultCategories = [
      { name: 'Shingles', code: 'SHINGLES', icon: 'Layers', sortOrder: 1 },
      { name: 'Hip & Ridge', code: 'HIP_RIDGE', icon: 'Mountain', sortOrder: 2 },
      { name: 'Starter', code: 'STARTER', icon: 'PlayCircle', sortOrder: 3 },
      { name: 'Underlayment', code: 'UNDERLAYMENT', icon: 'FileText', sortOrder: 4 },
      { name: 'Coil Nails', code: 'COIL_NAILS', icon: 'Hammer', sortOrder: 5 },
      { name: 'Pipe Flashing', code: 'PIPE_FLASHING', icon: 'Droplets', sortOrder: 6 },
      { name: 'Other Flashing', code: 'OTHER_FLASHING', icon: 'Wrench', sortOrder: 7 },
      { name: 'Vents', code: 'VENTS', icon: 'Wind', sortOrder: 8 },
      { name: 'Drip Edge', code: 'DRIP_EDGE', icon: 'ArrowDown', sortOrder: 9 },
      { name: 'Ice & Water Shield', code: 'ICE_WATER', icon: 'Shield', sortOrder: 10 },
      { name: 'Gutters', code: 'GUTTERS', icon: 'Columns', sortOrder: 11 },
      { name: 'Siding', code: 'SIDING', icon: 'LayoutList', sortOrder: 12 },
      { name: 'Trim', code: 'TRIM', icon: 'Scissors', sortOrder: 13 },
      { name: 'Miscellaneous', code: 'MISC', icon: 'Package', sortOrder: 99 },
    ];

    const created = [];
    for (const category of defaultCategories) {
      const existing = await prisma.productCategory.findFirst({
        where: { code: category.code },
      });

      if (!existing) {
        const newCategory = await prisma.productCategory.create({
          data: category,
        });
        created.push(newCategory);
      }
    }

    res.json({
      success: true,
      message: `Created ${created.length} product categories`,
      data: created,
    });
  } catch (error) {
    console.error('Error seeding product categories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to seed product categories'
    });
  }
};
