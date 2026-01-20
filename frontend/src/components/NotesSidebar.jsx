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
import { opportunitiesApi } from '../services/api';
import MentionTextarea from './MentionTextarea';

export default function NotesSidebar({ opportunityId }) {
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

  // Fetch notes for this opportunity
  const { data: notes = [], isLoading, error } = useQuery({
    queryKey: ['opportunityNotes', opportunityId],
    queryFn: () => opportunitiesApi.getNotes(opportunityId),
    enabled: !!opportunityId,
  });

  // Create note mutation
  const createNoteMutation = useMutation({
    mutationFn: (data) => opportunitiesApi.createNote(opportunityId, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunityNotes', opportunityId]);
      setIsAddingNote(false);
      setNewNoteTitle('');
      setNewNoteBody('');
      setNewNoteMentions([]);
    },
  });

  // Update note mutation
  const updateNoteMutation = useMutation({
    mutationFn: ({ noteId, data }) => opportunitiesApi.updateNote(opportunityId, noteId, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunityNotes', opportunityId]);
      setEditingNoteId(null);
      setEditTitle('');
      setEditBody('');
      setEditMentions([]);
    },
  });

  // Delete note mutation
  const deleteNoteMutation = useMutation({
    mutationFn: (noteId) => opportunitiesApi.deleteNote(opportunityId, noteId),
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunityNotes', opportunityId]);
      setConfirmDelete(null);
    },
  });

  // Toggle pin mutation
  const togglePinMutation = useMutation({
    mutationFn: (noteId) => opportunitiesApi.toggleNotePin(opportunityId, noteId),
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunityNotes', opportunityId]);
    },
  });

  const handleCreateNote = () => {
    if (!newNoteBody.trim()) return;
    createNoteMutation.mutate({
      title: newNoteTitle.trim() || null,
      body: newNoteBody.trim(),
      isPinned: false,
    });
  };

  const handleUpdateNote = (noteId) => {
    if (!editBody.trim()) return;
    updateNoteMutation.mutate({
      noteId,
      data: {
        title: editTitle.trim() || null,
        body: editBody.trim(),
      },
    });
  };

  const startEditing = (note) => {
    setEditingNoteId(note.id);
    setEditTitle(note.title || '');
    setEditBody(note.body || '');
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
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const truncateText = (text, maxLength = 100) => {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  // Separate pinned and unpinned notes
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

  if (error) {
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
      {/* Header */}
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

      {/* Add Note Form */}
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
              className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateNote}
              disabled={!newNoteBody.trim() || createNoteMutation.isPending}
              className="px-3 py-1 text-xs bg-panda-primary text-white rounded-md hover:bg-panda-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {createNoteMutation.isPending ? (
                'Saving...'
              ) : (
                <>
                  <Check className="w-3 h-3" />
                  Save
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Notes List */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {/* Pinned Note */}
        {pinnedNote && (
          <NoteCard
            note={pinnedNote}
            isPinned={true}
            isExpanded={expandedNotes.has(pinnedNote.id)}
            isEditing={editingNoteId === pinnedNote.id}
            editTitle={editTitle}
            editBody={editBody}
            setEditTitle={setEditTitle}
            setEditBody={setEditBody}
            onToggleExpand={() => toggleExpand(pinnedNote.id)}
            onTogglePin={() => togglePinMutation.mutate(pinnedNote.id)}
            onStartEdit={() => startEditing(pinnedNote)}
            onCancelEdit={cancelEditing}
            onSaveEdit={() => handleUpdateNote(pinnedNote.id)}
            onDelete={() => setConfirmDelete(pinnedNote.id)}
            confirmDelete={confirmDelete === pinnedNote.id}
            onConfirmDelete={() => deleteNoteMutation.mutate(pinnedNote.id)}
            onCancelDelete={() => setConfirmDelete(null)}
            isUpdating={updateNoteMutation.isPending}
            isDeleting={deleteNoteMutation.isPending}
            formatDate={formatDate}
            truncateText={truncateText}
          />
        )}

        {/* Separator if there's a pinned note */}
        {pinnedNote && unpinnedNotes.length > 0 && (
          <div className="border-t border-gray-100 my-2"></div>
        )}

        {/* Unpinned Notes */}
        {unpinnedNotes.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            isPinned={false}
            isExpanded={expandedNotes.has(note.id)}
            isEditing={editingNoteId === note.id}
            editTitle={editTitle}
            editBody={editBody}
            setEditTitle={setEditTitle}
            setEditBody={setEditBody}
            onToggleExpand={() => toggleExpand(note.id)}
            onTogglePin={() => togglePinMutation.mutate(note.id)}
            onStartEdit={() => startEditing(note)}
            onCancelEdit={cancelEditing}
            onSaveEdit={() => handleUpdateNote(note.id)}
            onDelete={() => setConfirmDelete(note.id)}
            confirmDelete={confirmDelete === note.id}
            onConfirmDelete={() => deleteNoteMutation.mutate(note.id)}
            onCancelDelete={() => setConfirmDelete(null)}
            isUpdating={updateNoteMutation.isPending}
            isDeleting={deleteNoteMutation.isPending}
            formatDate={formatDate}
            truncateText={truncateText}
          />
        ))}

        {/* Empty State */}
        {notes.length === 0 && !isAddingNote && (
          <div className="text-center py-6 text-gray-400">
            <StickyNote className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No notes yet</p>
            <button
              onClick={() => setIsAddingNote(true)}
              className="text-xs text-panda-primary hover:underline mt-1"
            >
              Add the first note
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Individual Note Card Component
function NoteCard({
  note,
  isPinned,
  isExpanded,
  isEditing,
  editTitle,
  editBody,
  setEditTitle,
  setEditBody,
  onToggleExpand,
  onTogglePin,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  confirmDelete,
  onConfirmDelete,
  onCancelDelete,
  isUpdating,
  isDeleting,
  formatDate,
  truncateText,
}) {
  if (isEditing) {
    return (
      <div className={`p-3 rounded-lg border ${isPinned ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-200'}`}>
        <input
          type="text"
          placeholder="Title (optional)"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className="w-full text-sm font-medium text-gray-900 bg-transparent border-none focus:outline-none placeholder-gray-400 mb-2"
        />
        <MentionTextarea
          value={editBody}
          onChange={setEditBody}
          mentions={editMentions}
          onMentionsChange={setEditMentions}
          rows={4}
          className="w-full text-sm text-gray-700 bg-transparent border-none focus:outline-none resize-none"
          placeholder="Write your note... (type @ to mention someone)"
          autoFocus
        />
        <div className="flex justify-end gap-2 mt-2">
          <button
            onClick={onCancelEdit}
            className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={onSaveEdit}
            disabled={!editBody.trim() || isUpdating}
            className="px-3 py-1 text-xs bg-panda-primary text-white rounded-md hover:bg-panda-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUpdating ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    );
  }

  if (confirmDelete) {
    return (
      <div className="p-3 rounded-lg border border-red-200 bg-red-50">
        <p className="text-sm text-red-700 mb-2">Delete this note?</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancelDelete}
            className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={onConfirmDelete}
            disabled={isDeleting}
            className="px-3 py-1 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group p-3 rounded-lg border transition-colors cursor-pointer ${
        isPinned
          ? 'bg-yellow-50 border-yellow-200 hover:border-yellow-300'
          : 'bg-white border-gray-100 hover:border-gray-200 hover:bg-gray-50'
      }`}
      onClick={onToggleExpand}
    >
      {/* Note Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {note.title && (
            <h4 className="text-sm font-medium text-gray-900 truncate">{note.title}</h4>
          )}
          <p className={`text-sm text-gray-600 ${isExpanded ? '' : 'line-clamp-2'}`}>
            {isExpanded ? note.body : truncateText(note.body, 80)}
          </p>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
            className={`p-1 rounded ${isPinned ? 'text-yellow-600 hover:text-yellow-700' : 'text-gray-400 hover:text-yellow-500'}`}
            title={isPinned ? 'Unpin' : 'Pin to top'}
          >
            {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStartEdit();
            }}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
            title="Edit"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1 text-gray-400 hover:text-red-500 rounded"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Note Footer */}
      <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
        <div className="flex items-center gap-2">
          {note.createdBy && (
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              {note.createdBy.firstName || note.createdBy.email?.split('@')[0] || 'Unknown'}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDate(note.createdAt)}
          </span>
        </div>
        {isPinned && (
          <span className="flex items-center gap-1 text-yellow-600">
            <Pin className="w-3 h-3" />
            Pinned
          </span>
        )}
        {note.body && note.body.length > 80 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            className="text-panda-primary hover:underline flex items-center gap-0.5"
          >
            {isExpanded ? (
              <>
                Less <ChevronUp className="w-3 h-3" />
              </>
            ) : (
              <>
                More <ChevronDown className="w-3 h-3" />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
