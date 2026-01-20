import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// List conversations with filtering and pagination
export async function listConversations(req, res, next) {
  try {
    const {
      status,
      channel,
      assignedUserId,
      contactId,
      opportunityId,
      accountId,
      needsAttention,
      priority,
      search,
      page = 1,
      limit = 50,
    } = req.query;

    const where = {
      ...(status && { status }),
      ...(channel && { channels: { has: channel } }),
      ...(assignedUserId && { assignedUserId }),
      ...(contactId && { contactId }),
      ...(opportunityId && { opportunityId }),
      ...(accountId && { accountId }),
      ...(needsAttention === 'true' && { needsAttention: true }),
      ...(priority && { priority }),
      ...(search && {
        OR: [
          { phoneNumber: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { lastMessagePreview: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
          _count: {
            select: { messages: true },
          },
        },
        orderBy: { lastMessageAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.conversation.count({ where }),
    ]);

    res.json({
      data: conversations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
}

// Get single conversation with messages
export async function getConversation(req, res, next) {
  try {
    const { id } = req.params;
    const { messageLimit = 50 } = req.query;

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: parseInt(messageLimit),
        },
      },
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json(conversation);
  } catch (error) {
    next(error);
  }
}

// Get or create conversation by identifier (phone or email)
export async function getConversationByIdentifier(req, res, next) {
  try {
    const { identifier } = req.params;
    const normalizedIdentifier = normalizeIdentifier(identifier);

    let conversation = await prisma.conversation.findUnique({
      where: { identifier: normalizedIdentifier },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!conversation) {
      // Determine if it's a phone or email
      const isPhone = /^\+?[\d\s\-()]+$/.test(identifier);
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);

      conversation = await prisma.conversation.create({
        data: {
          identifier: normalizedIdentifier,
          phoneNumber: isPhone ? normalizedIdentifier : null,
          email: isEmail ? normalizedIdentifier : null,
          channels: isPhone ? ['SMS'] : isEmail ? ['EMAIL'] : [],
        },
        include: {
          messages: true,
        },
      });
    }

    res.json(conversation);
  } catch (error) {
    next(error);
  }
}

// Get conversations by contact
export async function getConversationsByContact(req, res, next) {
  try {
    const { contactId } = req.params;

    const conversations = await prisma.conversation.findMany({
      where: { contactId },
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: { messages: true },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    res.json(conversations);
  } catch (error) {
    next(error);
  }
}

// Get conversations by opportunity
export async function getConversationsByOpportunity(req, res, next) {
  try {
    const { opportunityId } = req.params;

    const conversations = await prisma.conversation.findMany({
      where: { opportunityId },
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: { messages: true },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    res.json(conversations);
  } catch (error) {
    next(error);
  }
}

// Update conversation
export async function updateConversation(req, res, next) {
  try {
    const { id } = req.params;
    const {
      status,
      priority,
      assignedUserId,
      tags,
      autoResponseEnabled,
      contactId,
      opportunityId,
      accountId,
    } = req.body;

    const conversation = await prisma.conversation.update({
      where: { id },
      data: {
        ...(status && { status }),
        ...(priority && { priority }),
        ...(assignedUserId !== undefined && { assignedUserId }),
        ...(tags && { tags }),
        ...(autoResponseEnabled !== undefined && { autoResponseEnabled }),
        ...(contactId !== undefined && { contactId }),
        ...(opportunityId !== undefined && { opportunityId }),
        ...(accountId !== undefined && { accountId }),
      },
    });

    res.json(conversation);
  } catch (error) {
    next(error);
  }
}

// Assign conversation to user
export async function assignConversation(req, res, next) {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    const conversation = await prisma.conversation.update({
      where: { id },
      data: { assignedUserId: userId },
    });

    res.json(conversation);
  } catch (error) {
    next(error);
  }
}

// Close conversation
export async function closeConversation(req, res, next) {
  try {
    const { id } = req.params;

    const conversation = await prisma.conversation.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        needsAttention: false,
      },
    });

    res.json(conversation);
  } catch (error) {
    next(error);
  }
}

// Archive conversation
export async function archiveConversation(req, res, next) {
  try {
    const { id } = req.params;

    const conversation = await prisma.conversation.update({
      where: { id },
      data: {
        status: 'ARCHIVED',
        archivedAt: new Date(),
        needsAttention: false,
      },
    });

    res.json(conversation);
  } catch (error) {
    next(error);
  }
}

// Mark conversation as read
export async function markAsRead(req, res, next) {
  try {
    const { id } = req.params;

    // Mark all unread messages as read
    await prisma.message.updateMany({
      where: {
        conversationId: id,
        readAt: null,
        direction: 'INBOUND',
      },
      data: { readAt: new Date() },
    });

    // Reset unread count
    const conversation = await prisma.conversation.update({
      where: { id },
      data: { unreadCount: 0 },
    });

    res.json(conversation);
  } catch (error) {
    next(error);
  }
}

// Get attention queue - conversations needing attention
export async function getAttentionQueue(req, res, next) {
  try {
    const { assignedUserId, limit = 20 } = req.query;

    const conversations = await prisma.conversation.findMany({
      where: {
        needsAttention: true,
        status: 'OPEN',
        ...(assignedUserId && { assignedUserId }),
      },
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: [
        { priority: 'desc' }, // URGENT first
        { lastMessageAt: 'desc' },
      ],
      take: parseInt(limit),
    });

    res.json(conversations);
  } catch (error) {
    next(error);
  }
}

// Get conversation statistics
export async function getConversationStats(req, res, next) {
  try {
    const { assignedUserId, opportunityId, accountId } = req.query;

    const baseWhere = {
      ...(assignedUserId && { assignedUserId }),
      ...(opportunityId && { opportunityId }),
      ...(accountId && { accountId }),
    };

    const [total, open, closed, needsAttention, unreadCount] = await Promise.all([
      prisma.conversation.count({ where: baseWhere }),
      prisma.conversation.count({ where: { ...baseWhere, status: 'OPEN' } }),
      prisma.conversation.count({ where: { ...baseWhere, status: 'CLOSED' } }),
      prisma.conversation.count({ where: { ...baseWhere, needsAttention: true } }),
      prisma.conversation.aggregate({
        where: baseWhere,
        _sum: { unreadCount: true },
      }),
    ]);

    // Channel breakdown
    const byChannel = await prisma.conversation.groupBy({
      by: ['lastChannel'],
      where: { ...baseWhere, lastChannel: { not: null } },
      _count: true,
    });

    res.json({
      total,
      open,
      closed,
      needsAttention,
      totalUnread: unreadCount._sum.unreadCount || 0,
      byChannel: byChannel.reduce((acc, item) => {
        acc[item.lastChannel] = item._count;
        return acc;
      }, {}),
    });
  } catch (error) {
    next(error);
  }
}

// Helper: Normalize identifier (phone or email)
function normalizeIdentifier(identifier) {
  // Check if it's a phone number
  if (/^\+?[\d\s\-()]+$/.test(identifier)) {
    // Remove all non-digits
    let phone = identifier.replace(/\D/g, '');
    // Add +1 for US numbers if needed
    if (phone.length === 10) {
      phone = '1' + phone;
    }
    return '+' + phone;
  }
  // It's an email - lowercase it
  return identifier.toLowerCase().trim();
}
