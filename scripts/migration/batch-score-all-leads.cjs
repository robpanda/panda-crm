#!/usr/bin/env node
// Batch Score All Unscored Leads
// Usage: node batch-score-all-leads.cjs [batchSize] [maxLeads]

const pg = require('pg');

const client = new pg.Client({
  host: 'panda-crm-db.c1o4i6ekayqo.us-east-2.rds.amazonaws.com',
  port: 5432,
  database: 'panda_crm',
  user: 'pandacrm',
  password: 'PandaCRM2025Secure!',
  ssl: { rejectUnauthorized: false }
});

function scoreToRank(score) {
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  if (score >= 20) return 'D';
  return 'F';
}

async function scoreLead(lead, rules) {
  let totalScore = 0;
  const factors = [];

  // Evaluate rules
  for (const rule of rules) {
    let fieldValue = null;

    switch(rule.field) {
      case 'source': fieldValue = lead.lead_source; break;
      case 'state': fieldValue = lead.state; break;
      case 'workType': fieldValue = lead.work_type; break;
      case 'isSelfGen': fieldValue = lead.is_self_gen; break;
      case 'propertyType': fieldValue = lead.property_type; break;
      case 'phone': fieldValue = lead.phone; break;
      case 'email': fieldValue = lead.email; break;
      case 'street': fieldValue = lead.street; break;
      default: fieldValue = lead[rule.field];
    }

    let matches = false;
    const ruleValue = String(rule.value).replace(/"/g, '');

    switch(rule.operator) {
      case 'equals':
        matches = String(fieldValue || '').toLowerCase() === ruleValue.toLowerCase();
        break;
      case 'exists':
        matches = fieldValue !== null && fieldValue !== undefined && fieldValue !== '';
        break;
      case 'in':
        const inArray = ruleValue.split(',').map(v => v.trim().toLowerCase());
        matches = inArray.includes(String(fieldValue || '').toLowerCase());
        break;
      case 'gte':
        matches = Number(fieldValue) >= Number(ruleValue);
        break;
    }

    if (matches) {
      totalScore += rule.score_impact;
      factors.push({ name: rule.name, impact: rule.score_impact });
    }
  }

  // Census enrichment
  let enrichmentData = null;
  if (lead.postal_code) {
    try {
      const zip = lead.postal_code.substring(0, 5);
      const url = `https://api.census.gov/data/2022/acs/acs5?get=NAME,B19013_001E,B25077_001E,B25003_002E,B25003_001E,B01002_001E&for=zip%20code%20tabulation%20area:${zip}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data && data.length > 1) {
        const values = data[1];
        const medianIncome = parseInt(values[1]) || 0;
        const medianHomeValue = parseInt(values[2]) || 0;
        const ownerOccupied = parseInt(values[3]) || 0;
        const totalOccupied = parseInt(values[4]) || 1;
        const homeownershipRate = Math.round((ownerOccupied / totalOccupied) * 100);
        const medianAge = parseFloat(values[5]) || null;

        enrichmentData = { medianIncome, medianHomeValue, homeownershipRate, medianAge };

        // Add demographic scores
        if (medianIncome >= 100000) { totalScore += 15; factors.push({ name: 'High Income Area', impact: 15 }); }
        else if (medianIncome >= 75000) { totalScore += 10; factors.push({ name: 'Mid Income Area', impact: 10 }); }

        if (medianHomeValue >= 400000) { totalScore += 15; factors.push({ name: 'High Home Value', impact: 15 }); }
        else if (medianHomeValue >= 250000) { totalScore += 10; factors.push({ name: 'Good Home Value', impact: 10 }); }

        if (homeownershipRate >= 70) { totalScore += 10; factors.push({ name: 'High Homeownership', impact: 10 }); }
      }
    } catch (e) {
      // Census API error - continue without enrichment
    }
  }

  const normalizedScore = Math.min(100, Math.round((totalScore / 150) * 100));
  const rank = scoreToRank(normalizedScore);

  return { score: normalizedScore, rank, factors, enrichmentData };
}

async function run() {
  const batchSize = parseInt(process.argv[2]) || 100;
  const maxLeads = parseInt(process.argv[3]) || 99999;

  await client.connect();
  console.log('Connected!\n');

  // Get scoring rules
  const rulesResult = await client.query('SELECT * FROM lead_scoring_rules WHERE is_active = true ORDER BY priority');
  const rules = rulesResult.rows;
  console.log(`Loaded ${rules.length} scoring rules`);

  // Count unscored leads
  const countResult = await client.query('SELECT COUNT(*) as count FROM leads WHERE scored_at IS NULL');
  const totalUnscored = parseInt(countResult.rows[0].count);
  console.log(`Total unscored leads: ${totalUnscored}`);
  console.log(`Will process up to: ${Math.min(totalUnscored, maxLeads)} leads\n`);

  let processed = 0;
  let scored = 0;
  let errors = 0;
  const rankCounts = { A: 0, B: 0, C: 0, D: 0, F: 0 };

  while (processed < maxLeads) {
    // Get batch of unscored leads
    const leadsResult = await client.query(`
      SELECT id, first_name, last_name, state, postal_code, lead_source, work_type, is_self_gen,
             property_type, phone, email, street
      FROM leads
      WHERE scored_at IS NULL
      LIMIT $1
    `, [batchSize]);

    if (leadsResult.rows.length === 0) {
      console.log('\nNo more unscored leads!');
      break;
    }

    for (const lead of leadsResult.rows) {
      try {
        const result = await scoreLead(lead, rules);

        // Update lead with score
        const enriched = result.enrichmentData ? true : false;
        await client.query(`
          UPDATE leads SET
            lead_score = $1,
            lead_rank = $2,
            score_factors = $3,
            scored_at = NOW(),
            score_version = 1,
            median_household_income = $4,
            median_home_value = $5,
            homeownership_rate = $6,
            median_age = $7,
            enriched_at = $8
          WHERE id = $9
        `, [
          result.score,
          result.rank,
          JSON.stringify(result.factors),
          result.enrichmentData?.medianIncome || null,
          result.enrichmentData?.medianHomeValue || null,
          result.enrichmentData?.homeownershipRate || null,
          result.enrichmentData?.medianAge || null,
          enriched ? new Date() : null,
          lead.id
        ]);

        rankCounts[result.rank]++;
        scored++;
      } catch (e) {
        console.error('Error scoring lead:', lead.id, e.message);
        errors++;
      }

      processed++;

      if (processed % 100 === 0) {
        console.log(`Processed: ${processed} | Scored: ${scored} | Errors: ${errors}`);
      }
    }

    // Small delay between batches to be nice to Census API
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n========================================');
  console.log('BATCH SCORING COMPLETE');
  console.log('========================================');
  console.log(`Total processed: ${processed}`);
  console.log(`Successfully scored: ${scored}`);
  console.log(`Errors: ${errors}`);
  console.log('\nRank Distribution:');
  console.log(`  A (Hot Lead):     ${rankCounts.A}`);
  console.log(`  B (Warm Lead):    ${rankCounts.B}`);
  console.log(`  C (Average):      ${rankCounts.C}`);
  console.log(`  D (Cool Lead):    ${rankCounts.D}`);
  console.log(`  F (Low Priority): ${rankCounts.F}`);

  await client.end();
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
