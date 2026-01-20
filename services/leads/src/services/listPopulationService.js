// List Population Service - Auto-routes leads to appropriate call lists
// Based on Panda Call Center Process flow diagram
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * List Population Service
 *
 * Routes leads and opportunities to appropriate call lists based on:
 * - Lead status and disposition
 * - Lead age (created date)
 * - Call attempt count
 * - Cooldown periods
 * - Callback schedules
 *
 * List Flow (from Panda Call Center Process):
 *
 * New Leads → Hot Leads (< 4 hours old)
 *          → Lead Reset (4 hours - 7 days old)
 *          → Cold Leads (> 7 days old)
 *
 * Appointments:
 *   Scheduled → Confirmation list
 *   Cancelled → Reset list
 *   Inspected but not sold → Rehash list
 *
 * Dispositions:
 *   CALLBACK_REQUESTED → Scheduled Callbacks list
 *   NOT_INTERESTED → Cool Down list (90 day cooldown)
 *   DNC → Remove from all lists
 */
class ListPopulationService {

  /**
   * Get all call lists indexed by name for quick lookup
   */
  async getCallListsByName() {
    const lists = await prisma.callList.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    return lists.reduce((acc, list) => {
      acc[list.name] = list.id;
      return acc;
    }, {});
  }

  /**
   * Main population job - runs periodically to route leads to lists
   * @param {Object} options - { dryRun: boolean, limit: number }
   */
  async populateLists(options = {}) {
    const { dryRun = false, limit = 1000 } = options;
    const listsByName = await this.getCallListsByName();

    const results = {
      hotLeads: await this.populateHotLeads(listsByName, { dryRun, limit }),
      leadReset: await this.populateLeadReset(listsByName, { dryRun, limit }),
      coldLeads: await this.populateColdLeads(listsByName, { dryRun, limit }),
      callbacks: await this.populateCallbacks(listsByName, { dryRun, limit }),
      coolDown: await this.populateCoolDown(listsByName, { dryRun, limit }),
    };

    console.log('List population completed:', results);
    return results;
  }

  /**
   * Hot Leads - New leads less than 4 hours old
   * Preview dialer, 3hr cadence, 6 max attempts
   */
  async populateHotLeads(listsByName, options = {}) {
    const { dryRun = false, limit = 1000 } = options;
    const listId = listsByName['Hot Leads'];
    if (!listId) return { error: 'Hot Leads list not found' };

    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);

    // Find new leads less than 4 hours old
    const leads = await prisma.lead.findMany({
      where: {
        status: { in: ['NEW', 'CONTACTED'] },
        createdAt: { gte: fourHoursAgo },
        isConverted: false,
        deletedAt: null,
        // Not already in a list or past cooldown
        OR: [
          { currentListId: null },
          { cooldownUntil: { lt: new Date() } },
        ],
        // Has a phone number
        OR: [
          { phone: { not: null } },
          { mobilePhone: { not: null } },
        ],
      },
      take: limit,
      select: { id: true, firstName: true, lastName: true, phone: true, mobilePhone: true, state: true, status: true },
    });

    if (dryRun) {
      return { listId, listName: 'Hot Leads', wouldAdd: leads.length, leads: leads.map(l => l.id) };
    }

    // Add leads to the list
    let added = 0;
    for (const lead of leads) {
      try {
        // Check if already in list
        const existing = await prisma.callListItem.findFirst({
          where: { callListId: listId, leadId: lead.id, status: { not: 'REMOVED' } },
        });

        if (!existing) {
          const phone = lead.mobilePhone || lead.phone;
          await prisma.callListItem.create({
            data: {
              callListId: listId,
              leadId: lead.id,
              phoneNumber: phone?.replace(/\D/g, '') || '',
              formattedPhone: phone,
              displayName: `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Unknown',
              displayAddress: lead.state || '',
              displayStatus: lead.status,
              addedReason: 'auto_hot_lead',
              priority: 100,
            },
          });

          // Update lead's current list
          await prisma.lead.update({
            where: { id: lead.id },
            data: { currentListId: listId },
          });

          added++;
        }
      } catch (error) {
        console.error(`Error adding lead ${lead.id} to Hot Leads:`, error.message);
      }
    }

    return { listId, listName: 'Hot Leads', added, total: leads.length };
  }

  /**
   * Lead Reset - Leads 4 hours to 7 days old
   * Progressive dialer, 3hr cadence
   */
  async populateLeadReset(listsByName, options = {}) {
    const { dryRun = false, limit = 1000 } = options;
    const listId = listsByName['Lead Reset'];
    if (!listId) return { error: 'Lead Reset list not found' };

    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const leads = await prisma.lead.findMany({
      where: {
        status: { in: ['NEW', 'CONTACTED', 'NURTURING'] },
        createdAt: {
          gte: sevenDaysAgo,
          lt: fourHoursAgo,
        },
        isConverted: false,
        deletedAt: null,
        // Not in Hot Leads
        currentListId: { not: listsByName['Hot Leads'] },
        // Past cooldown
        OR: [
          { cooldownUntil: null },
          { cooldownUntil: { lt: new Date() } },
        ],
        // Has a phone
        OR: [
          { phone: { not: null } },
          { mobilePhone: { not: null } },
        ],
      },
      take: limit,
      select: { id: true, firstName: true, lastName: true, phone: true, mobilePhone: true, state: true, status: true },
    });

    if (dryRun) {
      return { listId, listName: 'Lead Reset', wouldAdd: leads.length };
    }

    let added = 0;
    for (const lead of leads) {
      try {
        const existing = await prisma.callListItem.findFirst({
          where: { callListId: listId, leadId: lead.id, status: { not: 'REMOVED' } },
        });

        if (!existing) {
          const phone = lead.mobilePhone || lead.phone;
          await prisma.callListItem.create({
            data: {
              callListId: listId,
              leadId: lead.id,
              phoneNumber: phone?.replace(/\D/g, '') || '',
              formattedPhone: phone,
              displayName: `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Unknown',
              displayAddress: lead.state || '',
              displayStatus: lead.status,
              addedReason: 'auto_lead_reset',
              priority: 75,
            },
          });

          await prisma.lead.update({
            where: { id: lead.id },
            data: { currentListId: listId },
          });

          added++;
        }
      } catch (error) {
        console.error(`Error adding lead ${lead.id} to Lead Reset:`, error.message);
      }
    }

    return { listId, listName: 'Lead Reset', added, total: leads.length };
  }

  /**
   * Cold Leads - Leads older than 7 days
   * Progressive dialer, 24hr cadence
   */
  async populateColdLeads(listsByName, options = {}) {
    const { dryRun = false, limit = 1000 } = options;
    const listId = listsByName['Cold Leads'];
    if (!listId) return { error: 'Cold Leads list not found' };

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const leads = await prisma.lead.findMany({
      where: {
        status: { in: ['NEW', 'CONTACTED', 'NURTURING'] },
        createdAt: { lt: sevenDaysAgo },
        isConverted: false,
        deletedAt: null,
        // Not in hot or reset lists
        currentListId: {
          notIn: [listsByName['Hot Leads'], listsByName['Lead Reset']].filter(Boolean),
        },
        // Past cooldown
        OR: [
          { cooldownUntil: null },
          { cooldownUntil: { lt: new Date() } },
        ],
        // Has a phone
        OR: [
          { phone: { not: null } },
          { mobilePhone: { not: null } },
        ],
      },
      take: limit,
      select: { id: true, firstName: true, lastName: true, phone: true, mobilePhone: true, state: true, status: true },
    });

    if (dryRun) {
      return { listId, listName: 'Cold Leads', wouldAdd: leads.length };
    }

    let added = 0;
    for (const lead of leads) {
      try {
        const existing = await prisma.callListItem.findFirst({
          where: { callListId: listId, leadId: lead.id, status: { not: 'REMOVED' } },
        });

        if (!existing) {
          const phone = lead.mobilePhone || lead.phone;
          await prisma.callListItem.create({
            data: {
              callListId: listId,
              leadId: lead.id,
              phoneNumber: phone?.replace(/\D/g, '') || '',
              formattedPhone: phone,
              displayName: `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Unknown',
              displayAddress: lead.state || '',
              displayStatus: lead.status,
              addedReason: 'auto_cold_lead',
              priority: 50,
            },
          });

          await prisma.lead.update({
            where: { id: lead.id },
            data: { currentListId: listId },
          });

          added++;
        }
      } catch (error) {
        console.error(`Error adding lead ${lead.id} to Cold Leads:`, error.message);
      }
    }

    return { listId, listName: 'Cold Leads', added, total: leads.length };
  }

  /**
   * Scheduled Callbacks - Leads with callback times
   */
  async populateCallbacks(listsByName, options = {}) {
    const { dryRun = false, limit = 1000 } = options;
    const listId = listsByName['Scheduled Callbacks'];
    if (!listId) return { error: 'Scheduled Callbacks list not found' };

    const leads = await prisma.lead.findMany({
      where: {
        callbackScheduledAt: { not: null },
        isConverted: false,
        deletedAt: null,
        disposition: { in: ['CALLBACK_REQUESTED', 'FOLLOW_UP_SPECIFIC_DATE', 'CALL_BACK_LATER'] },
      },
      take: limit,
      select: { id: true, firstName: true, lastName: true, phone: true, mobilePhone: true, state: true, status: true, callbackScheduledAt: true },
    });

    if (dryRun) {
      return { listId, listName: 'Scheduled Callbacks', wouldAdd: leads.length };
    }

    let added = 0;
    for (const lead of leads) {
      try {
        const existing = await prisma.callListItem.findFirst({
          where: { callListId: listId, leadId: lead.id, status: { not: 'REMOVED' } },
        });

        if (!existing) {
          const phone = lead.mobilePhone || lead.phone;
          await prisma.callListItem.create({
            data: {
              callListId: listId,
              leadId: lead.id,
              phoneNumber: phone?.replace(/\D/g, '') || '',
              formattedPhone: phone,
              displayName: `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Unknown',
              displayAddress: lead.state || '',
              displayStatus: lead.status,
              addedReason: 'callback_scheduled',
              priority: 99,
              scheduledFor: lead.callbackScheduledAt,
            },
          });

          await prisma.lead.update({
            where: { id: lead.id },
            data: { currentListId: listId },
          });

          added++;
        }
      } catch (error) {
        console.error(`Error adding lead ${lead.id} to Scheduled Callbacks:`, error.message);
      }
    }

    return { listId, listName: 'Scheduled Callbacks', added, total: leads.length };
  }

  /**
   * Cool Down - Not interested leads with cooldown period
   */
  async populateCoolDown(listsByName, options = {}) {
    const { dryRun = false, limit = 1000 } = options;
    const listId = listsByName['Cool Down'];
    if (!listId) return { error: 'Cool Down list not found' };

    const leads = await prisma.lead.findMany({
      where: {
        disposition: { in: ['NOT_INTERESTED', 'CALL_BACK_LATER'] },
        status: 'NURTURING',
        isConverted: false,
        deletedAt: null,
        // Has cooldown set
        cooldownUntil: { not: null },
      },
      take: limit,
      select: { id: true, firstName: true, lastName: true, phone: true, mobilePhone: true, state: true, status: true },
    });

    if (dryRun) {
      return { listId, listName: 'Cool Down', wouldAdd: leads.length };
    }

    let added = 0;
    for (const lead of leads) {
      try {
        const existing = await prisma.callListItem.findFirst({
          where: { callListId: listId, leadId: lead.id, status: { not: 'REMOVED' } },
        });

        if (!existing) {
          const phone = lead.mobilePhone || lead.phone;
          await prisma.callListItem.create({
            data: {
              callListId: listId,
              leadId: lead.id,
              phoneNumber: phone?.replace(/\D/g, '') || '',
              formattedPhone: phone,
              displayName: `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Unknown',
              displayAddress: lead.state || '',
              displayStatus: lead.status,
              addedReason: 'cooldown_disposition',
              priority: 30,
            },
          });

          await prisma.lead.update({
            where: { id: lead.id },
            data: { currentListId: listId },
          });

          added++;
        }
      } catch (error) {
        console.error(`Error adding lead ${lead.id} to Cool Down:`, error.message);
      }
    }

    return { listId, listName: 'Cool Down', added, total: leads.length };
  }

  /**
   * Handle disposition - routes lead to appropriate list based on disposition code
   * Called after an agent applies a disposition to a call
   *
   * @param {string} leadId - Lead ID
   * @param {string} dispositionCode - Disposition code (e.g., 'NOT_INTERESTED', 'CALLBACK_REQUESTED')
   * @param {Object} options - { callbackAt, notes }
   */
  async handleDisposition(leadId, dispositionCode, options = {}) {
    const { callbackAt, notes } = options;

    // Get disposition settings
    const disposition = await prisma.callListDisposition.findFirst({
      where: { code: dispositionCode, callListId: null, isActive: true },
    });

    if (!disposition) {
      throw new Error(`Disposition ${dispositionCode} not found`);
    }

    const listsByName = await this.getCallListsByName();
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new Error('Lead not found');

    const updates = {
      disposition: dispositionCode,
      lastCallAt: new Date(),
      lastCallResult: dispositionCode,
      callAttempts: lead.callAttempts + 1,
    };

    // Handle disposition actions
    if (disposition.removeFromList) {
      // Remove from current list
      if (lead.currentListId) {
        await prisma.callListItem.updateMany({
          where: { leadId, callListId: lead.currentListId },
          data: { status: 'REMOVED' },
        });
      }
      updates.currentListId = null;
    }

    if (disposition.scheduleCallback && callbackAt) {
      updates.callbackScheduledAt = new Date(callbackAt);
      // Will be picked up by populateCallbacks job
    }

    if (disposition.cooldownDays) {
      updates.cooldownUntil = new Date(Date.now() + disposition.cooldownDays * 24 * 60 * 60 * 1000);
    }

    if (disposition.updateLeadStatus) {
      updates.status = disposition.updateLeadStatus;
    }

    if (disposition.addToDNC) {
      // Mark as DNC - no further calls
      updates.status = 'UNQUALIFIED';
      updates.cooldownUntil = new Date('2099-12-31'); // Effectively permanent
    }

    // Update the lead
    await prisma.lead.update({
      where: { id: leadId },
      data: updates,
    });

    // Move to specific list if configured
    if (disposition.moveToListName && listsByName[disposition.moveToListName]) {
      const targetListId = listsByName[disposition.moveToListName];
      const phone = lead.mobilePhone || lead.phone;

      await prisma.callListItem.create({
        data: {
          callListId: targetListId,
          leadId,
          phoneNumber: phone?.replace(/\D/g, '') || '',
          formattedPhone: phone,
          displayName: `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Unknown',
          displayAddress: lead.state || '',
          displayStatus: updates.status || lead.status,
          addedReason: `disposition_${dispositionCode}`,
          priority: 50,
        },
      });

      await prisma.lead.update({
        where: { id: leadId },
        data: { currentListId: targetListId },
      });
    }

    return { success: true, dispositionCode, actions: disposition };
  }

  /**
   * Populate Confirmation list - Opportunities with scheduled appointments
   */
  async populateConfirmation(listsByName, options = {}) {
    const { dryRun = false, limit = 1000 } = options;
    const listId = listsByName['Confirmation'];
    if (!listId) return { error: 'Confirmation list not found' };

    const opportunities = await prisma.opportunity.findMany({
      where: {
        stage: 'SCHEDULED',
        status: { notIn: ['CONFIRMED', 'COMPLETED', 'CANCELLED'] },
        isClosed: false,
      },
      include: {
        account: { select: { phone: true, billingCity: true, billingState: true } },
        contact: { select: { phone: true, mobilePhone: true } },
      },
      take: limit,
    });

    if (dryRun) {
      return { listId, listName: 'Confirmation', wouldAdd: opportunities.length };
    }

    let added = 0;
    for (const opp of opportunities) {
      try {
        const existing = await prisma.callListItem.findFirst({
          where: { callListId: listId, opportunityId: opp.id, status: { not: 'REMOVED' } },
        });

        if (!existing) {
          const phone = opp.contact?.mobilePhone || opp.contact?.phone || opp.account?.phone;
          if (phone) {
            await prisma.callListItem.create({
              data: {
                callListId: listId,
                opportunityId: opp.id,
                accountId: opp.accountId,
                phoneNumber: phone.replace(/\D/g, ''),
                formattedPhone: phone,
                displayName: opp.name,
                displayAddress: opp.account ?
                  `${opp.account.billingCity || ''}, ${opp.account.billingState || ''}`.trim() : '',
                displayStatus: opp.stage,
                addedReason: 'auto_confirmation',
                priority: 95,
              },
            });
            added++;
          }
        }
      } catch (error) {
        console.error(`Error adding opportunity ${opp.id} to Confirmation:`, error.message);
      }
    }

    return { listId, listName: 'Confirmation', added, total: opportunities.length };
  }

  /**
   * Populate Rehash list - Opportunities that were inspected but not sold
   */
  async populateRehash(listsByName, options = {}) {
    const { dryRun = false, limit = 1000 } = options;
    const listId = listsByName['Rehash'];
    if (!listId) return { error: 'Rehash list not found' };

    const opportunities = await prisma.opportunity.findMany({
      where: {
        stage: 'INSPECTED',
        isClosed: false,
        isWon: false,
      },
      include: {
        account: { select: { phone: true, billingCity: true, billingState: true } },
        contact: { select: { phone: true, mobilePhone: true } },
      },
      take: limit,
    });

    if (dryRun) {
      return { listId, listName: 'Rehash', wouldAdd: opportunities.length };
    }

    let added = 0;
    for (const opp of opportunities) {
      try {
        const existing = await prisma.callListItem.findFirst({
          where: { callListId: listId, opportunityId: opp.id, status: { not: 'REMOVED' } },
        });

        if (!existing) {
          const phone = opp.contact?.mobilePhone || opp.contact?.phone || opp.account?.phone;
          if (phone) {
            await prisma.callListItem.create({
              data: {
                callListId: listId,
                opportunityId: opp.id,
                accountId: opp.accountId,
                phoneNumber: phone.replace(/\D/g, ''),
                formattedPhone: phone,
                displayName: opp.name,
                displayAddress: opp.account ?
                  `${opp.account.billingCity || ''}, ${opp.account.billingState || ''}`.trim() : '',
                displayStatus: opp.stage,
                addedReason: 'auto_rehash',
                priority: 80,
              },
            });
            added++;
          }
        }
      } catch (error) {
        console.error(`Error adding opportunity ${opp.id} to Rehash:`, error.message);
      }
    }

    return { listId, listName: 'Rehash', added, total: opportunities.length };
  }

  /**
   * Populate Reset list - Cancelled/No-show appointments
   */
  async populateReset(listsByName, options = {}) {
    const { dryRun = false, limit = 1000 } = options;
    const listId = listsByName['Reset'];
    if (!listId) return { error: 'Reset list not found' };

    const opportunities = await prisma.opportunity.findMany({
      where: {
        stage: { in: ['SCHEDULED', 'LEAD_ASSIGNED'] },
        status: { in: ['CANCELLED', 'NO_SHOW', 'RESCHEDULE', 'UNCONFIRMED'] },
        isClosed: false,
      },
      include: {
        account: { select: { phone: true, billingCity: true, billingState: true } },
        contact: { select: { phone: true, mobilePhone: true } },
      },
      take: limit,
    });

    if (dryRun) {
      return { listId, listName: 'Reset', wouldAdd: opportunities.length };
    }

    let added = 0;
    for (const opp of opportunities) {
      try {
        const existing = await prisma.callListItem.findFirst({
          where: { callListId: listId, opportunityId: opp.id, status: { not: 'REMOVED' } },
        });

        if (!existing) {
          const phone = opp.contact?.mobilePhone || opp.contact?.phone || opp.account?.phone;
          if (phone) {
            await prisma.callListItem.create({
              data: {
                callListId: listId,
                opportunityId: opp.id,
                accountId: opp.accountId,
                phoneNumber: phone.replace(/\D/g, ''),
                formattedPhone: phone,
                displayName: opp.name,
                displayAddress: opp.account ?
                  `${opp.account.billingCity || ''}, ${opp.account.billingState || ''}`.trim() : '',
                displayStatus: `${opp.stage} - ${opp.status}`,
                addedReason: 'auto_reset',
                priority: 90,
              },
            });
            added++;
          }
        }
      } catch (error) {
        console.error(`Error adding opportunity ${opp.id} to Reset:`, error.message);
      }
    }

    return { listId, listName: 'Reset', added, total: opportunities.length };
  }

  /**
   * Full population run - all lists
   */
  async runFullPopulation(options = {}) {
    const listsByName = await this.getCallListsByName();

    const results = {
      // Lead lists
      hotLeads: await this.populateHotLeads(listsByName, options),
      leadReset: await this.populateLeadReset(listsByName, options),
      coldLeads: await this.populateColdLeads(listsByName, options),
      callbacks: await this.populateCallbacks(listsByName, options),
      coolDown: await this.populateCoolDown(listsByName, options),
      // Opportunity lists
      confirmation: await this.populateConfirmation(listsByName, options),
      rehash: await this.populateRehash(listsByName, options),
      reset: await this.populateReset(listsByName, options),
    };

    return results;
  }
}

export const listPopulationService = new ListPopulationService();
export default listPopulationService;
