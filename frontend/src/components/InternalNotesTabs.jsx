import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  StickyNote,
  Pin,
  PinOff,
  Plus,
  Edit3,
  Trash2,
  X,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  User,
} from 'lucide-react';
import { leadsApi, opportunitiesApi } from '../services/api';
import MentionTextarea from './MentionTextarea';
import ThreadMessageList, { ThreadBody } from './ThreadMessageList';

const apiByEntity = {
  lead: leadsApi,
  opportunity: opportunitiesApi,
};

export default function InternalNotesTabs({ entityType = 'lead', entityId }) {
  const api = apiByEntity[entityType];
  const queryClient = useQueryClient();
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteBody, setNewNoteBody] = useState('');
  const [newNoteMentions, setNewNoteMentions] = useState([]);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editMentions, setEditMentions] = useState([]);
  const [expandedNotes, setExpandedNotes] = useState(new Set());
  const [confirmDelete, setConfirmDelete] = useState(null);

  const { data: notes = [], isLoading, error } = useQuery({
    queryKey: ['internalNotes', entityType, entityId],
    queryFn: () => api?.getNotes?.(entityId),
    enabled: !!entityId && !!api?.getNotes,
  });

  const createNoteMutation = useMutation({
    mutationFn: (data) => api?.createNote?.(entityId, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['internalNotes', entityType, entityId]);
      setIsAddingNote(false);
      setNewNoteTitle('');
      setNewNoteBody('');
      setNewNoteMentions([]);
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: ({ noteId, data }) => api?.updateNote?.(entityId, noteId, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['internalNotes', entityType, entityId]);
      setEditingNoteId(null);
      setEditTitle('');
      setEditBody('');
      setEditMentions([]);
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (noteId) => api?.deleteNote?.(entityId, noteId),
    onSuccess: () => {
      queryClient.invalidateQueries(['internalNotes', entityType, entityId]);
      setConfirmDelete(null);
    },
  });

  const togglePinMutation = useMutation({
    mutationFn: (noteId) => api?.toggleNotePin?.(entityId, noteId),
    onSuccess: () => {
      queryClient.invalidateQueries(['internalNotes', entityType, entityId]);
    },
  });

  const handleCreateNote = () => {
    if (!newNoteBody.trim()) return;
    createNoteMutation.mutate({
      title: newNoteTitle.trim() || null,
      body: newNoteBody.trim(),
      isPinned: false,
      mentions: newNoteMentions,
    });
  };

  const handleUpdateNote = (noteId) => {
    if (!editBody.trim()) return;
    updateNoteMutation.mutate({
      noteId,
      data: {
        title: editTitle.trim() || null,
        body: editBody.trim(),
        mentions: editMentions,
      },
    });
  };

  const startEditing = (note) => {
    setEditingNoteId(note.id);
    setEditTitle(note.title || '');
    setEditBody(note.body || '');
    setEditMentions([]);
  };

  const cancelEditing = () => {
    setEditingNoteId(null);
    setEditTitle('');
    setEditBody('');
    setEditMentions([]);
  };

  const toggleExpand = (noteId) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) {
        next.delete(noteId);
      } else {
        next.add(noteId);
      }
      return next;
    });
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const truncateText = (text, maxLength = 100) => {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const pinnedNote = notes.find((n) => n.isPinned);
  const unpinnedNotes = notes.filter((n) => !n.isPinned);

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-4">
          <StickyNote className="w-5 h-5 text-yellow-500" />
          <h3 className="font-semibold text-gray-900">Notes</h3>
        </div>
        <div className="animate-pulse space-y-3">
          <div className="h-16 bg-gray-100 rounded-lg"></div>
          <div className="h-12 bg-gray-100 rounded-lg"></div>
          <div className="h-12 bg-gray-100 rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (error || !api?.getNotes) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-4">
          <StickyNote className="w-5 h-5 text-yellow-500" />
          <h3 className="font-semibold text-gray-900">Notes</h3>
        </div>
        <p className="text-sm text-red-500">Failed to load notes</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <StickyNote className="w-5 h-5 text-yellow-500" />
          <h3 className="font-semibold text-gray-900">Notes</h3>
          <span className="text-xs text-gray-400">({notes.length})</span>
        </div>
        {!isAddingNote && (
          <button
            onClick={() => setIsAddingNote(true)}
            className="p-1.5 text-gray-400 hover:text-panda-primary hover:bg-gray-50 rounded-lg transition-colors"
            title="Add Note"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {isAddingNote && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <input
            type="text"
            placeholder="Title (optional)"
            value={newNoteTitle}
            onChange={(e) => setNewNoteTitle(e.target.value)}
            className="w-full text-sm font-medium text-gray-900 bg-transparent border-none focus:outline-none placeholder-gray-400 mb-2"
          />
          <MentionTextarea
            placeholder="Write your note... (type @ to mention someone)"
            value={newNoteBody}
            onChange={setNewNoteBody}
            mentions={newNoteMentions}
            onMentionsChange={setNewNoteMentions}
            rows={3}
            className="w-full text-sm text-gray-700 bg-transparent border-none focus:outline-none resize-none placeholder-gray-400"
            autoFocus
          />
          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={() => {
                setIsAddingNote(false);
                setNewNoteTitle('');
                setNewNoteBody('');
                setNewNoteMentions([]);
              }}
              className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateNote}
              className="px-3 py-1.5 text-xs bg-panda-primary text-white rounded-md hover:bg-panda-primary/90"
            >
              Save Note
            </button>
          </div>
        </div>
      )}

      {pinnedNote && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Pin className="w-4 h-4 text-yellow-600" />
              <span className="text-sm font-semibold text-gray-900">
                {pinnedNote.title || 'Pinned Note'}
              </span>
            </div>
            <button
              onClick={() => togglePinMutation.mutate(pinnedNote.id)}
              className="text-gray-400 hover:text-gray-600"
              title="Unpin"
            >
              <PinOff className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-gray-700">{pinnedNote.body}</p>
        </div>
      )}

      <ThreadMessageList
        items={unpinnedNotes}
        emptyTitle={pinnedNote ? '' : 'No notes yet'}
        className="space-y-3"
        renderItem={(note) => {
          const isExpanded = expandedNotes.has(note.id);
          const isEditing = editingNoteId === note.id;
          const author = note.createdBy || note.author || note.user || {};
          const authorName = `${author.firstName || ''} ${author.lastName || ''}`.trim();

          return (
            <div key={note.id} className="border border-gray-200 rounded-lg p-3">
              {isEditing ? (
                <div>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full text-sm font-medium text-gray-900 border border-gray-200 rounded-md px-2 py-1 mb-2"
                    placeholder="Title (optional)"
                  />
                  <MentionTextarea
                    value={editBody}
                    onChange={setEditBody}
                    mentions={editMentions}
                    onMentionsChange={setEditMentions}
                    rows={3}
                    className="w-full text-sm text-gray-700 border border-gray-200 rounded-md px-2 py-1 resize-none"
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    <button
                      onClick={cancelEditing}
                      className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleUpdateNote(note.id)}
                      className="px-2 py-1 text-xs bg-panda-primary text-white rounded-md"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">
                          {note.title || 'Untitled'}
                        </span>
                        {note.isPinned && <Pin className="w-3 h-3 text-yellow-500" />}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                        {authorName && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" /> {authorName}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {formatDate(note.createdAt)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => togglePinMutation.mutate(note.id)}
                        className="text-gray-400 hover:text-yellow-600"
                        title={note.isPinned ? 'Unpin' : 'Pin'}
                      >
                        {note.isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => startEditing(note)}
                        className="text-gray-400 hover:text-blue-600"
                        title="Edit"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(note.id)}
                        className="text-gray-400 hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-2">
                    <ThreadBody text={isExpanded ? note.body : truncateText(note.body)} />
                  </div>

                  {note.body && note.body.length > 100 && (
                    <button
                      onClick={() => toggleExpand(note.id)}
                      className="mt-1 text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                    >
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {isExpanded ? 'Show less' : 'Show more'}
                    </button>
                  )}
                </>
              )}

              {confirmDelete === note.id && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md flex items-center justify-between">
                  <span className="text-xs text-red-600">Delete this note?</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="p-1 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteNoteMutation.mutate(note.id)}
                      className="p-1 text-red-600 hover:text-red-700"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        }}
      />
    </div>
  );
}
