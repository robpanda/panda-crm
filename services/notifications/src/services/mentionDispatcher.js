function extractRecipientId(recipient) {
  if (!recipient) return null;
  if (typeof recipient === 'string') return recipient;
  if (typeof recipient === 'object') return recipient.userId || recipient.id || null;
  return null;
}

export function normalizeMentionRecipients(recipients = [], actorId = null) {
  const unique = new Set();
  let skippedSelf = 0;

  for (const recipient of recipients || []) {
    const userId = extractRecipientId(recipient);
    if (!userId) continue;
    if (actorId && userId === actorId) {
      skippedSelf += 1;
      continue;
    }
    unique.add(userId);
  }

  return {
    recipientIds: Array.from(unique),
    skippedSelf,
  };
}

function buildActionLabel(entityType = null) {
  const normalized = String(entityType || '').trim().toLowerCase();
  if (!normalized) return 'View Item';
  if (normalized === 'opportunity' || normalized === 'job') return 'View Job';
  if (normalized === 'lead') return 'View Lead';
  return `View ${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

function buildDefaultContext(entityType = null, entityId = null) {
  const normalized = String(entityType || '').trim().toLowerCase();
  if (!normalized) return 'a record';
  if (!entityId) return normalized;
  return `${normalized} ${entityId}`;
}

export async function dispatchMentions({
  notificationService,
  actorId = null,
  actorName = 'Someone',
  recipients = [],
  entityType = null,
  entityId = null,
  noteId = null,
  commentId = null,
  snippet = '',
  bodyPreview = '',
  actionPath = null,
  actionLabel = null,
  context = null,
  sourceType = null,
  sourceId = null,
  leadId = null,
  opportunityId = null,
  accountId = null,
  correlationId = null,
  logger = console,
}) {
  if (!notificationService || typeof notificationService.createFromTemplate !== 'function') {
    throw new Error('notificationService.createFromTemplate is required');
  }

  const { recipientIds, skippedSelf } = normalizeMentionRecipients(recipients, actorId);
  if (recipientIds.length === 0) {
    return {
      attempted: 0,
      dispatched: 0,
      skippedSelf,
      failures: [],
      notificationIds: [],
    };
  }

  const preview = String(bodyPreview || snippet || '').trim();
  const excerpt = preview.length > 200 ? `${preview.slice(0, 200)}...` : preview;
  const normalizedContext = context || buildDefaultContext(entityType, entityId);
  const normalizedActionLabel = actionLabel || buildActionLabel(entityType);

  const baseData = {
    mentionedBy: actorName,
    context: normalizedContext,
    excerpt,
    actionUrl: actionPath,
    actionLabel: normalizedActionLabel,
    sourceType: sourceType || String(entityType || '').toUpperCase() || 'INTERNAL',
    sourceId: sourceId || entityId,
    entityType,
    entityId,
    noteId,
    commentId,
    correlationId,
    internalNotification: true,
  };

  const relations = {
    actorId,
    leadId,
    opportunityId,
    accountId,
  };

  const results = await Promise.all(
    recipientIds.map(async (recipientId) => {
      try {
        const notification = await notificationService.createFromTemplate(
          'MENTION',
          recipientId,
          baseData,
          relations,
          {
            forceInApp: true,
            correlationId,
          }
        );

        return {
          recipientId,
          notificationId: notification?.id || null,
          created: Boolean(notification),
          error: null,
        };
      } catch (error) {
        logger.warn?.(
          `[mentions.dispatch] failed recipient=${recipientId} correlationId=${correlationId || 'n/a'}: ${error.message}`
        );
        return {
          recipientId,
          notificationId: null,
          created: false,
          error: error.message,
        };
      }
    })
  );

  return {
    attempted: recipientIds.length,
    dispatched: results.filter((r) => r.created).length,
    skippedSelf,
    notificationIds: results.map((r) => r.notificationId).filter(Boolean),
    failures: results.filter((r) => r.error).map((r) => ({ recipientId: r.recipientId, error: r.error })),
  };
}

export default {
  dispatchMentions,
  normalizeMentionRecipients,
};
