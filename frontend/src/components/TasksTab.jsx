import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckSquare,
  Plus,
  Calendar,
  User,
  Clock,
  MoreVertical,
  Check,
  Trash2,
  Edit2,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  X,
  Loader2,
} from 'lucide-react';
import { tasksApi } from '../services/api';

// Task subject options (matching Salesforce)
const TASK_SUBJECTS = [
  'Call',
  'Send Letter/Quote',
  'Send Quote',
  'Other',
  'Meeting',
  'Site Visit',
  'Follow Up',
  'Contract Review',
  'Document Collection',
  'Schedule Appointment',
  'Insurance Follow Up',
  'Payment Follow Up',
  'Estimate Request',
  'Adjuster Meeting',
  'Project Prep',
];

// Task subtypes
const TASK_SUBTYPES = [
  'Call',
  'Email',
  'List Email',
  'Cadence',
  'LinkedIn',
  'Other',
];

// Priority options
const PRIORITIES = [
  { value: 'LOW', label: 'Low', color: 'text-gray-500 bg-gray-100' },
  { value: 'NORMAL', label: 'Normal', color: 'text-blue-600 bg-blue-100' },
  { value: 'HIGH', label: 'High', color: 'text-orange-600 bg-orange-100' },
  { value: 'CRITICAL', label: 'Critical', color: 'text-red-600 bg-red-100' },
];

// Status options
const STATUSES = [
  { value: 'NOT_STARTED', label: 'Not Started', color: 'text-gray-600 bg-gray-100' },
  { value: 'IN_PROGRESS', label: 'In Progress', color: 'text-blue-600 bg-blue-100' },
  { value: 'WAITING', label: 'Waiting', color: 'text-yellow-600 bg-yellow-100' },
  { value: 'COMPLETED', label: 'Completed', color: 'text-green-600 bg-green-100' },
  { value: 'DEFERRED', label: 'Deferred', color: 'text-purple-600 bg-purple-100' },
];

function TaskCard({ task, onComplete, onEdit, onDelete, onFollowUp }) {
  const [showMenu, setShowMenu] = useState(false);
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'COMPLETED';
  const priority = PRIORITIES.find(p => p.value === task.priority) || PRIORITIES[1];
  const status = STATUSES.find(s => s.value === task.status) || STATUSES[0];

  return (
    <div className={`bg-white border rounded-lg p-4 ${isOverdue ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Checkbox for completion */}
          <button
            onClick={() => task.status !== 'COMPLETED' && onComplete(task.id)}
            className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              task.status === 'COMPLETED'
                ? 'bg-green-500 border-green-500 text-white'
                : 'border-gray-300 hover:border-panda-primary'
            }`}
          >
            {task.status === 'COMPLETED' && <Check className="w-3 h-3" />}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className={`font-medium ${task.status === 'COMPLETED' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                {task.subject}
              </h4>
              <span className={`px-2 py-0.5 text-xs rounded-full ${priority.color}`}>
                {priority.label}
              </span>
              <span className={`px-2 py-0.5 text-xs rounded-full ${status.color}`}>
                {status.label}
              </span>
            </div>

            {task.description && (
              <p className={`text-sm mt-1 ${task.status === 'COMPLETED' ? 'text-gray-400' : 'text-gray-600'}`}>
                {task.description}
              </p>
            )}

            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
              {task.dueDate && (
                <div className={`flex items-center gap-1 ${isOverdue ? 'text-red-600' : ''}`}>
                  <Calendar className="w-3.5 h-3.5" />
                  <span>
                    {new Date(task.dueDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                  {isOverdue && <span className="text-xs font-medium">(Overdue)</span>}
                </div>
              )}
              {task.assignedTo && (
                <div className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5" />
                  <span>{task.assignedTo.firstName} {task.assignedTo.lastName}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Actions menu */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                <button
                  onClick={() => { onEdit(task); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={() => { onFollowUp(task); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <RefreshCw className="w-4 h-4" />
                  Create Follow-up
                </button>
                {task.status !== 'COMPLETED' && (
                  <button
                    onClick={() => { onComplete(task.id); setShowMenu(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-green-600 hover:bg-green-50"
                  >
                    <Check className="w-4 h-4" />
                    Mark Complete
                  </button>
                )}
                <button
                  onClick={() => { onDelete(task.id); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskModal({ isOpen, onClose, task, opportunityId, users, onSuccess }) {
  const queryClient = useQueryClient();
  const isEditing = !!task?.id;

  const [formData, setFormData] = useState({
    subject: task?.subject || '',
    subtype: '',
    description: task?.description || '',
    status: task?.status || 'NOT_STARTED',
    priority: task?.priority || 'NORMAL',
    dueDate: task?.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '',
    assignedToId: task?.assignedToId || '',
  });

  const createMutation = useMutation({
    mutationFn: (data) => tasksApi.createTask({ ...data, opportunityId }),
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunityTasks', opportunityId]);
      onSuccess?.('Task created successfully');
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => tasksApi.updateTask(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunityTasks', opportunityId]);
      onSuccess?.('Task updated successfully');
      onClose();
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {
      ...formData,
      dueDate: formData.dueDate || null,
      assignedToId: formData.assignedToId || null,
    };

    if (isEditing) {
      updateMutation.mutate({ id: task.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  if (!isOpen) return null;

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">
            {isEditing ? 'Edit Task' : 'New Task'}
          </h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subject <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
              required
            >
              <option value="">Select subject...</option>
              {TASK_SUBJECTS.map((subject) => (
                <option key={subject} value={subject}>{subject}</option>
              ))}
            </select>
          </div>

          {/* Subtype */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subtype
            </label>
            <select
              value={formData.subtype}
              onChange={(e) => setFormData({ ...formData, subtype: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
            >
              <option value="">Select subtype...</option>
              {TASK_SUBTYPES.map((subtype) => (
                <option key={subtype} value={subtype}>{subtype}</option>
              ))}
            </select>
          </div>

          {/* Description/Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              placeholder="Leave notes..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
            />
          </div>

          {/* Due Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Due Date
            </label>
            <input
              type="date"
              value={formData.dueDate}
              onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
            />
          </div>

          {/* Assigned To */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Task Owner
            </label>
            <select
              value={formData.assignedToId}
              onChange={(e) => setFormData({ ...formData, assignedToId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
            >
              <option value="">Select owner...</option>
              {users?.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.firstName} {user.lastName}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
              >
                {STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>{status.label}</option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Priority
              </label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
              >
                {PRIORITIES.map((priority) => (
                  <option key={priority.value} value={priority.value}>{priority.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !formData.subject}
              className="px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
            >
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEditing ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TasksTab({ opportunityId, users }) {
  const queryClient = useQueryClient();
  const [showCompleted, setShowCompleted] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  // Fetch tasks
  const { data: tasks = [], isLoading, error, refetch } = useQuery({
    queryKey: ['opportunityTasks', opportunityId, showCompleted],
    queryFn: () => tasksApi.getOpportunityTasks(opportunityId, showCompleted),
    enabled: !!opportunityId,
  });

  // Complete task mutation
  const completeMutation = useMutation({
    mutationFn: (taskId) => tasksApi.completeTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunityTasks', opportunityId]);
      setSuccessMessage('Task marked as completed');
      setTimeout(() => setSuccessMessage(''), 3000);
    },
  });

  // Delete task mutation
  const deleteMutation = useMutation({
    mutationFn: (taskId) => tasksApi.deleteTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunityTasks', opportunityId]);
      setSuccessMessage('Task deleted');
      setTimeout(() => setSuccessMessage(''), 3000);
    },
  });

  // Follow-up mutation
  const followUpMutation = useMutation({
    mutationFn: ({ taskId, data }) => tasksApi.createFollowUp(taskId, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunityTasks', opportunityId]);
      setSuccessMessage('Follow-up task created');
      setTimeout(() => setSuccessMessage(''), 3000);
    },
  });

  const handleComplete = (taskId) => {
    if (window.confirm('Mark this task as completed?')) {
      completeMutation.mutate(taskId);
    }
  };

  const handleDelete = (taskId) => {
    if (window.confirm('Are you sure you want to delete this task?')) {
      deleteMutation.mutate(taskId);
    }
  };

  const handleFollowUp = (task) => {
    // Create a follow-up task with same subject + 7 days
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);

    followUpMutation.mutate({
      taskId: task.id,
      data: {
        subject: `Follow up: ${task.subject}`,
        dueDate: dueDate.toISOString(),
        priority: task.priority,
        assignedToId: task.assignedToId,
      },
    });
  };

  const handleEdit = (task) => {
    setEditingTask(task);
    setShowModal(true);
  };

  const handleNewTask = () => {
    setEditingTask(null);
    setShowModal(true);
  };

  // Separate open vs completed tasks
  const openTasks = tasks.filter(t => t.status !== 'COMPLETED');
  const completedTasks = tasks.filter(t => t.status === 'COMPLETED');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-panda-primary animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-red-300 mx-auto mb-4" />
        <p className="text-gray-500">Failed to load tasks</p>
        <button
          onClick={() => refetch()}
          className="mt-2 text-panda-primary hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckSquare className="w-5 h-5 text-panda-primary" />
          <h3 className="font-semibold text-gray-900">Tasks</h3>
          {openTasks.length > 0 && (
            <span className="px-2 py-0.5 bg-panda-primary/10 text-panda-primary text-sm rounded-full">
              {openTasks.length} open
            </span>
          )}
        </div>
        <button
          onClick={handleNewTask}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-panda-primary to-panda-secondary text-white text-sm rounded-lg hover:opacity-90"
        >
          <Plus className="w-4 h-4" />
          New Task
        </button>
      </div>

      {/* Success message */}
      {successMessage && (
        <div className="bg-green-50 text-green-700 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
          <Check className="w-4 h-4" />
          {successMessage}
        </div>
      )}

      {/* Open Tasks */}
      {openTasks.length > 0 ? (
        <div className="space-y-3">
          {openTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onComplete={handleComplete}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onFollowUp={handleFollowUp}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 bg-gray-50 rounded-lg">
          <CheckSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No open tasks</p>
          <button
            onClick={handleNewTask}
            className="mt-2 text-panda-primary hover:underline text-sm"
          >
            Create a task
          </button>
        </div>
      )}

      {/* Completed Tasks Toggle */}
      {completedTasks.length > 0 && (
        <div className="pt-4 border-t border-gray-100">
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
          >
            {showCompleted ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {showCompleted ? 'Hide' : 'Show'} completed ({completedTasks.length})
          </button>

          {showCompleted && (
            <div className="mt-3 space-y-3">
              {completedTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onComplete={handleComplete}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onFollowUp={handleFollowUp}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Task Modal */}
      <TaskModal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditingTask(null); }}
        task={editingTask}
        opportunityId={opportunityId}
        users={users}
        onSuccess={(msg) => {
          setSuccessMessage(msg);
          setTimeout(() => setSuccessMessage(''), 3000);
        }}
      />
    </div>
  );
}
