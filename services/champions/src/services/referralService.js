/**
 * Referral Service
 * Handles referral submissions, status updates, and lead integration
 */

import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

const prisma = new PrismaClient();

// Service URLs for inter-service communication
const LEADS_SERVICE_URL = process.env.LEADS_SERVICE_URL || 'http://leads-service:3003';

export const referralService = {
  /**
   * Get all referrals with filters
   */
  async getReferrals({ championId, status, page = 1, limit = 50 }) {
    const where = {};

    if (championId) {
      where.championId = championId;
    }

    if (status) {
      where.status = status;
    }

    const [referrals, total] = await Promise.all([
      prisma.championReferral.findMany({
        where,
        include: {
          champion: {
            select: { id: true, firstName: true, lastName: true, referralCode: true },
          },
          payouts: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.championReferral.count({ where }),
    ]);

    return {
      referrals,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get a single referral by ID
   */
  async getReferralById(id) {
    return prisma.championReferral.findUnique({
      where: { id },
      include: {
        champion: {
          select: { id: true, firstName: true, lastName: true, email: true, referralCode: true },
        },
        lead: true,
        payouts: {
          include: {
            tier: true,
          },
        },
      },
    });
  },

  /**
   * Submit a new referral (from mobile app or web form)
   */
  async submitReferral(data) {
    const { referralCode, ...referralData } = data;

    // Find champion by referral code
    const champion = await prisma.champion.findUnique({
      where: { referralCode },
    });

    if (!champion) {
      throw new Error('Invalid referral code');
    }

    if (champion.status !== 'ACTIVE') {
      throw new Error('Champion account is not active');
    }

    // Check for duplicates
    const settings = await prisma.referralSettings.findFirst();
    const duplicateWindow = new Date();
    duplicateWindow.setDate(duplicateWindow.getDate() - (settings?.duplicateWindowDays || 90));

    let isDuplicate = false;
    let duplicateReason = null;

    // Check by phone
    if (settings?.duplicateCheckPhone && referralData.phone) {
      const existingByPhone = await prisma.championReferral.findFirst({
        where: {
          phone: referralData.phone,
          createdAt: { gte: duplicateWindow },
        },
      });
      if (existingByPhone) {
        isDuplicate = true;
        duplicateReason = 'Phone number already submitted';
      }
    }

    // Check by address
    if (!isDuplicate && settings?.duplicateCheckAddress && referralData.street) {
      const existingByAddress = await prisma.championReferral.findFirst({
        where: {
          street: { contains: referralData.street, mode: 'insensitive' },
          zipCode: referralData.zipCode,
          createdAt: { gte: duplicateWindow },
        },
      });
      if (existingByAddress) {
        isDuplicate = true;
        duplicateReason = 'Address already submitted';
      }
    }

    // Create the referral
    const referral = await prisma.championReferral.create({
      data: {
        championId: champion.id,
        referralCodeUsed: referralCode,
        firstName: referralData.firstName,
        lastName: referralData.lastName,
        email: referralData.email,
        phone: referralData.phone,
        street: referralData.street,
        city: referralData.city,
        state: referralData.state,
        zipCode: referralData.zipCode,
        description: referralData.description,
        propertyType: referralData.propertyType || 'Residential',
        homeownerName: referralData.homeownerName,
        relationship: referralData.relationship,
        status: isDuplicate ? 'DUPLICATE' : 'SUBMITTED',
        isDuplicate,
        duplicateReason,
        submittedVia: referralData.submittedVia || 'mobile_app',
        deviceInfo: referralData.deviceInfo,
      },
      include: {
        champion: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    // Update champion stats
    await prisma.champion.update({
      where: { id: champion.id },
      data: {
        totalReferrals: { increment: 1 },
      },
    });

    // Log activity
    await prisma.championActivity.create({
      data: {
        championId: champion.id,
        type: 'REFERRAL_SUBMITTED',
        description: `Submitted referral for ${referralData.firstName} ${referralData.lastName}`,
        metadata: { referralId: referral.id },
      },
    });

    // If not duplicate, create a Lead in the CRM and award signup bonus
    if (!isDuplicate) {
      try {
        await this.createLeadFromReferral(referral);
      } catch (error) {
        logger.error('Failed to create lead from referral', {
          referralId: referral.id,
          error: error.message,
        });
        // Don't fail the referral submission if lead creation fails
      }

      // Award signup bonus for valid referral submissions
      try {
        await this.awardBonus(referral.id, 'SIGNUP_BONUS');
      } catch (error) {
        logger.error('Failed to award signup bonus', {
          referralId: referral.id,
          error: error.message,
        });
      }
    }

    logger.info('Referral submitted', {
      referralId: referral.id,
      championId: champion.id,
      isDuplicate,
    });

    return referral;
  },

  /**
   * Create a Lead in the CRM from a referral
   */
  async createLeadFromReferral(referral) {
    // Create lead directly in the database since we're in the same system
    const lead = await prisma.lead.create({
      data: {
        firstName: referral.firstName,
        lastName: referral.lastName,
        email: referral.email,
        phone: referral.phone,
        street: referral.street,
        city: referral.city,
        state: referral.state,
        postalCode: referral.zipCode,
        source: 'CHAMPION_REFERRAL',
        status: 'NEW',
        propertyType: referral.propertyType,
        description: referral.description,
        isChampionReferral: true,
        championReferralId: referral.id,
        referredByChampionId: referral.championId,
        leadNotes: `Referred by Champion: ${referral.champion.firstName} ${referral.champion.lastName}\nRelationship: ${referral.relationship || 'Not specified'}`,
      },
    });

    // Update referral with lead ID
    await prisma.championReferral.update({
      where: { id: referral.id },
      data: { leadId: lead.id },
    });

    logger.info('Lead created from referral', { leadId: lead.id, referralId: referral.id });

    return lead;
  },

  /**
   * Update referral status
   */
  async updateStatus(id, status, notes = null, userId = null) {
    const referral = await prisma.championReferral.findUnique({
      where: { id },
      include: { champion: true },
    });

    if (!referral) {
      throw new Error('Referral not found');
    }

    const updateData = {
      status,
      statusNotes: notes,
    };

    // Handle status-specific logic
    if (status === 'QUALIFIED' && !referral.isQualified) {
      updateData.isQualified = true;
      updateData.qualifiedAt = new Date();
      updateData.qualifiedById = userId;

      // Award qualified bonus
      await this.awardBonus(referral.id, 'QUALIFIED_BONUS');

      // Update champion stats
      await prisma.champion.update({
        where: { id: referral.championId },
        data: { qualifiedReferrals: { increment: 1 } },
      });

      // Log activity
      await prisma.championActivity.create({
        data: {
          championId: referral.championId,
          type: 'REFERRAL_QUALIFIED',
          description: `Referral for ${referral.firstName} ${referral.lastName} was qualified`,
          metadata: { referralId: referral.id },
        },
      });
    }

    if (status === 'CLOSED_WON' && !referral.closedWon) {
      updateData.closedWon = true;
      updateData.closedWonAt = new Date();

      // Award closed won bonus
      await this.awardBonus(referral.id, 'CLOSED_WON_BONUS');

      // Update champion stats
      await prisma.champion.update({
        where: { id: referral.championId },
        data: { closedReferrals: { increment: 1 } },
      });

      // Log activity
      await prisma.championActivity.create({
        data: {
          championId: referral.championId,
          type: 'REFERRAL_CLOSED',
          description: `Referral for ${referral.firstName} ${referral.lastName} closed won!`,
          metadata: { referralId: referral.id },
        },
      });
    }

    const updated = await prisma.championReferral.update({
      where: { id },
      data: updateData,
    });

    logger.info('Referral status updated', { referralId: id, status });

    return updated;
  },

  /**
   * Award a bonus for a referral
   */
  async awardBonus(referralId, bonusType) {
    const referral = await prisma.championReferral.findUnique({
      where: { id: referralId },
    });

    if (!referral) {
      throw new Error('Referral not found');
    }

    // Get the payout tier
    const tier = await prisma.championPayoutTier.findFirst({
      where: { type: bonusType, isActive: true },
    });

    if (!tier || tier.amount <= 0) {
      logger.info('No bonus configured for type', { bonusType, referralId });
      return null;
    }

    // Check if already awarded
    const existing = await prisma.championPayout.findFirst({
      where: { referralId, type: bonusType },
    });

    if (existing) {
      logger.info('Bonus already awarded', { bonusType, referralId });
      return existing;
    }

    // Create payout
    const payout = await prisma.championPayout.create({
      data: {
        championId: referral.championId,
        referralId,
        tierId: tier.id,
        type: bonusType,
        amount: tier.amount,
        status: 'PENDING',
        notes: `${tier.name} for referral ${referral.firstName} ${referral.lastName}`,
      },
    });

    // Update wallet pending balance
    await prisma.championWallet.update({
      where: { championId: referral.championId },
      data: {
        pendingBalance: { increment: tier.amount },
      },
    });

    // Log wallet transaction
    const wallet = await prisma.championWallet.findUnique({
      where: { championId: referral.championId },
    });

    await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'CREDIT_PAYOUT',
        amount: tier.amount,
        balanceAfter: wallet.pendingBalance,
        description: `${tier.name} earned`,
        referralId,
        payoutId: payout.id,
        tierId: tier.id,
      },
    });

    // Update champion total earnings
    await prisma.champion.update({
      where: { id: referral.championId },
      data: {
        pendingEarnings: { increment: tier.amount },
        totalEarnings: { increment: tier.amount },
      },
    });

    // Log activity
    await prisma.championActivity.create({
      data: {
        championId: referral.championId,
        type: 'PAYOUT_EARNED',
        description: `Earned $${tier.amount} ${tier.name}`,
        metadata: { referralId, payoutId: payout.id },
      },
    });

    // Mark on referral when paid
    if (bonusType === 'QUALIFIED_BONUS') {
      await prisma.championReferral.update({
        where: { id: referralId },
        data: { qualifiedPaidAt: new Date() },
      });
    } else if (bonusType === 'CLOSED_WON_BONUS') {
      await prisma.championReferral.update({
        where: { id: referralId },
        data: { closedPaidAt: new Date() },
      });
    }

    logger.info('Bonus awarded', {
      referralId,
      bonusType,
      amount: tier.amount,
      payoutId: payout.id,
    });

    return payout;
  },

  /**
   * Sync referral status from Lead updates
   * Called when a Lead status changes in the CRM
   */
  async syncFromLead(leadId, leadStatus, opportunityId = null, closedWon = false) {
    const referral = await prisma.championReferral.findFirst({
      where: { leadId },
    });

    if (!referral) {
      logger.info('No champion referral found for lead', { leadId });
      return null;
    }

    // Map lead status to referral status
    const statusMap = {
      NEW: 'SUBMITTED',
      CONTACTED: 'CONTACTED',
      QUALIFIED: 'QUALIFIED',
      UNQUALIFIED: 'INVALID',
      CONVERTED: closedWon ? 'CLOSED_WON' : 'SCHEDULED',
    };

    const newStatus = statusMap[leadStatus] || referral.status;

    if (newStatus !== referral.status) {
      await this.updateStatus(referral.id, newStatus);
    }

    // If converted to opportunity, update the link
    if (opportunityId) {
      await prisma.championReferral.update({
        where: { id: referral.id },
        data: { convertedToOpportunityId: opportunityId },
      });
    }

    return referral;
  },
};

export default referralService;
