// Migration: Add Order Templates, Labor Orders, and Product Categories
// Run with: node migrations/add_order_templates_labor_orders.js

import pg from 'pg';

const { Client } = pg;

async function migrate() {
  const client = new Client({
    host: process.env.DATABASE_HOST || 'panda-crm-db.c1o4i6ekayqo.us-east-2.rds.amazonaws.com',
    port: 5432,
    database: process.env.DATABASE_NAME || 'panda_crm',
    user: process.env.DATABASE_USER || 'pandacrm',
    password: process.env.DATABASE_PASSWORD || 'PandaCRM2025Secure!',
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Create enums
    const enumQueries = [
      `DO $$ BEGIN
        CREATE TYPE "OrderTemplateCategory" AS ENUM ('ROOFING', 'SIDING', 'GUTTERS', 'SOLAR', 'GENERAL');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`,

      `DO $$ BEGIN
        CREATE TYPE "LaborOrderStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`,
    ];

    for (const query of enumQueries) {
      await client.query(query);
      console.log('Enum created or already exists');
    }

    // Create order_templates table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "order_templates" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "code" TEXT UNIQUE,
        "description" TEXT,
        "category" "OrderTemplateCategory" NOT NULL DEFAULT 'ROOFING',
        "supplier" TEXT,
        "is_abc_template" BOOLEAN NOT NULL DEFAULT false,
        "is_srs_template" BOOLEAN NOT NULL DEFAULT false,
        "structure" JSONB,
        "pricebook_id" TEXT REFERENCES "pricebooks"("id"),
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "is_default" BOOLEAN NOT NULL DEFAULT false,
        "sort_order" INTEGER NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Created order_templates table');

    // Create indexes for order_templates
    await client.query(`CREATE INDEX IF NOT EXISTS "order_templates_category_idx" ON "order_templates"("category")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "order_templates_is_active_idx" ON "order_templates"("is_active")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "order_templates_supplier_idx" ON "order_templates"("supplier")`);

    // Create labor_orders table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "labor_orders" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "labor_order_number" TEXT NOT NULL UNIQUE,
        "status" "LaborOrderStatus" NOT NULL DEFAULT 'DRAFT',
        "work_type_id" TEXT,
        "work_type_name" TEXT,
        "order_template_id" TEXT REFERENCES "order_templates"("id"),
        "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
        "tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
        "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
        "include_siding" BOOLEAN NOT NULL DEFAULT false,
        "include_solar_dnr" BOOLEAN NOT NULL DEFAULT false,
        "include_gutter" BOOLEAN NOT NULL DEFAULT false,
        "include_trim_work" BOOLEAN NOT NULL DEFAULT false,
        "include_interior_work" BOOLEAN NOT NULL DEFAULT false,
        "include_attic_insulation" BOOLEAN NOT NULL DEFAULT false,
        "work_order_id" TEXT NOT NULL REFERENCES "work_orders"("id"),
        "opportunity_id" TEXT REFERENCES "opportunities"("id"),
        "account_id" TEXT,
        "created_by_id" TEXT REFERENCES "users"("id"),
        "notes" TEXT,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Created labor_orders table');

    // Create indexes for labor_orders
    await client.query(`CREATE INDEX IF NOT EXISTS "labor_orders_work_order_id_idx" ON "labor_orders"("work_order_id")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "labor_orders_opportunity_id_idx" ON "labor_orders"("opportunity_id")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "labor_orders_status_idx" ON "labor_orders"("status")`);

    // Create labor_order_line_items table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "labor_order_line_items" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "labor_order_id" TEXT NOT NULL REFERENCES "labor_orders"("id") ON DELETE CASCADE,
        "product_id" TEXT REFERENCES "products"("id"),
        "product_name" TEXT NOT NULL,
        "description" TEXT,
        "list_price" DECIMAL(12,2) NOT NULL,
        "unit_price" DECIMAL(12,2) NOT NULL,
        "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
        "total_price" DECIMAL(12,2) NOT NULL,
        "uom" TEXT,
        "work_type" TEXT,
        "sort_order" INTEGER NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Created labor_order_line_items table');

    // Create index for labor_order_line_items
    await client.query(`CREATE INDEX IF NOT EXISTS "labor_order_line_items_labor_order_id_idx" ON "labor_order_line_items"("labor_order_id")`);

    // Create product_categories table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "product_categories" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "code" TEXT UNIQUE,
        "description" TEXT,
        "icon" TEXT,
        "sort_order" INTEGER NOT NULL DEFAULT 0,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "parent_id" TEXT REFERENCES "product_categories"("id"),
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Created product_categories table');

    // Create indexes for product_categories
    await client.query(`CREATE INDEX IF NOT EXISTS "product_categories_parent_id_idx" ON "product_categories"("parent_id")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "product_categories_is_active_idx" ON "product_categories"("is_active")`);

    // Create product_category_mappings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "product_category_mappings" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "product_id" TEXT NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
        "category_id" TEXT NOT NULL REFERENCES "product_categories"("id") ON DELETE CASCADE,
        "sort_order" INTEGER NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE("product_id", "category_id")
      )
    `);
    console.log('Created product_category_mappings table');

    // Create index for product_category_mappings
    await client.query(`CREATE INDEX IF NOT EXISTS "product_category_mappings_category_id_idx" ON "product_category_mappings"("category_id")`);

    // Add order_template_id column to material_orders if not exists
    await client.query(`
      ALTER TABLE "material_orders" ADD COLUMN IF NOT EXISTS "order_template_id" TEXT REFERENCES "order_templates"("id")
    `);
    console.log('Added order_template_id to material_orders');

    // Create index for order_template_id on material_orders
    await client.query(`CREATE INDEX IF NOT EXISTS "material_orders_order_template_id_idx" ON "material_orders"("order_template_id")`);

    // Insert default order templates
    const defaultTemplates = [
      { id: 'tmpl_standard', name: 'Standard Package', code: 'STANDARD', category: 'ROOFING', supplier: 'ABC', isAbcTemplate: true, isDefault: true, sortOrder: 1, description: 'Standard roofing package with basic materials' },
      { id: 'tmpl_gold_pledge', name: 'Gold Pledge', code: 'GOLD_PLEDGE', category: 'ROOFING', supplier: 'ABC', isAbcTemplate: true, sortOrder: 2, description: 'Gold Pledge warranty package with premium materials' },
      { id: 'tmpl_presidential', name: 'Presidential Package', code: 'PRESIDENTIAL', category: 'ROOFING', supplier: 'ABC', isAbcTemplate: true, sortOrder: 3, description: 'Presidential package with top-tier materials' },
      { id: 'tmpl_abc_pricebook', name: 'ABC Supply Price Book', code: 'ABC_PRICEBOOK', category: 'ROOFING', supplier: 'ABC', isAbcTemplate: true, sortOrder: 4, description: 'Custom materials from ABC Supply price book' },
      { id: 'tmpl_siding_abc', name: 'Siding ABC Template', code: 'SIDING_ABC', category: 'SIDING', supplier: 'ABC', isAbcTemplate: true, sortOrder: 5, description: 'Siding materials template for ABC Supply' },
      { id: 'tmpl_srs_standard', name: 'SRS Standard Package', code: 'SRS_STANDARD', category: 'ROOFING', supplier: 'SRS', isSrsTemplate: true, isActive: false, sortOrder: 10, description: 'Standard package from SRS Distribution (Coming Soon)' },
    ];

    for (const template of defaultTemplates) {
      await client.query(`
        INSERT INTO "order_templates" ("id", "name", "code", "category", "supplier", "is_abc_template", "is_srs_template", "is_default", "is_active", "sort_order", "description")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, true), $10, $11)
        ON CONFLICT ("code") DO NOTHING
      `, [
        template.id,
        template.name,
        template.code,
        template.category,
        template.supplier,
        template.isAbcTemplate || false,
        template.isSrsTemplate || false,
        template.isDefault || false,
        template.isActive !== false,
        template.sortOrder,
        template.description,
      ]);
    }
    console.log('Inserted default order templates');

    // Insert default product categories
    const defaultCategories = [
      { id: 'cat_shingles', name: 'Shingles', code: 'SHINGLES', icon: 'Layers', sortOrder: 1 },
      { id: 'cat_hip_ridge', name: 'Hip & Ridge', code: 'HIP_RIDGE', icon: 'Mountain', sortOrder: 2 },
      { id: 'cat_starter', name: 'Starter', code: 'STARTER', icon: 'PlayCircle', sortOrder: 3 },
      { id: 'cat_underlayment', name: 'Underlayment', code: 'UNDERLAYMENT', icon: 'FileText', sortOrder: 4 },
      { id: 'cat_coil_nails', name: 'Coil Nails', code: 'COIL_NAILS', icon: 'Hammer', sortOrder: 5 },
      { id: 'cat_pipe_flashing', name: 'Pipe Flashing', code: 'PIPE_FLASHING', icon: 'Droplets', sortOrder: 6 },
      { id: 'cat_other_flashing', name: 'Other Flashing', code: 'OTHER_FLASHING', icon: 'Wrench', sortOrder: 7 },
      { id: 'cat_vents', name: 'Vents', code: 'VENTS', icon: 'Wind', sortOrder: 8 },
      { id: 'cat_drip_edge', name: 'Drip Edge', code: 'DRIP_EDGE', icon: 'ArrowDown', sortOrder: 9 },
      { id: 'cat_ice_water', name: 'Ice & Water Shield', code: 'ICE_WATER', icon: 'Shield', sortOrder: 10 },
      { id: 'cat_gutters', name: 'Gutters', code: 'GUTTERS', icon: 'Columns', sortOrder: 11 },
      { id: 'cat_siding', name: 'Siding', code: 'SIDING', icon: 'LayoutList', sortOrder: 12 },
      { id: 'cat_trim', name: 'Trim', code: 'TRIM', icon: 'Scissors', sortOrder: 13 },
      { id: 'cat_misc', name: 'Miscellaneous', code: 'MISC', icon: 'Package', sortOrder: 99 },
    ];

    for (const category of defaultCategories) {
      await client.query(`
        INSERT INTO "product_categories" ("id", "name", "code", "icon", "sort_order")
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT ("code") DO NOTHING
      `, [category.id, category.name, category.code, category.icon, category.sortOrder]);
    }
    console.log('Inserted default product categories');

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await client.end();
  }
}

migrate().catch(console.error);
