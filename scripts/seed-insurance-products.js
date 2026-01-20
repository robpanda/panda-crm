// Seed Insurance Products
// Creates products with insurance-specific families for use in quote builder
// Run with: node scripts/seed-insurance-products.js

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Insurance-specific product families and their line items
const insuranceProducts = [
  // Roof RCV (Replacement Cost Value) items
  { name: 'Roof RCV - Shingles', family: 'Roof RCV', description: 'Replacement cost value for roof shingles', unitPrice: 0, productCode: 'INS-ROOF-SHINGLES' },
  { name: 'Roof RCV - Underlayment', family: 'Roof RCV', description: 'Replacement cost value for underlayment', unitPrice: 0, productCode: 'INS-ROOF-UNDER' },
  { name: 'Roof RCV - Ridge Cap', family: 'Roof RCV', description: 'Replacement cost value for ridge cap', unitPrice: 0, productCode: 'INS-ROOF-RIDGE' },
  { name: 'Roof RCV - Flashing', family: 'Roof RCV', description: 'Replacement cost value for flashing', unitPrice: 0, productCode: 'INS-ROOF-FLASH' },
  { name: 'Roof RCV - Ventilation', family: 'Roof RCV', description: 'Replacement cost value for ventilation', unitPrice: 0, productCode: 'INS-ROOF-VENT' },
  { name: 'Roof RCV - Drip Edge', family: 'Roof RCV', description: 'Replacement cost value for drip edge', unitPrice: 0, productCode: 'INS-ROOF-DRIP' },
  { name: 'Roof RCV - Ice & Water Shield', family: 'Roof RCV', description: 'Replacement cost value for ice & water shield', unitPrice: 0, productCode: 'INS-ROOF-IW' },
  { name: 'Roof RCV - Starter Strip', family: 'Roof RCV', description: 'Replacement cost value for starter strip', unitPrice: 0, productCode: 'INS-ROOF-START' },
  { name: 'Roof RCV - Tear Off', family: 'Roof RCV', description: 'Tear off and disposal of existing roof', unitPrice: 0, productCode: 'INS-ROOF-TEAR' },
  { name: 'Roof RCV - Labor', family: 'Roof RCV', description: 'Labor for roof installation', unitPrice: 0, productCode: 'INS-ROOF-LABOR' },

  // Siding RCV items
  { name: 'Siding RCV - Vinyl Siding', family: 'Siding RCV', description: 'Replacement cost value for vinyl siding', unitPrice: 0, productCode: 'INS-SIDE-VINYL' },
  { name: 'Siding RCV - Aluminum Siding', family: 'Siding RCV', description: 'Replacement cost value for aluminum siding', unitPrice: 0, productCode: 'INS-SIDE-ALUM' },
  { name: 'Siding RCV - Fiber Cement', family: 'Siding RCV', description: 'Replacement cost value for fiber cement siding', unitPrice: 0, productCode: 'INS-SIDE-FC' },
  { name: 'Siding RCV - Soffit', family: 'Siding RCV', description: 'Replacement cost value for soffit', unitPrice: 0, productCode: 'INS-SIDE-SOFFIT' },
  { name: 'Siding RCV - Fascia', family: 'Siding RCV', description: 'Replacement cost value for fascia', unitPrice: 0, productCode: 'INS-SIDE-FASCIA' },
  { name: 'Siding RCV - J-Channel', family: 'Siding RCV', description: 'Replacement cost value for J-channel', unitPrice: 0, productCode: 'INS-SIDE-JCHAN' },
  { name: 'Siding RCV - Tear Off', family: 'Siding RCV', description: 'Tear off and disposal of existing siding', unitPrice: 0, productCode: 'INS-SIDE-TEAR' },
  { name: 'Siding RCV - Labor', family: 'Siding RCV', description: 'Labor for siding installation', unitPrice: 0, productCode: 'INS-SIDE-LABOR' },

  // Gutters RCV items
  { name: 'Gutters RCV - Seamless Gutters', family: 'Gutters RCV', description: 'Replacement cost value for seamless gutters', unitPrice: 0, productCode: 'INS-GUT-SEAM' },
  { name: 'Gutters RCV - Downspouts', family: 'Gutters RCV', description: 'Replacement cost value for downspouts', unitPrice: 0, productCode: 'INS-GUT-DOWN' },
  { name: 'Gutters RCV - Gutter Guards', family: 'Gutters RCV', description: 'Replacement cost value for gutter guards', unitPrice: 0, productCode: 'INS-GUT-GUARD' },
  { name: 'Gutters RCV - Elbows', family: 'Gutters RCV', description: 'Replacement cost value for elbows', unitPrice: 0, productCode: 'INS-GUT-ELBOW' },
  { name: 'Gutters RCV - Labor', family: 'Gutters RCV', description: 'Labor for gutter installation', unitPrice: 0, productCode: 'INS-GUT-LABOR' },

  // Interior RCV items
  { name: 'Interior RCV - Drywall', family: 'Interior RCV', description: 'Replacement cost value for drywall repair', unitPrice: 0, productCode: 'INS-INT-DRYWALL' },
  { name: 'Interior RCV - Paint', family: 'Interior RCV', description: 'Replacement cost value for painting', unitPrice: 0, productCode: 'INS-INT-PAINT' },
  { name: 'Interior RCV - Ceiling', family: 'Interior RCV', description: 'Replacement cost value for ceiling repair', unitPrice: 0, productCode: 'INS-INT-CEIL' },
  { name: 'Interior RCV - Insulation', family: 'Interior RCV', description: 'Replacement cost value for insulation', unitPrice: 0, productCode: 'INS-INT-INSUL' },
  { name: 'Interior RCV - Flooring', family: 'Interior RCV', description: 'Replacement cost value for flooring', unitPrice: 0, productCode: 'INS-INT-FLOOR' },
  { name: 'Interior RCV - Labor', family: 'Interior RCV', description: 'Labor for interior work', unitPrice: 0, productCode: 'INS-INT-LABOR' },

  // Deductible and Depreciation (typically negative values applied to quote)
  { name: 'Homeowner Deductible', family: 'Deductible', description: 'Homeowner insurance deductible (customer responsibility)', unitPrice: 0, productCode: 'INS-DEDUCT' },
  { name: 'Depreciation Holdback', family: 'Depreciation', description: 'Depreciation held back by insurance (recoverable after completion)', unitPrice: 0, productCode: 'INS-DEPREC' },

  // Supplement items
  { name: 'Supplement - Roof', family: 'Supplements', description: 'Additional roof work approved via supplement', unitPrice: 0, productCode: 'INS-SUPP-ROOF' },
  { name: 'Supplement - Siding', family: 'Supplements', description: 'Additional siding work approved via supplement', unitPrice: 0, productCode: 'INS-SUPP-SIDE' },
  { name: 'Supplement - Gutters', family: 'Supplements', description: 'Additional gutter work approved via supplement', unitPrice: 0, productCode: 'INS-SUPP-GUT' },
  { name: 'Supplement - Interior', family: 'Supplements', description: 'Additional interior work approved via supplement', unitPrice: 0, productCode: 'INS-SUPP-INT' },
  { name: 'Supplement - Code Upgrade', family: 'Supplements', description: 'Building code upgrade supplement', unitPrice: 0, productCode: 'INS-SUPP-CODE' },
  { name: 'Supplement - Other', family: 'Supplements', description: 'Other supplemental work', unitPrice: 0, productCode: 'INS-SUPP-OTHER' },

  // ACV (Actual Cash Value) - initial payment from insurance
  { name: 'ACV Payment - Initial', family: 'ACV', description: 'Initial actual cash value payment from insurance', unitPrice: 0, productCode: 'INS-ACV-INIT' },
  { name: 'ACV Payment - Supplement', family: 'ACV', description: 'Supplemental actual cash value payment', unitPrice: 0, productCode: 'INS-ACV-SUPP' },
];

async function seed() {
  console.log('Seeding insurance products...');

  for (const product of insuranceProducts) {
    try {
      // Check if product already exists by code
      const existing = await prisma.product.findFirst({
        where: { productCode: product.productCode },
      });

      if (existing) {
        console.log(`  Skipping existing product: ${product.productCode}`);
        continue;
      }

      await prisma.product.create({
        data: {
          ...product,
          isActive: true,
          quantityUnitOfMeasure: 'SQ FT', // Default unit
        },
      });

      console.log(`  Created: ${product.name} (${product.family})`);
    } catch (error) {
      console.error(`  Error creating ${product.name}:`, error.message);
    }
  }

  console.log('\nSeeding complete!');

  // Print summary
  const familyCounts = {};
  for (const p of insuranceProducts) {
    familyCounts[p.family] = (familyCounts[p.family] || 0) + 1;
  }
  console.log('\nProducts by family:');
  for (const [family, count] of Object.entries(familyCounts)) {
    console.log(`  ${family}: ${count}`);
  }
}

seed()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
