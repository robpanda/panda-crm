/**
 * Champion Service
 * Core business logic for Champion management
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { logger } from './logger.js';

const prisma = new PrismaClient();

// Generate a unique referral code
function generateReferralCode(prefix = 'PANDA', length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No O, 0, 1, I for clarity
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}${code}`;
}

// Generate a unique invite token
function generateInviteToken() {
  return crypto.randomBytes(32).toString('hex');
}

export const championService = {
  /**
   * Get all champions with optional filters
   */
  async getChampions({ status, assignedRepId, search, page = 1, limit = 50 }) {
    const where = {
      deletedAt: null,
    };

    if (status) {
      where.status = status;
    }

    if (assignedRepId) {
      where.assignedRepId = assignedRepId;
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { referralCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [champions, total] = await Promise.all([
      prisma.champion.findMany({
        where,
        include: {
          wallet: true,
          assignedRep: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          _count: {
            select: { referrals: true, payouts: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.champion.count({ where }),
    ]);

    return {
      champions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get a single champion by ID
   */
  async getChampionById(id) {
    const champion = await prisma.champion.findUnique({
      where: { id },
      include: {
        wallet: true,
        assignedRep: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        invitedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        referrals: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        payouts: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    return champion;
  },

  /**
   * Get champion by referral code
   */
  async getChampionByReferralCode(referralCode) {
    return prisma.champion.findUnique({
      where: { referralCode },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        referralCode: true,
        status: true,
      },
    });
  },

  /**
   * Get champion by email
   */
  async getChampionByEmail(email) {
    return prisma.champion.findUnique({
      where: { email: email.toLowerCase() },
    });
  },

  /**
   * Get champion by invite token
   */
  async getChampionByInviteToken(token) {
    return prisma.champion.findFirst({
      where: { inviteToken: token },
    });
  },

  /**
   * Create a new champion (self-registration or admin invite)
   */
  async createChampion(data, invitedById = null) {
    const settings = await prisma.referralSettings.findFirst();

    // Check if email already exists
    const existing = await this.getChampionByEmail(data.email);
    if (existing) {
      throw new Error('A champion with this email already exists');
    }

    // Generate unique referral code
    let referralCode = generateReferralCode(
      settings?.codePrefix || 'PANDA',
      settings?.codeLength || 6
    );

    // Ensure uniqueness
    let attempts = 0;
    while (await prisma.champion.findUnique({ where: { referralCode } })) {
      referralCode = generateReferralCode(settings?.codePrefix || 'PANDA', settings?.codeLength || 6);
      attempts++;
      if (attempts > 10) throw new Error('Failed to generate unique referral code');
    }

    // Determine initial status
    const status = settings?.requireApproval ? 'PENDING' : 'ACTIVE';

    // Hash password if provided
    let passwordHash = null;
    if (data.password) {
      passwordHash = await bcrypt.hash(data.password, 12);
    }

    // Create champion with wallet
    const champion = await prisma.champion.create({
      data: {
        email: data.email.toLowerCase(),
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        city: data.city,
        state: data.state,
        zipCode: data.zipCode,
        referralCode,
        referralUrl: `https://pandaexteriors.com/refer/${referralCode}`,
        status,
        passwordHash,
        invitedById,
        invitedAt: invitedById ? new Date() : null,
        assignedRepId: data.assignedRepId,
        wallet: {
          create: {
            availableBalance: 0,
            pendingBalance: 0,
            lifetimeEarnings: 0,
            lifetimePayouts: 0,
            minimumPayout: settings?.defaultMinimumPayout || 25,
          },
        },
      },
      include: {
        wallet: true,
      },
    });

    // Log activity
    await this.logActivity(champion.id, 'SIGNUP', 'Champion account created');

    // If status is ACTIVE and signup bonus exists, award it
    if (status === 'ACTIVE') {
      await this.awardSignupBonus(champion.id);
    }

    logger.info('Champion created', { championId: champion.id, email: champion.email });

    return champion;
  },

  /**
   * Create an invite for a new champion
   */
  async createInvite(email, assignedRepId, invitedById) {
    const settings = await prisma.referralSettings.findFirst();

    // Check if champion already exists
    const existing = await this.getChampionByEmail(email);
    if (existing) {
      throw new Error('A champion with this email already exists');
    }

    const inviteToken = generateInviteToken();
    const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Create pending champion
    const champion = await prisma.champion.create({
      data: {
        email: email.toLowerCase(),
        firstName: '',
        lastName: '',
        referralCode: generateReferralCode(settings?.codePrefix || 'PANDA', settings?.codeLength || 6),
        status: 'PENDING',
        inviteToken,
        inviteExpires,
        invitedById,
        invitedAt: new Date(),
        assignedRepId,
      },
    });

    logger.info('Champion invite created', { championId: champion.id, email });

    return {
      champion,
      inviteUrl: `https://pandaexteriors.com/champion/join/${inviteToken}`,
    };
  },

  /**
   * Complete invite registration
   */
  async completeInvite(inviteToken, data) {
    const champion = await prisma.champion.findUnique({
      where: { inviteToken },
    });

    if (!champion) {
      throw new Error('Invalid invite token');
    }

    if (champion.inviteExpires && champion.inviteExpires < new Date()) {
      throw new Error('Invite has expired');
    }

    if (champion.status !== 'PENDING') {
      throw new Error('Invite has already been used');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, 12);

    // Update champion
    const updated = await prisma.champion.update({
      where: { id: champion.id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        city: data.city,
        state: data.state,
        zipCode: data.zipCode,
        passwordHash,
        emailVerified: true,
        status: 'ACTIVE',
        inviteToken: null,
        inviteExpires: null,
        referralUrl: `https://pandaexteriors.com/refer/${champion.referralCode}`,
        wallet: {
          create: {
            availableBalance: 0,
            pendingBalance: 0,
            lifetimeEarnings: 0,
            lifetimePayouts: 0,
            minimumPayout: 25,
          },
        },
      },
      include: { wallet: true },
    });

    // Log activity and award signup bonus
    await this.logActivity(updated.id, 'SIGNUP', 'Champion completed registration');
    await this.awardSignupBonus(updated.id);

    return updated;
  },

  /**
   * Update champion
   */
  async updateChampion(id, data) {
    const champion = await prisma.champion.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
      include: { wallet: true },
    });

    if (data.status) {
      await this.logActivity(id, 'STATUS_CHANGED', `Status changed to ${data.status}`);
    }

    return champion;
  },

  /**
   * Update champion status
   */
  async updateStatus(id, status, reason = null) {
    const champion = await prisma.champion.update({
      where: { id },
      data: {
        status,
        statusReason: reason,
        statusChangedAt: new Date(),
      },
    });

    await this.logActivity(id, 'STATUS_CHANGED', `Status changed to ${status}: ${reason || 'No reason provided'}`);

    // If activating a pending champion, award signup bonus
    if (status === 'ACTIVE') {
      const existingPayouts = await prisma.championPayout.count({
        where: { championId: id, type: 'SIGNUP_BONUS' },
      });
      if (existingPayouts === 0) {
        await this.awardSignupBonus(id);
      }
    }

    return champion;
  },

  /**
   * Soft delete champion
   */
  async deleteChampion(id) {
    const champion = await prisma.champion.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'TERMINATED',
      },
    });

    await this.logActivity(id, 'STATUS_CHANGED', 'Champion account terminated');

    return champion;
  },

  /**
   * Award signup bonus
   */
  async awardSignupBonus(championId) {
    const tier = await prisma.championPayoutTier.findFirst({
      where: { type: 'SIGNUP_BONUS', isActive: true },
    });

    if (!tier || tier.amount <= 0) {
      logger.info('No signup bonus configured', { championId });
      return null;
    }

    const payout = await prisma.championPayout.create({
      data: {
        championId,
        tierId: tier.id,
        type: 'SIGNUP_BONUS',
        amount: tier.amount,
        status: 'PENDING',
        notes: 'Welcome signup bonus',
      },
    });

    // Add to wallet pending balance
    await prisma.championWallet.update({
      where: { championId },
      data: {
        pendingBalance: { increment: tier.amount },
      },
    });

    // Log transaction
    const wallet = await prisma.championWallet.findUnique({ where: { championId } });
    await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'CREDIT_PAYOUT',
        amount: tier.amount,
        balanceAfter: wallet.pendingBalance,
        description: 'Signup bonus earned',
        payoutId: payout.id,
        tierId: tier.id,
      },
    });

    await this.logActivity(championId, 'PAYOUT_EARNED', `Earned $${tier.amount} signup bonus`);

    logger.info('Signup bonus awarded', { championId, amount: tier.amount });

    return payout;
  },

  /**
   * Log champion activity
   */
  async logActivity(championId, type, description, metadata = null) {
    return prisma.championActivity.create({
      data: {
        championId,
        type,
        description,
        metadata,
      },
    });
  },

  /**
   * Get champion statistics
   */
  async getStats() {
    const [
      totalChampions,
      activeChampions,
      pendingChampions,
      totalReferrals,
      qualifiedReferrals,
      closedReferrals,
      totalEarnings,
      pendingPayouts,
    ] = await Promise.all([
      prisma.champion.count({ where: { deletedAt: null } }),
      prisma.champion.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      prisma.champion.count({ where: { status: 'PENDING', deletedAt: null } }),
      prisma.championReferral.count(),
      prisma.championReferral.count({ where: { isQualified: true } }),
      prisma.championReferral.count({ where: { closedWon: true } }),
      prisma.championPayout.aggregate({
        where: { status: 'PAID' },
        _sum: { amount: true },
      }),
      prisma.championPayout.aggregate({
        where: { status: 'PENDING' },
        _sum: { amount: true },
      }),
    ]);

    return {
      champions: {
        total: totalChampions,
        active: activeChampions,
        pending: pendingChampions,
      },
      referrals: {
        total: totalReferrals,
        qualified: qualifiedReferrals,
        closed: closedReferrals,
        conversionRate: totalReferrals > 0
          ? ((closedReferrals / totalReferrals) * 100).toFixed(1) + '%'
          : '0%',
      },
      earnings: {
        totalPaid: totalEarnings._sum.amount || 0,
        pendingPayouts: pendingPayouts._sum.amount || 0,
      },
    };
  },

  /**
   * Validate champion password
   */
  async validatePassword(email, password) {
    const champion = await this.getChampionByEmail(email);
    if (!champion || !champion.passwordHash) {
      return null;
    }

    const valid = await bcrypt.compare(password, champion.passwordHash);
    if (!valid) {
      return null;
    }

    // Update last login
    await prisma.champion.update({
      where: { id: champion.id },
      data: { lastLoginAt: new Date() },
    });

    await this.logActivity(champion.id, 'LOGIN', 'Champion logged in');

    return champion;
  },
};

export default championService;
