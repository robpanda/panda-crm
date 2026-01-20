#!/usr/bin/env node
/**
 * Analyze orphan commissions to understand what data they have
 * and find patterns for matching
 */

import { prisma, disconnect } from './prisma-client.js';

async function analyze() {
  // Get sample of orphan commissions
  const orphans = await prisma.$queryRaw`
    SELECT
      id, name, salesforce_id, owner_id, commission_value, created_at,
      commission_type::text as type
    FROM commissions
    WHERE opportunity_id IS NULL
    LIMIT 20
  `;

  console.log('Sample orphan commissions:');
  for (const c of orphans) {
    console.log('---');
    console.log('  Name:', c.name);
    console.log('  Type:', c.type);
    console.log('  Value:', Number(c.commission_value));
    console.log('  Created:', c.created_at);
    console.log('  Owner ID:', c.owner_id);
    console.log('  SF ID:', c.salesforce_id);
  }

  // Check if owner has opportunities we could match
  console.log('\n\nChecking if owners have opportunities...');
  const ownerAnalysis = await prisma.$queryRaw`
    SELECT
      c.owner_id,
      COUNT(DISTINCT c.id) as commission_count,
      COUNT(DISTINCT o.id) as opp_count
    FROM commissions c
    LEFT JOIN opportunities o ON c.owner_id = o.owner_id
    WHERE c.opportunity_id IS NULL
    GROUP BY c.owner_id
    HAVING COUNT(DISTINCT c.id) > 5
    ORDER BY COUNT(DISTINCT c.id) DESC
    LIMIT 10
  `;

  console.log('\nTop owners with orphan commissions:');
  for (const row of ownerAnalysis) {
    console.log(`  Owner ${row.owner_id}: ${row.commission_count} commissions, ${row.opp_count} opportunities`);
  }

  // Look at name patterns
  console.log('\n\nName patterns in orphan commissions:');
  const namePatterns = await prisma.$queryRaw`
    SELECT
      CASE
        WHEN name LIKE '%Panda Ext%' THEN 'Has Panda Ext-'
        WHEN name LIKE '%Commission%' THEN 'Contains Commission'
        WHEN name LIKE '%Override%' THEN 'Contains Override'
        WHEN name LIKE '% - %' THEN 'Has dash separator'
        ELSE 'Other'
      END as pattern,
      COUNT(*) as count
    FROM commissions
    WHERE opportunity_id IS NULL
    GROUP BY 1
    ORDER BY count DESC
  `;

  for (const row of namePatterns) {
    console.log(`  ${row.pattern}: ${row.count}`);
  }

  await disconnect();
}

analyze().catch(console.error);
