#!/usr/bin/env node
// Migrate Products and Pricebooks from Salesforce to PostgreSQL
import { querySalesforce } from './salesforce-client.js';
import { getPrismaClient, batchUpsert, disconnect } from './prisma-client.js';

const PRODUCT_FIELDS = [
  'Id',
  'Name',
  'ProductCode',
  'Family',
  'Description',
  'IsActive',
  'QuantityUnitOfMeasure',
  'CreatedDate',
  'LastModifiedDate',
];

const PRICEBOOK_FIELDS = [
  'Id',
  'Name',
  'Description',
  'IsActive',
  'IsStandard',
  'CreatedDate',
  'LastModifiedDate',
];

const PRICEBOOK_ENTRY_FIELDS = [
  'Id',
  'Pricebook2Id',
  'Product2Id',
  'UnitPrice',
  'IsActive',
  'UseStandardPrice',
  'CreatedDate',
  'LastModifiedDate',
];

function transformProduct(sfProduct) {
  return {
    salesforceId: sfProduct.Id,
    name: sfProduct.Name || 'Unnamed Product',
    productCode: sfProduct.ProductCode,
    family: sfProduct.Family || 'Other',
    description: sfProduct.Description,
    isActive: sfProduct.IsActive === true,
    createdAt: sfProduct.CreatedDate ? new Date(sfProduct.CreatedDate) : new Date(),
    updatedAt: sfProduct.LastModifiedDate ? new Date(sfProduct.LastModifiedDate) : new Date(),
  };
}

function transformPricebook(sfPricebook) {
  return {
    salesforceId: sfPricebook.Id,
    name: sfPricebook.Name || 'Unnamed Pricebook',
    description: sfPricebook.Description,
    isActive: sfPricebook.IsActive === true,
    isStandard: sfPricebook.IsStandard === true,
    createdAt: sfPricebook.CreatedDate ? new Date(sfPricebook.CreatedDate) : new Date(),
    updatedAt: sfPricebook.LastModifiedDate ? new Date(sfPricebook.LastModifiedDate) : new Date(),
  };
}

function transformPricebookEntry(sfEntry, productIdMap, pricebookIdMap) {
  // Map Salesforce IDs to our database IDs
  const productId = productIdMap.get(sfEntry.Product2Id);
  const pricebookId = pricebookIdMap.get(sfEntry.Pricebook2Id);

  if (!productId || !pricebookId) {
    return null; // Skip entries where product or pricebook not found
  }

  return {
    salesforceId: sfEntry.Id,
    pricebookId: pricebookId,
    productId: productId,
    unitPrice: sfEntry.UnitPrice ? parseFloat(sfEntry.UnitPrice) : 0,
    isActive: sfEntry.IsActive === true,
    useStandardPrice: sfEntry.UseStandardPrice === true,
    createdAt: sfEntry.CreatedDate ? new Date(sfEntry.CreatedDate) : new Date(),
    updatedAt: sfEntry.LastModifiedDate ? new Date(sfEntry.LastModifiedDate) : new Date(),
  };
}

async function migrateProducts() {
  console.log('Starting product migration from Salesforce...\n');
  const prisma = await getPrismaClient();

  // Maps to store Salesforce ID -> Database ID mappings
  const productIdMap = new Map();
  const pricebookIdMap = new Map();

  try {
    // Phase 1: Migrate Pricebooks first (they're referenced by entries)
    console.log('Phase 1: Migrating Pricebooks...');
    const pricebooksQuery = `
      SELECT ${PRICEBOOK_FIELDS.join(', ')}
      FROM Pricebook2
      ORDER BY IsStandard DESC, Name
    `;

    const pricebooks = await querySalesforce(pricebooksQuery);
    console.log(`  Found ${pricebooks.length} pricebooks`);

    if (pricebooks.length > 0) {
      for (const sfPricebook of pricebooks) {
        const data = transformPricebook(sfPricebook);
        const result = await prisma.pricebook.upsert({
          where: { salesforceId: data.salesforceId },
          create: data,
          update: data,
        });
        pricebookIdMap.set(sfPricebook.Id, result.id);
      }
      console.log(`  Migrated ${pricebooks.length} pricebooks`);
    }

    // Phase 2: Migrate Products
    console.log('\nPhase 2: Migrating Products...');
    const productsQuery = `
      SELECT ${PRODUCT_FIELDS.join(', ')}
      FROM Product2
      ORDER BY Family, Name
    `;

    const products = await querySalesforce(productsQuery);
    console.log(`  Found ${products.length} products`);

    if (products.length > 0) {
      // Process in batches of 100
      const batchSize = 100;
      let processed = 0;
      const familyCounts = {};

      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize);

        for (const sfProduct of batch) {
          const data = transformProduct(sfProduct);
          try {
            const result = await prisma.product.upsert({
              where: { salesforceId: data.salesforceId },
              create: data,
              update: data,
            });
            productIdMap.set(sfProduct.Id, result.id);
            familyCounts[data.family] = (familyCounts[data.family] || 0) + 1;
          } catch (err) {
            // Handle duplicate productCode constraint
            if (err.code === 'P2002' && err.meta?.target?.includes('product_code')) {
              // Try update without productCode
              const dataWithoutCode = { ...data };
              delete dataWithoutCode.productCode;
              const result = await prisma.product.upsert({
                where: { salesforceId: data.salesforceId },
                create: { ...data, productCode: `${data.productCode}_${Date.now()}` },
                update: dataWithoutCode,
              });
              productIdMap.set(sfProduct.Id, result.id);
              familyCounts[data.family] = (familyCounts[data.family] || 0) + 1;
            } else {
              console.error(`  Error migrating product ${sfProduct.Id}: ${err.message}`);
            }
          }
        }

        processed += batch.length;
        process.stdout.write(`\r  Processed ${processed}/${products.length} products...`);
      }
      console.log(`\n  Migrated ${products.length} products`);

      // Print summary by family
      console.log('\n  Products by family:');
      Object.entries(familyCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([family, count]) => {
          console.log(`    ${family}: ${count}`);
        });
    }

    // Phase 3: Migrate PricebookEntries
    console.log('\nPhase 3: Migrating PricebookEntries...');
    const entriesQuery = `
      SELECT ${PRICEBOOK_ENTRY_FIELDS.join(', ')}
      FROM PricebookEntry
      ORDER BY Pricebook2Id, Product2Id
    `;

    const entries = await querySalesforce(entriesQuery);
    console.log(`  Found ${entries.length} pricebook entries`);

    if (entries.length > 0) {
      const batchSize = 200;
      let processed = 0;
      let skipped = 0;

      for (let i = 0; i < entries.length; i += batchSize) {
        const batch = entries.slice(i, i + batchSize);

        for (const sfEntry of batch) {
          const data = transformPricebookEntry(sfEntry, productIdMap, pricebookIdMap);
          if (!data) {
            skipped++;
            continue;
          }

          try {
            await prisma.pricebookEntry.upsert({
              where: { salesforceId: data.salesforceId },
              create: data,
              update: data,
            });
          } catch (err) {
            // Handle duplicate pricebook+product constraint
            if (err.code === 'P2002') {
              // Update existing entry
              await prisma.pricebookEntry.updateMany({
                where: {
                  pricebookId: data.pricebookId,
                  productId: data.productId,
                },
                data: {
                  unitPrice: data.unitPrice,
                  isActive: data.isActive,
                  useStandardPrice: data.useStandardPrice,
                },
              });
            } else {
              console.error(`  Error migrating entry ${sfEntry.Id}: ${err.message}`);
            }
          }
        }

        processed += batch.length;
        process.stdout.write(`\r  Processed ${processed}/${entries.length} entries...`);
      }
      console.log(`\n  Migrated ${entries.length - skipped} pricebook entries (skipped ${skipped})`);
    }

    console.log('\n✓ Product migration complete!');

    // Print summary
    const [productCount, pricebookCount, entryCount] = await Promise.all([
      prisma.product.count(),
      prisma.pricebook.count(),
      prisma.pricebookEntry.count(),
    ]);

    console.log('\nDatabase summary:');
    console.log(`  Products: ${productCount}`);
    console.log(`  Pricebooks: ${pricebookCount}`);
    console.log(`  Pricebook Entries: ${entryCount}`);

  } catch (error) {
    console.error('\n✗ Migration failed:', error);
    throw error;
  } finally {
    await disconnect();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateProducts()
    .then(() => {
      console.log('\nMigration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\nMigration failed:', error);
      process.exit(1);
    });
}

export { migrateProducts };
