// Commission Workflow Triggers
// Automated commission creation based on business events
// Mirrors Salesforce commission flows for Panda CRM
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();

/**
 * Commission Triggers - Replaces Salesforce Commission Flows
 *
 * Commission Types:
 * 1. PRE_COMMISSION - Created when contract is signed/created
 * 2. BACK_END - Created when job is paid in full
 * 3. COMPANY_LEAD - Commission for company-generated leads
 * 4. SELF_GEN - Commission for self-generated leads
 * 5. SUPPLEMENT_OVERRIDE - Created when supplements are approved
 * 6. PM_COMMISSION - Created for PM add-on contracts
 * 7. SALES_OP - Jason Wooten's PandaClaims commission
 * 8. MANAGER_OVERRIDE - Manager's override commission
 * 9. REGIONAL_MANAGER_OVERRIDE - Regional Manager's override commission
 * 10. DIRECTOR_OVERRIDE - Director's override commission
 * 11. EXECUTIVE_OVERRIDE - Executive's override commission
 * 12. SALES_FLIP - PandaClaims, created on onboarding, requested at 30% collected
 * 13. PAYROLL_ADJUSTMENT - Auto-created when Paid Amount changes
 */

export const commissionTriggers = {
  /**
   * Calculate commission rate with 50/50 split logic
   * Equivalent to: Salesforce "Commissions After Save Flow" rate calculation
   */
  calculateRateWithSplit(user, serviceContract, isCompanyLead) {
    const has5050Split = serviceContract?.x5050Split || user?.x5050CommissionSplit || false;

    let rate;
    if (isCompanyLead) {
      rate = parseFloat(user?.companyLeadRate || 0);
    } else {
      rate = parseFloat(user?.selfGenRate || 0);
    }

    // Apply 50/50 split if enabled
    if (has5050Split && rate > 0) {
      rate = rate / 2;
    }

    return rate;
  },

  /**
   * Calculate commission value based on supplements commissionable flag
   * From Salesforce: IF(Supplements_Commissionable__c=true,(Contract_Grand_Total__c*0.95),(Sales_Total_Price__c*0.95))
   */
  calculateCommissionValue(serviceContract) {
    if (serviceContract.supplementsCommissionable) {
      return parseFloat(serviceContract.contractTotal || 0) * 0.95;
    }
    return parseFloat(serviceContract.salesTotalPrice || serviceContract.contractTotal || 0) * 0.95;
  },

  /**
   * Trigger: Contract Signed/Created
   * Creates Pre-Commission for sales rep AND Override commissions for management hierarchy
   *
   * Equivalent to: Salesforce "Service Contract - Commissions Updates" + "Create_Commission_Rec_For_Commission_And_Overrides_Subflow"
   */
  async onContractCreated(serviceContract, userId) {
    logger.info(`Commission trigger: Contract created ${serviceContract.id}`);
    const createdCommissions = [];

    try {
      // Get the owner (sales rep) with their commission rates and hierarchy
      const owner = await prisma.user.findUnique({
        where: { id: serviceContract.ownerId },
        select: {
          id: true,
          fullName: true,
          preCommissionRate: true,
          commissionRate: true,
          companyLeadRate: true,
          selfGenRate: true,
          x5050CommissionSplit: true,
          // Management Hierarchy
          managerId: true,
          manager: {
            select: { id: true, fullName: true, overridePercent: true }
          },
          regionalManagerId: true,
          regionalManager: {
            select: { id: true, fullName: true, overridePercent: true }
          },
          directorId: true,
          director: {
            select: { id: true, fullName: true, overridePercent: true }
          },
          executiveId: true,
          executive: {
            select: { id: true, fullName: true, overridePercent: true }
          },
        },
      });

      if (!owner) {
        logger.warn(`No owner found for contract ${serviceContract.id}`);
        return null;
      }

      // Update ServiceContract with owner's rates and hierarchy
      await prisma.serviceContract.update({
        where: { id: serviceContract.id },
        data: {
          ownerId: owner.id,
          preCommissionRate: owner.preCommissionRate,
          companyLeadRate: owner.companyLeadRate,
          selfGenRate: owner.selfGenRate,
          commissionRate: owner.commissionRate,
          x5050Split: owner.x5050CommissionSplit,
          // Hierarchy
          managerId: owner.managerId,
          regionalManagerId: owner.regionalManagerId,
          directorId: owner.directorId,
          executiveId: owner.executiveId,
          // Override Rates
          managerOverride: owner.manager?.overridePercent,
          regionalOverride: owner.regionalManager?.overridePercent,
          directorOverride: owner.director?.overridePercent,
          executiveOverride: owner.executive?.overridePercent,
        },
      });

      // Determine if company lead or self-gen
      let isCompanyLead = false;
      let isSelfGen = false;

      if (serviceContract.opportunityId) {
        const opp = await prisma.opportunity.findUnique({
          where: { id: serviceContract.opportunityId },
          select: { leadSource: true, isSelfGen: true },
        });

        if (opp?.isSelfGen || opp?.leadSource?.toLowerCase().includes('self')) {
          isSelfGen = true;
        } else {
          isCompanyLead = true;
        }
      }

      // Calculate rate with 50/50 split
      const rate = this.calculateRateWithSplit(owner, serviceContract, isCompanyLead);

      if (!rate || rate <= 0) {
        logger.info(`Skipping pre-commission - rate is 0 for ${owner.fullName}`);
      } else {
        // Calculate commission amount
        const value = this.calculateCommissionValue(serviceContract);
        const amount = value * (rate / 100);

        if (amount > 0) {
          // Check for duplicate
          const existing = await prisma.commission.findFirst({
            where: {
              serviceContractId: serviceContract.id,
              type: 'PRE_COMMISSION',
              status: { notIn: ['DENIED'] },
            },
          });

          if (!existing) {
            // Create pre-commission for owner
            const commission = await prisma.commission.create({
              data: {
                name: `Pre-Commission - ${serviceContract.name || serviceContract.contractNumber}`,
                type: 'PRE_COMMISSION',
                status: 'NEW',
                commissionValue: value,
                commissionRate: rate,
                commissionAmount: Math.round(amount * 100) / 100,
                isCompanyLead,
                isSelfGen,
                ownerId: owner.id,
                serviceContractId: serviceContract.id,
                opportunityId: serviceContract.opportunityId,
              },
            });

            logger.info(`Pre-commission created: ${commission.id} for $${commission.commissionAmount}`);
            createdCommissions.push(commission);
          }
        }
      }

      // Note: Override commissions are created when back-end commission is ready (job paid)
      // This matches Salesforce behavior from "Create_Commission_Rec_For_Commission_And_Overrides_Subflow"

      return createdCommissions;

    } catch (error) {
      logger.error('Error creating pre-commission:', error);
      throw error;
    }
  },

  /**
   * Trigger: Onboarding Complete (Contract Received + Down Payment Received)
   * Updates Pre-Commission status to REQUESTED
   * Also updates Sales Op Commission to REQUESTED if PandaClaims
   *
   * Equivalent to: Salesforce flow that sets Commission Status = "Requested"
   */
  async onOnboardingComplete(serviceContractId, userId) {
    logger.info(`Commission trigger: Onboarding complete for ${serviceContractId}`);
    const updatedCommissions = [];

    try {
      // Find pre-commission for this contract
      const preCommission = await prisma.commission.findFirst({
        where: {
          serviceContractId,
          type: { in: ['PRE_COMMISSION', 'SELF_GEN', 'COMPANY_LEAD'] },
          status: 'NEW',
        },
      });

      if (preCommission) {
        const updated = await prisma.commission.update({
          where: { id: preCommission.id },
          data: {
            status: 'REQUESTED',
            requestedDate: new Date(),
          },
        });
        logger.info(`Pre-commission status updated to REQUESTED: ${updated.id}`);
        updatedCommissions.push(updated);
      }

      // Also update Sales Op Commission if exists (PandaClaims flow)
      const salesOpCommission = await prisma.commission.findFirst({
        where: {
          serviceContractId,
          type: 'SALES_OP',
          status: 'NEW',
        },
      });

      if (salesOpCommission) {
        const updated = await prisma.commission.update({
          where: { id: salesOpCommission.id },
          data: {
            status: 'REQUESTED',
            requestedDate: new Date(),
          },
        });
        logger.info(`Sales Op commission status updated to REQUESTED: ${updated.id}`);
        updatedCommissions.push(updated);
      }

      return updatedCommissions;

    } catch (error) {
      logger.error('Error updating commission status:', error);
      throw error;
    }
  },

  /**
   * Trigger: Job Paid in Full (Balance Due <= 0)
   * Creates Back-End Commission for owner AND Override commissions for management hierarchy
   *
   * Equivalent to: Salesforce "BackEnd Commission Ready" flow + "Create_Commission_Rec_For_Commission_And_Overrides_Subflow"
   */
  async onJobPaidInFull(serviceContractId, userId) {
    logger.info(`Commission trigger: Job paid in full ${serviceContractId}`);
    const createdCommissions = [];

    try {
      const serviceContract = await prisma.serviceContract.findUnique({
        where: { id: serviceContractId },
        include: {
          opportunity: {
            select: {
              account: { select: { isPandaClaims: true, isSureClaims: true } }
            }
          },
        },
      });

      if (!serviceContract) {
        logger.warn(`Service contract not found: ${serviceContractId}`);
        return null;
      }

      // Mark back-end commission as ready
      await prisma.serviceContract.update({
        where: { id: serviceContractId },
        data: { backEndCommissionReady: true },
      });

      const value = this.calculateCommissionValue(serviceContract);

      // 1. Create Back-End Commission for Owner
      if (serviceContract.ownerId && serviceContract.commissionRate > 0) {
        const existing = await prisma.commission.findFirst({
          where: {
            serviceContractId,
            type: 'BACK_END',
            ownerId: serviceContract.ownerId,
            status: { notIn: ['DENIED'] },
          },
        });

        if (!existing) {
          const rate = parseFloat(serviceContract.commissionRate);
          const amount = value * (rate / 100);

          if (amount > 0) {
            const commission = await prisma.commission.create({
              data: {
                name: `Back-End - ${serviceContract.name || serviceContract.contractNumber}`,
                type: 'BACK_END',
                status: 'REQUESTED',
                commissionValue: value,
                commissionRate: rate,
                commissionAmount: Math.round(amount * 100) / 100,
                ownerId: serviceContract.ownerId,
                serviceContractId,
                opportunityId: serviceContract.opportunityId,
                requestedDate: new Date(),
              },
            });

            logger.info(`Back-end commission created: ${commission.id} for $${commission.commissionAmount}`);
            createdCommissions.push(commission);
          }
        }
      }

      // 2. Create Override Commissions for Management Hierarchy
      const overrideConfigs = [
        { type: 'MANAGER_OVERRIDE', userId: serviceContract.managerId, rate: serviceContract.managerOverride },
        { type: 'REGIONAL_MANAGER_OVERRIDE', userId: serviceContract.regionalManagerId, rate: serviceContract.regionalOverride },
        { type: 'DIRECTOR_OVERRIDE', userId: serviceContract.directorId, rate: serviceContract.directorOverride },
        { type: 'EXECUTIVE_OVERRIDE', userId: serviceContract.executiveId, rate: serviceContract.executiveOverride },
      ];

      for (const config of overrideConfigs) {
        if (config.userId && config.rate && parseFloat(config.rate) > 0) {
          const existing = await prisma.commission.findFirst({
            where: {
              serviceContractId,
              type: config.type,
              ownerId: config.userId,
              status: { notIn: ['DENIED'] },
            },
          });

          if (!existing) {
            const rate = parseFloat(config.rate);
            const amount = value * (rate / 100);

            if (amount > 0) {
              const commission = await prisma.commission.create({
                data: {
                  name: `${config.type.replace(/_/g, ' ')} - ${serviceContract.name || serviceContract.contractNumber}`,
                  type: config.type,
                  status: 'REQUESTED',
                  commissionValue: value,
                  commissionRate: rate,
                  commissionAmount: Math.round(amount * 100) / 100,
                  ownerId: config.userId,
                  serviceContractId,
                  opportunityId: serviceContract.opportunityId,
                  requestedDate: new Date(),
                },
              });

              logger.info(`${config.type} commission created: ${commission.id} for $${commission.commissionAmount}`);
              createdCommissions.push(commission);
            }
          }
        }
      }

      // 3. Create Supplement Override if supplements exist
      if (serviceContract.supplementsClosedTotal && parseFloat(serviceContract.supplementsClosedTotal) > 0) {
        await this.onSupplementApproved(serviceContractId, serviceContract.supplementsClosedTotal, userId);
      }

      return createdCommissions;

    } catch (error) {
      logger.error('Error creating back-end commissions:', error);
      throw error;
    }
  },

  /**
   * Trigger: Supplement Approved
   * Creates Supplement Override Commission
   */
  async onSupplementApproved(serviceContractId, supplementAmount, userId) {
    logger.info(`Commission trigger: Supplement approved for ${serviceContractId}, amount: ${supplementAmount}`);

    try {
      const serviceContract = await prisma.serviceContract.findUnique({
        where: { id: serviceContractId },
      });

      if (!serviceContract) {
        logger.warn(`Service contract not found: ${serviceContractId}`);
        return null;
      }

      if (!serviceContract.supplementsCommissionable) {
        logger.info('Supplements not commissionable for this contract');
        return null;
      }

      // Get owner with override rate
      const owner = await prisma.user.findUnique({
        where: { id: serviceContract.ownerId },
        select: {
          id: true,
          fullName: true,
          overridePercent: true,
          supplementsCommissionable: true,
        },
      });

      if (!owner?.supplementsCommissionable || !owner?.overridePercent) {
        logger.info('Supplements not commissionable for owner or no override rate');
        return null;
      }

      const rate = parseFloat(owner.overridePercent);
      const value = parseFloat(supplementAmount);
      const amount = value * (rate / 100);

      if (amount <= 0) {
        logger.info(`Skipping supplement commission - amount is 0`);
        return null;
      }

      // Check for duplicate
      const existing = await prisma.commission.findFirst({
        where: {
          serviceContractId,
          type: 'SUPPLEMENT_OVERRIDE',
          status: { notIn: ['DENIED'] },
        },
      });

      if (existing) {
        logger.info(`Supplement commission already exists: ${existing.id}`);
        return existing;
      }

      const commission = await prisma.commission.create({
        data: {
          name: `Supplement Override - ${serviceContract.name || serviceContract.contractNumber}`,
          type: 'SUPPLEMENT_OVERRIDE',
          status: 'REQUESTED',
          commissionValue: value,
          commissionRate: rate,
          commissionAmount: Math.round(amount * 100) / 100,
          ownerId: serviceContract.ownerId,
          serviceContractId,
          opportunityId: serviceContract.opportunityId,
          requestedDate: new Date(),
        },
      });

      logger.info(`Supplement commission created: ${commission.id} for $${commission.commissionAmount}`);
      return commission;

    } catch (error) {
      logger.error('Error creating supplement commission:', error);
      throw error;
    }
  },

  /**
   * Trigger: PM Add-On Contract Created
   * Creates PM Commission for the project manager
   */
  async onPMContractCreated(serviceContract, pmUserId, userId) {
    logger.info(`Commission trigger: PM contract created ${serviceContract.id}`);

    try {
      const pmUser = await prisma.user.findUnique({
        where: { id: pmUserId },
        select: {
          id: true,
          fullName: true,
          commissionRate: true,
        },
      });

      if (!pmUser) {
        logger.warn(`PM user not found: ${pmUserId}`);
        return null;
      }

      const rate = parseFloat(pmUser.commissionRate || 0);

      if (rate <= 0) {
        logger.info(`Skipping PM commission - rate is 0`);
        return null;
      }

      const value = parseFloat(serviceContract.contractTotal || 0);
      const amount = value * (rate / 100);

      if (amount <= 0) {
        logger.info(`Skipping PM commission - amount is 0`);
        return null;
      }

      const commission = await prisma.commission.create({
        data: {
          name: `PM Commission - ${serviceContract.name || serviceContract.contractNumber}`,
          type: 'PM_COMMISSION',
          status: 'NEW',
          commissionValue: value,
          commissionRate: rate,
          commissionAmount: Math.round(amount * 100) / 100,
          ownerId: pmUserId,
          serviceContractId: serviceContract.id,
          opportunityId: serviceContract.opportunityId,
        },
      });

      logger.info(`PM commission created: ${commission.id} for $${commission.commissionAmount}`);
      return commission;

    } catch (error) {
      logger.error('Error creating PM commission:', error);
      throw error;
    }
  },

  /**
   * Trigger: PandaClaims Job Onboarded
   * Creates Sales Op Commission AND Sales Flip Commission
   *
   * Equivalent to: Salesforce "Jason Wooten Pre Commission" flow
   */
  async onPandaClaimsOnboarded(serviceContract, userId) {
    logger.info(`Commission trigger: PandaClaims job onboarded ${serviceContract.id}`);
    const createdCommissions = [];

    try {
      // Find Jason Wooten user for Sales Op
      const jasonWooten = await prisma.user.findFirst({
        where: {
          OR: [
            { email: { contains: 'jasonwooten', mode: 'insensitive' } },
            { fullName: { contains: 'Jason Wooten', mode: 'insensitive' } },
          ],
          isActive: true,
        },
        select: {
          id: true,
          fullName: true,
          overridePercent: true,
        },
      });

      const value = parseFloat(serviceContract.contractTotal || 0);

      // 1. Create Sales Op Commission for Jason Wooten
      if (jasonWooten) {
        const rate = parseFloat(jasonWooten.overridePercent || 0.5); // Default 0.5%
        const amount = value * (rate / 100);

        if (amount > 0) {
          const existing = await prisma.commission.findFirst({
            where: {
              serviceContractId: serviceContract.id,
              type: 'SALES_OP',
              ownerId: jasonWooten.id,
              status: { notIn: ['DENIED'] },
            },
          });

          if (!existing) {
            const commission = await prisma.commission.create({
              data: {
                name: `Sales Op - ${serviceContract.name || serviceContract.contractNumber}`,
                type: 'SALES_OP',
                status: 'NEW',
                commissionValue: value,
                commissionRate: rate,
                commissionAmount: Math.round(amount * 100) / 100,
                ownerId: jasonWooten.id,
                serviceContractId: serviceContract.id,
                opportunityId: serviceContract.opportunityId,
              },
            });

            logger.info(`Sales Op commission created: ${commission.id} for $${commission.commissionAmount}`);
            createdCommissions.push(commission);
          }
        }
      }

      // 2. Create Sales Flip Commission (status = NEW, will be REQUESTED at 30% collected)
      if (serviceContract.ownerId) {
        const owner = await prisma.user.findUnique({
          where: { id: serviceContract.ownerId },
          select: { id: true, fullName: true, overridePercent: true },
        });

        if (owner) {
          const rate = parseFloat(owner.overridePercent || 0);

          if (rate > 0) {
            const amount = value * (rate / 100);

            if (amount > 0) {
              const existing = await prisma.commission.findFirst({
                where: {
                  serviceContractId: serviceContract.id,
                  type: 'SALES_FLIP',
                  status: { notIn: ['DENIED'] },
                },
              });

              if (!existing) {
                const commission = await prisma.commission.create({
                  data: {
                    name: `Sales Flip - ${serviceContract.name || serviceContract.contractNumber}`,
                    type: 'SALES_FLIP',
                    status: 'NEW', // Will be REQUESTED when 30% collected
                    commissionValue: value,
                    commissionRate: rate,
                    commissionAmount: Math.round(amount * 100) / 100,
                    ownerId: serviceContract.ownerId,
                    serviceContractId: serviceContract.id,
                    opportunityId: serviceContract.opportunityId,
                  },
                });

                logger.info(`Sales Flip commission created: ${commission.id} for $${commission.commissionAmount}`);
                createdCommissions.push(commission);
              }
            }
          }
        }
      }

      // Update contract with PandaClaims onboarded date
      await prisma.serviceContract.update({
        where: { id: serviceContract.id },
        data: { pandaClaimsOnboardedDate: new Date() },
      });

      return createdCommissions;

    } catch (error) {
      logger.error('Error creating PandaClaims commissions:', error);
      throw error;
    }
  },

  /**
   * Trigger: Collection Percentage Updated (30% threshold for Sales Flip)
   * Updates Sales Flip Commission to REQUESTED when 30% collected
   *
   * Equivalent to: Salesforce "Jason Wooten Pre Commission" flow - 30% collected check
   */
  async onCollectionUpdated(serviceContractId, collectedPercent, userId) {
    logger.info(`Commission trigger: Collection updated for ${serviceContractId}, collected: ${collectedPercent}%`);

    try {
      // Check if 30% threshold reached
      if (parseFloat(collectedPercent) < 30) {
        logger.info('Collection below 30%, no action needed');
        return null;
      }

      // Find Sales Flip commission in NEW status
      const salesFlip = await prisma.commission.findFirst({
        where: {
          serviceContractId,
          type: 'SALES_FLIP',
          status: 'NEW',
        },
      });

      if (!salesFlip) {
        logger.info('No Sales Flip commission to update');
        return null;
      }

      // Update to REQUESTED
      const updated = await prisma.commission.update({
        where: { id: salesFlip.id },
        data: {
          status: 'REQUESTED',
          requestedDate: new Date(),
        },
      });

      logger.info(`Sales Flip commission status updated to REQUESTED: ${updated.id}`);
      return updated;

    } catch (error) {
      logger.error('Error updating Sales Flip commission:', error);
      throw error;
    }
  },

  /**
   * Trigger: Commission Paid Amount Changed
   * Creates Payroll Adjustment Commission when paid amount changes
   *
   * Equivalent to: Salesforce "Commissions After Save Flow" - Payroll Adjustment creation
   */
  async onCommissionPaidAmountChanged(commissionId, oldPaidAmount, newPaidAmount, userId) {
    logger.info(`Commission trigger: Paid amount changed for ${commissionId}: ${oldPaidAmount} -> ${newPaidAmount}`);

    try {
      const commission = await prisma.commission.findUnique({
        where: { id: commissionId },
        include: {
          serviceContract: true,
        },
      });

      if (!commission) {
        logger.warn(`Commission not found: ${commissionId}`);
        return null;
      }

      const oldAmount = parseFloat(oldPaidAmount || 0);
      const newAmount = parseFloat(newPaidAmount || 0);
      const adjustmentValue = newAmount - oldAmount;

      if (adjustmentValue === 0) {
        logger.info('No adjustment needed - amounts are equal');
        return null;
      }

      // Create Payroll Adjustment commission
      const adjustment = await prisma.commission.create({
        data: {
          name: `Payroll Adjustment - ${commission.name}`,
          type: 'PAYROLL_ADJUSTMENT',
          status: 'NEW',
          commissionValue: Math.abs(adjustmentValue),
          commissionRate: 100, // 100% of the adjustment
          commissionAmount: adjustmentValue, // Can be negative
          ownerId: commission.ownerId,
          serviceContractId: commission.serviceContractId,
          opportunityId: commission.opportunityId,
          parentCommissionId: commissionId,
          notes: `Adjustment from $${oldAmount} to $${newAmount}`,
        },
      });

      logger.info(`Payroll adjustment created: ${adjustment.id} for $${adjustmentValue}`);
      return adjustment;

    } catch (error) {
      logger.error('Error creating payroll adjustment:', error);
      throw error;
    }
  },

  /**
   * Trigger: Commission Status Changed
   * Updates date fields based on new status
   *
   * Equivalent to: Salesforce "Commissions After Save Flow" - status date tracking
   */
  async onCommissionStatusChanged(commissionId, newStatus, userId, notes = null) {
    logger.info(`Commission trigger: Status changed for ${commissionId} to ${newStatus}`);

    try {
      const updateData = {};

      switch (newStatus) {
        case 'REQUESTED':
          updateData.requestedDate = new Date();
          break;
        case 'APPROVED':
          updateData.approvedDate = new Date();
          break;
        case 'HOLD':
          updateData.holdDate = new Date();
          if (notes) updateData.holdReason = notes;
          break;
        case 'PAID':
          updateData.paidDate = new Date();
          break;
        case 'DENIED':
          updateData.deniedDate = new Date();
          if (notes) updateData.deniedReason = notes;
          break;
      }

      if (notes && !updateData.holdReason && !updateData.deniedReason) {
        updateData.notes = notes;
      }

      const updated = await prisma.commission.update({
        where: { id: commissionId },
        data: {
          status: newStatus,
          ...updateData,
        },
      });

      logger.info(`Commission ${commissionId} status updated to ${newStatus}`);
      return updated;

    } catch (error) {
      logger.error('Error updating commission status:', error);
      throw error;
    }
  },

  /**
   * Trigger: Insurance Program Lead Special Handling
   * Sets hardcoded overrides for Insurance Program leads
   *
   * Equivalent to: Salesforce "Service Contract - Commissions Updates" - Insurance Program branch
   */
  async handleInsuranceProgramLead(serviceContract) {
    logger.info(`Commission trigger: Insurance Program lead handling for ${serviceContract.id}`);

    try {
      // Find specific users for Insurance Program override
      const hoover = await prisma.user.findFirst({
        where: { email: { contains: 'danhoover', mode: 'insensitive' } },
        select: { id: true },
      });

      const tony = await prisma.user.findFirst({
        where: { email: { contains: 'tony@pandaexteriors', mode: 'insensitive' } },
        select: { id: true },
      });

      const tommy = await prisma.user.findFirst({
        where: { email: { contains: 'tommyhallwig', mode: 'insensitive' } },
        select: { id: true },
      });

      // Update ServiceContract with Insurance Program specific overrides
      await prisma.serviceContract.update({
        where: { id: serviceContract.id },
        data: {
          managerId: hoover?.id,
          regionalManagerId: tony?.id,
          directorId: tommy?.id,
          // Fixed rates for Insurance Program
          managerOverride: 2.0,
          regionalOverride: 0.5,
          directorOverride: 2.0,
        },
      });

      logger.info(`Insurance Program overrides set for ${serviceContract.id}`);

    } catch (error) {
      logger.error('Error handling Insurance Program lead:', error);
      throw error;
    }
  },
};

export default commissionTriggers;
