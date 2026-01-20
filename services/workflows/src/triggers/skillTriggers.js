/**
 * Skill Requirement Triggers
 *
 * Handles adding skill requirements to work orders based on opportunity trade fields.
 * Replicates Salesforce's Trigger_Add_Skill_to_Work_Order flow behavior.
 *
 * When trade checkboxes are set on an opportunity (e.g., insulationTrade = true),
 * and a work order is created for that opportunity, we add corresponding
 * SkillRequirement records to the work order.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Mapping of trade checkbox fields to skill names
 * These skill names should match the names in the skills table
 */
const TRADE_TO_SKILL_MAP = {
  roofingTrade: 'Roofing',
  guttersTrade: 'Gutters',
  sidingTrade: 'Siding',
  trimCappingTrade: 'Trim & Capping',
  solarTrade: 'GAF Solar',
  skylightTrade: 'Skylight',
  interiorTrade: 'Interior Work',
  insulationTrade: 'Insulation',
  timbersteelTrade: 'GAF TimberSteel',
};

/**
 * Get or create a skill by name
 * @param {string} skillName - Name of the skill
 * @returns {Promise<Object>} The skill record
 */
async function getOrCreateSkill(skillName) {
  let skill = await prisma.skill.findUnique({
    where: { name: skillName },
  });

  if (!skill) {
    skill = await prisma.skill.create({
      data: {
        name: skillName,
        description: `Skill for ${skillName} trade work`,
      },
    });
    console.log(`[Skill Trigger] Created new skill: ${skillName}`);
  }

  return skill;
}

/**
 * Add skill requirements to a work order based on opportunity trade fields
 * @param {string} workOrderId - Work Order ID
 * @param {string} opportunityId - Opportunity ID
 * @returns {Promise<Object>} Results of the operation
 */
export async function addSkillRequirementsFromOpportunity(workOrderId, opportunityId) {
  console.log(`[Skill Trigger] Adding skill requirements for WorkOrder: ${workOrderId}, Opportunity: ${opportunityId}`);

  const results = {
    workOrderId,
    opportunityId,
    skillsAdded: [],
    skillsSkipped: [],
    errors: [],
  };

  try {
    // Get the opportunity with trade fields
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      select: {
        roofingTrade: true,
        guttersTrade: true,
        sidingTrade: true,
        trimCappingTrade: true,
        solarTrade: true,
        skylightTrade: true,
        interiorTrade: true,
        insulationTrade: true,
        timbersteelTrade: true,
        name: true,
      },
    });

    if (!opportunity) {
      throw new Error(`Opportunity not found: ${opportunityId}`);
    }

    // Check each trade field and add corresponding skill requirement
    for (const [tradeField, skillName] of Object.entries(TRADE_TO_SKILL_MAP)) {
      if (opportunity[tradeField] === true) {
        try {
          // Get or create the skill
          const skill = await getOrCreateSkill(skillName);

          // Check if skill requirement already exists
          const existingRequirement = await prisma.workOrderSkillRequirement.findUnique({
            where: {
              workOrderId_skillId: {
                workOrderId,
                skillId: skill.id,
              },
            },
          });

          if (existingRequirement) {
            results.skillsSkipped.push({
              skill: skillName,
              reason: 'Already exists',
            });
            console.log(`[Skill Trigger] Skill requirement already exists: ${skillName}`);
            continue;
          }

          // Create the skill requirement
          await prisma.workOrderSkillRequirement.create({
            data: {
              workOrderId,
              skillId: skill.id,
              skillLevel: 'INTERMEDIATE',
              isRequired: true,
            },
          });

          results.skillsAdded.push(skillName);
          console.log(`[Skill Trigger] Added skill requirement: ${skillName}`);
        } catch (skillError) {
          console.error(`[Skill Trigger] Failed to add skill ${skillName}:`, skillError);
          results.errors.push({
            skill: skillName,
            error: skillError.message,
          });
        }
      }
    }

    console.log(`[Skill Trigger] Completed. Added ${results.skillsAdded.length} skills, skipped ${results.skillsSkipped.length}`);
    return results;
  } catch (error) {
    console.error('[Skill Trigger] addSkillRequirementsFromOpportunity failed:', error);
    throw error;
  }
}

/**
 * Trigger: Work Order Created
 * When a work order is created for an opportunity, add skill requirements
 * based on the opportunity's trade checkbox fields
 */
export async function onWorkOrderCreated(workOrderId) {
  console.log(`[Skill Trigger] Work Order Created: ${workOrderId}`);

  try {
    // Get the work order with opportunity ID
    const workOrder = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        id: true,
        opportunityId: true,
        workOrderNumber: true,
      },
    });

    if (!workOrder) {
      throw new Error(`Work Order not found: ${workOrderId}`);
    }

    if (!workOrder.opportunityId) {
      console.log(`[Skill Trigger] Work order ${workOrderId} has no opportunity, skipping skill requirements`);
      return { skipped: true, reason: 'No opportunity linked' };
    }

    return await addSkillRequirementsFromOpportunity(workOrderId, workOrder.opportunityId);
  } catch (error) {
    console.error('[Skill Trigger] onWorkOrderCreated failed:', error);
    throw error;
  }
}

/**
 * Trigger: Opportunity Trade Fields Updated
 * When an opportunity's trade fields are updated, update skill requirements
 * on any linked work orders
 */
export async function onOpportunityTradesUpdated(opportunityId, updatedTradeFields) {
  console.log(`[Skill Trigger] Opportunity Trades Updated: ${opportunityId}`);

  const results = {
    opportunityId,
    workOrdersUpdated: [],
    errors: [],
  };

  try {
    // Find all work orders linked to this opportunity
    const workOrders = await prisma.workOrder.findMany({
      where: { opportunityId },
      select: { id: true, workOrderNumber: true },
    });

    if (workOrders.length === 0) {
      console.log(`[Skill Trigger] No work orders found for opportunity ${opportunityId}`);
      return results;
    }

    // Update skill requirements on each work order
    for (const workOrder of workOrders) {
      try {
        const result = await addSkillRequirementsFromOpportunity(workOrder.id, opportunityId);
        results.workOrdersUpdated.push({
          workOrderId: workOrder.id,
          workOrderNumber: workOrder.workOrderNumber,
          ...result,
        });
      } catch (woError) {
        console.error(`[Skill Trigger] Failed to update work order ${workOrder.id}:`, woError);
        results.errors.push({
          workOrderId: workOrder.id,
          error: woError.message,
        });
      }
    }

    return results;
  } catch (error) {
    console.error('[Skill Trigger] onOpportunityTradesUpdated failed:', error);
    throw error;
  }
}

/**
 * Remove skill requirement from a work order
 * Called when a trade checkbox is unchecked
 */
export async function removeSkillRequirement(workOrderId, skillName) {
  console.log(`[Skill Trigger] Removing skill requirement: ${skillName} from WorkOrder: ${workOrderId}`);

  try {
    const skill = await prisma.skill.findUnique({
      where: { name: skillName },
    });

    if (!skill) {
      return { removed: false, reason: 'Skill not found' };
    }

    const deleted = await prisma.workOrderSkillRequirement.deleteMany({
      where: {
        workOrderId,
        skillId: skill.id,
      },
    });

    return {
      removed: deleted.count > 0,
      count: deleted.count,
    };
  } catch (error) {
    console.error('[Skill Trigger] removeSkillRequirement failed:', error);
    throw error;
  }
}

/**
 * Get skill requirements for a work order
 */
export async function getWorkOrderSkillRequirements(workOrderId) {
  return prisma.workOrderSkillRequirement.findMany({
    where: { workOrderId },
    include: {
      skill: true,
    },
  });
}

export default {
  TRADE_TO_SKILL_MAP,
  addSkillRequirementsFromOpportunity,
  onWorkOrderCreated,
  onOpportunityTradesUpdated,
  removeSkillRequirement,
  getWorkOrderSkillRequirements,
};
