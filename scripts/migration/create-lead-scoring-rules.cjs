/**
 * Creates the lead_scoring_rules table and seeds default rules
 * Run with: DATABASE_URL="..." node create-lead-scoring-rules.cjs
 */

const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://pandacrm:PandaCRM2025Secure!@panda-crm-db.c1o4i6ekayqo.us-east-2.rds.amazonaws.com:5432/panda_crm';

async function main() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected!');

    // Check if table exists
    const checkResult = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'lead_scoring_rules'
      );
    `);

    const tableExists = checkResult.rows[0].exists;
    console.log('Table exists:', tableExists);

    if (!tableExists) {
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
    console.log('Existing rules:', rulesCount.rows[0].count);

    if (parseInt(rulesCount.rows[0].count) === 0) {
      console.log('Seeding default scoring rules...');

      await client.query(`
        INSERT INTO lead_scoring_rules (id, name, description, field, operator, value, score_impact, category, priority) VALUES
        -- Source scoring
        ('rule_source_selfgen', 'Self-Gen Lead', 'Sales rep generated lead', 'isSelfGen', 'equals', '"true"', 25, 'source', 10),
        ('rule_source_referral', 'Referral Lead', 'Customer or partner referral', 'source', 'in', '"Customer Referral,Partner Referral,Employee Referral"', 20, 'source', 10),
        ('rule_source_web', 'Web Lead', 'Came from website', 'source', 'equals', '"Web"', 10, 'source', 10),
        ('rule_source_doorknock', 'Door Knock Lead', 'Canvassing lead', 'source', 'equals', '"Door Knock"', 5, 'source', 10),

        -- Work type scoring (Insurance = higher ticket)
        ('rule_worktype_insurance', 'Insurance Work', 'Insurance claim work', 'workType', 'equals', '"INSURANCE"', 20, 'worktype', 20),
        ('rule_worktype_retail', 'Retail Work', 'Retail roofing work', 'workType', 'equals', '"RETAIL"', 10, 'worktype', 20),

        -- Geographic scoring (by state performance)
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

    // Verify
    const finalCount = await client.query('SELECT COUNT(*) FROM lead_scoring_rules WHERE is_active = true');
    console.log('\nActive scoring rules:', finalCount.rows[0].count);

    const rules = await client.query('SELECT name, field, operator, score_impact FROM lead_scoring_rules ORDER BY priority, name LIMIT 10');
    console.log('\nFirst 10 rules:');
    rules.rows.forEach(r => console.log(`  - ${r.name}: ${r.field} ${r.operator} (+${r.score_impact} pts)`));

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
