/**
 * AWS Lambda: Score New Leads
 *
 * This Lambda function runs on a schedule (e.g., every hour) to score
 * newly created leads that haven't been scored yet.
 *
 * Environment Variables:
 * - DATABASE_URL: PostgreSQL connection string
 * - CENSUS_API_KEY: Optional Census API key for higher rate limits
 *
 * Trigger: CloudWatch Events / EventBridge Rule
 * Schedule: rate(1 hour) or cron(0 * * * ? *)
 */

const pg = require('pg');

const RANK_THRESHOLDS = { A: 80, B: 60, C: 40, D: 20, F: 0 };
const MAX_LEADS_PER_RUN = 200;

function scoreToRank(score) {
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  if (score >= 20) return 'D';
  return 'F';
}

async function scoreLead(client, lead, rules) {
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

        if (medianIncome >= 100000) { totalScore += 15; factors.push({ name: 'High Income Area', impact: 15 }); }
        else if (medianIncome >= 75000) { totalScore += 10; factors.push({ name: 'Mid Income Area', impact: 10 }); }

        if (medianHomeValue >= 400000) { totalScore += 15; factors.push({ name: 'High Home Value', impact: 15 }); }
        else if (medianHomeValue >= 250000) { totalScore += 10; factors.push({ name: 'Good Home Value', impact: 10 }); }

        if (homeownershipRate >= 70) { totalScore += 10; factors.push({ name: 'High Homeownership', impact: 10 }); }
      }
    } catch (e) {
      console.warn(`Census API error for ZIP ${lead.postal_code}:`, e.message);
    }
  }

  const normalizedScore = Math.min(100, Math.round((totalScore / 150) * 100));
  const rank = scoreToRank(normalizedScore);

  // Update lead with score
  const enriched = enrichmentData ? true : false;
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
    normalizedScore,
    rank,
    JSON.stringify(factors),
    enrichmentData?.medianIncome || null,
    enrichmentData?.medianHomeValue || null,
    enrichmentData?.homeownershipRate || null,
    enrichmentData?.medianAge || null,
    enriched ? new Date() : null,
    lead.id
  ]);

  return { score: normalizedScore, rank };
}

// Ensure lead_scoring_rules table exists and has default rules
async function ensureScoringRulesTable(client) {
  // Check if table exists
  const checkResult = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_name = 'lead_scoring_rules'
    );
  `);

  if (!checkResult.rows[0].exists) {
    console.log('Creating lead_scoring_rules table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS lead_scoring_rules (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        field VARCHAR(100) NOT NULL,
        operator VARCHAR(20) NOT NULL,
        value JSONB NOT NULL,
        score_impact INT NOT NULL,
        category VARCHAR(50),
        is_active BOOLEAN DEFAULT TRUE,
        priority INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Table created!');
  }

  // Check if rules exist
  const rulesCount = await client.query('SELECT COUNT(*) FROM lead_scoring_rules');
  if (parseInt(rulesCount.rows[0].count) === 0) {
    console.log('Seeding default scoring rules...');
    await client.query(`
      INSERT INTO lead_scoring_rules (id, name, description, field, operator, value, score_impact, category, priority) VALUES
      -- Source scoring
      ('rule_source_selfgen', 'Self-Gen Lead', 'Sales rep generated lead', 'isSelfGen', 'equals', '"true"', 25, 'source', 10),
      ('rule_source_referral', 'Referral Lead', 'Customer or partner referral', 'source', 'in', '"Customer Referral,Partner Referral,Employee Referral"', 20, 'source', 10),
      ('rule_source_web', 'Web Lead', 'Came from website', 'source', 'equals', '"Web"', 10, 'source', 10),
      ('rule_source_doorknock', 'Door Knock Lead', 'Canvassing lead', 'source', 'equals', '"Door Knock"', 5, 'source', 10),
      -- Work type scoring
      ('rule_worktype_insurance', 'Insurance Work', 'Insurance claim work', 'workType', 'equals', '"INSURANCE"', 20, 'worktype', 20),
      ('rule_worktype_retail', 'Retail Work', 'Retail roofing work', 'workType', 'equals', '"RETAIL"', 10, 'worktype', 20),
      -- Geographic scoring
      ('rule_geo_md', 'Maryland Lead', 'Strong market', 'state', 'equals', '"MD"', 15, 'geographic', 30),
      ('rule_geo_va', 'Virginia Lead', 'Strong market', 'state', 'equals', '"VA"', 15, 'geographic', 30),
      ('rule_geo_de', 'Delaware Lead', 'Growing market', 'state', 'equals', '"DE"', 10, 'geographic', 30),
      ('rule_geo_nj', 'New Jersey Lead', 'Growing market', 'state', 'equals', '"NJ"', 10, 'geographic', 30),
      ('rule_geo_nc', 'North Carolina Lead', 'Growing market', 'state', 'equals', '"NC"', 10, 'geographic', 30),
      ('rule_geo_pa', 'Pennsylvania Lead', 'Growing market', 'state', 'equals', '"PA"', 10, 'geographic', 30),
      -- Property type scoring
      ('rule_prop_residential', 'Residential Property', 'Single family home', 'propertyType', 'equals', '"Residential"', 10, 'property', 40),
      -- Engagement scoring
      ('rule_has_phone', 'Has Phone Number', 'Contact phone provided', 'phone', 'exists', '"true"', 5, 'engagement', 50),
      ('rule_has_email', 'Has Email', 'Contact email provided', 'email', 'exists', '"true"', 5, 'engagement', 50),
      ('rule_has_address', 'Has Full Address', 'Complete address provided', 'street', 'exists', '"true"', 10, 'engagement', 50)
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log('Default rules seeded!');
  }
}

exports.handler = async function(event, context) {
  console.log('Starting lead scoring job...');

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Ensure table exists and has rules
    await ensureScoringRulesTable(client);

    // Get scoring rules
    const rulesResult = await client.query('SELECT * FROM lead_scoring_rules WHERE is_active = true ORDER BY priority');
    const rules = rulesResult.rows;
    console.log(`Loaded ${rules.length} scoring rules`);

    // Get unscored leads (created in last 24 hours first, then older ones)
    const leadsResult = await client.query(`
      SELECT id, first_name, last_name, state, postal_code, lead_source, work_type, is_self_gen,
             property_type, phone, email, street
      FROM leads
      WHERE scored_at IS NULL
      ORDER BY created_at DESC
      LIMIT $1
    `, [MAX_LEADS_PER_RUN]);

    const leads = leadsResult.rows;
    console.log(`Found ${leads.length} unscored leads`);

    if (leads.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'No unscored leads', scored: 0 })
      };
    }

    let scored = 0;
    let errors = 0;
    const rankCounts = { A: 0, B: 0, C: 0, D: 0, F: 0 };

    for (const lead of leads) {
      try {
        const result = await scoreLead(client, lead, rules);
        rankCounts[result.rank]++;
        scored++;
      } catch (e) {
        console.error(`Error scoring lead ${lead.id}:`, e.message);
        errors++;
      }
    }

    const summary = {
      scored,
      errors,
      rankDistribution: rankCounts,
      timestamp: new Date().toISOString()
    };

    console.log('Scoring complete:', summary);

    return {
      statusCode: 200,
      body: JSON.stringify(summary)
    };

  } catch (error) {
    console.error('Lambda error:', error);
    throw error;
  } finally {
    await client.end();
  }
}
