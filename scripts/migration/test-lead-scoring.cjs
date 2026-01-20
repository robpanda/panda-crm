#!/usr/bin/env node
// Test Lead Scoring on Sample Leads

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

async function run() {
  await client.connect();
  console.log('Connected!\n');

  // Get scoring rules
  const rulesResult = await client.query('SELECT * FROM lead_scoring_rules WHERE is_active = true ORDER BY priority');
  const rules = rulesResult.rows;
  console.log('Loaded', rules.length, 'scoring rules\n');

  // Get sample leads to score
  const limit = parseInt(process.argv[2]) || 5;
  const leadsResult = await client.query(`
    SELECT id, first_name, last_name, state, postal_code, lead_source, work_type, is_self_gen,
           property_type, phone, email, street
    FROM leads
    WHERE postal_code IS NOT NULL AND scored_at IS NULL
    LIMIT $1
  `, [limit]);

  for (const lead of leadsResult.rows) {
    console.log('='.repeat(60));
    console.log('Scoring: ' + lead.first_name + ' ' + lead.last_name);
    console.log('  State:', lead.state, '| ZIP:', lead.postal_code);
    console.log('  Source:', lead.lead_source, '| Self-Gen:', lead.is_self_gen);

    let totalScore = 0;
    const factors = [];

    // Evaluate rules
    for (const rule of rules) {
      let fieldValue = null;

      // Map field names
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

    // Census enrichment (fetch live)
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

          console.log('  Census: Income $' + medianIncome.toLocaleString() + ' | Home $' + medianHomeValue.toLocaleString() + ' | Own ' + homeownershipRate + '%');

          // Add demographic scores
          if (medianIncome >= 100000) { totalScore += 15; factors.push({ name: 'High Income Area', impact: 15 }); }
          else if (medianIncome >= 75000) { totalScore += 10; factors.push({ name: 'Mid Income Area', impact: 10 }); }

          if (medianHomeValue >= 400000) { totalScore += 15; factors.push({ name: 'High Home Value', impact: 15 }); }
          else if (medianHomeValue >= 250000) { totalScore += 10; factors.push({ name: 'Good Home Value', impact: 10 }); }

          if (homeownershipRate >= 70) { totalScore += 10; factors.push({ name: 'High Homeownership', impact: 10 }); }

          // Save enrichment
          await client.query(`
            UPDATE leads SET
              median_household_income = $1,
              median_home_value = $2,
              homeownership_rate = $3,
              enriched_at = NOW()
            WHERE id = $4
          `, [medianIncome, medianHomeValue, homeownershipRate, lead.id]);
        }
      } catch (e) {
        console.log('  Census API error:', e.message);
      }
    }

    // Normalize score (max ~150 points possible)
    const normalizedScore = Math.min(100, Math.round((totalScore / 150) * 100));
    const rank = scoreToRank(normalizedScore);

    console.log('  Factors:', factors.map(f => f.name + '(+' + f.impact + ')').join(', '));
    console.log('  Raw Score:', totalScore, '| Normalized:', normalizedScore, '| Rank:', rank);

    // Save score
    await client.query(`
      UPDATE leads SET
        lead_score = $1,
        lead_rank = $2,
        score_factors = $3,
        scored_at = NOW(),
        score_version = 1
      WHERE id = $4
    `, [normalizedScore, rank, JSON.stringify(factors), lead.id]);

    console.log('  ✓ Saved!\n');
  }

  // Check updated leads
  const scored = await client.query(`
    SELECT id, first_name, last_name, lead_score, lead_rank
    FROM leads
    WHERE scored_at IS NOT NULL
    ORDER BY scored_at DESC
    LIMIT 10
  `);
  console.log('\nRecently scored leads:');
  scored.rows.forEach(l => console.log('  ' + l.first_name + ' ' + l.last_name + ': ' + l.lead_score + ' (' + l.lead_rank + ')'));

  await client.end();
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
