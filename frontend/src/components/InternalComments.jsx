import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MessageCircle,
  Plus,
  Edit3,
  Trash2,
  CheckCircle2,
  RotateCcw,
  X,
  Check,
  Paperclip,
} from 'lucide-react';
import { leadsApi, opportunitiesApi } from '../services/api';
import MentionTextarea from './MentionTextarea';

const apiByEntity = {
  lead: leadsApi,
  opportunity: opportunitiesApi,
};

function normalizeCommentsPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.comments)) return payload.comments;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function normalizeDepartment(dept) {
  if (!dept) return null;
  if (typeof dept === 'string') {
    return { value: dept, label: dept };
  }
  const value = dept.value || dept.tag || dept.name || dept.id;
  if (!value) return null;
  return {
    value,
    label: dept.label || dept.name || dept.value || dept.tag || dept.id,
  };
}

export default function InternalComments({ entityType, entityId }) {
  const api = apiByEntity[entityType];
  const queryClient = useQueryClient();
  const commentsQueryKey = ['internalComments', entityType, entityId];
  const [newContent, setNewContent] = useState('');
  const [newMentions, setNewMentions] = useState([]);
  const [newDepartment, setNewDepartment] = useState('general');
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [editMentions, setEditMentions] = useState([]);
  const [replyingToId, setReplyingToId] = useState(null);
  const [replyContent, setReplyContent] = useState('');
  const [replyMentions, setReplyMentions] = useState([]);

  const { data: comments = [], isLoading, error } = useQuery({
    queryKey: commentsQueryKey,
    queryFn: async () => {
      try {
        const payload = await api?.getInternalComments?.(entityId);
        return normalizeCommentsPayload(payload);
      } catch (err) {
        if (err?.response?.status === 404) return [];
        throw err;
      }
    },
    enabled: !!entityId && !!api?.getInternalComments,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['commentDepartments', entityType],
    queryFn: () => api?.getCommentDepartments?.(),
    enabled: !!api?.getCommentDepartments,
  });

  const departmentOptions = useMemo(() => {
    const normalized = (departments || [])
      .map(normalizeDepartment)
      .filter(Boolean);
    const unique = new Map();
    normalized.forEach((d) => unique.set(d.value, d));
    if (!unique.has('general')) {
      unique.set('general', { value: 'general', label: 'General' });
    }
    return Array.from(unique.values());
  }, [departments]);

  const createMutation = useMutation({
    mutationFn: (data) => api.createInternalComment(entityId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentsQueryKey });
      setNewContent('');
      setNewMentions([]);
      setNewDepartment('general');
    },
  });

  const createReplyMutation = useMutation({
    mutationFn: ({ parentCommentId, data }) => api.createInternalComment(entityId, { ...data, parentCommentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentsQueryKey });
      setReplyingToId(null);
      setReplyContent('');
      setReplyMentions([]);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ commentId, data }) => api.updateInternalComment(entityId, commentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentsQueryKey });
      setEditingId(null);
      setEditContent('');
      setEditMentions([]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (commentId) => api.deleteInternalComment(entityId, commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentsQueryKey });
    },
  });

  const toggleResolvedMutation = useMutation({
    mutationFn: ({ commentId, isResolved }) => api.updateInternalComment(entityId, commentId, { isResolved }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentsQueryKey });
    },
  });

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const startEditing = (comment) => {
    setEditingId(comment.id);
    setEditContent(comment.content ?? comment.body ?? comment.text ?? '');
    setEditMentions([]);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditContent('');
    setEditMentions([]);
  };

  const startReply = (commentId) => {
    setReplyingToId(commentId);
    setReplyContent('');
    setReplyMentions([]);
  };

  const cancelReply = () => {
    setReplyingToId(null);
    setReplyContent('');
    setReplyMentions([]);
  };

  const handleCreate = () => {
    if (!newContent.trim()) return;
    createMutation.mutate({
      content: newContent.trim(),
      departmentTag: newDepartment || 'general',
      mentions: newMentions,
    });
  };

  const handleUpdate = (commentId) => {
    if (!editContent.trim()) return;
    updateMutation.mutate({
      commentId,
      data: {
        content: editContent.trim(),
        mentions: editMentions,
      },
    });
  };

  const handleCreateReply = (commentId) => {
    if (!replyContent.trim()) return;
    createReplyMutation.mutate({
      parentCommentId: commentId,
      data: {
        content: replyContent.trim(),
        mentions: replyMentions,
      },
    });
  };

  const renderAttachments = (attachmentUrls = []) => {
    if (!attachmentUrls.length) return null;
    return (
      <div className="mt-2 space-y-1">
        {attachmentUrls.map((url) => (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
          >
            <Paperclip className="w-3 h-3" />
            Attachment
          </a>
        ))}
      </div>
    );
  };

  const renderComment = (comment, depth = 0) => {
    const isEditing = editingId === comment.id;
    const author = comment.author || comment.createdBy || comment.user || {};
    const authorName = `${author.firstName || ''} ${author.lastName || ''}`.trim();
    const departmentLabel = comment.departmentTag || comment.department || comment.departmentName;
    const contentText = comment.content ?? comment.body ?? comment.text ?? '';
    const attachmentUrls = comment.attachmentUrls || comment.attachments || [];
    return (
      <div key={comment.id} style={{ marginLeft: depth * 16 }} className="border-l border-gray-200 pl-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">
                {authorName || 'Unknown'}
              </span>
              {departmentLabel && (
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  {departmentLabel}
                </span>
              )}
              {comment.isResolved && (
                <span className="text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Resolved</span>
              )}
            </div>
            <div className="text-xs text-gray-400">{formatDate(comment.createdAt)}</div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <button
              onClick={() => startReply(comment.id)}
              className="flex items-center gap-1 hover:text-panda-primary"
              title="Reply"
            >
              <MessageCircle className="w-4 h-4" />
            </button>
            {!comment.isResolved ? (
              <button
                onClick={() => toggleResolvedMutation.mutate({ commentId: comment.id, isResolved: true })}
                className="flex items-center gap-1 hover:text-green-600"
                title="Mark resolved"
              >
                <CheckCircle2 className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => toggleResolvedMutation.mutate({ commentId: comment.id, isResolved: false })}
                className="flex items-center gap-1 hover:text-yellow-600"
                title="Mark unresolved"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => startEditing(comment)}
              className="flex items-center gap-1 hover:text-blue-600"
              title="Edit"
            >
              <Edit3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => deleteMutation.mutate(comment.id)}
              className="flex items-center gap-1 hover:text-red-600"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="mt-2">
          {isEditing ? (
            <div className="space-y-2">
              <MentionTextarea
                value={editContent}
                onChange={setEditContent}
                mentions={editMentions}
                onMentionsChange={setEditMentions}
                rows={3}
                className="w-full text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-2 focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleUpdate(comment.id)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-panda-primary text-white rounded-lg"
                >
                  <Check className="w-3 h-3" />
                  Save
                </button>
                <button
                  onClick={cancelEditing}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-lg"
                >
                  <X className="w-3 h-3" />
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{contentText}</p>
          )}
          {renderAttachments(attachmentUrls)}
          {replyingToId === comment.id && (
            <div className="mt-3 p-3 rounded-lg border border-gray-200 bg-gray-50 space-y-2">
              <MentionTextarea
                value={replyContent}
                onChange={setReplyContent}
                mentions={replyMentions}
                onMentionsChange={setReplyMentions}
                rows={2}
                placeholder="Write a reply..."
                className="w-full text-sm text-gray-700 bg-white border border-gray-200 rounded-lg p-2 focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCreateReply(comment.id)}
                  disabled={!replyContent.trim() || createReplyMutation.isPending}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-panda-primary text-white rounded-lg disabled:opacity-50"
                >
                  <Check className="w-3 h-3" />
                  Reply
                </button>
                <button
                  onClick={cancelReply}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg"
                >
                  <X className="w-3 h-3" />
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-4 space-y-4">
            {comment.replies.map((reply) => renderComment(reply, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (!api) return null;

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <MessageCircle className="w-5 h-5 text-panda-primary" />
          <h3 className="text-lg font-semibold text-gray-900">Internal Comments</h3>
        </div>
        <div className="animate-pulse space-y-3">
          <div className="h-16 bg-gray-100 rounded-lg"></div>
          <div className="h-12 bg-gray-100 rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (error) {
    const status = error?.response?.status;
    const message = status === 404
      ? 'Internal comments are not available for this record yet.'
      : 'Failed to load internal comments.';
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <MessageCircle className="w-5 h-5 text-panda-primary" />
          <h3 className="text-lg font-semibold text-gray-900">Internal Comments</h3>
        </div>
        <p className="text-sm text-red-500">{message}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-panda-primary" />
          <h3 className="text-lg font-semibold text-gray-900">Internal Comments</h3>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{comments.length}</span>
        </div>
      </div>

      <div className="border border-blue-200 bg-blue-50 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-900">Add Comment</h4>
        </div>
        <div className="grid grid-cols-1 gap-2">
          <select
            value={newDepartment}
            onChange={(e) => setNewDepartment(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
          >
            {departmentOptions.map((dept) => (
              <option key={dept.value} value={dept.value}>{dept.label}</option>
            ))}
          </select>
          <MentionTextarea
            value={newContent}
            onChange={setNewContent}
            mentions={newMentions}
            onMentionsChange={setNewMentions}
            rows={3}
            placeholder="Write an internal comment... (type @ to mention someone)"
            className="w-full text-sm text-gray-700 bg-white border border-gray-200 rounded-lg p-2 focus:outline-none"
          />
        </div>
        <div className="flex justify-end">
          <button
            onClick={handleCreate}
            disabled={!newContent.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-panda-primary rounded-lg disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Add Comment
          </button>
        </div>
      </div>

      {comments.length === 0 ? (
        <div className="text-sm text-gray-500">No internal comments yet.</div>
      ) : (
        <div className="space-y-6">
          {comments.map((comment) => renderComment(comment, 0))}
        </div>
      )}
    </div>
  );
}
