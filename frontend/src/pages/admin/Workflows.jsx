import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Search,
  Filter,
  MoreVertical,
  Play,
  Pause,
  Copy,
  Trash2,
  Edit,
  AlertCircle,
  CheckCircle,
  Clock,
  Zap,
} from 'lucide-react';
import api from '../../services/api';

const triggerObjects = [
  { value: 'Opportunity', label: 'Job' },
  { value: 'Account', label: 'Account' },
  { value: 'Lead', label: 'Lead' },
  { value: 'Contact', label: 'Contact' },
  { value: 'Invoice', label: 'Invoice' },
  { value: 'ServiceAppointment', label: 'Service Appointment' },
];

const triggerEvents = [
  { value: 'CREATE', label: 'Record Created' },
  { value: 'UPDATE', label: 'Record Updated' },
  { value: 'FIELD_CHANGE', label: 'Field Changed' },
  { value: 'SCHEDULED', label: 'Scheduled Time' },
];

export default function Workflows() {
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterObject, setFilterObject] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);

  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = async () => {
    try {
      // const response = await api.get('/workflows');
      // setWorkflows(response.data);
      // Mock data for now
      setWorkflows([
        {
          id: '1',
          name: 'Send Welcome SMS on Contract Signed',
          triggerObject: 'Opportunity',
          triggerEvent: 'FIELD_CHANGE',
          isActive: true,
          executionCount: 156,
          lastExecutedAt: new Date().toISOString(),
          actionsCount: 3,
        },
        {
          id: '2',
          name: 'Create Commission on Quote Accepted',
          triggerObject: 'ServiceContract',
          triggerEvent: 'CREATE',
          isActive: true,
          executionCount: 89,
          lastExecutedAt: new Date().toISOString(),
          actionsCount: 2,
        },
        {
          id: '3',
          name: 'Schedule Follow-up Task',
          triggerObject: 'Lead',
          triggerEvent: 'UPDATE',
          isActive: false,
          executionCount: 234,
          lastExecutedAt: new Date(Date.now() - 86400000).toISOString(),
          actionsCount: 1,
        },
      ]);
    } catch (error) {
      console.error('Failed to load workflows:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleWorkflowStatus = async (workflowId, currentStatus) => {
    try {
      // await api.patch(`/workflows/${workflowId}`, { isActive: !currentStatus });
      setWorkflows(workflows.map(w =>
        w.id === workflowId ? { ...w, isActive: !currentStatus } : w
      ));
    } catch (error) {
      console.error('Failed to toggle workflow:', error);
    }
  };

  const filteredWorkflows = workflows.filter(workflow => {
    const matchesSearch = workflow.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesObject = !filterObject || workflow.triggerObject === filterObject;
    const matchesStatus = !filterStatus ||
      (filterStatus === 'active' && workflow.isActive) ||
      (filterStatus === 'inactive' && !workflow.isActive);
    return matchesSearch && matchesObject && matchesStatus;
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Workflow Automation</h1>
          <p className="text-sm text-gray-500 mt-1">
            Automate your business processes with triggers and actions
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center justify-center px-4 py-2.5 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-5 h-5 mr-2" />
          <span>Create Workflow</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Zap className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{workflows.length}</p>
              <p className="text-xs text-gray-500">Total Workflows</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {workflows.filter(w => w.isActive).length}
              </p>
              <p className="text-xs text-gray-500">Active</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {workflows.reduce((sum, w) => sum + w.executionCount, 0)}
              </p>
              <p className="text-xs text-gray-500">Executions</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <AlertCircle className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">0</p>
              <p className="text-xs text-gray-500">Errors Today</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search workflows..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
            />
          </div>
          <select
            value={filterObject}
            onChange={(e) => setFilterObject(e.target.value)}
            className="px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
          >
            <option value="">All Objects</option>
            {triggerObjects.map(obj => (
              <option key={obj.value} value={obj.value}>{obj.label}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Workflows List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-panda-primary border-t-transparent rounded-full mx-auto" />
          </div>
        ) : filteredWorkflows.length === 0 ? (
          <div className="p-8 text-center">
            <Zap className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No workflows found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredWorkflows.map((workflow) => (
              <div
                key={workflow.id}
                className="p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-gray-900 truncate">
                        {workflow.name}
                      </h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        workflow.isActive
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {workflow.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                      <span>
                        <strong>Trigger:</strong> {workflow.triggerObject} - {workflow.triggerEvent}
                      </span>
                      <span>
                        <strong>Actions:</strong> {workflow.actionsCount}
                      </span>
                      <span>
                        <strong>Runs:</strong> {workflow.executionCount}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleWorkflowStatus(workflow.id, workflow.isActive)}
                      className={`p-2 rounded-lg transition-colors ${
                        workflow.isActive
                          ? 'text-orange-600 hover:bg-orange-50'
                          : 'text-green-600 hover:bg-green-50'
                      }`}
                      title={workflow.isActive ? 'Deactivate' : 'Activate'}
                    >
                      {workflow.isActive ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                    </button>
                    <button
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                      title="Edit"
                    >
                      <Edit className="w-5 h-5" />
                    </button>
                    <button
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                      title="Duplicate"
                    >
                      <Copy className="w-5 h-5" />
                    </button>
                    <button
                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      title="Delete"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
