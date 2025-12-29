// Approval Workflow Service
// Handles approval requests, routing, escalation, and notifications

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

class ApprovalService {
  /**
   * Create a new approval request
   */
  async createApprovalRequest({
    type,
    subject,
    description,
    requesterId,
    requestedValue,
    originalValue,
    discountType,
    discountPercent,
    discountAmount,
    opportunityId,
    quoteId,
    commissionId,
    orderId,
    dueDate,
    metadata,
  }) {
    // Find applicable approval rule
    const rule = await this.findApplicableRule(type, requestedValue, discountPercent);

    // Determine approver based on rule or manager chain
    let approverId = null;
    let totalSteps = 1;

    if (rule) {
      // Rule-based approval
      if (rule.approverIds.length > 0) {
        approverId = rule.approverIds[0];
      }
      totalSteps = rule.requireAllApprovers ? rule.approverIds.length : 1;
    } else {
      // Fall back to requester's manager
      const requester = await prisma.user.findUnique({
        where: { id: requesterId },
        select: { managerId: true },
      });
      approverId = requester?.managerId || null;
    }

    // Calculate expiration (default 7 days)
    const expiresAt = dueDate
      ? new Date(dueDate)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Create the approval request
    const approvalRequest = await prisma.approvalRequest.create({
      data: {
        type,
        subject,
        description,
        requesterId,
        approverId,
        requestedValue,
        originalValue,
        discountType,
        discountPercent,
        discountAmount,
        opportunityId,
        quoteId,
        commissionId,
        orderId,
        dueDate,
        expiresAt,
        totalSteps,
        metadata,
        status: 'PENDING',
        // Create first approval step
        steps: {
          create: {
            stepNumber: 1,
            name: rule?.name || 'Manager Approval',
            approverId,
            status: 'PENDING',
          },
        },
      },
      include: {
        requester: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        approver: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        opportunity: {
          select: { id: true, name: true },
        },
        steps: true,
      },
    });

    // Create notification for approver
    if (approverId) {
      await this.notifyApprover(approvalRequest);
    }

    return approvalRequest;
  }

  /**
   * Find applicable approval rule based on type and thresholds
   */
  async findApplicableRule(type, value, discountPercent) {
    const rules = await prisma.approvalRule.findMany({
      where: {
        type,
        isActive: true,
      },
      orderBy: { priority: 'desc' },
    });

    for (const rule of rules) {
      // Check amount thresholds
      if (rule.minAmount && value < parseFloat(rule.minAmount)) continue;
      if (rule.maxAmount && value > parseFloat(rule.maxAmount)) continue;

      // Check discount threshold
      if (rule.minDiscountPercent && discountPercent < parseFloat(rule.minDiscountPercent)) continue;

      return rule;
    }

    return null;
  }

  /**
   * Get approval requests with filters
   */
  async getApprovalRequests({
    status,
    type,
    requesterId,
    approverId,
    opportunityId,
    includeExpired = false,
    page = 1,
    limit = 20,
  }) {
    const where = {};

    if (status) where.status = status;
    if (type) where.type = type;
    if (requesterId) where.requesterId = requesterId;
    if (approverId) where.approverId = approverId;
    if (opportunityId) where.opportunityId = opportunityId;

    // Exclude expired unless specifically requested
    if (!includeExpired) {
      where.OR = [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
        { status: { in: ['APPROVED', 'REJECTED', 'CANCELLED'] } },
      ];
    }

    const [approvalRequests, total] = await Promise.all([
      prisma.approvalRequest.findMany({
        where,
        include: {
          requester: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          approver: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          decidedBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          opportunity: {
            select: { id: true, name: true },
          },
          quote: {
            select: { id: true, quoteNumber: true, name: true },
          },
          commission: {
            select: { id: true, name: true, commissionAmount: true },
          },
          steps: {
            orderBy: { stepNumber: 'asc' },
          },
          _count: { select: { comments: true } },
        },
        orderBy: { submittedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.approvalRequest.count({ where }),
    ]);

    return {
      data: approvalRequests,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get approval requests pending for a specific user (to approve)
   */
  async getPendingForApprover(userId, options = {}) {
    return this.getApprovalRequests({
      ...options,
      approverId: userId,
      status: 'PENDING',
    });
  }

  /**
   * Get approval requests submitted by a user
   */
  async getSubmittedByUser(userId, options = {}) {
    return this.getApprovalRequests({
      ...options,
      requesterId: userId,
    });
  }

  /**
   * Get single approval request by ID
   */
  async getApprovalRequestById(id) {
    return prisma.approvalRequest.findUnique({
      where: { id },
      include: {
        requester: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
        approver: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        decidedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        escalatedTo: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        opportunity: {
          select: {
            id: true,
            name: true,
            stage: true,
            amount: true,
            account: { select: { id: true, name: true } },
          },
        },
        quote: {
          select: { id: true, quoteNumber: true, name: true, total: true },
        },
        commission: {
          select: { id: true, name: true, commissionAmount: true, type: true },
        },
        order: {
          select: { id: true, orderNumber: true, total: true },
        },
        steps: {
          orderBy: { stepNumber: 'asc' },
          include: {
            approver: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
        comments: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
      },
    });
  }

  /**
   * Process an approval decision
   */
  async processDecision(id, { decision, decisionReason, decisionNotes, decidedById }) {
    const approvalRequest = await prisma.approvalRequest.findUnique({
      where: { id },
      include: { steps: { orderBy: { stepNumber: 'asc' } } },
    });

    if (!approvalRequest) {
      throw new Error('Approval request not found');
    }

    if (approvalRequest.status !== 'PENDING' && approvalRequest.status !== 'IN_REVIEW') {
      throw new Error(`Cannot process decision for request in ${approvalRequest.status} status`);
    }

    const currentStep = approvalRequest.steps.find(
      (s) => s.stepNumber === approvalRequest.currentStep
    );

    // Update current step
    await prisma.approvalStep.update({
      where: { id: currentStep.id },
      data: {
        decision,
        decisionReason,
        decidedAt: new Date(),
        status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      },
    });

    let newStatus;
    let nextApproverId = null;

    if (decision === 'APPROVE') {
      // Check if there are more steps
      if (approvalRequest.currentStep < approvalRequest.totalSteps) {
        // Move to next step
        newStatus = 'PENDING';
        const nextStep = approvalRequest.steps.find(
          (s) => s.stepNumber === approvalRequest.currentStep + 1
        );
        nextApproverId = nextStep?.approverId;
      } else {
        // All steps complete - fully approved
        newStatus = 'APPROVED';
      }
    } else if (decision === 'REJECT') {
      newStatus = 'REJECTED';
    } else if (decision === 'REQUEST_CHANGES') {
      newStatus = 'PENDING'; // Keep pending but add comment
    } else if (decision === 'DELEGATE') {
      newStatus = 'PENDING'; // Will need to update approver
    }

    // Update approval request
    const updated = await prisma.approvalRequest.update({
      where: { id },
      data: {
        status: newStatus,
        decision: decision === 'APPROVE' && newStatus === 'APPROVED' ? 'APPROVE' :
                  decision === 'REJECT' ? 'REJECT' : null,
        decisionReason,
        decisionNotes,
        decidedById: newStatus === 'APPROVED' || newStatus === 'REJECTED' ? decidedById : null,
        decidedAt: newStatus === 'APPROVED' || newStatus === 'REJECTED' ? new Date() : null,
        currentStep: decision === 'APPROVE' && newStatus === 'PENDING'
          ? approvalRequest.currentStep + 1
          : approvalRequest.currentStep,
        approverId: nextApproverId || approvalRequest.approverId,
      },
      include: {
        requester: { select: { id: true, firstName: true, lastName: true, email: true } },
        approver: { select: { id: true, firstName: true, lastName: true, email: true } },
        opportunity: { select: { id: true, name: true } },
      },
    });

    // Send notifications
    if (newStatus === 'APPROVED' || newStatus === 'REJECTED') {
      await this.notifyRequester(updated, decision);
    } else if (nextApproverId) {
      await this.notifyApprover(updated);
    }

    // If approved, execute any post-approval actions
    if (newStatus === 'APPROVED') {
      await this.executePostApprovalActions(updated);
    }

    return updated;
  }

  /**
   * Add a comment to an approval request
   */
  async addComment(approvalRequestId, { content, authorId, isInternal = false }) {
    return prisma.approvalComment.create({
      data: {
        approvalRequestId,
        content,
        authorId,
        isInternal,
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  /**
   * Cancel an approval request (by requester)
   */
  async cancelRequest(id, requesterId) {
    const approvalRequest = await prisma.approvalRequest.findUnique({
      where: { id },
    });

    if (!approvalRequest) {
      throw new Error('Approval request not found');
    }

    if (approvalRequest.requesterId !== requesterId) {
      throw new Error('Only the requester can cancel this request');
    }

    if (!['PENDING', 'IN_REVIEW'].includes(approvalRequest.status)) {
      throw new Error('Cannot cancel a request that has already been decided');
    }

    return prisma.approvalRequest.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  /**
   * Escalate an approval request
   */
  async escalateRequest(id, { escalateToId, escalationReason, escalatedById }) {
    const approvalRequest = await prisma.approvalRequest.findUnique({
      where: { id },
      include: { approver: true },
    });

    if (!approvalRequest) {
      throw new Error('Approval request not found');
    }

    // Get the next level manager if no specific escalation target
    let targetId = escalateToId;
    if (!targetId && approvalRequest.approver?.managerId) {
      targetId = approvalRequest.approver.managerId;
    }

    if (!targetId) {
      throw new Error('No escalation target available');
    }

    const updated = await prisma.approvalRequest.update({
      where: { id },
      data: {
        status: 'ESCALATED',
        escalatedAt: new Date(),
        escalatedToId: targetId,
        escalationReason,
        approverId: targetId, // Also update current approver
      },
      include: {
        requester: { select: { id: true, firstName: true, lastName: true, email: true } },
        escalatedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    // Notify the escalation target
    await this.notifyEscalation(updated);

    return updated;
  }

  /**
   * Process expired approval requests
   */
  async processExpiredRequests() {
    const expired = await prisma.approvalRequest.updateMany({
      where: {
        status: { in: ['PENDING', 'IN_REVIEW'] },
        expiresAt: { lt: new Date() },
      },
      data: { status: 'EXPIRED' },
    });

    return expired.count;
  }

  /**
   * Get approval statistics
   */
  async getApprovalStats(userId = null) {
    const where = userId
      ? { OR: [{ requesterId: userId }, { approverId: userId }] }
      : {};

    const [pending, approved, rejected, expired, byType] = await Promise.all([
      prisma.approvalRequest.count({ where: { ...where, status: 'PENDING' } }),
      prisma.approvalRequest.count({ where: { ...where, status: 'APPROVED' } }),
      prisma.approvalRequest.count({ where: { ...where, status: 'REJECTED' } }),
      prisma.approvalRequest.count({ where: { ...where, status: 'EXPIRED' } }),
      prisma.approvalRequest.groupBy({
        by: ['type'],
        where,
        _count: true,
      }),
    ]);

    return {
      pending,
      approved,
      rejected,
      expired,
      total: pending + approved + rejected + expired,
      byType: byType.reduce((acc, item) => {
        acc[item.type] = item._count;
        return acc;
      }, {}),
    };
  }

  /**
   * Notify approver of pending request
   */
  async notifyApprover(approvalRequest) {
    if (!approvalRequest.approverId) return;

    try {
      await prisma.notification.create({
        data: {
          type: 'APPROVAL_REQUESTED',
          title: 'Approval Request',
          message: `${approvalRequest.requester.firstName} ${approvalRequest.requester.lastName} submitted "${approvalRequest.subject}" for your approval`,
          priority: approvalRequest.priority || 'NORMAL',
          userId: approvalRequest.approverId,
          opportunityId: approvalRequest.opportunityId,
          metadata: {
            approvalRequestId: approvalRequest.id,
            approvalType: approvalRequest.type,
          },
        },
      });
    } catch (error) {
      console.error('Failed to create approval notification:', error);
    }
  }

  /**
   * Notify requester of decision
   */
  async notifyRequester(approvalRequest, decision) {
    try {
      const decisionText = decision === 'APPROVE' ? 'approved' : 'rejected';
      await prisma.notification.create({
        data: {
          type: decision === 'APPROVE' ? 'APPROVAL_APPROVED' : 'APPROVAL_REJECTED',
          title: `Request ${decisionText}`,
          message: `Your "${approvalRequest.subject}" request has been ${decisionText}`,
          priority: 'NORMAL',
          userId: approvalRequest.requesterId,
          opportunityId: approvalRequest.opportunityId,
          metadata: {
            approvalRequestId: approvalRequest.id,
            decision,
          },
        },
      });
    } catch (error) {
      console.error('Failed to create decision notification:', error);
    }
  }

  /**
   * Notify escalation target
   */
  async notifyEscalation(approvalRequest) {
    if (!approvalRequest.escalatedToId) return;

    try {
      await prisma.notification.create({
        data: {
          type: 'APPROVAL_REQUESTED',
          title: 'Escalated Approval Request',
          message: `"${approvalRequest.subject}" has been escalated to you for approval`,
          priority: 'HIGH',
          userId: approvalRequest.escalatedToId,
          opportunityId: approvalRequest.opportunityId,
          metadata: {
            approvalRequestId: approvalRequest.id,
            isEscalation: true,
          },
        },
      });
    } catch (error) {
      console.error('Failed to create escalation notification:', error);
    }
  }

  /**
   * Execute post-approval actions (e.g., apply discount, update commission status)
   */
  async executePostApprovalActions(approvalRequest) {
    try {
      switch (approvalRequest.type) {
        case 'DISCOUNT':
          // Apply approved discount to quote/order
          if (approvalRequest.quoteId && approvalRequest.discountAmount) {
            await prisma.quote.update({
              where: { id: approvalRequest.quoteId },
              data: {
                discount: approvalRequest.discountAmount,
                // Recalculate total would happen via trigger/service
              },
            });
          }
          break;

        case 'COMMISSION':
          // Update commission status to APPROVED
          if (approvalRequest.commissionId) {
            await prisma.commission.update({
              where: { id: approvalRequest.commissionId },
              data: {
                status: 'APPROVED',
                approvedDate: new Date(),
              },
            });
          }
          break;

        case 'SUPPLEMENT':
        case 'CHANGE_ORDER':
          // Update opportunity with approved supplement amount
          if (approvalRequest.opportunityId && approvalRequest.requestedValue) {
            await prisma.opportunity.update({
              where: { id: approvalRequest.opportunityId },
              data: {
                supplementsTotal: {
                  increment: approvalRequest.requestedValue,
                },
              },
            });
          }
          break;

        default:
          // No automatic action for other types
          break;
      }
    } catch (error) {
      console.error('Post-approval action failed:', error);
      // Don't throw - the approval is still valid even if post-action fails
    }
  }

  // ============================================================================
  // APPROVAL RULES MANAGEMENT
  // ============================================================================

  /**
   * Get all approval rules
   */
  async getApprovalRules(activeOnly = false) {
    const where = activeOnly ? { isActive: true } : {};
    return prisma.approvalRule.findMany({
      where,
      orderBy: [{ type: 'asc' }, { priority: 'desc' }],
    });
  }

  /**
   * Create an approval rule
   */
  async createApprovalRule(data) {
    return prisma.approvalRule.create({ data });
  }

  /**
   * Update an approval rule
   */
  async updateApprovalRule(id, data) {
    return prisma.approvalRule.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete an approval rule
   */
  async deleteApprovalRule(id) {
    return prisma.approvalRule.delete({ where: { id } });
  }
}

export const approvalService = new ApprovalService();
export default approvalService;
