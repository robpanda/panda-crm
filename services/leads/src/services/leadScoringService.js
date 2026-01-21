// Lead Scoring Service - Open Source Lead Intelligence
// Combines rule-based scoring, Census demographic enrichment, and ML predictions
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();

// Census API configuration (FREE - no API key needed for basic queries)
const CENSUS_API_BASE = 'https://api.census.gov/data';
const CENSUS_YEAR = '2022'; // Latest ACS 5-year estimates
const CENSUS_DATASET = 'acs/acs5';

// Score thresholds for letter grades
const RANK_THRESHOLDS = {
  A: 80, // 80-100 = Hot Lead
  B: 60, // 60-79 = Warm Lead
  C: 40, // 40-59 = Average
  D: 20, // 20-39 = Cool Lead
  F: 0,  // 0-19 = Low Priority
};

class LeadScoringService {
  constructor() {
    this.rulesCache = null;
    this.rulesCacheTime = null;
    this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  }

  // ============================================================================
  // MAIN SCORING METHODS
  // ============================================================================

  /**
   * Score a single lead using all available methods
   * @param {string} leadId - Lead ID to score
   * @param {Object} options - Scoring options
   * @returns {Object} Score result with rank and factors
   */
  async scoreLead(leadId, options = {}) {
    const { enrichDemographics = true, useML = false } = options;

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
    });

    if (!lead) {
      throw new Error(`Lead not found: ${leadId}`);
    }

    // Step 1: Rule-based scoring (instant)
    const ruleScore = await this.calculateRuleBasedScore(lead);

    // Step 2: Demographic enrichment if address available
    let demographicScore = { score: 0, factors: [] };
    if (enrichDemographics && lead.postalCode) {
      try {
        const enrichedData = await this.enrichWithCensusData(lead);
        if (enrichedData) {
          demographicScore = await this.calculateDemographicScore(enrichedData);
          // Update lead with enrichment data
          await this.updateLeadEnrichment(leadId, enrichedData);
        }
      } catch (error) {
        logger.warn(`Census enrichment failed for lead ${leadId}: ${error.message}`);
      }
    }

    // Step 3: ML prediction (if model is active)
    let mlScore = { score: 0, factors: [], confidence: 0 };
    if (useML) {
      try {
        mlScore = await this.getMLPrediction(lead);
      } catch (error) {
        logger.warn(`ML prediction failed for lead ${leadId}: ${error.message}`);
      }
    }

    // Combine scores (weighted average)
    const weights = {
      rule: 0.5,
      demographic: 0.3,
      ml: useML ? 0.2 : 0,
    };

    // Normalize weights if ML not used
    if (!useML) {
      weights.rule = 0.6;
      weights.demographic = 0.4;
    }

    const combinedScore = Math.min(100, Math.round(
      ruleScore.score * weights.rule +
      demographicScore.score * weights.demographic +
      mlScore.score * weights.ml
    ));

    const rank = this.scoreToRank(combinedScore);

    // Combine all factors
    const allFactors = [
      ...ruleScore.factors,
      ...demographicScore.factors,
      ...mlScore.factors,
    ].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

    // Update lead with score
    // Note: Using underscore field names from schema (lead_rank, lead_score, etc.)
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        score: combinedScore,
        lead_score: combinedScore,
        lead_rank: rank,
        score_factors: allFactors,
        scored_at: new Date(),
        score_version: 1,
      },
    });

    // Record score history (wrapped in try-catch in case table doesn't exist yet)
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO lead_score_history (id, lead_id, score, rank, score_factors, score_version, scored_by, created_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, NOW())`,
        `score_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        leadId,
        combinedScore,
        rank,
        JSON.stringify(allFactors),
        1,
        'system'
      );
    } catch (historyError) {
      logger.warn(`Could not record score history for lead ${leadId}: ${historyError.message}`);
    }

    logger.info(`Lead ${leadId} scored: ${combinedScore} (${rank})`);

    return {
      leadId,
      score: combinedScore,
      rank,
      rankLabel: this.getRankLabel(rank),
      factors: allFactors.slice(0, 10), // Top 10 factors
      breakdown: {
        rule: ruleScore.score,
        demographic: demographicScore.score,
        ml: mlScore.score,
      },
      scoredAt: new Date(),
    };
  }

  /**
   * Bulk score multiple leads
   * @param {string[]} leadIds - Array of lead IDs
   * @returns {Object[]} Array of score results
   */
  async scoreLeadsBatch(leadIds, options = {}) {
    const results = [];
    const batchSize = 10;

    for (let i = 0; i < leadIds.length; i += batchSize) {
      const batch = leadIds.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(id => this.scoreLead(id, options).catch(err => ({
          leadId: id,
          error: err.message,
        })))
      );
      results.push(...batchResults);

      // Small delay between batches to avoid rate limits
      if (i + batchSize < leadIds.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const successful = results.filter(r => !r.error);
    const failed = results.filter(r => r.error);

    logger.info(`Batch scoring complete: ${successful.length}/${leadIds.length} successful`);

    return {
      results,
      summary: {
        total: leadIds.length,
        successful: successful.length,
        failed: failed.length,
      },
    };
  }

  /**
   * Score all unscored leads
   */
  async scoreUnscoredLeads(limit = 100) {
    // Using underscore field names from schema
    const unscoredLeads = await prisma.lead.findMany({
      where: {
        OR: [
          { scored_at: null },
          { lead_score: null },
        ],
        isConverted: false,
      },
      select: { id: true },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    if (unscoredLeads.length === 0) {
      return { message: 'No unscored leads found', scored: 0 };
    }

    const leadIds = unscoredLeads.map(l => l.id);
    return this.scoreLeadsBatch(leadIds);
  }

  // ============================================================================
  // RULE-BASED SCORING
  // ============================================================================

  /**
   * Calculate score based on configurable rules
   */
  async calculateRuleBasedScore(lead) {
    const rules = await this.getScoringRules();
    let totalScore = 0;
    const factors = [];

    for (const rule of rules) {
      const matches = this.evaluateRule(lead, rule);
      if (matches) {
        totalScore += rule.scoreImpact;
        factors.push({
          name: rule.name,
          impact: rule.scoreImpact,
          category: rule.category,
          field: rule.field,
        });
      }
    }

    // Normalize to 0-100 scale (max possible from rules ~150)
    const normalizedScore = Math.min(100, Math.round((totalScore / 150) * 100));

    return {
      score: normalizedScore,
      rawScore: totalScore,
      factors,
    };
  }

  /**
   * Evaluate a single rule against lead data
   */
  evaluateRule(lead, rule) {
    const fieldValue = this.getLeadFieldValue(lead, rule.field);
    const ruleValue = rule.value;

    switch (rule.operator) {
      case 'equals':
        return String(fieldValue).toLowerCase() === String(ruleValue).toLowerCase().replace(/"/g, '');

      case 'in':
        const inArray = Array.isArray(ruleValue) ? ruleValue : JSON.parse(ruleValue);
        return inArray.some(v =>
          String(fieldValue).toLowerCase() === String(v).toLowerCase().replace(/"/g, '')
        );

      case 'contains':
        return fieldValue && String(fieldValue).toLowerCase().includes(String(ruleValue).toLowerCase());

      case 'exists':
        return fieldValue !== null && fieldValue !== undefined && fieldValue !== '';

      case 'gte':
        return Number(fieldValue) >= Number(ruleValue);

      case 'lte':
        return Number(fieldValue) <= Number(ruleValue);

      case 'between':
        const range = Array.isArray(ruleValue) ? ruleValue : JSON.parse(ruleValue);
        const numValue = Number(fieldValue);
        return numValue >= range[0] && numValue <= range[1];

      default:
        return false;
    }
  }

  /**
   * Get field value from lead, supporting nested and enrichment fields
   */
  getLeadFieldValue(lead, field) {
    // Map rule field names to lead object properties (handle both camelCase and snake_case)
    const fieldMap = {
      'isSelfGen': lead.isSelfGen ?? lead.is_self_gen,
      'source': lead.leadSource ?? lead.lead_source ?? lead.source,
      'workType': lead.workType ?? lead.work_type,
      'state': lead.state,
      'propertyType': lead.propertyType ?? lead.property_type,
      'phone': lead.phone ?? lead.mobilePhone ?? lead.mobile_phone,
      'email': lead.email,
      'street': lead.street,
      'postalCode': lead.postalCode ?? lead.postal_code,
      'medianHouseholdIncome': lead.medianHouseholdIncome ?? lead.median_household_income,
      'medianHomeValue': lead.medianHomeValue ?? lead.median_home_value,
      'homeownershipRate': lead.homeownershipRate ?? lead.homeownership_rate,
    };

    return fieldMap[field] ?? lead[field];
  }

  /**
   * Get scoring rules from database (cached)
   */
  async getScoringRules() {
    const now = Date.now();
    if (this.rulesCache && this.rulesCacheTime && (now - this.rulesCacheTime < this.CACHE_TTL)) {
      return this.rulesCache;
    }

    const rules = await prisma.leadScoringRule.findMany({
      where: { isActive: true },
      orderBy: { priority: 'asc' },
    });

    this.rulesCache = rules;
    this.rulesCacheTime = now;

    return rules;
  }

  // ============================================================================
  // CENSUS DEMOGRAPHIC ENRICHMENT (FREE API)
  // ============================================================================

  /**
   * Enrich lead with Census ACS demographic data
   * Uses ZIP Code Tabulation Areas (ZCTA)
   */
  async enrichWithCensusData(lead) {
    if (!lead.postalCode) {
      return null;
    }

    const zipCode = lead.postalCode.substring(0, 5);

    try {
      // Census ACS 5-year estimates variables:
      // B19013_001E = Median household income
      // B25077_001E = Median home value
      // B25003_002E = Owner-occupied housing units
      // B25003_001E = Total occupied housing units
      // B01002_001E = Median age

      const variables = [
        'B19013_001E', // Median household income
        'B25077_001E', // Median home value
        'B25003_002E', // Owner-occupied units
        'B25003_001E', // Total occupied units
        'B01002_001E', // Median age
      ].join(',');

      const url = `${CENSUS_API_BASE}/${CENSUS_YEAR}/${CENSUS_DATASET}?get=NAME,${variables}&for=zip%20code%20tabulation%20area:${zipCode}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Census API error: ${response.status}`);
      }

      const data = await response.json();

      // Census returns array with header row and data row
      if (!data || data.length < 2) {
        logger.warn(`No Census data found for ZIP ${zipCode}`);
        return null;
      }

      const [headers, values] = data;

      // Parse values (Census returns strings, some may be negative for unavailable)
      const medianIncome = parseInt(values[1]) || null;
      const medianHomeValue = parseInt(values[2]) || null;
      const ownerOccupied = parseInt(values[3]) || 0;
      const totalOccupied = parseInt(values[4]) || 1;
      const medianAge = parseFloat(values[5]) || null;

      // Calculate homeownership rate
      const homeownershipRate = totalOccupied > 0
        ? Math.round((ownerOccupied / totalOccupied) * 100)
        : null;

      return {
        censusTract: zipCode,
        medianHouseholdIncome: medianIncome > 0 ? medianIncome : null,
        medianHomeValue: medianHomeValue > 0 ? medianHomeValue : null,
        homeownershipRate,
        medianAge: medianAge > 0 ? medianAge : null,
        enrichedAt: new Date(),
      };
    } catch (error) {
      logger.error(`Census API error for ZIP ${zipCode}: ${error.message}`);
      return null;
    }
  }

  /**
   * Update lead with enrichment data
   */
  async updateLeadEnrichment(leadId, enrichmentData) {
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        censusTract: enrichmentData.censusTract,
        medianHouseholdIncome: enrichmentData.medianHouseholdIncome,
        medianHomeValue: enrichmentData.medianHomeValue,
        homeownershipRate: enrichmentData.homeownershipRate,
        medianAge: enrichmentData.medianAge,
        enrichedAt: enrichmentData.enrichedAt,
      },
    });
  }

  /**
   * Calculate score boost from demographic data
   */
  async calculateDemographicScore(enrichment) {
    let score = 0;
    const factors = [];

    // Income scoring (higher income = more likely to afford roof work)
    if (enrichment.medianHouseholdIncome) {
      if (enrichment.medianHouseholdIncome >= 150000) {
        score += 25;
        factors.push({ name: 'Very High Income Area ($150K+)', impact: 25, category: 'demographic' });
      } else if (enrichment.medianHouseholdIncome >= 100000) {
        score += 20;
        factors.push({ name: 'High Income Area ($100K+)', impact: 20, category: 'demographic' });
      } else if (enrichment.medianHouseholdIncome >= 75000) {
        score += 15;
        factors.push({ name: 'Upper-Mid Income Area ($75K+)', impact: 15, category: 'demographic' });
      } else if (enrichment.medianHouseholdIncome >= 50000) {
        score += 10;
        factors.push({ name: 'Mid Income Area ($50K+)', impact: 10, category: 'demographic' });
      }
    }

    // Home value scoring (higher value = bigger roof projects)
    if (enrichment.medianHomeValue) {
      if (enrichment.medianHomeValue >= 500000) {
        score += 25;
        factors.push({ name: 'Premium Home Value ($500K+)', impact: 25, category: 'property' });
      } else if (enrichment.medianHomeValue >= 350000) {
        score += 20;
        factors.push({ name: 'High Home Value ($350K+)', impact: 20, category: 'property' });
      } else if (enrichment.medianHomeValue >= 250000) {
        score += 15;
        factors.push({ name: 'Good Home Value ($250K+)', impact: 15, category: 'property' });
      } else if (enrichment.medianHomeValue >= 150000) {
        score += 10;
        factors.push({ name: 'Average Home Value ($150K+)', impact: 10, category: 'property' });
      }
    }

    // Homeownership rate (higher = more potential customers)
    if (enrichment.homeownershipRate) {
      if (enrichment.homeownershipRate >= 80) {
        score += 20;
        factors.push({ name: 'Very High Homeownership (80%+)', impact: 20, category: 'demographic' });
      } else if (enrichment.homeownershipRate >= 65) {
        score += 15;
        factors.push({ name: 'High Homeownership (65%+)', impact: 15, category: 'demographic' });
      } else if (enrichment.homeownershipRate >= 50) {
        score += 10;
        factors.push({ name: 'Moderate Homeownership (50%+)', impact: 10, category: 'demographic' });
      }
    }

    // Age scoring (45-65 age range tends to have highest conversion)
    if (enrichment.medianAge) {
      if (enrichment.medianAge >= 45 && enrichment.medianAge <= 65) {
        score += 15;
        factors.push({ name: 'Prime Age Demographics (45-65)', impact: 15, category: 'demographic' });
      } else if (enrichment.medianAge >= 35 && enrichment.medianAge <= 70) {
        score += 10;
        factors.push({ name: 'Good Age Demographics (35-70)', impact: 10, category: 'demographic' });
      }
    }

    // Normalize to 0-100 (max possible ~85)
    const normalizedScore = Math.min(100, Math.round((score / 85) * 100));

    return {
      score: normalizedScore,
      rawScore: score,
      factors,
    };
  }

  // ============================================================================
  // ML MODEL PREDICTION (Future - requires trained model)
  // ============================================================================

  /**
   * Get ML model prediction (placeholder for future implementation)
   * This would call a trained XGBoost/sklearn model via Lambda or SageMaker
   */
  async getMLPrediction(lead) {
    // Check if we have an active ML model
    const activeModel = await prisma.leadScoringModel.findFirst({
      where: { isActive: true },
      orderBy: { deployedAt: 'desc' },
    });

    if (!activeModel) {
      return { score: 0, factors: [], confidence: 0, modelUsed: false };
    }

    // TODO: Implement actual ML prediction via:
    // Option 1: Lambda function with sklearn/xgboost
    // Option 2: SageMaker endpoint
    // Option 3: Embedded ONNX model

    // For now, return placeholder
    logger.info(`ML model ${activeModel.name} v${activeModel.version} available but not yet integrated`);
    return {
      score: 0,
      factors: [],
      confidence: 0,
      modelUsed: false,
      model: {
        name: activeModel.name,
        version: activeModel.version,
        auc: activeModel.aucRoc,
      },
    };
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Convert numeric score to letter rank
   */
  scoreToRank(score) {
    if (score >= RANK_THRESHOLDS.A) return 'A';
    if (score >= RANK_THRESHOLDS.B) return 'B';
    if (score >= RANK_THRESHOLDS.C) return 'C';
    if (score >= RANK_THRESHOLDS.D) return 'D';
    return 'F';
  }

  /**
   * Get human-readable rank label
   */
  getRankLabel(rank) {
    const labels = {
      A: 'Hot Lead',
      B: 'Warm Lead',
      C: 'Average',
      D: 'Cool Lead',
      F: 'Low Priority',
    };
    return labels[rank] || 'Unknown';
  }

  /**
   * Get scoring statistics
   */
  async getScoringStats() {
    const [totalLeads, scoredLeads, rankDistribution, avgScoreBySource] = await Promise.all([
      prisma.lead.count({ where: { isConverted: false } }),
      prisma.lead.count({ where: { scoredAt: { not: null }, isConverted: false } }),
      prisma.lead.groupBy({
        by: ['leadRank'],
        where: { scoredAt: { not: null }, isConverted: false },
        _count: { id: true },
      }),
      prisma.lead.groupBy({
        by: ['source'],
        where: { scoredAt: { not: null }, isConverted: false },
        _avg: { leadScore: true },
        _count: { id: true },
      }),
    ]);

    return {
      totalLeads,
      scoredLeads,
      unscoredLeads: totalLeads - scoredLeads,
      scoredPercent: totalLeads > 0 ? Math.round((scoredLeads / totalLeads) * 100) : 0,
      rankDistribution: rankDistribution.reduce((acc, item) => {
        acc[item.leadRank || 'unscored'] = item._count.id;
        return acc;
      }, {}),
      avgScoreBySource: avgScoreBySource
        .filter(item => item.source)
        .map(item => ({
          source: item.source,
          avgScore: Math.round(item._avg.leadScore || 0),
          count: item._count.id,
        }))
        .sort((a, b) => b.avgScore - a.avgScore),
    };
  }

  /**
   * Invalidate rules cache (call after rule updates)
   */
  invalidateRulesCache() {
    this.rulesCache = null;
    this.rulesCacheTime = null;
  }
}

export const leadScoringService = new LeadScoringService();
export default leadScoringService;
