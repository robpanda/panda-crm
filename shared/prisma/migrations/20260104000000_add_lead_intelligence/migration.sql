-- Lead Intelligence / Predictive Scoring
-- Adds scoring fields to leads table and creates supporting tables

-- Add scoring fields to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_score INT DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_rank VARCHAR(1); -- A, B, C, D, F
ALTER TABLE leads ADD COLUMN IF NOT EXISTS score_factors JSONB;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS scored_at TIMESTAMP;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS score_version INT DEFAULT 1;

-- Demographic enrichment fields
ALTER TABLE leads ADD COLUMN IF NOT EXISTS census_tract VARCHAR(20);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS median_household_income INT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS median_home_value INT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS homeownership_rate DECIMAL(5,2);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS median_age DECIMAL(4,1);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMP;

-- Index for sorting by score
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(lead_score DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_rank ON leads(lead_rank, created_at DESC);

-- Lead Score History table (track score changes over time)
CREATE TABLE IF NOT EXISTS lead_score_history (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  score INT NOT NULL,
  rank VARCHAR(1) NOT NULL,
  score_factors JSONB,
  score_version INT DEFAULT 1,
  scored_at TIMESTAMP DEFAULT NOW(),
  scored_by VARCHAR(50) DEFAULT 'system', -- 'system', 'manual', 'ml_model'

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_score_history_lead ON lead_score_history(lead_id, scored_at DESC);

-- Lead Scoring Model table (store trained model metadata)
CREATE TABLE IF NOT EXISTS lead_scoring_models (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name VARCHAR(100) NOT NULL,
  version INT NOT NULL,
  model_type VARCHAR(50) NOT NULL, -- 'xgboost', 'logistic_regression', 'rule_based'

  -- Training metadata
  trained_at TIMESTAMP,
  training_samples INT,
  training_positives INT, -- converted leads
  training_negatives INT, -- non-converted leads

  -- Performance metrics
  accuracy DECIMAL(5,4),
  precision_score DECIMAL(5,4),
  recall_score DECIMAL(5,4),
  f1_score DECIMAL(5,4),
  auc_roc DECIMAL(5,4),

  -- Feature importance (top features)
  feature_importance JSONB,

  -- Model config
  hyperparameters JSONB,
  feature_columns JSONB,

  -- Status
  is_active BOOLEAN DEFAULT FALSE,
  deployed_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Scoring Rules table (rule-based scoring config)
CREATE TABLE IF NOT EXISTS lead_scoring_rules (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name VARCHAR(100) NOT NULL,
  description TEXT,

  -- Rule definition
  field VARCHAR(100) NOT NULL, -- e.g., 'source', 'state', 'workType'
  operator VARCHAR(20) NOT NULL, -- 'equals', 'contains', 'in', 'gte', 'lte', 'between'
  value JSONB NOT NULL, -- single value or array

  -- Score impact
  score_impact INT NOT NULL, -- points to add/subtract

  -- Categorization
  category VARCHAR(50), -- 'demographic', 'behavioral', 'property', 'engagement'

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  priority INT DEFAULT 0, -- evaluation order

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default scoring rules for roofing business
INSERT INTO lead_scoring_rules (id, name, description, field, operator, value, score_impact, category, priority) VALUES
-- Source scoring
('rule_source_selfgen', 'Self-Gen Lead', 'Sales rep generated lead', 'isSelfGen', 'equals', 'true', 25, 'source', 10),
('rule_source_referral', 'Referral Lead', 'Customer or partner referral', 'source', 'in', '["Customer Referral", "Partner Referral", "Employee Referral"]', 20, 'source', 10),
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

-- Property type scoring
('rule_prop_residential', 'Residential Property', 'Single family home', 'propertyType', 'equals', '"Residential"', 10, 'property', 40),

-- Engagement scoring
('rule_has_phone', 'Has Phone Number', 'Contact phone provided', 'phone', 'exists', 'true', 5, 'engagement', 50),
('rule_has_email', 'Has Email', 'Contact email provided', 'email', 'exists', 'true', 5, 'engagement', 50),
('rule_has_address', 'Has Full Address', 'Complete address provided', 'street', 'exists', 'true', 10, 'engagement', 50),

-- Demographic scoring (from Census enrichment)
('rule_income_high', 'High Income Area', 'Median income > $100K', 'medianHouseholdIncome', 'gte', '100000', 15, 'demographic', 60),
('rule_income_mid', 'Mid Income Area', 'Median income $75-100K', 'medianHouseholdIncome', 'between', '[75000, 100000]', 10, 'demographic', 60),
('rule_homevalue_high', 'High Home Value', 'Median home > $400K', 'medianHomeValue', 'gte', '400000', 15, 'demographic', 60),
('rule_homeowner_rate', 'High Homeownership', 'Homeownership > 70%', 'homeownershipRate', 'gte', '70', 10, 'demographic', 60)

ON CONFLICT (id) DO NOTHING;
