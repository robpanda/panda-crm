// Lead Service - Business Logic Layer
// Replicates SalesLeaderLeadListController.cls and LeadWizard functionality
import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from '../middleware/logger.js';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const prisma = new PrismaClient();
const lambdaClient = new LambdaClient({ region: 'us-east-2' });

// Job ID starting number (first job ID will be YYYY-1000)
const JOB_ID_STARTING_NUMBER = 999;

// Audit logging helper
const logAudit = async ({ tableName, recordId, action, oldValues, newValues, userId, userEmail, source = 'api' }) => {
  try {
    // Calculate changed fields
    const changedFields = [];
    if (oldValues && newValues) {
      const allKeys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);
      for (const key of allKeys) {
        if (JSON.stringify(oldValues[key]) !== JSON.stringify(newValues[key])) {
          changedFields.push(key);
        }
      }
    } else if (newValues) {
      changedFields.push(...Object.keys(newValues));
    }

    await prisma.auditLog.create({
      data: {
        tableName,
        recordId,
        action,
        oldValues: oldValues || undefined,
        newValues: newValues || undefined,
        changedFields,
        userId,
        userEmail,
        source,
      },
    });
    logger.debug(`Audit log created: ${action} on ${tableName}:${recordId}`);
  } catch (error) {
    logger.error('Failed to create audit log:', error);
    // Don't throw - audit logging should not break the main operation
  }
};

// Salesforce sync configuration
const SALESFORCE_SYNC_ENABLED = process.env.SALESFORCE_SYNC_ENABLED !== 'false';
const SYNC_LAMBDA_NAME = 'panda-crm-sync';

class LeadService {
  /**
   * Normalize status to uppercase for Prisma enum (NEW, CONTACTED, etc.)
   */
  normalizeStatus(status) {
    if (!status) return 'NEW';
    const upper = status.toUpperCase().replace(/\s+/g, '_');
    // Map common frontend values to schema enum values
    const statusMap = {
      'NEW': 'NEW',
      'CONTACTED': 'CONTACTED',
      'QUALIFIED': 'QUALIFIED',
      'UNQUALIFIED': 'UNQUALIFIED',
      'NURTURING': 'NURTURING',
      'CONVERTED': 'CONVERTED',
      'LEAD_NOT_SET': 'NEW',     // Map "Lead Not Set" to NEW
      'LEAD_SET': 'CONTACTED',    // Map "Lead Set" to CONTACTED
    };
    return statusMap[upper] || 'NEW';
  }

  /**
   * Normalize rating to uppercase for Prisma enum (HOT, WARM, COLD)
   */
  normalizeRating(rating) {
    if (!rating) return null;
    const upper = rating.toUpperCase();
    if (['HOT', 'WARM', 'COLD'].includes(upper)) return upper;
    return null;
  }

  /**
   * Get leads with filtering and pagination
   * Replicates: getLeads()
   */
  async getLeads(options = {}) {
    const {
      page = 1,
      limit = 50,
      status,
      ownerId,
      ownerIds = [], // Support multiple owner IDs for team filtering
      ownerFilter, // 'mine' or 'all'
      source,
      leadSource, // Alias for source (from frontend filter)
      disposition,
      workType,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      currentUserId,
      startDate,
      endDate,
    } = options;

    const skip = (page - 1) * limit;

    // Build where clause - always exclude soft-deleted records
    const where = {
      isConverted: false,
      deleted_at: null, // Only show non-deleted records
    };

    if (status && status !== 'all') {
      where.status = status;
    }

    // Handle owner filtering with support for multiple owners (team view)
    if (ownerIds && ownerIds.length > 0) {
      // Multiple owner IDs provided (team filtering)
      where.ownerId = { in: ownerIds };
    } else if (ownerFilter === 'mine' && currentUserId) {
      where.ownerId = currentUserId;
    } else if (ownerId) {
      where.ownerId = ownerId;
    }

    // Source filter - supports both 'source' and 'leadSource' params
    const effectiveSource = source || leadSource;
    if (effectiveSource && effectiveSource !== 'all') {
      // Special handling for Champion Referral filter
      if (effectiveSource === 'CHAMPION_REFERRAL') {
        where.isChampionReferral = true;
      } else {
        where.source = effectiveSource;
      }
    }

    // Disposition filter
    if (disposition && disposition !== 'all') {
      where.disposition = disposition;
    }

    // Work type filter - case insensitive
    if (workType && workType !== 'all') {
      where.workType = { equals: workType, mode: 'insensitive' };
    }

    // Date range filtering
    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(`${endDate}T23:59:59.999Z`),
      };
    } else if (startDate) {
      where.createdAt = { gte: new Date(startDate) };
    } else if (endDate) {
      where.createdAt = { lte: new Date(`${endDate}T23:59:59.999Z`) };
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { mobilePhone: { contains: search } },
        { company: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Handle sorting - ownerName is a computed field, need to sort by relation
    let orderBy;
    if (sortBy === 'ownerName') {
      // Sort by owner's lastName, then firstName
      orderBy = [
        { owner: { lastName: sortOrder } },
        { owner: { firstName: sortOrder } },
      ];
    } else {
      orderBy = { [sortBy]: sortOrder };
    }

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          owner: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      prisma.lead.count({ where }),
    ]);

    // Transform leads to wrappers with computed fields
    const wrappers = leads.map((lead) => this.createLeadWrapper(lead));

    return {
      data: wrappers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    };
  }

  /**
   * Get lead counts by status and filters
   * @param {string} currentUserId - Current user ID (can be Cognito ID or database ID)
   * @param {string} ownerId - Filter counts to specific owner ID
   * @param {string[]} ownerIds - Filter counts to multiple owner IDs
   */
  async getLeadCounts(currentUserId, ownerId = null, ownerIds = []) {
    const counts = {};

    // Resolve user ID if it's a Cognito ID (starts with uuid format)
    let resolvedUserId = currentUserId;
    if (currentUserId) {
      resolvedUserId = await this.resolveUserId(currentUserId);
      logger.info(`getLeadCounts: currentUserId=${currentUserId}, resolvedUserId=${resolvedUserId}`);
    }

    // Build owner filter
    const ownerWhere = {};
    if (ownerIds && ownerIds.length > 0) {
      ownerWhere.ownerId = { in: ownerIds };
    } else if (ownerId) {
      ownerWhere.ownerId = ownerId;
    }

    // Total unconverted leads (with owner filter if specified)
    counts.total = await prisma.lead.count({
      where: { isConverted: false, deleted_at: null, ...ownerWhere },
    });

    // My leads - always set this, even if 0
    if (resolvedUserId) {
      counts.mine = await prisma.lead.count({
        where: { isConverted: false, deleted_at: null, ownerId: resolvedUserId },
      });
      logger.info(`getLeadCounts: mine=${counts.mine} for resolvedUserId=${resolvedUserId}`);
    } else {
      counts.mine = 0;
    }

    // By status (with owner filter if specified)
    const statusCounts = await prisma.lead.groupBy({
      by: ['status'],
      where: { isConverted: false, deleted_at: null, ...ownerWhere },
      _count: { id: true },
    });

    for (const item of statusCounts) {
      if (item.status) {
        counts[item.status] = item._count.id;
      }
    }

    return counts;
  }

  /**
   * Get available lead statuses
   */
  getLeadStatuses() {
    return [
      { value: 'NEW', label: 'New' },
      { value: 'CONTACTED', label: 'Contacted' },
      { value: 'QUALIFIED', label: 'Qualified' },
      { value: 'UNQUALIFIED', label: 'Unqualified' },
      { value: 'NURTURING', label: 'Nurturing' },
      { value: 'CONVERTED', label: 'Converted' },
    ];
  }

  /**
   * Get lead sources
   */
  getLeadSources() {
    return [
      { value: 'Web', label: 'Web' },
      { value: 'Phone Inquiry', label: 'Phone Inquiry' },
      { value: 'Partner Referral', label: 'Partner Referral' },
      { value: 'Purchased List', label: 'Purchased List' },
      { value: 'Door Knock', label: 'Door Knock' },
      { value: 'Self-Gen', label: 'Self-Gen' },
      { value: 'Marketing Campaign', label: 'Marketing Campaign' },
      { value: 'Trade Show', label: 'Trade Show' },
      { value: 'Employee Referral', label: 'Employee Referral' },
      { value: 'Customer Referral', label: 'Customer Referral' },
      { value: 'Social Media', label: 'Social Media' },
      { value: 'Other', label: 'Other' },
    ];
  }

  /**
   * Get single lead by ID
   */
  async getLeadById(id) {
    const lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        notes: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            createdBy: { select: { firstName: true, lastName: true } },
          },
        },
        tasks: {
          orderBy: { dueDate: 'asc' },
          where: { status: { not: 'COMPLETED' } },
          take: 5,
        },
        // Champion referral relation not yet defined in schema - use championReferralId directly
      },
    });

    if (!lead) {
      const error = new Error(`Lead not found: ${id}`);
      error.name = 'NotFoundError';
      throw error;
    }

    return this.createLeadWrapper(lead);
  }

  /**
   * Resolve user ID from Cognito ID or direct user ID
   * The frontend sends Cognito sub as userId, but leads table references users.id
   */
  async resolveUserId(idOrCognitoId) {
    if (!idOrCognitoId) return null;

    // If it's already a valid user ID format (user_XXX), return as-is
    if (idOrCognitoId.startsWith('user_')) {
      return idOrCognitoId;
    }

    // Look up by cognitoId (UUID format from Cognito)
    const user = await prisma.user.findFirst({
      where: { cognitoId: idOrCognitoId },
      select: { id: true }
    });

    if (user) {
      return user.id;
    }

    // Fallback: try direct lookup by id
    const directUser = await prisma.user.findUnique({
      where: { id: idOrCognitoId },
      select: { id: true }
    });

    return directUser?.id || null;
  }

  /**
   * Create new lead
   */
  async createLead(data) {
    // Map frontend fields to schema fields
    // creatorId -> ownerId (the person who created/owns the lead)
    // leadSetById -> assignedById (the person who assigned/set the lead)
    const rawOwnerId = data.ownerId || data.creatorId || null;
    const rawAssignedById = data.leadSetById || data.assignedById || null;
    const rawLeadSetById = data.leadSetById || null;

    // Resolve Cognito IDs to actual user IDs
    const ownerId = await this.resolveUserId(rawOwnerId);
    const assignedById = await this.resolveUserId(rawAssignedById);
    const leadSetById = await this.resolveUserId(rawLeadSetById);

    const lead = await prisma.lead.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        mobilePhone: data.mobilePhone,
        company: data.company,
        street: data.street,
        city: data.city,
        state: data.state,
        postalCode: data.postalCode,
        status: this.normalizeStatus(data.status),
        source: data.source,
        rating: this.normalizeRating(data.rating),
        industry: data.industry,
        ownerId: ownerId,
        assignedById: assignedById,
        assignedAt: assignedById ? new Date() : null,
        workType: data.workType,
        propertyType: data.propertyType,
        leadNotes: data.leadNotes,
        description: data.description,
        title: data.title,
        salesRabbitUser: data.salesRabbitUser,
        isSelfGen: data.isSelfGen || false,
        selfGenRepId: data.selfGenRepId,
        salesforceId: data.salesforceId,
        // Call Center - Tentative Appointment fields (per Setting A Lead SOP)
        tentativeAppointmentDate: data.tentativeAppointmentDate ? new Date(data.tentativeAppointmentDate) : null,
        tentativeAppointmentTime: data.tentativeAppointmentTime,
        leadSetById: leadSetById,
        disposition: data.disposition,
      },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
        leadSetBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    logger.info(`Lead created: ${lead.id} (${lead.firstName} ${lead.lastName})`);

    // Log audit event
    const auditContext = data._auditContext || {};
    await logAudit({
      tableName: 'leads',
      recordId: lead.id,
      action: 'CREATE',
      newValues: {
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone,
        status: lead.status,
        source: lead.source,
        ownerId: lead.ownerId,
      },
      userId: auditContext.userId,
      userEmail: auditContext.userEmail,
      source: 'web',
    });

    // Push to Salesforce if sync is enabled and lead doesn't already have a Salesforce ID
    if (SALESFORCE_SYNC_ENABLED && !lead.salesforceId) {
      this.pushToSalesforce(lead.id).catch(err => {
        logger.error(`Failed to push lead ${lead.id} to Salesforce: ${err.message}`);
      });
    }

    // Score the new lead asynchronously (non-blocking)
    this.scoreNewLead(lead.id).catch(err => {
      logger.error(`Failed to score new lead ${lead.id}: ${err.message}`);
    });

    return this.createLeadWrapper(lead);
  }

  /**
   * Score a newly created lead using rule-based scoring
   * Called asynchronously after lead creation
   * Uses simplified scoring until full LeadScoringRule model is deployed
   */
  async scoreNewLead(leadId) {
    try {
      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead) {
        logger.warn(`Lead ${leadId} not found for scoring`);
        return null;
      }

      // Calculate score based on lead attributes
      let score = 50; // Base score
      const factors = [];

      // Source scoring - self-gen leads are highly valuable
      if (lead.isSelfGen) {
        score += 25;
        factors.push({ name: 'Self-Gen Lead', impact: 25, category: 'source' });
      } else if (lead.source === 'Customer Referral' || lead.source === 'Partner Referral') {
        score += 20;
        factors.push({ name: 'Referral Lead', impact: 20, category: 'source' });
      } else if (lead.source === 'Web' || lead.source === 'Marketing Campaign') {
        score += 10;
        factors.push({ name: 'Marketing Lead', impact: 10, category: 'source' });
      }

      // Work type scoring - Insurance typically higher value
      if (lead.workType === 'Insurance') {
        score += 15;
        factors.push({ name: 'Insurance Work Type', impact: 15, category: 'workType' });
      } else if (lead.workType === 'Retail') {
        score += 10;
        factors.push({ name: 'Retail Work Type', impact: 10, category: 'workType' });
      }

      // Data completeness scoring
      if (lead.email) {
        score += 5;
        factors.push({ name: 'Has Email', impact: 5, category: 'completeness' });
      }
      if (lead.phone || lead.mobilePhone) {
        score += 5;
        factors.push({ name: 'Has Phone', impact: 5, category: 'completeness' });
      }
      if (lead.street && lead.city && lead.state) {
        score += 5;
        factors.push({ name: 'Complete Address', impact: 5, category: 'completeness' });
      }

      // Territory scoring - active service areas
      const activeStates = ['MD', 'VA', 'DE', 'NJ', 'NC', 'TN', 'FL'];
      if (lead.state && activeStates.includes(lead.state.toUpperCase())) {
        score += 10;
        factors.push({ name: 'Active Service Area', impact: 10, category: 'territory' });
      }

      // Normalize score to 0-100
      score = Math.min(100, Math.max(0, score));

      // Calculate rank
      const rank = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : score >= 20 ? 'D' : 'F';

      // Update lead with score
      // Note: Using underscore field names from schema (lead_rank, lead_score, etc.)
      await prisma.lead.update({
        where: { id: leadId },
        data: {
          score: score,
          lead_score: score,
          lead_rank: rank,
          score_factors: factors,
          scored_at: new Date(),
          score_version: 1,
        },
      });

      logger.info(`New lead ${leadId} scored: ${score} (${rank})`);

      return {
        leadId,
        score,
        rank,
        factors,
        scoredAt: new Date(),
      };
    } catch (error) {
      logger.error(`Lead scoring failed for ${leadId}: ${error.message}`);
      // Don't throw - scoring failure shouldn't break lead creation
      return null;
    }
  }

  /**
   * Push lead to Salesforce via sync Lambda
   * Called asynchronously after lead creation
   */
  async pushToSalesforce(leadId) {
    try {
      const command = new InvokeCommand({
        FunctionName: SYNC_LAMBDA_NAME,
        InvocationType: 'Event', // Async invocation
        Payload: JSON.stringify({
          action: 'pushLead',
          leadId: leadId,
        }),
      });

      await lambdaClient.send(command);
      logger.info(`Queued lead ${leadId} for Salesforce sync`);
      return { success: true };
    } catch (error) {
      logger.error(`Failed to invoke sync Lambda for lead ${leadId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update lead
   */
  async updateLead(id, data) {
    // Get old values for audit logging
    const oldLead = await prisma.lead.findUnique({ where: { id } });

    // Build update data, filtering out undefined values
    const updateData = {};

    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.email !== undefined) updateData.email = data.email || null;
    if (data.phone !== undefined) updateData.phone = data.phone || null;
    if (data.mobilePhone !== undefined) updateData.mobilePhone = data.mobilePhone || null;
    if (data.company !== undefined) updateData.company = data.company || null;
    if (data.street !== undefined) updateData.street = data.street || null;
    if (data.city !== undefined) updateData.city = data.city || null;
    if (data.state !== undefined) updateData.state = data.state || null;
    if (data.postalCode !== undefined) updateData.postalCode = data.postalCode || null;
    if (data.status !== undefined) updateData.status = this.normalizeStatus(data.status);
    if (data.source !== undefined) updateData.source = data.source || null;
    if (data.rating !== undefined) updateData.rating = this.normalizeRating(data.rating);
    if (data.industry !== undefined) updateData.industry = data.industry || null;
    if (data.ownerId !== undefined) updateData.ownerId = data.ownerId || null;
    if (data.score !== undefined) updateData.score = data.score;
    if (data.workType !== undefined) updateData.workType = data.workType || null;
    if (data.propertyType !== undefined) updateData.propertyType = data.propertyType || null;
    if (data.leadNotes !== undefined) updateData.leadNotes = data.leadNotes || null;
    if (data.description !== undefined) updateData.description = data.description || null;
    if (data.title !== undefined) updateData.title = data.title || null;
    if (data.salesRabbitUser !== undefined) updateData.salesRabbitUser = data.salesRabbitUser || null;
    // Call Center - Tentative Appointment fields
    if (data.tentativeAppointmentDate !== undefined) {
      updateData.tentativeAppointmentDate = data.tentativeAppointmentDate ? new Date(data.tentativeAppointmentDate) : null;
    }
    if (data.tentativeAppointmentTime !== undefined) updateData.tentativeAppointmentTime = data.tentativeAppointmentTime || null;
    if (data.disposition !== undefined) updateData.disposition = data.disposition || null;

    const lead = await prisma.lead.update({
      where: { id },
      data: updateData,
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
        leadSetBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    logger.info(`Lead updated: ${id}`);

    // Log audit event
    const auditContext = data._auditContext || {};
    await logAudit({
      tableName: 'leads',
      recordId: id,
      action: 'UPDATE',
      oldValues: oldLead ? {
        firstName: oldLead.firstName,
        lastName: oldLead.lastName,
        email: oldLead.email,
        phone: oldLead.phone,
        status: oldLead.status,
        source: oldLead.source,
        ownerId: oldLead.ownerId,
      } : null,
      newValues: {
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone,
        status: lead.status,
        source: lead.source,
        ownerId: lead.ownerId,
      },
      userId: auditContext.userId,
      userEmail: auditContext.userEmail,
      source: 'web',
    });

    return this.createLeadWrapper(lead);
  }

  /**
   * Convert lead to Account, Contact, and Opportunity
   */
  async convertLead(id, options = {}) {
    const lead = await prisma.lead.findUnique({ where: { id } });

    if (!lead) {
      const error = new Error(`Lead not found: ${id}`);
      error.name = 'NotFoundError';
      throw error;
    }

    if (lead.isConverted) {
      const error = new Error('Lead has already been converted');
      error.name = 'ValidationError';
      throw error;
    }

    // Use transaction for conversion
    const result = await prisma.$transaction(async (tx) => {
      // Create Account
      const account = await tx.account.create({
        data: {
          name: options.accountName || lead.company || `${lead.firstName} ${lead.lastName}`,
          billingStreet: lead.street,
          billingCity: lead.city,
          billingState: lead.state,
          billingPostalCode: lead.postalCode,
          phone: lead.phone,
          email: lead.email,
          type: 'RESIDENTIAL',
          status: 'NEW',
          ownerId: lead.ownerId,
        },
      });

      // Create Contact
      const contact = await tx.contact.create({
        data: {
          firstName: lead.firstName,
          lastName: lead.lastName,
          fullName: `${lead.firstName} ${lead.lastName}`,
          email: lead.email,
          phone: lead.phone,
          mobilePhone: lead.mobilePhone,
          mailingStreet: lead.street,
          mailingCity: lead.city,
          mailingState: lead.state,
          mailingPostalCode: lead.postalCode,
          accountId: account.id,
          isPrimary: true,
        },
      });

      // Create Opportunity if requested
      let opportunity = null;
      if (options.createOpportunity !== false) {
        // Generate Job ID within transaction using row-level lock
        const currentYear = new Date().getFullYear();
        let jobId = null;

        try {
          // Try to get and lock the sequence row for this year
          const sequences = await tx.$queryRaw`
            SELECT id, year, last_number
            FROM job_id_sequences
            WHERE year = ${currentYear}
            FOR UPDATE
          `;

          let nextNumber;
          if (!sequences || sequences.length === 0) {
            // First job of the year - create the sequence
            await tx.jobIdSequence.create({
              data: {
                year: currentYear,
                lastNumber: JOB_ID_STARTING_NUMBER + 1,
              },
            });
            nextNumber = JOB_ID_STARTING_NUMBER + 1;
          } else {
            // Increment the sequence
            nextNumber = Number(sequences[0].last_number) + 1;
            await tx.jobIdSequence.update({
              where: { year: currentYear },
              data: { lastNumber: nextNumber },
            });
          }
          jobId = `${currentYear}-${nextNumber}`;
          logger.info(`Generated Job ID: ${jobId} for lead conversion`);
        } catch (err) {
          // Log error but don't fail the conversion - Job ID can be assigned later
          logger.warn(`Failed to generate Job ID: ${err.message}`);
        }

        opportunity = await tx.opportunity.create({
          data: {
            name: options.opportunityName || `${lead.firstName} ${lead.lastName} - ${new Date().toLocaleDateString()}`,
            job_id: jobId, // Auto-assigned Job ID (using underscore field name from schema)
            accountId: account.id,
            contactId: contact.id,
            stage: 'LEAD_ASSIGNED',
            type: options.opportunityType || 'INSURANCE',
            leadSource: lead.source,
            isSelfGen: lead.isSelfGen,
            ownerId: lead.ownerId,
            closeDate: options.closeDate ? new Date(options.closeDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            // Store work type and appointment date on opportunity
            workType: options.workType,
            appointmentDate: options.tentativeAppointmentDate ? new Date(options.tentativeAppointmentDate) : null,
          },
        });
      }

      // Create Service Appointment if tentative appointment date is provided
      let serviceAppointment = null;
      let assignedResource = null;
      if (options.createServiceAppointment && options.tentativeAppointmentDate && opportunity) {
        // First, find the best available resource based on territory and skills
        const bestResource = await this.findBestResource({
          state: lead.state,
          postalCode: lead.postalCode,
          workType: options.workType || 'Inspection',
          appointmentDate: new Date(options.tentativeAppointmentDate),
        }, tx);

        // Find or create territory based on state
        let territory = null;
        if (lead.state) {
          territory = await tx.territory.findFirst({
            where: {
              OR: [
                { states: { has: lead.state } },
                { name: { contains: lead.state, mode: 'insensitive' } },
              ],
            },
          });
        }

        // Create WorkOrder with territory
        const workOrder = await tx.workOrder.create({
          data: {
            subject: `${options.workType || 'Inspection'} - ${account.name}`,
            accountId: account.id,
            contactId: contact.id,
            opportunityId: opportunity.id,
            status: 'NEW',
            workType: options.workType || 'Inspection',
            priority: 'NORMAL',
            territoryId: territory?.id,
          },
        });

        // Then create the Service Appointment
        const appointmentDate = new Date(options.tentativeAppointmentDate);
        const endDate = new Date(appointmentDate);
        endDate.setHours(endDate.getHours() + 2); // Default 2 hour duration

        serviceAppointment = await tx.serviceAppointment.create({
          data: {
            subject: `${options.workType || 'Inspection'} - ${lead.firstName} ${lead.lastName}`,
            workOrderId: workOrder.id,
            accountId: account.id,
            contactId: contact.id,
            scheduledStart: appointmentDate,
            scheduledEnd: endDate,
            status: 'SCHEDULED',
            appointmentType: options.workType || 'Inspection',
            street: lead.street,
            city: lead.city,
            state: lead.state,
            postalCode: lead.postalCode,
          },
        });

        // Assign the resource to the service appointment
        if (bestResource) {
          assignedResource = await tx.assignedResource.create({
            data: {
              serviceAppointmentId: serviceAppointment.id,
              serviceResourceId: bestResource.id,
              isPrimaryResource: true,
            },
          });
          logger.info(`Assigned resource ${bestResource.name} (${bestResource.id}) to appointment ${serviceAppointment.id}`);
        } else {
          logger.warn(`No available resource found for appointment ${serviceAppointment.id} - appointment created unassigned`);
        }

        logger.info(`Service Appointment created: ${serviceAppointment.id} for ${appointmentDate.toISOString()}`);
      }

      // Update lead as converted
      await tx.lead.update({
        where: { id },
        data: {
          isConverted: true,
          convertedDate: new Date(),
          convertedAccountId: account.id,
          convertedContactId: contact.id,
          convertedOpportunityId: opportunity?.id,
        },
      });

      return { account, contact, opportunity, serviceAppointment, assignedResource };
    });

    logger.info(`Lead converted: ${id} -> Account: ${result.account.id}, Contact: ${result.contact.id}, Opportunity: ${result.opportunity?.id}${result.serviceAppointment ? `, ServiceAppointment: ${result.serviceAppointment.id}` : ''}${result.assignedResource ? `, AssignedResource: ${result.assignedResource.serviceResourceId}` : ''}`);
    return result;
  }

  /**
   * Delete lead
   */
  async deleteLead(id) {
    await prisma.lead.delete({ where: { id } });
    logger.info(`Lead deleted: ${id}`);
    return { deleted: true };
  }

  /**
   * Create lead wrapper with computed fields
   */
  createLeadWrapper(lead) {
    const wrapper = {
      id: lead.id,
      name: `${lead.firstName} ${lead.lastName}`,
      firstName: lead.firstName,
      lastName: lead.lastName,
      status: lead.status,
      source: lead.source,
      phone: lead.phone,
      email: lead.email,
      company: lead.company,
      title: lead.title,
      mobilePhone: lead.mobilePhone,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
      ownerId: lead.ownerId,
      ownerName: lead.owner ? `${lead.owner.firstName} ${lead.owner.lastName}` : 'Unassigned',
      city: lead.city,
      state: lead.state,
      street: lead.street,
      postalCode: lead.postalCode,
      rating: lead.rating,
      industry: lead.industry,
      score: lead.score,
      isSelfGen: lead.isSelfGen,
      isConverted: lead.isConverted,
      formattedPhone: lead.mobilePhone || lead.phone,
      statusClass: this.getStatusClass(lead.status),
      ratingClass: this.getRatingClass(lead.rating),
      daysOld: 0,
      daysOldLabel: 'Today',
      // Lead detail fields
      workType: lead.workType,
      propertyType: lead.propertyType,
      leadNotes: lead.leadNotes,
      notes: lead.leadNotes, // Alias for mobile app compatibility
      description: lead.description,
      salesRabbitUser: lead.salesRabbitUser,
      // Call Center - Tentative Appointment fields
      tentativeAppointmentDate: lead.tentativeAppointmentDate,
      tentativeAppointmentTime: lead.tentativeAppointmentTime,
      disposition: lead.disposition,
      leadSetById: lead.leadSetById,
      leadSetByName: lead.leadSetBy ? `${lead.leadSetBy.firstName} ${lead.leadSetBy.lastName}` : null,
      // Lead Intelligence / Scoring fields (snake_case in DB)
      leadScore: lead.lead_score,
      leadRank: lead.lead_rank,
      scoreFactors: lead.score_factors,
      scoredAt: lead.scored_at,
      // Demographic enrichment (snake_case in DB)
      medianHouseholdIncome: lead.median_household_income,
      medianHomeValue: lead.median_home_value,
      homeownershipRate: lead.homeownership_rate,
      medianAge: lead.median_age,
      enrichedAt: lead.enriched_at,
      // Champion Referral fields
      isChampionReferral: lead.isChampionReferral || false,
      championReferralId: lead.championReferralId,
      referredByChampionId: lead.referredByChampionId,
      championReferral: lead.championReferral || null,
    };

    // Calculate days old
    if (lead.createdAt) {
      const diffTime = Date.now() - new Date(lead.createdAt).getTime();
      const daysOld = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      wrapper.daysOld = daysOld;

      if (daysOld === 0) {
        wrapper.daysOldLabel = 'Today';
      } else if (daysOld === 1) {
        wrapper.daysOldLabel = '1 day';
      } else if (daysOld < 7) {
        wrapper.daysOldLabel = `${daysOld} days`;
      } else if (daysOld < 30) {
        const weeks = Math.floor(daysOld / 7);
        wrapper.daysOldLabel = `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
      } else {
        const months = Math.floor(daysOld / 30);
        wrapper.daysOldLabel = `${months} ${months === 1 ? 'month' : 'months'}`;
      }
    }

    return wrapper;
  }

  /**
   * Get CSS class for lead status
   */
  getStatusClass(status) {
    if (!status) return 'status-default';

    const statusLower = status.toLowerCase();
    if (statusLower.includes('new') || statusLower === 'open') return 'status-new';
    if (statusLower.includes('working') || statusLower.includes('contacted')) return 'status-working';
    if (statusLower.includes('qualified') || statusLower.includes('hot') || statusLower.includes('set')) return 'status-qualified';
    if (statusLower.includes('unqualified') || statusLower.includes('closed') || statusLower.includes('not set')) return 'status-closed';
    if (statusLower.includes('nurturing') || statusLower.includes('waiting')) return 'status-nurturing';
    if (statusLower.includes('assigned') || statusLower.includes('issued')) return 'status-assigned';
    return 'status-default';
  }

  /**
   * Get CSS class for lead rating
   */
  getRatingClass(rating) {
    if (!rating) return 'rating-none';

    const ratingLower = rating.toLowerCase();
    if (ratingLower === 'hot') return 'rating-hot';
    if (ratingLower === 'warm') return 'rating-warm';
    if (ratingLower === 'cold') return 'rating-cold';
    return 'rating-none';
  }

  /**
   * Find the best available resource based on territory, skills, and availability
   * @param {Object} options - Search criteria
   * @param {string} options.state - State abbreviation (e.g., 'MD', 'VA')
   * @param {string} options.postalCode - Postal code for territory matching
   * @param {string} options.workType - Work type (e.g., 'Inspection', 'Retail Demo')
   * @param {Date} options.appointmentDate - Requested appointment date/time
   * @param {Object} tx - Prisma transaction client
   * @returns {Object|null} Best matching service resource or null
   */
  async findBestResource(options, tx = prisma) {
    const { state, postalCode, workType, appointmentDate } = options;

    try {
      // Step 1: Find territory by state
      let territory = null;
      if (state) {
        territory = await tx.territory.findFirst({
          where: {
            isActive: true,
            OR: [
              { states: { has: state } },
              { name: { contains: state, mode: 'insensitive' } },
            ],
          },
        });
      }

      // Step 2: Build resource query
      const resourceWhere = {
        isActive: true,
      };

      // Filter by territory if found
      if (territory) {
        resourceWhere.territoryMembers = {
          some: { territoryId: territory.id },
        };
      }

      // Step 3: Get all eligible resources
      const resources = await tx.serviceResource.findMany({
        where: resourceWhere,
        include: {
          skills: {
            include: {
              skill: true,
            },
          },
          territoryMembers: {
            include: {
              territory: true,
            },
          },
          absences: {
            where: {
              // Check for absences on the appointment date
              startTime: { lte: appointmentDate },
              endTime: { gte: appointmentDate },
            },
          },
        },
        orderBy: [
          { lastAppointmentAssignedAt: 'asc' }, // Prefer resources who haven't been assigned recently
          { name: 'asc' },
        ],
      });

      if (resources.length === 0) {
        logger.info(`No resources found for territory ${territory?.name || state}`);
        return null;
      }

      // Step 4: Filter and score resources
      const appointmentDay = appointmentDate.getDay();
      const isWeekend = appointmentDay === 0 || appointmentDay === 6;

      const scoredResources = resources
        .filter(resource => {
          // Exclude resources with absences on the appointment date
          if (resource.absences.length > 0) {
            return false;
          }
          return true;
        })
        .map(resource => {
          let score = 0;

          // Score: Has matching skill for work type (+50 points)
          const hasMatchingSkill = resource.skills.some(rs =>
            rs.skill?.name?.toLowerCase().includes(workType?.toLowerCase() || '')
          );
          if (hasMatchingSkill) score += 50;

          // Score: Is in matching territory (+30 points)
          if (territory && resource.territoryMembers.some(tm => tm.territoryId === territory.id)) {
            score += 30;
          }

          // Score: Not assigned recently (+20 points for each day since last assignment)
          if (resource.lastAppointmentAssignedAt) {
            const daysSinceAssigned = Math.floor(
              (Date.now() - new Date(resource.lastAppointmentAssignedAt).getTime()) / (1000 * 60 * 60 * 24)
            );
            score += Math.min(daysSinceAssigned * 5, 20);
          } else {
            score += 20; // Never assigned = high priority
          }

          // Score: Prefers weekend work (if applicable) (+10 points)
          if (isWeekend && resource.worksWeekends) {
            score += 10;
          }

          return { resource, score };
        })
        .sort((a, b) => b.score - a.score); // Sort by score descending

      if (scoredResources.length === 0) {
        logger.info(`No eligible resources after filtering for ${workType} in ${state}`);
        return null;
      }

      const bestResource = scoredResources[0].resource;
      logger.info(`Best resource found: ${bestResource.name} (score: ${scoredResources[0].score}) for ${workType} in ${territory?.name || state}`);

      // Update last assigned timestamp
      await tx.serviceResource.update({
        where: { id: bestResource.id },
        data: { lastAppointmentAssignedAt: new Date() },
      });

      return bestResource;
    } catch (error) {
      logger.error(`Error finding best resource: ${error.message}`);
      return null;
    }
  }

  // ============================================================================
  // CALL CENTER METHODS - Dashboard Stats & Queues
  // ============================================================================

  /**
   * Get date range for filtering (defaults to current month)
   * Handles date-only strings (YYYY-MM-DD) by treating them as full days in UTC
   */
  getDateRange(startDate, endDate) {
    if (startDate && endDate) {
      // Parse date-only strings properly
      // startDate should be start of day (00:00:00.000)
      // endDate should be end of day (23:59:59.999)
      const start = new Date(startDate);
      const end = new Date(endDate);

      // If endDate is a date-only string (no time component), set it to end of day
      // Date-only strings like "2025-12-30" are parsed as UTC midnight
      // We need to add 23:59:59.999 to cover the full day
      if (typeof endDate === 'string' && endDate.length === 10) {
        end.setUTCHours(23, 59, 59, 999);
      }

      return { start, end };
    }
    // Default to current month
    const now = new Date();
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
    };
  }

  /**
   * Get call center leaderboard
   * Shows agents ranked by leads created this month
   * ONLY includes users with call_center or call_center_manager roleType
   * Uses ownerId (the assigned rep) since leadSetById isn't populated in migrated data
   */
  async getCallCenterLeaderboard(options = {}) {
    const { start, end } = this.getDateRange(options.startDate, options.endDate);

    // First, get all users with call_center or call_center_manager role types
    const callCenterUsers = await prisma.user.findMany({
      where: {
        role: {
          roleType: { in: ['call_center', 'call_center_manager'] },
        },
      },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    // If no call center users found, return empty leaderboard
    if (callCenterUsers.length === 0) {
      return {
        leaderboard: [],
        period: { start, end },
        totalLeadsSet: 0,
        totalAppointmentsSet: 0,
      };
    }

    const callCenterUserIds = callCenterUsers.map(u => u.id);
    const agentMap = new Map(callCenterUsers.map(a => [a.id, a]));

    // Get all leads created in the date range, grouped by owner
    // ONLY for call center users
    const leadsCreatedByAgent = await prisma.lead.groupBy({
      by: ['ownerId'],
      where: {
        ownerId: { in: callCenterUserIds },
        createdAt: { gte: start, lte: end },
      },
      _count: { id: true },
    });

    // Get converted leads (appointments set) by agent in the date range
    // ONLY for call center users
    const convertedByAgent = await prisma.lead.groupBy({
      by: ['ownerId'],
      where: {
        ownerId: { in: callCenterUserIds },
        isConverted: true,
        convertedDate: { gte: start, lte: end },
      },
      _count: { id: true },
    });

    // Create a map for converted leads
    const convertedMap = new Map(convertedByAgent.map(c => [c.ownerId, c._count.id]));

    // Build leaderboard with fields the frontend expects
    const leaderboard = leadsCreatedByAgent
      .map(item => {
        const agent = agentMap.get(item.ownerId);
        const leadsCreated = item._count.id;
        const appointmentsSet = convertedMap.get(item.ownerId) || 0;
        const conversionRate = leadsCreated > 0
          ? Math.round((appointmentsSet / leadsCreated) * 100)
          : 0;

        return {
          userId: item.ownerId,
          name: agent ? `${agent.firstName} ${agent.lastName}` : 'Unknown',
          firstName: agent?.firstName || '',
          lastName: agent?.lastName || '',
          email: agent?.email,
          leadsCreated,
          appointmentsSet,
          conversionRate,
          // Keep leadsSet for backwards compatibility
          leadsSet: leadsCreated,
        };
      })
      .sort((a, b) => b.leadsCreated - a.leadsCreated);

    return {
      leaderboard,
      period: { start, end },
      totalLeadsSet: leaderboard.reduce((sum, a) => sum + a.leadsCreated, 0),
      totalAppointmentsSet: leaderboard.reduce((sum, a) => sum + a.appointmentsSet, 0),
    };
  }

  /**
   * Get current user's call center stats
   * Uses ownerId and createdAt since leadSetById/assignedAt aren't populated in migrated data
   */
  async getMyCallCenterStats(userId, options = {}) {
    const defaultStats = {
      leadsCreated: 0,
      appointmentsSet: 0,
      callsMade: 0,
      conversionRate: 0,
      leadsSet: 0,
      leadsToday: 0,
      leadsThisWeek: 0,
      leadsThisMonth: 0,
    };

    if (!userId) {
      return defaultStats;
    }

    // Resolve user ID if it's a Cognito ID
    const resolvedUserId = await this.resolveUserId(userId);
    if (!resolvedUserId) {
      return defaultStats;
    }

    const { start, end } = this.getDateRange(options.startDate, options.endDate);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const [leadsCreated, appointmentsSet, leadsToday, leadsThisWeek] = await Promise.all([
      // Total leads owned in period
      prisma.lead.count({
        where: {
          ownerId: resolvedUserId,
          createdAt: { gte: start, lte: end },
        },
      }),
      // Converted leads (appointments set) in period
      prisma.lead.count({
        where: {
          ownerId: resolvedUserId,
          isConverted: true,
          convertedDate: { gte: start, lte: end },
        },
      }),
      // Leads created today
      prisma.lead.count({
        where: {
          ownerId: resolvedUserId,
          createdAt: { gte: todayStart },
        },
      }),
      // Leads created this week
      prisma.lead.count({
        where: {
          ownerId: resolvedUserId,
          createdAt: { gte: weekStart },
        },
      }),
    ]);

    // Calculate conversion rate
    const conversionRate = leadsCreated > 0
      ? Math.round((appointmentsSet / leadsCreated) * 100)
      : 0;

    return {
      // Fields the frontend expects
      leadsCreated,
      appointmentsSet,
      callsMade: 0, // TODO: Integrate with RingCentral call logs
      conversionRate,
      // Legacy fields for backwards compatibility
      leadsSet: leadsCreated,
      leadsToday,
      leadsThisWeek,
      leadsThisMonth: leadsCreated,
      period: { start, end },
    };
  }

  /**
   * Get team-wide call center totals
   * ONLY includes leads owned by call_center or call_center_manager role users
   * Uses ownerId and createdAt since leadSetById/assignedAt aren't populated in migrated data
   */
  async getCallCenterTeamTotals(options = {}) {
    const { start, end } = this.getDateRange(options.startDate, options.endDate);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // First, get all users with call_center or call_center_manager role types
    const callCenterUsers = await prisma.user.findMany({
      where: {
        role: {
          roleType: { in: ['call_center', 'call_center_manager'] },
        },
      },
      select: { id: true },
    });

    // If no call center users found, return zeros
    if (callCenterUsers.length === 0) {
      return {
        totalLeads: 0,
        totalAppointments: 0,
        totalConverted: 0,
        teamConversionRate: 0,
        totalCalls: 0,
        totalLeadsSet: 0,
        leadsToday: 0,
        unconfirmedCount: 0,
        unscheduledCount: 0,
        period: { start, end },
      };
    }

    const callCenterUserIds = callCenterUsers.map(u => u.id);

    const [totalLeadsCreated, totalConverted, leadsToday, unconfirmedCount, unscheduledCount] = await Promise.all([
      // Total leads created in period by call center users
      prisma.lead.count({
        where: {
          ownerId: { in: callCenterUserIds },
          createdAt: { gte: start, lte: end },
        },
      }),
      // Total converted leads (appointments set) in period by call center users
      prisma.lead.count({
        where: {
          ownerId: { in: callCenterUserIds },
          isConverted: true,
          convertedDate: { gte: start, lte: end },
        },
      }),
      // Leads created today by call center users
      prisma.lead.count({
        where: {
          ownerId: { in: callCenterUserIds },
          createdAt: { gte: todayStart },
        },
      }),
      // Unconfirmed leads (assigned but not confirmed - no tentative appointment date) by call center users
      prisma.lead.count({
        where: {
          isConverted: false,
          ownerId: { in: callCenterUserIds },
          tentativeAppointmentDate: null,
          status: { in: ['NEW', 'CONTACTED'] },
        },
      }),
      // Unscheduled appointments (has tentative date but not converted yet) by call center users
      prisma.lead.count({
        where: {
          isConverted: false,
          ownerId: { in: callCenterUserIds },
          tentativeAppointmentDate: { not: null },
        },
      }),
    ]);

    // Calculate team conversion rate
    const teamConversionRate = totalLeadsCreated > 0
      ? Math.round((totalConverted / totalLeadsCreated) * 100)
      : 0;

    return {
      // Fields the frontend expects
      totalLeads: totalLeadsCreated,
      totalAppointments: totalConverted,
      totalConverted: totalConverted,
      teamConversionRate,
      totalCalls: 0, // TODO: Integrate with RingCentral call logs
      // Legacy fields for backwards compatibility
      totalLeadsSet: totalLeadsCreated,
      leadsToday,
      unconfirmedCount,
      unscheduledCount,
      period: { start, end },
    };
  }

  /**
   * Get unconfirmed leads (leads assigned but no appointment scheduled)
   * Used by: Unconfirmed Leads tab
   */
  async getUnconfirmedLeads(options = {}) {
    const { page = 1, limit = 50, currentUserId } = options;
    const skip = (page - 1) * limit;

    const where = {
      isConverted: false,
      ownerId: { not: null },
      tentativeAppointmentDate: null,
      status: { in: ['NEW', 'CONTACTED', 'QUALIFIED'] },
    };

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
          leadSetBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.lead.count({ where }),
    ]);

    const wrappers = leads.map(lead => this.createLeadWrapper(lead));

    return {
      data: wrappers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    };
  }

  /**
   * Get unscheduled appointments (leads with tentative date but not yet converted/scheduled)
   * Used by: Unscheduled Appts tab
   */
  async getUnscheduledAppointments(options = {}) {
    const { page = 1, limit = 50, currentUserId } = options;
    const skip = (page - 1) * limit;

    const where = {
      isConverted: false,
      tentativeAppointmentDate: { not: null },
    };

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        skip,
        take: limit,
        orderBy: { tentativeAppointmentDate: 'asc' },
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
          leadSetBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.lead.count({ where }),
    ]);

    const wrappers = leads.map(lead => this.createLeadWrapper(lead));

    return {
      data: wrappers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    };
  }

  // ============================================================================
  // CALL CENTER METHODS - Notes for Lead Management
  // ============================================================================

  /**
   * Get all notes for a lead
   * Used by: Call Center Dashboard to view lead communication history
   */
  async getLeadNotes(leadId) {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, firstName: true, lastName: true },
    });

    if (!lead) {
      const error = new Error(`Lead not found: ${leadId}`);
      error.name = 'NotFoundError';
      throw error;
    }

    const notes = await prisma.note.findMany({
      where: { leadId: leadId },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    return {
      leadId,
      leadName: `${lead.firstName} ${lead.lastName}`,
      notes: notes.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        createdAt: n.createdAt,
        createdBy: n.createdBy
          ? `${n.createdBy.firstName} ${n.createdBy.lastName}`
          : 'System',
        createdById: n.createdById,
      })),
      total: notes.length,
    };
  }

  /**
   * Add a note to a lead
   * Used by: Call Center to document calls and status updates
   */
  async addLeadNote(leadId, data) {
    const { note, title, createdBy, isPinned } = data;

    // Verify lead exists
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, firstName: true, lastName: true },
    });

    if (!lead) {
      const error = new Error(`Lead not found: ${leadId}`);
      error.name = 'NotFoundError';
      throw error;
    }

    // If this note will be pinned, unpin any existing pinned notes
    if (isPinned) {
      await prisma.note.updateMany({
        where: { leadId: leadId, isPinned: true },
        data: { isPinned: false, pinnedAt: null },
      });
    }

    // Create the note
    const newNote = await prisma.note.create({
      data: {
        title: title || null,
        body: note,
        leadId: leadId,
        createdById: createdBy,
        isPinned: isPinned || false,
        pinnedAt: isPinned ? new Date() : null,
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    logger.info(`Note added to lead ${leadId}`);

    return {
      id: newNote.id,
      title: newNote.title,
      body: newNote.body,
      isPinned: newNote.isPinned || false,
      createdAt: newNote.createdAt,
      updatedAt: newNote.updatedAt,
      createdBy: newNote.createdBy,
    };
  }

  /**
   * Update an existing note
   * @param {string} leadId - Lead ID
   * @param {string} noteId - Note ID
   * @param {object} data - { title?, body?, isPinned? }
   */
  async updateLeadNote(leadId, noteId, data) {
    // Verify lead exists
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true },
    });

    if (!lead) {
      const error = new Error(`Lead not found: ${leadId}`);
      error.name = 'NotFoundError';
      throw error;
    }

    // Verify note exists and belongs to this lead
    const existingNote = await prisma.note.findFirst({
      where: { id: noteId, leadId: leadId },
    });

    if (!existingNote) {
      const error = new Error(`Note not found: ${noteId}`);
      error.name = 'NotFoundError';
      throw error;
    }

    const updateData = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.body !== undefined) updateData.body = data.body;
    if (data.isPinned !== undefined) {
      updateData.isPinned = data.isPinned;
      updateData.pinnedAt = data.isPinned ? new Date() : null;
    }

    const updatedNote = await prisma.note.update({
      where: { id: noteId },
      data: updateData,
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    logger.info(`Note ${noteId} updated for lead ${leadId}`);

    return {
      id: updatedNote.id,
      title: updatedNote.title,
      body: updatedNote.body,
      isPinned: updatedNote.isPinned || false,
      pinnedAt: updatedNote.pinnedAt,
      createdAt: updatedNote.createdAt,
      updatedAt: updatedNote.updatedAt,
      createdBy: updatedNote.createdBy,
    };
  }

  /**
   * Delete a note from a lead
   * @param {string} leadId - Lead ID
   * @param {string} noteId - Note ID
   */
  async deleteLeadNote(leadId, noteId) {
    // Verify lead exists
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true },
    });

    if (!lead) {
      const error = new Error(`Lead not found: ${leadId}`);
      error.name = 'NotFoundError';
      throw error;
    }

    // Verify note exists and belongs to this lead
    const existingNote = await prisma.note.findFirst({
      where: { id: noteId, leadId: leadId },
    });

    if (!existingNote) {
      const error = new Error(`Note not found: ${noteId}`);
      error.name = 'NotFoundError';
      throw error;
    }

    await prisma.note.delete({
      where: { id: noteId },
    });

    logger.info(`Note ${noteId} deleted from lead ${leadId}`);

    return { success: true, deletedId: noteId };
  }

  /**
   * Toggle pin status of a note (only one pinned note at a time per lead)
   * @param {string} leadId - Lead ID
   * @param {string} noteId - Note ID
   */
  async toggleLeadNotePin(leadId, noteId) {
    // Verify lead exists
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true },
    });

    if (!lead) {
      const error = new Error(`Lead not found: ${leadId}`);
      error.name = 'NotFoundError';
      throw error;
    }

    // Verify note exists and belongs to this lead
    const existingNote = await prisma.note.findFirst({
      where: { id: noteId, leadId: leadId },
    });

    if (!existingNote) {
      const error = new Error(`Note not found: ${noteId}`);
      error.name = 'NotFoundError';
      throw error;
    }

    const newPinnedState = !existingNote.isPinned;

    // If pinning, unpin any other pinned notes for this lead
    if (newPinnedState) {
      await prisma.note.updateMany({
        where: { leadId: leadId, isPinned: true },
        data: { isPinned: false, pinnedAt: null },
      });
    }

    // Update the note
    const updatedNote = await prisma.note.update({
      where: { id: noteId },
      data: {
        isPinned: newPinnedState,
        pinnedAt: newPinnedState ? new Date() : null,
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    logger.info(`Note ${noteId} pin toggled to ${newPinnedState} for lead ${leadId}`);

    return {
      id: updatedNote.id,
      title: updatedNote.title,
      body: updatedNote.body,
      isPinned: updatedNote.isPinned || false,
      pinnedAt: updatedNote.pinnedAt,
      createdAt: updatedNote.createdAt,
      updatedAt: updatedNote.updatedAt,
      createdBy: updatedNote.createdBy,
    };
  }

  // ============================================================================
  // BULK REASSIGNMENT METHODS
  // ============================================================================

  /**
   * Bulk reassign leads to a new owner
   * Used by: Call Center, Sales Managers for bulk lead management
   * @param {string[]} leadIds - Array of lead IDs to reassign
   * @param {string} newOwnerId - The user ID to assign leads to
   * @param {object} auditContext - User info for audit logging
   * @returns {object} Result with success count and any errors
   */
  async bulkReassignLeads(leadIds, newOwnerId, auditContext = {}) {
    if (!leadIds || leadIds.length === 0) {
      const error = new Error('No lead IDs provided');
      error.name = 'ValidationError';
      throw error;
    }

    if (!newOwnerId) {
      const error = new Error('New owner ID is required');
      error.name = 'ValidationError';
      throw error;
    }

    // Verify the new owner exists
    const newOwner = await prisma.user.findUnique({
      where: { id: newOwnerId },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    if (!newOwner) {
      const error = new Error(`User not found: ${newOwnerId}`);
      error.name = 'NotFoundError';
      throw error;
    }

    const results = {
      success: [],
      failed: [],
      total: leadIds.length,
    };

    // Process each lead
    for (const leadId of leadIds) {
      try {
        const lead = await prisma.lead.findUnique({
          where: { id: leadId },
          include: {
            owner: { select: { id: true, firstName: true, lastName: true } },
          },
        });

        if (!lead) {
          results.failed.push({ id: leadId, error: 'Lead not found' });
          continue;
        }

        const previousOwnerId = lead.ownerId;
        const previousOwnerName = lead.owner
          ? `${lead.owner.firstName} ${lead.owner.lastName}`
          : 'Unassigned';

        // Update the lead
        await prisma.lead.update({
          where: { id: leadId },
          data: {
            ownerId: newOwnerId,
            assignedById: auditContext.userId || null,
            assignedAt: new Date(),
          },
        });

        // Add audit note
        await prisma.note.create({
          data: {
            title: 'Lead Reassigned',
            body: `Lead reassigned from ${previousOwnerName} to ${newOwner.firstName} ${newOwner.lastName}`,
            leadId: leadId,
            createdById: auditContext.userId || null,
          },
        });

        results.success.push({
          id: leadId,
          name: `${lead.firstName} ${lead.lastName}`,
          previousOwner: previousOwnerName,
          newOwner: `${newOwner.firstName} ${newOwner.lastName}`,
        });

        logger.info(`Lead ${leadId} reassigned from ${previousOwnerId} to ${newOwnerId}`);
      } catch (error) {
        logger.error(`Failed to reassign lead ${leadId}:`, error);
        results.failed.push({ id: leadId, error: error.message });
      }
    }

    logger.info(`Bulk reassignment complete: ${results.success.length}/${results.total} succeeded`);

    return {
      success: true,
      message: `${results.success.length} of ${results.total} leads reassigned`,
      results,
      newOwner: {
        id: newOwner.id,
        name: `${newOwner.firstName} ${newOwner.lastName}`,
      },
    };
  }

  /**
   * Get available sales reps for reassignment
   * Returns users who can be assigned leads (sales reps, call center agents)
   */
  async getAssignableUsers() {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { roleType: 'SALES_REP' },
          { roleType: 'CALL_CENTER' },
          { roleType: 'SALES_MANAGER' },
          { roleType: 'OFFICE_MANAGER' },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        roleType: true,
        office: true,
        _count: {
          select: {
            leadsOwned: {
              where: { isConverted: false },
            },
          },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    return users.map(user => ({
      id: user.id,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      roleType: user.roleType,
      office: user.office,
      activeLeadCount: user._count.leadsOwned,
    }));
  }

  /**
   * Bulk update status for multiple leads
   * @param {string[]} leadIds - Array of lead IDs
   * @param {string} status - New status (NEW, CONTACTED, QUALIFIED, etc.)
   * @param {string} [disposition] - Optional disposition update
   * @param {object} auditContext - Audit trail context
   */
  async bulkUpdateStatus(leadIds, status, disposition, auditContext = {}) {
    const normalizedStatus = this.normalizeStatus(status);

    const results = {
      success: [],
      failed: [],
      total: leadIds.length,
    };

    for (const leadId of leadIds) {
      try {
        const oldLead = await prisma.lead.findUnique({
          where: { id: leadId },
          select: { status: true, disposition: true },
        });

        if (!oldLead) {
          results.failed.push({ id: leadId, error: 'Lead not found' });
          continue;
        }

        const updateData = { status: normalizedStatus };
        if (disposition) {
          updateData.disposition = disposition;
        }

        await prisma.lead.update({
          where: { id: leadId },
          data: updateData,
        });

        // Log audit
        await logAudit({
          tableName: 'leads',
          recordId: leadId,
          action: 'BULK_STATUS_UPDATE',
          oldValues: { status: oldLead.status, disposition: oldLead.disposition },
          newValues: updateData,
          userId: auditContext.userId,
          userEmail: auditContext.userEmail,
          source: 'api',
        });

        results.success.push(leadId);
      } catch (error) {
        logger.error(`Failed to update lead ${leadId}:`, error);
        results.failed.push({ id: leadId, error: error.message });
      }
    }

    logger.info(`Bulk status update complete: ${results.success.length}/${results.total} succeeded`);

    return {
      success: true,
      message: `${results.success.length} of ${results.total} leads updated`,
      results,
    };
  }

  /**
   * Bulk delete (soft delete) multiple leads
   * Sets status to UNQUALIFIED and marks as deleted
   * @param {string[]} leadIds - Array of lead IDs
   * @param {object} auditContext - Audit trail context
   */
  async bulkDeleteLeads(leadIds, auditContext = {}) {
    const results = {
      success: [],
      failed: [],
      total: leadIds.length,
    };

    for (const leadId of leadIds) {
      try {
        const oldLead = await prisma.lead.findUnique({
          where: { id: leadId },
          select: { id: true, firstName: true, lastName: true, status: true },
        });

        if (!oldLead) {
          results.failed.push({ id: leadId, error: 'Lead not found' });
          continue;
        }

        // Soft delete by setting status to UNQUALIFIED and adding deletion marker
        await prisma.lead.update({
          where: { id: leadId },
          data: {
            status: 'UNQUALIFIED',
            disposition: 'DO_NOT_CALL',
            deleted_at: new Date(),
          },
        });

        // Log audit
        await logAudit({
          tableName: 'leads',
          recordId: leadId,
          action: 'BULK_DELETE',
          oldValues: { status: oldLead.status },
          newValues: { status: 'UNQUALIFIED', disposition: 'DO_NOT_CALL', deleted_at: new Date() },
          userId: auditContext.userId,
          userEmail: auditContext.userEmail,
          source: 'api',
        });

        results.success.push(leadId);
        logger.info(`Soft deleted lead: ${oldLead.firstName} ${oldLead.lastName}`);
      } catch (error) {
        logger.error(`Failed to delete lead ${leadId}:`, error);
        results.failed.push({ id: leadId, error: error.message });
      }
    }

    logger.info(`Bulk delete complete: ${results.success.length}/${results.total} succeeded`);

    return {
      success: true,
      message: `${results.success.length} of ${results.total} leads deleted`,
      results,
    };
  }

  /**
   * Get deleted leads for admin restore page
   */
  async getDeletedLeads(options = {}) {
    const { page = 1, limit = 50, search } = options;
    const skip = (page - 1) * limit;

    const where = { deleted_at: { not: null } };

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        skip,
        take: limit,
        orderBy: { deleted_at: 'desc' },
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.lead.count({ where }),
    ]);

    return {
      data: leads,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Restore a soft-deleted lead
   */
  async restoreLead(id) {
    logger.info(`Restoring lead: ${id}`);

    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) {
      const error = new Error(`Lead not found: ${id}`);
      error.name = 'NotFoundError';
      throw error;
    }
    if (!lead.deleted_at) {
      const error = new Error('Lead is not deleted');
      error.name = 'ValidationError';
      throw error;
    }

    const restored = await prisma.lead.update({
      where: { id },
      data: {
        deleted_at: null,
        status: 'NEW', // Reset to NEW status
        disposition: null,
        updatedAt: new Date(),
      },
    });

    logger.info(`Lead restored: ${id}`);
    return restored;
  }

  // ============================================================================
  // MOBILE APP / DOOR KNOCKER METHODS
  // ============================================================================

  /**
   * PIN status mapping from mobile codes to CRM Lead status/disposition
   */
  pinStatusMapping = {
    NA: { status: 'NEW', disposition: null },           // No Answer
    NI: { status: 'UNQUALIFIED', disposition: 'NOT_INTERESTED' }, // Not Interested
    NP: { status: 'CONTACTED', disposition: 'NO_PITCH' },    // No Pitch
    GBL: { status: 'NURTURING', disposition: 'CALLBACK' },   // Go Back Later
    INFO: { status: 'CONTACTED', disposition: null },        // Info Gather
    SET: { status: 'QUALIFIED', disposition: null },         // Lead Set
    JOB: { status: 'CONVERTED', disposition: null },         // Panda Job (has Opportunity)
    PROS: { status: 'NURTURING', disposition: null },        // Prospect
  };

  /**
   * Get scoreboard stats for door knockers
   * Returns personal stats and team leaderboard
   * Supports period shortcuts (today, week, month) or explicit date range
   */
  async getScoreboard(options = {}) {
    const { userId, startDate, endDate, teamId, period } = options;

    // Calculate date range based on period or explicit dates
    const now = new Date();
    let start, end;

    if (period) {
      // Period-based filtering (mobile app style)
      switch (period) {
        case 'today':
          start = new Date(now);
          start.setHours(0, 0, 0, 0);
          end = new Date(now);
          end.setHours(23, 59, 59, 999);
          break;
        case 'week':
          start = new Date(now);
          start.setDate(start.getDate() - start.getDay()); // Start of week (Sunday)
          start.setHours(0, 0, 0, 0);
          end = new Date(now);
          end.setHours(23, 59, 59, 999);
          break;
        case 'month':
        default:
          start = new Date(now.getFullYear(), now.getMonth(), 1);
          end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          end.setHours(23, 59, 59, 999);
          break;
      }
    } else {
      // Explicit date range or default to current month
      start = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
      end = endDate ? new Date(endDate) : new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }

    // Get personal stats
    const personal = await this.getUserScoreboardStats(userId, start, end);

    // Get team leaderboard
    const teamFilter = teamId ? { user: { teamId } } : {};
    const teamStats = await prisma.lead.groupBy({
      by: ['ownerId'],
      where: {
        deleted_at: null,
        createdAt: { gte: start, lte: end },
        ...teamFilter,
      },
      _count: { id: true },
    });

    // Enrich team stats with user names and individual metrics
    const teamLeaderboard = await Promise.all(
      teamStats.map(async (stat) => {
        const user = await prisma.user.findUnique({
          where: { id: stat.ownerId },
          select: { id: true, firstName: true, lastName: true },
        });

        const userStats = await this.getUserScoreboardStats(stat.ownerId, start, end);

        return {
          userId: stat.ownerId,
          name: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
          dk: userStats.dk,
          con: userStats.con,
          set: userStats.set,
        };
      })
    );

    // Sort by leads set (descending) and assign ranks
    teamLeaderboard.sort((a, b) => b.set - a.set);
    teamLeaderboard.forEach((item, index) => {
      item.rank = index + 1;
      // Add mobile-friendly aliases
      item.pinsDropped = item.dk;
      item.isCurrentUser = item.userId === userId;
    });

    // Find current user's rank
    const currentUserRank = teamLeaderboard.find(m => m.userId === userId)?.rank || 0;

    return {
      // Original format
      personal,
      team: teamLeaderboard.slice(0, 20), // Top 20
      period: period || 'month', // Return period string for mobile app
      startDate: start,
      // Mobile-friendly format
      leaderboard: teamLeaderboard.slice(0, 10).map(m => ({
        id: m.userId,
        name: m.name,
        pinsDropped: m.dk,
        rank: m.rank,
        isCurrentUser: m.isCurrentUser,
      })),
    };
  }

  /**
   * Get detailed stats for a single user
   */
  async getUserScoreboardStats(userId, startDate, endDate) {
    const baseWhere = {
      ownerId: userId,
      deleted_at: null,
      createdAt: { gte: startDate, lte: endDate },
    };

    // Get total doors knocked (all leads created)
    const dk = await prisma.lead.count({ where: baseWhere });

    // Get conversations (leads with status != NEW or have any interaction)
    const con = await prisma.lead.count({
      where: { ...baseWhere, status: { not: 'NEW' } },
    });

    // Get counts by disposition/status for breakdown
    const ni = await prisma.lead.count({
      where: { ...baseWhere, disposition: 'NOT_INTERESTED' },
    });

    const gbl = await prisma.lead.count({
      where: { ...baseWhere, disposition: 'CALLBACK' },
    });

    const np = await prisma.lead.count({
      where: { ...baseWhere, disposition: 'NO_PITCH' },
    });

    const info = await prisma.lead.count({
      where: { ...baseWhere, status: 'CONTACTED', disposition: null },
    });

    const set = await prisma.lead.count({
      where: { ...baseWhere, status: { in: ['QUALIFIED', 'CONVERTED'] } },
    });

    // Calculate days worked in period
    const distinctDays = await prisma.lead.groupBy({
      by: ['createdAt'],
      where: baseWhere,
    });
    const uniqueDays = new Set(distinctDays.map((d) => d.createdAt.toISOString().split('T')[0]));
    const daysWorked = uniqueDays.size || 1;

    return {
      dk,
      con,
      ni,
      gbl,
      np,
      info,
      set,
      avgLeadPerDay: daysWorked > 0 ? (set / daysWorked).toFixed(2) : '0.00',
      doorsPerLead: set > 0 ? (dk / set).toFixed(1) : '0.0',
      talkToPerLead: set > 0 ? (con / set).toFixed(1) : '0.0',
    };
  }

  /**
   * Get map pins for a specific user (Door Knocker experience)
   * Supports both date range (startDate/endDate) and single date filter
   * Can filter by territory and/or geographic radius
   */
  async getMyPins(options = {}) {
    const { userId, startDate, endDate, date, territoryId, latitude, longitude, radius } = options;

    const where = {
      deleted_at: null,
    };

    // User filter - check both owner and creator
    if (userId) {
      where.OR = [
        { ownerId: userId },
        { createdById: userId },
      ];
    }

    // Date filtering - support both single date and date range
    if (date) {
      // Single date filter (for "today's pins")
      const targetDate = new Date(date);
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);
      where.createdAt = {
        gte: startOfDay,
        lte: endOfDay,
      };
    } else if (startDate || endDate) {
      // Date range filter
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    // Territory filter
    if (territoryId) {
      where.territoryId = territoryId;
    }

    // Get leads with location data
    const leads = await prisma.lead.findMany({
      where: {
        ...where,
        latitude: { not: null },
        longitude: { not: null },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        disposition: true,
        street: true,
        city: true,
        state: true,
        postalCode: true,
        latitude: true,
        longitude: true,
        createdAt: true,
        opportunityId: true,
        source: true,
        notes: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 1000, // Limit for performance
    });

    // Convert to pin format
    const pins = leads.map((lead) => ({
      id: lead.id,
      latitude: parseFloat(lead.latitude),
      longitude: parseFloat(lead.longitude),
      status: this.leadToPinStatus(lead),
      name: `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Unknown',
      address: {
        street: lead.street,
        city: lead.city,
        state: lead.state,
        postalCode: lead.postalCode,
      },
      // Also provide flat address for backward compatibility
      street: lead.street,
      city: lead.city,
      disposition: lead.disposition,
      notes: lead.notes,
      source: lead.source,
      createdAt: lead.createdAt,
    }));

    // Filter by radius if provided
    if (latitude && longitude && radius) {
      return pins.filter((pin) => {
        const distance = this.calculateDistance(
          latitude,
          longitude,
          pin.latitude,
          pin.longitude
        );
        return distance <= radius;
      });
    }

    return pins;
  }

  /**
   * Get pins for a territory
   */
  async getTerritoryPins(territoryId) {
    // Get territory boundaries
    const territory = await prisma.territory.findUnique({
      where: { id: territoryId },
      include: { boundaries: true },
    });

    if (!territory) {
      const error = new Error(`Territory not found: ${territoryId}`);
      error.name = 'NotFoundError';
      throw error;
    }

    // Get all leads in the territory (simplified - gets all leads assigned to users in territory)
    const leads = await prisma.lead.findMany({
      where: {
        deleted_at: null,
        latitude: { not: null },
        longitude: { not: null },
        // Filter by territory assignment or geographic bounds would go here
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        disposition: true,
        street: true,
        city: true,
        latitude: true,
        longitude: true,
        createdAt: true,
        opportunityId: true,
        ownerId: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });

    // Convert to pin format
    return leads.map((lead) => ({
      id: lead.id,
      latitude: parseFloat(lead.latitude),
      longitude: parseFloat(lead.longitude),
      status: this.leadToPinStatus(lead),
      name: `${lead.firstName} ${lead.lastName}`,
      address: lead.street,
      city: lead.city,
      createdAt: lead.createdAt,
      ownerId: lead.ownerId,
    }));
  }

  /**
   * Update pin status (quick status update from mobile map)
   */
  async updatePinStatus(leadId, pinStatus, auditContext = {}) {
    const mapping = this.pinStatusMapping[pinStatus];

    if (!mapping) {
      const error = new Error(`Invalid pin status: ${pinStatus}`);
      error.name = 'ValidationError';
      throw error;
    }

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) {
      const error = new Error(`Lead not found: ${leadId}`);
      error.name = 'NotFoundError';
      throw error;
    }

    const oldValues = { status: lead.status, disposition: lead.disposition };

    const updated = await prisma.lead.update({
      where: { id: leadId },
      data: {
        status: mapping.status,
        disposition: mapping.disposition,
        updatedAt: new Date(),
      },
    });

    // Audit log
    await logAudit({
      tableName: 'leads',
      recordId: leadId,
      action: 'UPDATE',
      oldValues,
      newValues: { status: mapping.status, disposition: mapping.disposition, pinStatus },
      userId: auditContext.userId,
      userEmail: auditContext.userEmail,
      source: 'mobile_app',
    });

    return {
      ...updated,
      pinStatus,
    };
  }

  /**
   * Convert lead status/disposition to pin status code
   */
  leadToPinStatus(lead) {
    // If has opportunity, it's a JOB
    if (lead.opportunityId) return 'JOB';

    // Check disposition first
    if (lead.disposition === 'NOT_INTERESTED') return 'NI';
    if (lead.disposition === 'NO_PITCH') return 'NP';
    if (lead.disposition === 'CALLBACK') return 'GBL';

    // Check status
    if (lead.status === 'NEW') return 'NA';
    if (lead.status === 'CONTACTED') return 'INFO';
    if (lead.status === 'QUALIFIED' || lead.status === 'CONVERTED') return 'SET';
    if (lead.status === 'NURTURING') return 'PROS';
    if (lead.status === 'UNQUALIFIED') return 'NI';

    return 'NA';
  }

  /**
   * Calculate distance between two coordinates (in miles)
   * Uses Haversine formula
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 3959; // Earth's radius in miles
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  toRad(deg) {
    return deg * (Math.PI / 180);
  }

  /**
   * Get scored pins for mobile app map
   * Returns leads as map pins with house scores from Census enrichment
   * @param {Object} options - Query options
   * @param {number} options.latitude - Center latitude
   * @param {number} options.longitude - Center longitude
   * @param {number} options.radius - Radius in miles (default 5)
   * @param {number} options.limit - Max pins to return (default 500)
   */
  async getScoredPins(options = {}) {
    const { latitude, longitude, radius = 5, limit = 500 } = options;

    // Build query - get leads with location data
    const leads = await prisma.lead.findMany({
      where: {
        deleted_at: null,
        latitude: { not: null },
        longitude: { not: null },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        disposition: true,
        street: true,
        city: true,
        state: true,
        postalCode: true,
        latitude: true,
        longitude: true,
        phone: true,
        notes: true,
        createdAt: true,
        opportunityId: true,
        ownerId: true,
        // Score fields from Census enrichment
        leadScore: true,
        leadRank: true,
        scoreFactors: true,
        medianHouseholdIncome: true,
        medianHomeValue: true,
        homeownershipRate: true,
        medianAge: true,
        censusTract: true,
        scoredAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit * 2, 2000), // Get extra for radius filtering
    });

    // Convert to pin format with scores
    let pins = leads.map((lead) => {
      // Calculate house score rank based on existing score or Census data
      let houseScore = lead.leadScore;
      let houseScoreRank = lead.leadRank;

      // If no score exists, calculate a basic one from Census data
      if (!houseScore && (lead.medianHouseholdIncome || lead.medianHomeValue)) {
        houseScore = this.calculateQuickScore(lead);
        houseScoreRank = this.scoreToRank(houseScore);
      }

      return {
        id: lead.id,
        leadId: lead.id,
        latitude: parseFloat(lead.latitude),
        longitude: parseFloat(lead.longitude),
        status: this.leadToPinStatus(lead),
        address: lead.street || '',
        customerName: lead.firstName && lead.lastName
          ? `${lead.firstName} ${lead.lastName}`
          : lead.firstName || 'Unknown',
        notes: lead.notes,
        createdAt: lead.createdAt,
        createdById: lead.ownerId,
        // House Score data (SalesRabbit DataGrid AI style)
        houseScore: houseScore || null,
        houseScoreRank: houseScoreRank || null,
        scoreFactors: lead.scoreFactors ? (
          typeof lead.scoreFactors === 'string'
            ? JSON.parse(lead.scoreFactors)
            : lead.scoreFactors
        ) : {
          // Populate from Census fields if scoreFactors not available
          medianIncome: lead.medianHouseholdIncome,
          medianHomeValue: lead.medianHomeValue,
          homeownershipRate: lead.homeownershipRate
            ? Math.round(lead.homeownershipRate * 100)
            : null,
          medianAge: lead.medianAge,
        },
      };
    });

    // Filter by radius if center coordinates provided
    if (latitude && longitude) {
      pins = pins.filter((pin) => {
        const distance = this.calculateDistance(
          latitude,
          longitude,
          pin.latitude,
          pin.longitude
        );
        return distance <= radius;
      });
    }

    // Limit results
    pins = pins.slice(0, limit);

    return {
      pins,
      total: pins.length,
      center: latitude && longitude ? { latitude, longitude } : null,
      radius,
    };
  }

  /**
   * Quick score calculation from Census data (without full scoring)
   * Used when lead hasn't been fully scored yet
   */
  calculateQuickScore(lead) {
    let score = 50; // Base score

    // Income scoring
    if (lead.medianHouseholdIncome) {
      if (lead.medianHouseholdIncome >= 150000) score += 15;
      else if (lead.medianHouseholdIncome >= 100000) score += 12;
      else if (lead.medianHouseholdIncome >= 75000) score += 8;
      else if (lead.medianHouseholdIncome >= 50000) score += 4;
    }

    // Home value scoring
    if (lead.medianHomeValue) {
      if (lead.medianHomeValue >= 500000) score += 15;
      else if (lead.medianHomeValue >= 350000) score += 12;
      else if (lead.medianHomeValue >= 250000) score += 8;
      else if (lead.medianHomeValue >= 150000) score += 4;
    }

    // Homeownership rate scoring
    if (lead.homeownershipRate) {
      const rate = lead.homeownershipRate > 1
        ? lead.homeownershipRate
        : lead.homeownershipRate * 100;
      if (rate >= 80) score += 10;
      else if (rate >= 65) score += 7;
      else if (rate >= 50) score += 4;
    }

    return Math.min(100, Math.round(score));
  }

  /**
   * Convert numeric score to letter rank (A/B/C/D)
   */
  scoreToRank(score) {
    if (score >= 80) return 'A';
    if (score >= 60) return 'B';
    if (score >= 40) return 'C';
    return 'D';
  }

  // ============================================================================
  // MOBILE APP - QUICK PIN CREATION
  // ============================================================================

  /**
   * Quick create a lead pin from mobile app
   */
  async createQuickPin(data) {
    const { createdById, ownerId, latitude, longitude, street, city, state, postalCode, status, notes } = data;

    // Generate a placeholder name from address
    const addressName = street ? street.split(' ').slice(0, 3).join(' ') : 'New Pin';

    const lead = await prisma.lead.create({
      data: {
        firstName: addressName,
        lastName: '',
        street,
        city,
        state,
        postalCode,
        latitude,
        longitude,
        status: status || 'NEW',
        source: 'MOBILE_APP',
        notes,
        createdById,
        ownerId,
      },
    });

    return {
      id: lead.id,
      name: addressName,
      address: { street, city, state, postalCode },
      location: { latitude, longitude },
      status: lead.status,
      createdAt: lead.createdAt,
    };
  }
}

export const leadService = new LeadService();
export default leadService;
