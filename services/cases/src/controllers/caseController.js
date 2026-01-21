import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Workflows service URL for trigger execution
const WORKFLOWS_SERVICE_URL = process.env.WORKFLOWS_SERVICE_URL || 'http://workflows-service:3009';

// Helper: Trigger HOA case closed workflow
async function triggerHoaCaseClosedWorkflow(caseId, userId) {
  try {
    // Check if this case is HOA-related before calling workflow service
    const caseRecord = await prisma.case.findUnique({
      where: { id: caseId },
      select: {
        type: true,
        subject: true,
        description: true,
      },
    });

    if (!caseRecord) return;

    // Check if HOA-related
    const isHoaCase =
      caseRecord.type?.toLowerCase().includes('hoa') ||
      caseRecord.subject?.toLowerCase().includes('hoa') ||
      caseRecord.description?.toLowerCase().includes('hoa approval');

    if (!isHoaCase) {
      console.log(`[Case Controller] Case ${caseId} is not HOA-related, skipping workflow trigger`);
      return;
    }

    console.log(`[Case Controller] Triggering HOA case closed workflow for case ${caseId}`);

    const response = await fetch(`${WORKFLOWS_SERVICE_URL}/api/triggers/hoa-case-closed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId, userId }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Workflow service error: ${errorText}`);
    }

    const result = await response.json();
    console.log(`[Case Controller] HOA case closed workflow result:`, result);
    return result;
  } catch (error) {
    console.error(`[Case Controller] Error triggering HOA workflow:`, error);
    throw error;
  }
}

// List all cases with filtering and pagination
export async function listCases(req, res) {
  try {
    const {
      status,
      priority,
      accountId,
      type,
      search,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const where = {};

    if (status) {
      where.status = status;
    }

    if (priority) {
      where.priority = priority;
    }

    if (accountId) {
      where.accountId = accountId;
    }

    if (type) {
      where.type = type;
    }

    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { caseNumber: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [cases, total] = await Promise.all([
      prisma.case.findMany({
        where,
        include: {
          account: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.case.count({ where }),
    ]);

    res.json({
      cases,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Error listing cases:', error);
    res.status(500).json({ error: 'Failed to list cases' });
  }
}

// Get a single case by ID
export async function getCase(req, res) {
  try {
    const { id } = req.params;

    const caseRecord = await prisma.case.findUnique({
      where: { id },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            opportunities: {
              select: {
                id: true,
                name: true,
                stageName: true,
              },
              take: 5,
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    });

    if (!caseRecord) {
      return res.status(404).json({ error: 'Case not found' });
    }

    res.json(caseRecord);
  } catch (error) {
    console.error('Error getting case:', error);
    res.status(500).json({ error: 'Failed to get case' });
  }
}

// Create a new case
export async function createCase(req, res) {
  try {
    const { subject, description, accountId, priority, type, opportunityId } = req.body;

    if (!subject) {
      return res.status(400).json({ error: 'Subject is required' });
    }

    // Generate case number
    const lastCase = await prisma.case.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { caseNumber: true },
    });

    let nextNumber = 1;
    if (lastCase?.caseNumber) {
      const match = lastCase.caseNumber.match(/CASE-(\d+)/);
      if (match) {
        nextNumber = parseInt(match[1]) + 1;
      }
    }
    const caseNumber = `CASE-${String(nextNumber).padStart(6, '0')}`;

    // If opportunityId is provided, get the account from the opportunity
    let resolvedAccountId = accountId;
    if (opportunityId && !accountId) {
      const opportunity = await prisma.opportunity.findUnique({
        where: { id: opportunityId },
        select: { accountId: true },
      });
      if (opportunity) {
        resolvedAccountId = opportunity.accountId;
      }
    }

    const newCase = await prisma.case.create({
      data: {
        caseNumber,
        subject,
        description,
        accountId: resolvedAccountId,
        priority: priority || 'NORMAL',
        type,
        status: 'NEW',
      },
      include: {
        account: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    res.status(201).json(newCase);
  } catch (error) {
    console.error('Error creating case:', error);
    res.status(500).json({ error: 'Failed to create case' });
  }
}

// Update a case
export async function updateCase(req, res) {
  try {
    const { id } = req.params;
    const { subject, description, status, priority, type } = req.body;

    const updateData = {};
    if (subject !== undefined) updateData.subject = subject;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;
    if (priority !== undefined) updateData.priority = priority;
    if (type !== undefined) updateData.type = type;

    // Set closedAt when status changes to CLOSED
    if (status === 'CLOSED') {
      updateData.closedAt = new Date();
    } else if (status && status !== 'CLOSED') {
      updateData.closedAt = null;
    }

    const updatedCase = await prisma.case.update({
      where: { id },
      data: updateData,
      include: {
        account: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Trigger HOA case closed workflow if status changed to CLOSED (async, don't wait)
    if (status === 'CLOSED') {
      triggerHoaCaseClosedWorkflow(id, req.user?.id).catch(err => {
        console.error('Failed to trigger HOA case closed workflow:', err);
      });
    }

    res.json(updatedCase);
  } catch (error) {
    console.error('Error updating case:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Case not found' });
    }
    res.status(500).json({ error: 'Failed to update case' });
  }
}

// Delete a case
export async function deleteCase(req, res) {
  try {
    const { id } = req.params;

    await prisma.case.delete({
      where: { id },
    });

    res.json({ success: true, message: 'Case deleted' });
  } catch (error) {
    console.error('Error deleting case:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Case not found' });
    }
    res.status(500).json({ error: 'Failed to delete case' });
  }
}

// Get cases by account
export async function getCasesByAccount(req, res) {
  try {
    const { accountId } = req.params;
    const { status, limit = 20 } = req.query;

    const where = { accountId };
    if (status) {
      where.status = status;
    }

    const cases = await prisma.case.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
    });

    res.json(cases);
  } catch (error) {
    console.error('Error getting cases by account:', error);
    res.status(500).json({ error: 'Failed to get cases' });
  }
}

// Get cases by opportunity (via account)
export async function getCasesByOpportunity(req, res) {
  try {
    const { opportunityId } = req.params;
    const { status, limit = 20 } = req.query;

    // First get the opportunity to find its account
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      select: { accountId: true },
    });

    if (!opportunity || !opportunity.accountId) {
      return res.json([]);
    }

    const where = { accountId: opportunity.accountId };
    if (status) {
      where.status = status;
    }

    const cases = await prisma.case.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
    });

    res.json(cases);
  } catch (error) {
    console.error('Error getting cases by opportunity:', error);
    res.status(500).json({ error: 'Failed to get cases' });
  }
}

// Get case statistics
export async function getCaseStats(req, res) {
  try {
    const { accountId, opportunityId } = req.query;

    let where = {};

    if (accountId) {
      where.accountId = accountId;
    } else if (opportunityId) {
      const opportunity = await prisma.opportunity.findUnique({
        where: { id: opportunityId },
        select: { accountId: true },
      });
      if (opportunity?.accountId) {
        where.accountId = opportunity.accountId;
      }
    }

    const [total, newCases, working, escalated, closed] = await Promise.all([
      prisma.case.count({ where }),
      prisma.case.count({ where: { ...where, status: 'NEW' } }),
      prisma.case.count({ where: { ...where, status: 'WORKING' } }),
      prisma.case.count({ where: { ...where, status: 'ESCALATED' } }),
      prisma.case.count({ where: { ...where, status: 'CLOSED' } }),
    ]);

    res.json({
      total,
      byStatus: {
        new: newCases,
        working,
        escalated,
        closed,
      },
      openCases: total - closed,
    });
  } catch (error) {
    console.error('Error getting case stats:', error);
    res.status(500).json({ error: 'Failed to get case statistics' });
  }
}

// Escalate a case
export async function escalateCase(req, res) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const updatedCase = await prisma.case.update({
      where: { id },
      data: {
        status: 'ESCALATED',
        priority: 'HIGH',
      },
    });

    res.json(updatedCase);
  } catch (error) {
    console.error('Error escalating case:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Case not found' });
    }
    res.status(500).json({ error: 'Failed to escalate case' });
  }
}

// Close a case
export async function closeCase(req, res) {
  try {
    const { id } = req.params;
    const { resolution } = req.body;

    const updatedCase = await prisma.case.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
      },
    });

    // Trigger HOA case closed workflow (async, don't wait)
    triggerHoaCaseClosedWorkflow(id, req.user?.id).catch(err => {
      console.error('Failed to trigger HOA case closed workflow:', err);
    });

    res.json(updatedCase);
  } catch (error) {
    console.error('Error closing case:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Case not found' });
    }
    res.status(500).json({ error: 'Failed to close case' });
  }
}

// Reopen a case
export async function reopenCase(req, res) {
  try {
    const { id } = req.params;

    const updatedCase = await prisma.case.update({
      where: { id },
      data: {
        status: 'WORKING',
        closedAt: null,
      },
    });

    res.json(updatedCase);
  } catch (error) {
    console.error('Error reopening case:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Case not found' });
    }
    res.status(500).json({ error: 'Failed to reopen case' });
  }
}

// Get case comments (placeholder - would need CaseComment model)
export async function getCaseComments(req, res) {
  try {
    const { id } = req.params;
    // For now, return empty array - CaseComment model would need to be added
    res.json([]);
  } catch (error) {
    console.error('Error getting case comments:', error);
    res.status(500).json({ error: 'Failed to get case comments' });
  }
}

// Add case comment (placeholder - would need CaseComment model)
export async function addCaseComment(req, res) {
  try {
    const { id } = req.params;
    const { body, isPublic = false } = req.body;
    // For now, return success - CaseComment model would need to be added
    res.json({ success: true, message: 'Comment functionality coming soon' });
  } catch (error) {
    console.error('Error adding case comment:', error);
    res.status(500).json({ error: 'Failed to add case comment' });
  }
}
