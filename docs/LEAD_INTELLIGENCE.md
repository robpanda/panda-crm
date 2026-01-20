# Lead Intelligence System - Panda CRM

## Overview

Open-source lead scoring and intelligence system that combines:
1. **Rule-Based Scoring** - Configurable business rules (instant)
2. **Census Demographic Enrichment** - Free US Census API data
3. **ML Prediction** - XGBoost model trained on conversion history

## Cost: $0/month

This is a fully open-source solution using:
- Free US Census Bureau API for demographics
- Self-hosted ML model (XGBoost)
- No external paid services required

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    LEAD INTELLIGENCE SYSTEM                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐            │
│  │ Rule-Based  │    │  ML Model   │    │   Census    │            │
│  │  Scoring    │ +  │  (XGBoost)  │ +  │ Enrichment  │            │
│  │  (instant)  │    │  (trained)  │    │   (free)    │            │
│  └─────────────┘    └─────────────┘    └─────────────┘            │
│         │                  │                  │                    │
│         └──────────────────┼──────────────────┘                    │
│                            ▼                                       │
│                   ┌─────────────────┐                              │
│                   │  Combined Score │                              │
│                   │   A/B/C/D/F     │                              │
│                   └─────────────────┘                              │
└─────────────────────────────────────────────────────────────────────┘
```

## Lead Ranks

| Rank | Score Range | Label | Description |
|------|-------------|-------|-------------|
| A | 80-100 | Hot Lead | High conversion probability |
| B | 60-79 | Warm Lead | Good conversion potential |
| C | 40-59 | Average | Standard priority |
| D | 20-39 | Cool Lead | Lower conversion likelihood |
| F | 0-19 | Low Priority | Minimal conversion signals |

## Scoring Components

### 1. Rule-Based Scoring (50% weight)

Configurable rules stored in `lead_scoring_rules` table:

| Rule | Impact | Category |
|------|--------|----------|
| Self-Gen Lead | +25 | source |
| Referral Lead | +20 | source |
| Insurance Work Type | +20 | worktype |
| Maryland/Virginia | +15 | geographic |
| High Income Area ($100K+) | +20 | demographic |
| High Home Value ($350K+) | +20 | property |
| Complete Address | +10 | engagement |

### 2. Census Demographic Enrichment (30% weight)

Free data from US Census Bureau ACS 5-year estimates:

| Data Point | Impact |
|------------|--------|
| Median Household Income | Up to +25 |
| Median Home Value | Up to +25 |
| Homeownership Rate | Up to +20 |
| Median Age (45-65 optimal) | Up to +15 |

### 3. ML Prediction (20% weight - optional)

XGBoost model trained on historical conversion data:

**Features used:**
- Lead source
- Work type
- Property type
- State
- Is self-gen
- Has phone/email/address
- Demographic enrichment values
- Days to contact
- Lead age

## API Endpoints

### Score a Single Lead
```bash
POST /api/leads/scoring/score/:id
{
  "enrichDemographics": true,
  "useML": false
}
```

### Batch Score Leads
```bash
POST /api/leads/scoring/batch
{
  "leadIds": ["lead1", "lead2", "lead3"],
  "enrichDemographics": true
}
```

### Score All Unscored Leads
```bash
POST /api/leads/scoring/score-unscored?limit=100
```

### Get Scoring Statistics
```bash
GET /api/leads/scoring/stats
```

**Response:**
```json
{
  "totalLeads": 15000,
  "scoredLeads": 12500,
  "unscoredLeads": 2500,
  "scoredPercent": 83,
  "rankDistribution": {
    "A": 1500,
    "B": 3000,
    "C": 4500,
    "D": 2500,
    "F": 1000
  },
  "avgScoreBySource": [
    { "source": "Self-Gen", "avgScore": 72, "count": 2000 },
    { "source": "Referral", "avgScore": 68, "count": 1500 }
  ]
}
```

### Get Scoring Rules
```bash
GET /api/leads/scoring/rules
```

### Enrich Lead with Census Data
```bash
GET /api/leads/scoring/enrich/:id
```

## Database Schema

### Lead Table Additions
```sql
ALTER TABLE leads ADD COLUMN lead_score INT DEFAULT 0;
ALTER TABLE leads ADD COLUMN lead_rank VARCHAR(1); -- A, B, C, D, F
ALTER TABLE leads ADD COLUMN score_factors JSONB;
ALTER TABLE leads ADD COLUMN scored_at TIMESTAMP;

-- Census enrichment
ALTER TABLE leads ADD COLUMN median_household_income INT;
ALTER TABLE leads ADD COLUMN median_home_value INT;
ALTER TABLE leads ADD COLUMN homeownership_rate DECIMAL(5,2);
ALTER TABLE leads ADD COLUMN median_age DECIMAL(4,1);
ALTER TABLE leads ADD COLUMN enriched_at TIMESTAMP;
```

### Supporting Tables
- `lead_score_history` - Track score changes over time
- `lead_scoring_rules` - Configurable scoring rules
- `lead_scoring_models` - ML model metadata and metrics

## ML Model Training

### Requirements
```bash
pip install xgboost scikit-learn pandas numpy shap psycopg2-binary python-dotenv joblib
```

### Training Command
```bash
cd /panda-crm/scripts/ml
DATABASE_URL="postgresql://..." python train-lead-scoring-model.py --output ./models --evaluate --register
```

### Model Performance Targets
- AUC-ROC >= 0.7: Good
- AUC-ROC >= 0.6: Fair
- AUC-ROC < 0.6: Need more data

## UI Components

### LeadRankBadge
Compact badge showing rank letter with color coding.

### LeadScoreBar
Visual progress bar showing score 0-100.

### LeadScoreCard
Full card with rank, score, and top factors.

### LeadScoreDistribution
Chart showing distribution of ranks across all leads.

## Usage in Leads List

The lead rank badge appears in the lead list when a lead has been scored:

```jsx
{lead.leadRank && (
  <LeadScoreTooltip
    rank={lead.leadRank}
    score={lead.leadScore}
    factors={lead.scoreFactors}
  >
    <LeadRankBadge rank={lead.leadRank} score={lead.leadScore} size="sm" />
  </LeadScoreTooltip>
)}
```

## Scheduled Scoring

To automatically score new leads, add a cron job or scheduled task:

```bash
# Score new leads every hour
0 * * * * curl -X POST https://api.pandacrm.com/api/leads/scoring/score-unscored?limit=200
```

## Comparison vs Faraday

| Feature | Open Source (Ours) | Faraday |
|---------|-------------------|---------|
| Monthly Cost | $0 | $99+ |
| Data Points | ~20 (Census) | 1,500+ |
| Property Data | Via Census (aggregate) | Individual property |
| Real-time Scoring | Yes | Yes |
| Explainability | SHAP values | Built-in |
| Setup Time | 1-2 weeks | 2-3 weeks |

## Future Enhancements

1. **Property Data Integration** - Add BatchData or similar for individual property details ($50-100/mo)
2. **Real-time ML Scoring** - Deploy model to Lambda/SageMaker
3. **A/B Testing** - Compare rule-based vs ML scoring effectiveness
4. **Conversion Tracking** - Automated model retraining on new conversion data

## Files

| File | Purpose |
|------|---------|
| `services/leads/src/services/leadScoringService.js` | Main scoring service |
| `scripts/ml/train-lead-scoring-model.py` | ML model training pipeline |
| `shared/prisma/migrations/20260104000000_add_lead_intelligence/` | Database schema |
| `frontend/src/components/LeadRankBadge.jsx` | UI components |
