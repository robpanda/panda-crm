// Lead Service - Business Logic Layer
// Replicates SalesLeaderLeadListController.cls and LeadWizard functionality
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const prisma = new PrismaClient();
const lambdaClient = new LambdaClient({ region: 'us-east-2' });

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
      ownerFilter, // 'mine' or 'all'
      source,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      currentUserId,
    } = options;

    const skip = (page - 1) * limit;

    // Build where clause
    const where = { isConverted: false };

    if (status && status !== 'all') {
      where.status = status;
    }

    if (ownerFilter === 'mine' && currentUserId) {
      where.ownerId = currentUserId;
    } else if (ownerId) {
      where.ownerId = ownerId;
    }

    if (source && source !== 'all') {
      where.source = source;
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

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
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
   * Replicates: getLeadCounts()
   */
  async getLeadCounts(currentUserId) {
    const counts = {};

    // Total unconverted leads
    counts.total = await prisma.lead.count({
      where: { isConverted: false },
    });

    // My leads
    if (currentUserId) {
      counts.mine = await prisma.lead.count({
        where: { isConverted: false, ownerId: currentUserId },
      });
    }

    // By status
    const statusCounts = await prisma.lead.groupBy({
      by: ['status'],
      where: { isConverted: false },
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

    // Push to Salesforce if sync is enabled and lead doesn't already have a Salesforce ID
    if (SALESFORCE_SYNC_ENABLED && !lead.salesforceId) {
      this.pushToSalesforce(lead.id).catch(err => {
        logger.error(`Failed to push lead ${lead.id} to Salesforce: ${err.message}`);
      });
    }

    return this.createLeadWrapper(lead);
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
        opportunity = await tx.opportunity.create({
          data: {
            name: options.opportunityName || `${lead.firstName} ${lead.lastName} - ${new Date().toLocaleDateString()}`,
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
      description: lead.description,
      salesRabbitUser: lead.salesRabbitUser,
      // Call Center - Tentative Appointment fields
      tentativeAppointmentDate: lead.tentativeAppointmentDate,
      tentativeAppointmentTime: lead.tentativeAppointmentTime,
      disposition: lead.disposition,
      leadSetById: lead.leadSetById,
      leadSetByName: lead.leadSetBy ? `${lead.leadSetBy.firstName} ${lead.leadSetBy.lastName}` : null,
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
    const { note, title, createdBy } = data;

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

    // Create the note
    const newNote = await prisma.note.create({
      data: {
        title: title || 'Call Center Note',
        body: note,
        leadId: leadId,
        createdById: createdBy,
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    logger.info(`Note added to lead ${leadId}`);

    return {
      success: true,
      note: {
        id: newNote.id,
        title: newNote.title,
        body: newNote.body,
        createdAt: newNote.createdAt,
        createdBy: newNote.createdBy
          ? `${newNote.createdBy.firstName} ${newNote.createdBy.lastName}`
          : 'System',
      },
      lead: {
        id: lead.id,
        name: `${lead.firstName} ${lead.lastName}`,
      },
    };
  }
}

export const leadService = new LeadService();
export default leadService;
