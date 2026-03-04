import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Building2,
  MapPin,
  Phone,
  Mail,
  Calendar,
  Clock,
  CheckCircle,
  Circle,
  AlertTriangle,
  AlertCircle,
  FileText,
  DollarSign,
  Briefcase,
  Upload,
  User,
  Shield,
  ChevronRight,
  Loader2,
  CheckSquare,
  XCircle,
  Camera,
  Star,
  X,
  Users,
  MessageSquare,
  Send,
  Plus,
  Edit2,
  Trash2,
  Image,
  FolderOpen,
  TrendingUp,
  Eye,
  Download,
  Tag,
} from 'lucide-react';
import { subcontractorPortalApi } from '../services/api';

// Compliance status colors
const complianceColors = {
  valid: 'bg-green-100 text-green-700',
  expiring: 'bg-yellow-100 text-yellow-700',
  expired: 'bg-red-100 text-red-700',
  missing: 'bg-gray-100 text-gray-500',
};

const complianceIcons = {
  valid: CheckCircle,
  expiring: AlertTriangle,
  expired: XCircle,
  missing: Circle,
};

// Work order status colors
const statusColors = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  ACCEPTED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-indigo-100 text-indigo-700',
  PENDING_REVIEW: 'bg-purple-100 text-purple-700',
  APPROVED: 'bg-green-100 text-green-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  DECLINED: 'bg-red-100 text-red-700',
  COMPLETED: 'bg-green-100 text-green-700',
};

// Crew Modal Component
function CrewModal({ crew, onClose, onSave, isLoading, trades }) {
  const [formData, setFormData] = useState({
    name: crew?.name || '',
    foremanName: crew?.foremanName || '',
    foremanPhone: crew?.foremanPhone || '',
    memberCount: crew?.memberCount || 2,
    specialties: crew?.specialties || [],
    isActive: crew?.isActive ?? true,
    notes: crew?.notes || '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  const toggleSpecialty = (trade) => {
    setFormData((prev) => ({
      ...prev,
      specialties: prev.specialties.includes(trade)
        ? prev.specialties.filter((t) => t !== trade)
        : [...prev.specialties, trade],
    }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {crew ? 'Edit Crew' : 'Add New Crew'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Crew Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., Roofing Crew Alpha"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Foreman Name
              </label>
              <input
                type="text"
                value={formData.foremanName}
                onChange={(e) => setFormData({ ...formData, foremanName: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Foreman Phone
              </label>
              <input
                type="tel"
                value={formData.foremanPhone}
                onChange={(e) => setFormData({ ...formData, foremanPhone: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Team Size
            </label>
            <input
              type="number"
              min="1"
              max="20"
              value={formData.memberCount}
              onChange={(e) => setFormData({ ...formData, memberCount: parseInt(e.target.value) })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Specialties
            </label>
            <div className="flex flex-wrap gap-2">
              {trades.map((trade) => (
                <button
                  key={trade}
                  type="button"
                  onClick={() => toggleSpecialty(trade)}
                  className={`px-3 py-1 rounded-full text-sm transition-colors ${
                    formData.specialties.includes(trade)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {trade}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Additional notes about this crew..."
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="isActive" className="ml-2 text-sm text-gray-700">
              Crew is active and available for assignments
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !formData.name}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? 'Saving...' : crew ? 'Update Crew' : 'Add Crew'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Invoice Modal Component
function InvoiceModal({ workOrders, onClose, onCreate, isLoading }) {
  const [formData, setFormData] = useState({
    laborOrderId: '',
    description: '',
    laborHours: '',
    laborRate: '',
    materialsCost: '',
    otherCosts: '',
    notes: '',
  });

  const selectedOrder = workOrders.find((w) => w.id === formData.laborOrderId);

  const calculateTotal = () => {
    const labor = (parseFloat(formData.laborHours) || 0) * (parseFloat(formData.laborRate) || 0);
    const materials = parseFloat(formData.materialsCost) || 0;
    const other = parseFloat(formData.otherCosts) || 0;
    return labor + materials + other;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onCreate({
      ...formData,
      laborHours: parseFloat(formData.laborHours) || 0,
      laborRate: parseFloat(formData.laborRate) || 0,
      materialsCost: parseFloat(formData.materialsCost) || 0,
      otherCosts: parseFloat(formData.otherCosts) || 0,
      totalAmount: calculateTotal(),
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Create Invoice</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Work Order *
            </label>
            <select
              value={formData.laborOrderId}
              onChange={(e) => setFormData({ ...formData, laborOrderId: e.target.value })}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select a completed work order</option>
              {workOrders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.laborOrderNumber} - {order.job?.name}
                </option>
              ))}
            </select>
          </div>

          {selectedOrder && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm">
              <p className="font-medium text-gray-900">{selectedOrder.job?.name}</p>
              <p className="text-gray-500">{selectedOrder.workDescription}</p>
              {selectedOrder.totalCost && (
                <p className="text-gray-600 mt-1">
                  Agreed Amount: <span className="font-medium">${Number(selectedOrder.totalCost).toLocaleString()}</span>
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Work completed..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Labor Hours
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={formData.laborHours}
                onChange={(e) => setFormData({ ...formData, laborHours: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hourly Rate ($)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.laborRate}
                onChange={(e) => setFormData({ ...formData, laborRate: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Materials Cost ($)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.materialsCost}
                onChange={(e) => setFormData({ ...formData, materialsCost: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Other Costs ($)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.otherCosts}
                onChange={(e) => setFormData({ ...formData, otherCosts: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Additional notes..."
            />
          </div>

          {/* Total */}
          <div className="bg-blue-50 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-700">Invoice Total</span>
              <span className="text-2xl font-bold text-blue-700">
                ${calculateTotal().toLocaleString()}
              </span>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !formData.laborOrderId}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? 'Creating...' : 'Create Draft Invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SubcontractorPortal() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [subcontractor, setSubcontractor] = useState(null);
  const [activeTab, setActiveTab] = useState('work');
  const [workOrders, setWorkOrders] = useState([]);
  const [payments, setPayments] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  // New state for crews, invoices, and messages
  const [crews, setCrews] = useState([]);
  const [invoices, setInvoices] = useState(null);
  const [messages, setMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showCrewModal, setShowCrewModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [editingCrew, setEditingCrew] = useState(null);
  const [selectedMessageOrder, setSelectedMessageOrder] = useState(null);
  const [newMessage, setNewMessage] = useState('');

  // State for photos, documents, and rates
  const [photos, setPhotos] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [rates, setRates] = useState([]);
  const [standardPricing, setStandardPricing] = useState([]);
  const [rateChangeRequests, setRateChangeRequests] = useState([]);
  const [showPhotoUploadModal, setShowPhotoUploadModal] = useState(false);
  const [showDocumentUploadModal, setShowDocumentUploadModal] = useState(false);
  const [showRateRequestModal, setShowRateRequestModal] = useState(false);
  const [selectedPhotoOrder, setSelectedPhotoOrder] = useState(null);
  const [selectedDocOrder, setSelectedDocOrder] = useState(null);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  // Load portal data
  useEffect(() => {
    async function loadData() {
      if (!token) {
        setError('Invalid portal link');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const [portalRes, workRes] = await Promise.all([
          subcontractorPortalApi.getPortal(token),
          subcontractorPortalApi.getWorkOrders(token),
        ]);

        if (portalRes.success) {
          setSubcontractor(portalRes.data);
        }
        if (workRes.success) {
          setWorkOrders(workRes.data);
        }
      } catch (err) {
        console.error('Error loading portal:', err);
        setError(err.response?.data?.error?.message || 'Unable to load portal');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [token]);

  // Load payments when switching to payments tab
  useEffect(() => {
    async function loadPayments() {
      if (activeTab !== 'payments' || payments) return;
      try {
        const res = await subcontractorPortalApi.getPayments(token);
        if (res.success) {
          setPayments(res.data);
        }
      } catch (err) {
        console.error('Error loading payments:', err);
      }
    }
    loadPayments();
  }, [activeTab, token, payments]);

  // Load crews when switching to crews tab
  useEffect(() => {
    async function loadCrews() {
      if (activeTab !== 'crews') return;
      try {
        const res = await subcontractorPortalApi.getCrews(token);
        if (res.success) {
          setCrews(res.data);
        }
      } catch (err) {
        console.error('Error loading crews:', err);
      }
    }
    loadCrews();
  }, [activeTab, token]);

  // Load invoices when switching to invoices tab
  useEffect(() => {
    async function loadInvoices() {
      if (activeTab !== 'invoices' || invoices) return;
      try {
        const res = await subcontractorPortalApi.getInvoices(token);
        if (res.success) {
          setInvoices(res.data);
        }
      } catch (err) {
        console.error('Error loading invoices:', err);
      }
    }
    loadInvoices();
  }, [activeTab, token, invoices]);

  // Load unread message count
  useEffect(() => {
    async function loadUnreadCount() {
      try {
        const res = await subcontractorPortalApi.getUnreadCount(token);
        if (res.success) {
          setUnreadCount(res.data.count || 0);
        }
      } catch (err) {
        console.error('Error loading unread count:', err);
      }
    }
    if (token) loadUnreadCount();
  }, [token]);

  // Load messages for selected work order
  useEffect(() => {
    async function loadMessages() {
      if (!selectedMessageOrder) return;
      try {
        const res = await subcontractorPortalApi.getMessages(token, selectedMessageOrder.id);
        if (res.success) {
          setMessages(res.data);
        }
      } catch (err) {
        console.error('Error loading messages:', err);
      }
    }
    loadMessages();
  }, [selectedMessageOrder, token]);

  // Load photos when switching to photos tab
  useEffect(() => {
    async function loadPhotos() {
      if (activeTab !== 'photos') return;
      try {
        const res = await subcontractorPortalApi.getPhotos(token);
        if (res.success) {
          setPhotos(res.data?.photos || res.data || []);
        }
      } catch (err) {
        console.error('Error loading photos:', err);
      }
    }
    loadPhotos();
  }, [activeTab, token]);

  // Load documents when switching to documents tab
  useEffect(() => {
    async function loadDocuments() {
      if (activeTab !== 'documents') return;
      try {
        // Load documents for all work orders
        const allDocs = [];
        for (const order of workOrders) {
          if (order.status !== 'PENDING') {
            try {
              const res = await subcontractorPortalApi.getWorkOrderDocuments(token, order.id);
              if (res.success) {
                const docs = res.data?.documents || res.data || [];
                allDocs.push(...docs.map(d => ({ ...d, laborOrder: order })));
              }
            } catch (e) {
              // Continue loading other documents
            }
          }
        }
        setDocuments(allDocs);
      } catch (err) {
        console.error('Error loading documents:', err);
      }
    }
    loadDocuments();
  }, [activeTab, token, workOrders]);

  // Load rates when switching to rates tab
  useEffect(() => {
    async function loadRates() {
      if (activeTab !== 'rates') return;
      try {
        const [ratesRes, standardRes, requestsRes] = await Promise.all([
          subcontractorPortalApi.getRates(token),
          subcontractorPortalApi.getStandardPricing(token),
          subcontractorPortalApi.getRateChangeRequests(token),
        ]);
        if (ratesRes.success) {
          setRates(ratesRes.data?.rates || ratesRes.data || []);
        }
        if (standardRes.success) {
          setStandardPricing(standardRes.data?.items || standardRes.data || []);
        }
        if (requestsRes.success) {
          setRateChangeRequests(requestsRes.data?.requests || requestsRes.data || []);
        }
      } catch (err) {
        console.error('Error loading rates:', err);
      }
    }
    loadRates();
  }, [activeTab, token]);

  // Handle accept/decline labor order
  const handleOrderAction = async (orderId, action, reason = null) => {
    setIsUpdating(true);
    try {
      if (action === 'accept') {
        await subcontractorPortalApi.acceptOrder(token, orderId);
      } else if (action === 'decline') {
        await subcontractorPortalApi.declineOrder(token, orderId, reason);
      } else if (action === 'complete') {
        await subcontractorPortalApi.completeOrder(token, orderId);
      }
      // Refresh work orders
      const res = await subcontractorPortalApi.getWorkOrders(token);
      if (res.success) {
        setWorkOrders(res.data);
      }
      setSelectedOrder(null);
    } catch (err) {
      console.error('Error updating order:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle crew operations
  const handleSaveCrew = async (crewData) => {
    setIsUpdating(true);
    try {
      if (editingCrew?.id) {
        await subcontractorPortalApi.updateCrew(token, editingCrew.id, crewData);
      } else {
        await subcontractorPortalApi.createCrew(token, crewData);
      }
      // Refresh crews
      const res = await subcontractorPortalApi.getCrews(token);
      if (res.success) {
        setCrews(res.data);
      }
      setShowCrewModal(false);
      setEditingCrew(null);
    } catch (err) {
      console.error('Error saving crew:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteCrew = async (crewId) => {
    if (!window.confirm('Are you sure you want to delete this crew?')) return;
    setIsUpdating(true);
    try {
      await subcontractorPortalApi.deleteCrew(token, crewId);
      const res = await subcontractorPortalApi.getCrews(token);
      if (res.success) {
        setCrews(res.data);
      }
    } catch (err) {
      console.error('Error deleting crew:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAssignCrew = async (laborOrderId, crewId) => {
    setIsUpdating(true);
    try {
      await subcontractorPortalApi.assignCrew(token, laborOrderId, crewId);
      const res = await subcontractorPortalApi.getWorkOrders(token);
      if (res.success) {
        setWorkOrders(res.data);
      }
    } catch (err) {
      console.error('Error assigning crew:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle invoice operations
  const handleCreateInvoice = async (invoiceData) => {
    setIsUpdating(true);
    try {
      await subcontractorPortalApi.createInvoice(token, invoiceData);
      const res = await subcontractorPortalApi.getInvoices(token);
      if (res.success) {
        setInvoices(res.data);
      }
      setShowInvoiceModal(false);
    } catch (err) {
      console.error('Error creating invoice:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSubmitInvoice = async (invoiceId) => {
    setIsUpdating(true);
    try {
      await subcontractorPortalApi.submitInvoice(token, invoiceId);
      const res = await subcontractorPortalApi.getInvoices(token);
      if (res.success) {
        setInvoices(res.data);
      }
    } catch (err) {
      console.error('Error submitting invoice:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle messaging
  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedMessageOrder) return;
    setIsUpdating(true);
    try {
      await subcontractorPortalApi.sendMessage(token, selectedMessageOrder.id, newMessage);
      setNewMessage('');
      // Refresh messages
      const res = await subcontractorPortalApi.getMessages(token, selectedMessageOrder.id);
      if (res.success) {
        setMessages(res.data);
      }
      // Refresh unread count
      const unreadRes = await subcontractorPortalApi.getUnreadCount(token);
      if (unreadRes.success) {
        setUnreadCount(unreadRes.data.count || 0);
      }
    } catch (err) {
      console.error('Error sending message:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle photo upload
  const handlePhotoUpload = async (files, metadata = {}) => {
    if (!selectedPhotoOrder) return;
    setIsUpdating(true);
    try {
      await subcontractorPortalApi.uploadPhotos(token, selectedPhotoOrder.id, files, metadata);
      // Refresh photos
      const res = await subcontractorPortalApi.getPhotos(token);
      if (res.success) {
        setPhotos(res.data?.photos || res.data || []);
      }
      setShowPhotoUploadModal(false);
      setSelectedPhotoOrder(null);
    } catch (err) {
      console.error('Error uploading photos:', err);
      alert('Failed to upload photos. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle photo delete
  const handleDeletePhoto = async (photoId) => {
    if (!window.confirm('Are you sure you want to delete this photo?')) return;
    setIsUpdating(true);
    try {
      await subcontractorPortalApi.deletePhoto(token, photoId);
      setPhotos(photos.filter(p => p.id !== photoId));
      setSelectedPhoto(null);
    } catch (err) {
      console.error('Error deleting photo:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle document upload
  const handleDocumentUpload = async (file, metadata = {}) => {
    if (!selectedDocOrder) return;
    setIsUpdating(true);
    try {
      await subcontractorPortalApi.uploadWorkOrderDocument(token, selectedDocOrder.id, file, metadata);
      // Refresh documents
      const allDocs = [];
      for (const order of workOrders) {
        if (order.status !== 'PENDING') {
          try {
            const res = await subcontractorPortalApi.getWorkOrderDocuments(token, order.id);
            if (res.success) {
              const docs = res.data?.documents || res.data || [];
              allDocs.push(...docs.map(d => ({ ...d, laborOrder: order })));
            }
          } catch (e) {
            // Continue
          }
        }
      }
      setDocuments(allDocs);
      setShowDocumentUploadModal(false);
      setSelectedDocOrder(null);
    } catch (err) {
      console.error('Error uploading document:', err);
      alert('Failed to upload document. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle rate change request
  const handleSubmitRateRequest = async (requestData) => {
    setIsUpdating(true);
    try {
      await subcontractorPortalApi.submitRateChangeRequest(token, requestData);
      // Refresh rate change requests
      const res = await subcontractorPortalApi.getRateChangeRequests(token);
      if (res.success) {
        setRateChangeRequests(res.data?.requests || res.data || []);
      }
      setShowRateRequestModal(false);
    } catch (err) {
      console.error('Error submitting rate request:', err);
      alert('Failed to submit rate change request. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle withdraw rate request
  const handleWithdrawRateRequest = async (requestId) => {
    if (!window.confirm('Are you sure you want to withdraw this rate change request?')) return;
    setIsUpdating(true);
    try {
      await subcontractorPortalApi.withdrawRateChangeRequest(token, requestId);
      // Refresh rate change requests
      const res = await subcontractorPortalApi.getRateChangeRequests(token);
      if (res.success) {
        setRateChangeRequests(res.data?.requests || res.data || []);
      }
    } catch (err) {
      console.error('Error withdrawing rate request:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle respond to counter offer
  const handleRespondToCounter = async (requestId, accept) => {
    setIsUpdating(true);
    try {
      await subcontractorPortalApi.respondToCounterOffer(token, requestId, { accept });
      // Refresh rates and requests
      const [ratesRes, requestsRes] = await Promise.all([
        subcontractorPortalApi.getRates(token),
        subcontractorPortalApi.getRateChangeRequests(token),
      ]);
      if (ratesRes.success) {
        setRates(ratesRes.data?.rates || ratesRes.data || []);
      }
      if (requestsRes.success) {
        setRateChangeRequests(requestsRes.data?.requests || requestsRes.data || []);
      }
    } catch (err) {
      console.error('Error responding to counter offer:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading your portal...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Error</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <p className="text-sm text-gray-500">
            If you believe this is an error, please contact the office.
          </p>
        </div>
      </div>
    );
  }

  const { compliance } = subcontractor || {};

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <img
                src="/panda-logo.png"
                alt="Panda Exteriors"
                className="h-10 w-auto"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
              <div>
                <h1 className="text-xl font-bold text-gray-900">Subcontractor Portal</h1>
                <p className="text-sm text-gray-500">{subcontractor?.companyName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {subcontractor?.rating > 0 && (
                <div className="flex items-center text-yellow-500">
                  <Star className="w-4 h-4 fill-current" />
                  <span className="ml-1 text-sm font-medium">{subcontractor.rating.toFixed(1)}</span>
                </div>
              )}
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                subcontractor?.status === 'APPROVED' ? 'bg-green-100 text-green-700' :
                subcontractor?.status === 'SUSPENDED' ? 'bg-red-100 text-red-700' :
                'bg-yellow-100 text-yellow-700'
              }`}>
                {subcontractor?.status}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{subcontractor?.jobsCompleted || 0}</p>
                <p className="text-xs text-gray-500">Jobs Completed</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                <Clock className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {workOrders.filter(w => w.status === 'PENDING').length}
                </p>
                <p className="text-xs text-gray-500">Pending</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  ${payments?.summary?.paidAmount?.toLocaleString() || '0'}
                </p>
                <p className="text-xs text-gray-500">Paid YTD</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  ${payments?.summary?.pendingAmount?.toLocaleString() || '0'}
                </p>
                <p className="text-xs text-gray-500">Pending Payment</p>
              </div>
            </div>
          </div>
        </div>

        {/* Compliance Status */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            <Shield className="w-5 h-5 inline mr-2" />
            Compliance Status
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Insurance */}
            <div className={`p-4 rounded-xl ${complianceColors[compliance?.insurance?.status || 'missing']}`}>
              {(() => {
                const Icon = complianceIcons[compliance?.insurance?.status || 'missing'];
                return <Icon className="w-5 h-5 mb-2" />;
              })()}
              <p className="font-medium">Insurance</p>
              <p className="text-xs mt-1">
                {compliance?.insurance?.expiry
                  ? `Expires ${new Date(compliance.insurance.expiry).toLocaleDateString()}`
                  : 'Not on file'}
              </p>
            </div>

            {/* License */}
            <div className={`p-4 rounded-xl ${complianceColors[compliance?.license?.status || 'missing']}`}>
              {(() => {
                const Icon = complianceIcons[compliance?.license?.status || 'missing'];
                return <Icon className="w-5 h-5 mb-2" />;
              })()}
              <p className="font-medium">License</p>
              <p className="text-xs mt-1">
                {compliance?.license?.number || 'Not on file'}
              </p>
            </div>

            {/* W-9 */}
            <div className={`p-4 rounded-xl ${compliance?.w9?.received ? complianceColors.valid : complianceColors.missing}`}>
              {compliance?.w9?.received ? (
                <CheckCircle className="w-5 h-5 mb-2" />
              ) : (
                <Circle className="w-5 h-5 mb-2" />
              )}
              <p className="font-medium">W-9</p>
              <p className="text-xs mt-1">
                {compliance?.w9?.received ? 'On file' : 'Required'}
              </p>
            </div>

            {/* Contract */}
            <div className={`p-4 rounded-xl ${compliance?.contract?.signed ? complianceColors.valid : complianceColors.missing}`}>
              {compliance?.contract?.signed ? (
                <CheckCircle className="w-5 h-5 mb-2" />
              ) : (
                <Circle className="w-5 h-5 mb-2" />
              )}
              <p className="font-medium">Contract</p>
              <p className="text-xs mt-1">
                {compliance?.contract?.signed ? 'Signed' : 'Required'}
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="border-b border-gray-200">
            <div className="flex">
              {[
                { id: 'work', label: 'Work Orders', icon: Briefcase },
                { id: 'photos', label: 'Photos', icon: Camera },
                { id: 'documents', label: 'Documents', icon: FolderOpen },
                { id: 'invoices', label: 'Invoices', icon: FileText },
                { id: 'rates', label: 'Rates', icon: TrendingUp },
                { id: 'messages', label: 'Messages', icon: MessageSquare, badge: unreadCount },
                { id: 'payments', label: 'Payments', icon: DollarSign },
                { id: 'profile', label: 'Profile', icon: User },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-medium border-b-2 transition-colors relative ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  {tab.badge > 0 && (
                    <span className="absolute -top-1 -right-1 sm:relative sm:top-0 sm:right-0 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                      {tab.badge > 9 ? '9+' : tab.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="p-6">
            {/* Work Orders Tab */}
            {activeTab === 'work' && (
              <div className="space-y-4">
                {workOrders.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <Briefcase className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium">No work orders</p>
                    <p className="text-sm">Check back later for new assignments</p>
                  </div>
                ) : (
                  workOrders.map((order) => (
                    <div
                      key={order.id}
                      className="border border-gray-200 rounded-xl p-4 hover:border-blue-300 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-medium text-gray-900">
                            {order.laborOrderNumber}
                          </p>
                          <p className="text-sm text-gray-500">
                            {order.job?.jobId} - {order.job?.name}
                          </p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[order.status]}`}>
                          {order.status?.replace(/_/g, ' ')}
                        </span>
                      </div>

                      {order.job?.address && (
                        <div className="flex items-center text-sm text-gray-600 mb-2">
                          <MapPin className="w-4 h-4 mr-2" />
                          {order.job.address.street}, {order.job.address.city}
                        </div>
                      )}

                      {order.scheduledDate && (
                        <div className="flex items-center text-sm text-gray-600 mb-3">
                          <Calendar className="w-4 h-4 mr-2" />
                          {new Date(order.scheduledDate).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </div>
                      )}

                      {order.workDescription && (
                        <p className="text-sm text-gray-600 mb-3">
                          {order.workDescription}
                        </p>
                      )}

                      {/* Action Buttons */}
                      {order.status === 'PENDING' && (
                        <div className="flex gap-2 pt-2 border-t border-gray-100">
                          <button
                            onClick={() => handleOrderAction(order.id, 'accept')}
                            disabled={isUpdating}
                            className="flex-1 flex items-center justify-center gap-2 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                          >
                            <CheckSquare className="w-4 h-4" />
                            Accept
                          </button>
                          <button
                            onClick={() => setSelectedOrder(order)}
                            disabled={isUpdating}
                            className="flex-1 flex items-center justify-center gap-2 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
                          >
                            <X className="w-4 h-4" />
                            Decline
                          </button>
                        </div>
                      )}

                      {(order.status === 'ACCEPTED' || order.status === 'IN_PROGRESS') && (
                        <div className="flex gap-2 pt-2 border-t border-gray-100">
                          <button
                            onClick={() => handleOrderAction(order.id, 'complete')}
                            disabled={isUpdating}
                            className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                          >
                            <CheckCircle className="w-4 h-4" />
                            Mark Complete
                          </button>
                        </div>
                      )}

                      {order.totalCost && (
                        <div className="flex items-center justify-between pt-3 border-t border-gray-100 mt-3">
                          <span className="text-sm text-gray-500">Amount</span>
                          <span className="font-bold text-gray-900">
                            ${Number(order.totalCost).toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Payments Tab */}
            {activeTab === 'payments' && (
              <div>
                {/* Summary */}
                {payments?.summary && (
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-green-50 rounded-xl p-4">
                      <p className="text-sm text-green-600 font-medium">Paid to Date</p>
                      <p className="text-2xl font-bold text-green-700">
                        ${payments.summary.paidAmount?.toLocaleString() || '0'}
                      </p>
                    </div>
                    <div className="bg-yellow-50 rounded-xl p-4">
                      <p className="text-sm text-yellow-600 font-medium">Pending Payment</p>
                      <p className="text-2xl font-bold text-yellow-700">
                        ${payments.summary.pendingAmount?.toLocaleString() || '0'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Payment List */}
                <div className="space-y-3">
                  {payments?.payments?.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <DollarSign className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                      <p>No payment history yet</p>
                    </div>
                  ) : (
                    payments?.payments?.map((payment) => (
                      <div
                        key={payment.id}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                      >
                        <div>
                          <p className="font-medium text-gray-900">
                            {payment.laborOrderNumber}
                          </p>
                          <p className="text-sm text-gray-500">
                            {payment.jobId} - {payment.jobName}
                          </p>
                          <p className="text-xs text-gray-400">
                            {payment.completedDate && new Date(payment.completedDate).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-gray-900">
                            ${Number(payment.amount || 0).toLocaleString()}
                          </p>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            payment.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {payment.status}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Crews Tab */}
            {activeTab === 'crews' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">Your Crews</h3>
                  <button
                    onClick={() => {
                      setEditingCrew(null);
                      setShowCrewModal(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                  >
                    <Plus className="w-4 h-4" />
                    Add Crew
                  </button>
                </div>

                {crews.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium">No crews configured</p>
                    <p className="text-sm">Add your crews to assign them to work orders</p>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {crews.map((crew) => (
                      <div
                        key={crew.id}
                        className="border border-gray-200 rounded-xl p-4 hover:border-blue-300 transition-colors"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-medium text-gray-900">{crew.name}</p>
                            {crew.foremanName && (
                              <p className="text-sm text-gray-500">Foreman: {crew.foremanName}</p>
                            )}
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            crew.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {crew.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>

                        <div className="flex items-center text-sm text-gray-600 mb-2">
                          <Users className="w-4 h-4 mr-2" />
                          {crew.memberCount || 0} members
                        </div>

                        {crew.specialties?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {crew.specialties.map((spec, i) => (
                              <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded-full">
                                {spec}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="flex gap-2 pt-2 border-t border-gray-100">
                          <button
                            onClick={() => {
                              setEditingCrew(crew);
                              setShowCrewModal(true);
                            }}
                            className="flex-1 flex items-center justify-center gap-2 py-2 text-gray-600 hover:bg-gray-50 rounded-lg text-sm"
                          >
                            <Edit2 className="w-4 h-4" />
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteCrew(crew.id)}
                            disabled={isUpdating}
                            className="flex-1 flex items-center justify-center gap-2 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Invoices Tab */}
            {activeTab === 'invoices' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">Invoices</h3>
                  <button
                    onClick={() => setShowInvoiceModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                  >
                    <Plus className="w-4 h-4" />
                    Create Invoice
                  </button>
                </div>

                {/* Invoice Stats */}
                {invoices?.summary && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-gray-50 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-gray-900">{invoices.summary.total || 0}</p>
                      <p className="text-xs text-gray-500">Total</p>
                    </div>
                    <div className="bg-yellow-50 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-yellow-700">{invoices.summary.draft || 0}</p>
                      <p className="text-xs text-gray-500">Draft</p>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-blue-700">{invoices.summary.submitted || 0}</p>
                      <p className="text-xs text-gray-500">Submitted</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-green-700">${(invoices.summary.paidAmount || 0).toLocaleString()}</p>
                      <p className="text-xs text-gray-500">Paid</p>
                    </div>
                  </div>
                )}

                {/* Invoice List */}
                <div className="space-y-3">
                  {!invoices?.invoices || invoices.invoices.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p className="font-medium">No invoices yet</p>
                      <p className="text-sm">Create an invoice for completed work orders</p>
                    </div>
                  ) : (
                    invoices.invoices.map((invoice) => (
                      <div
                        key={invoice.id}
                        className="border border-gray-200 rounded-xl p-4"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-medium text-gray-900">{invoice.invoiceNumber}</p>
                            <p className="text-sm text-gray-500">{invoice.laborOrder?.laborOrderNumber}</p>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            invoice.status === 'PAID' ? 'bg-green-100 text-green-700' :
                            invoice.status === 'APPROVED' ? 'bg-blue-100 text-blue-700' :
                            invoice.status === 'SUBMITTED' ? 'bg-yellow-100 text-yellow-700' :
                            invoice.status === 'DECLINED' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-500'
                          }`}>
                            {invoice.status}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-sm mb-3">
                          <span className="text-gray-500">
                            {new Date(invoice.createdAt).toLocaleDateString()}
                          </span>
                          <span className="font-bold text-gray-900">
                            ${Number(invoice.totalAmount || 0).toLocaleString()}
                          </span>
                        </div>

                        {invoice.status === 'DRAFT' && (
                          <button
                            onClick={() => handleSubmitInvoice(invoice.id)}
                            disabled={isUpdating}
                            className="w-full flex items-center justify-center gap-2 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                          >
                            <Send className="w-4 h-4" />
                            Submit for Review
                          </button>
                        )}

                        {invoice.status === 'DECLINED' && invoice.reviewNotes && (
                          <div className="bg-red-50 rounded-lg p-3 text-sm text-red-700">
                            <p className="font-medium">Declined: {invoice.reviewNotes}</p>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Messages Tab */}
            {activeTab === 'messages' && (
              <div>
                {!selectedMessageOrder ? (
                  // Work order list for messages
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Select a Work Order</h3>
                    {workOrders.filter(w => w.status !== 'PENDING').length === 0 ? (
                      <div className="text-center py-12 text-gray-500">
                        <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                        <p className="font-medium">No active work orders</p>
                        <p className="text-sm">Messages will be available after accepting work orders</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {workOrders
                          .filter(w => w.status !== 'PENDING')
                          .map((order) => (
                            <button
                              key={order.id}
                              onClick={() => setSelectedMessageOrder(order)}
                              className="w-full text-left border border-gray-200 rounded-xl p-4 hover:border-blue-300 transition-colors"
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium text-gray-900">{order.laborOrderNumber}</p>
                                  <p className="text-sm text-gray-500">{order.job?.name}</p>
                                </div>
                                <ChevronRight className="w-5 h-5 text-gray-400" />
                              </div>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                ) : (
                  // Message thread view
                  <div>
                    <button
                      onClick={() => {
                        setSelectedMessageOrder(null);
                        setMessages([]);
                      }}
                      className="flex items-center text-blue-600 hover:text-blue-700 mb-4"
                    >
                      <ChevronRight className="w-4 h-4 rotate-180 mr-1" />
                      Back to work orders
                    </button>

                    <div className="bg-gray-50 rounded-xl p-4 mb-4">
                      <p className="font-medium text-gray-900">{selectedMessageOrder.laborOrderNumber}</p>
                      <p className="text-sm text-gray-500">{selectedMessageOrder.job?.name}</p>
                    </div>

                    {/* Messages list */}
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <div className="h-80 overflow-y-auto p-4 space-y-4 bg-white">
                        {messages.length === 0 ? (
                          <div className="text-center py-12 text-gray-500">
                            <MessageSquare className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                            <p className="text-sm">No messages yet. Start a conversation!</p>
                          </div>
                        ) : (
                          messages.map((msg) => (
                            <div
                              key={msg.id}
                              className={`flex ${msg.senderType === 'SUBCONTRACTOR' ? 'justify-end' : 'justify-start'}`}
                            >
                              <div
                                className={`max-w-[80%] rounded-xl px-4 py-2 ${
                                  msg.senderType === 'SUBCONTRACTOR'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 text-gray-900'
                                }`}
                              >
                                <p className="text-sm">{msg.message}</p>
                                <p className={`text-xs mt-1 ${
                                  msg.senderType === 'SUBCONTRACTOR' ? 'text-blue-200' : 'text-gray-400'
                                }`}>
                                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Message input */}
                      <div className="border-t border-gray-200 p-4 bg-gray-50">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                            placeholder="Type a message..."
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                          <button
                            onClick={handleSendMessage}
                            disabled={isUpdating || !newMessage.trim()}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                          >
                            <Send className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Photos Tab */}
            {activeTab === 'photos' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">Job Photos</h3>
                  <div className="flex gap-2">
                    <select
                      value={selectedPhotoOrder?.id || ''}
                      onChange={(e) => {
                        const order = workOrders.find(w => w.id === e.target.value);
                        setSelectedPhotoOrder(order);
                      }}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select work order...</option>
                      {workOrders
                        .filter(w => w.status !== 'PENDING' && w.status !== 'DECLINED')
                        .map(order => (
                          <option key={order.id} value={order.id}>
                            {order.laborOrderNumber} - {order.job?.name}
                          </option>
                        ))}
                    </select>
                    <button
                      onClick={() => selectedPhotoOrder && setShowPhotoUploadModal(true)}
                      disabled={!selectedPhotoOrder}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Upload className="w-4 h-4" />
                      Upload Photos
                    </button>
                  </div>
                </div>

                {photos.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <Camera className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium">No photos uploaded</p>
                    <p className="text-sm">Select a work order and upload photos of your work</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {photos.map((photo) => (
                      <div
                        key={photo.id}
                        className="group relative aspect-square rounded-xl overflow-hidden bg-gray-100 cursor-pointer"
                        onClick={() => setSelectedPhoto(photo)}
                      >
                        <img
                          src={photo.thumbnailUrl || photo.originalUrl || photo.url}
                          alt={photo.caption || 'Job photo'}
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="absolute bottom-0 left-0 right-0 p-3">
                            <p className="text-white text-sm font-medium truncate">
                              {photo.caption || 'No caption'}
                            </p>
                            <p className="text-white/70 text-xs">
                              {photo.laborOrder?.laborOrderNumber || photo.photoType || 'PROGRESS'}
                            </p>
                          </div>
                        </div>
                        {photo.photoType && (
                          <span className="absolute top-2 left-2 px-2 py-0.5 bg-black/50 text-white text-xs rounded-full">
                            {photo.photoType}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Documents Tab */}
            {activeTab === 'documents' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">Job Documents</h3>
                  <div className="flex gap-2">
                    <select
                      value={selectedDocOrder?.id || ''}
                      onChange={(e) => {
                        const order = workOrders.find(w => w.id === e.target.value);
                        setSelectedDocOrder(order);
                      }}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select work order...</option>
                      {workOrders
                        .filter(w => w.status !== 'PENDING' && w.status !== 'DECLINED')
                        .map(order => (
                          <option key={order.id} value={order.id}>
                            {order.laborOrderNumber} - {order.job?.name}
                          </option>
                        ))}
                    </select>
                    <button
                      onClick={() => selectedDocOrder && setShowDocumentUploadModal(true)}
                      disabled={!selectedDocOrder}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Upload className="w-4 h-4" />
                      Upload Document
                    </button>
                  </div>
                </div>

                {documents.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <FolderOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium">No documents uploaded</p>
                    <p className="text-sm">Select a work order and upload relevant documents</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                            <FileText className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{doc.title || doc.fileName}</p>
                            <p className="text-sm text-gray-500">
                              {doc.laborOrder?.laborOrderNumber} • {doc.category || 'General'}
                              {doc.fileSize && ` • ${(doc.fileSize / 1024).toFixed(0)} KB`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <a
                            href={doc.documentUrl || doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                          >
                            <Eye className="w-5 h-5" />
                          </a>
                          <a
                            href={doc.documentUrl || doc.url}
                            download
                            className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                          >
                            <Download className="w-5 h-5" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Rates Tab */}
            {activeTab === 'rates' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">Your Rates</h3>
                  <button
                    onClick={() => setShowRateRequestModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                  >
                    <Plus className="w-4 h-4" />
                    Request Rate Change
                  </button>
                </div>

                {/* Current Rates */}
                <div className="mb-8">
                  <h4 className="font-medium text-gray-700 mb-4">Current Rates</h4>
                  {rates.length === 0 ? (
                    <div className="text-center py-8 bg-gray-50 rounded-xl text-gray-500">
                      <TrendingUp className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                      <p className="text-sm">No rates configured yet</p>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {rates.map((rate) => (
                        <div
                          key={rate.id}
                          className="border border-gray-200 rounded-xl p-4 hover:border-blue-300 transition-colors"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <p className="font-medium text-gray-900">{rate.tradeType}</p>
                              <p className="text-sm text-gray-500">{rate.unit}</p>
                            </div>
                            <span className="text-lg font-bold text-blue-600">
                              ${Number(rate.rate).toFixed(2)}
                            </span>
                          </div>
                          {rate.notes && (
                            <p className="text-xs text-gray-500 mt-2">{rate.notes}</p>
                          )}
                          {rate.effectiveFrom && (
                            <p className="text-xs text-gray-400 mt-1">
                              Effective: {new Date(rate.effectiveFrom).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Rate Change Requests */}
                {rateChangeRequests.length > 0 && (
                  <div className="mb-8">
                    <h4 className="font-medium text-gray-700 mb-4">Rate Change Requests</h4>
                    <div className="space-y-3">
                      {rateChangeRequests.map((request) => (
                        <div
                          key={request.id}
                          className="border border-gray-200 rounded-xl p-4"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <p className="font-medium text-gray-900">{request.tradeType}</p>
                              <div className="flex items-center gap-2 text-sm">
                                <span className="text-gray-500">
                                  ${Number(request.currentRate).toFixed(2)}
                                </span>
                                <ChevronRight className="w-4 h-4 text-gray-400" />
                                <span className="font-medium text-blue-600">
                                  ${Number(request.requestedRate).toFixed(2)}
                                </span>
                              </div>
                            </div>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              request.status === 'APPROVED' ? 'bg-green-100 text-green-700' :
                              request.status === 'DECLINED' ? 'bg-red-100 text-red-700' :
                              request.status === 'COUNTER_OFFERED' ? 'bg-purple-100 text-purple-700' :
                              request.status === 'WITHDRAWN' ? 'bg-gray-100 text-gray-500' :
                              'bg-yellow-100 text-yellow-700'
                            }`}>
                              {request.status?.replace(/_/g, ' ')}
                            </span>
                          </div>

                          <p className="text-sm text-gray-600 mb-3">{request.justification}</p>

                          {/* Counter Offer */}
                          {request.status === 'COUNTER_OFFERED' && request.counterOffer && (
                            <div className="bg-purple-50 rounded-lg p-3 mb-3">
                              <p className="text-sm font-medium text-purple-700">
                                Counter Offer: ${Number(request.counterOffer).toFixed(2)} {request.unit}
                              </p>
                              {request.reviewNotes && (
                                <p className="text-xs text-purple-600 mt-1">{request.reviewNotes}</p>
                              )}
                              <div className="flex gap-2 mt-3">
                                <button
                                  onClick={() => handleRespondToCounter(request.id, true)}
                                  disabled={isUpdating}
                                  className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                                >
                                  Accept
                                </button>
                                <button
                                  onClick={() => handleRespondToCounter(request.id, false)}
                                  disabled={isUpdating}
                                  className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
                                >
                                  Decline
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Decline notes */}
                          {request.status === 'DECLINED' && request.reviewNotes && (
                            <div className="bg-red-50 rounded-lg p-3 text-sm text-red-700">
                              {request.reviewNotes}
                            </div>
                          )}

                          {/* Withdraw button for pending requests */}
                          {(request.status === 'PENDING' || request.status === 'UNDER_REVIEW') && (
                            <button
                              onClick={() => handleWithdrawRateRequest(request.id)}
                              disabled={isUpdating}
                              className="text-sm text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
                            >
                              Withdraw Request
                            </button>
                          )}

                          <p className="text-xs text-gray-400 mt-2">
                            Submitted: {new Date(request.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Standard Pricing Reference */}
                {standardPricing.length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-700 mb-4">Standard Pricing Reference</h4>
                    <div className="bg-gray-50 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="text-left px-4 py-3 font-medium text-gray-700">Category</th>
                            <th className="text-left px-4 py-3 font-medium text-gray-700">Service Item</th>
                            <th className="text-right px-4 py-3 font-medium text-gray-700">Price</th>
                            <th className="text-left px-4 py-3 font-medium text-gray-700">Unit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {standardPricing.map((item) => (
                            <tr key={item.id} className="hover:bg-gray-100">
                              <td className="px-4 py-3 text-gray-600">{item.category}</td>
                              <td className="px-4 py-3 text-gray-900">{item.serviceItem}</td>
                              <td className="px-4 py-3 text-right font-medium text-gray-900">
                                ${Number(item.price).toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-gray-500">{item.unit}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Company Information</h4>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex items-center text-gray-600">
                      <Building2 className="w-4 h-4 mr-3 text-gray-400" />
                      <span>{subcontractor?.companyName}</span>
                    </div>
                    <div className="flex items-center text-gray-600">
                      <User className="w-4 h-4 mr-3 text-gray-400" />
                      <span>{subcontractor?.contactName || '-'}</span>
                    </div>
                    <div className="flex items-center text-gray-600">
                      <Phone className="w-4 h-4 mr-3 text-gray-400" />
                      <a href={`tel:${subcontractor?.phone}`} className="text-blue-600 hover:underline">
                        {subcontractor?.phone || '-'}
                      </a>
                    </div>
                    <div className="flex items-center text-gray-600">
                      <Mail className="w-4 h-4 mr-3 text-gray-400" />
                      <a href={`mailto:${subcontractor?.email}`} className="text-blue-600 hover:underline">
                        {subcontractor?.email || '-'}
                      </a>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Trades & Service Areas</h4>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {subcontractor?.trades?.map((trade, i) => (
                      <span key={i} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                        {trade}
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {subcontractor?.serviceAreas?.map((area, i) => (
                      <span key={i} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                        {area}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Decline Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Decline Work Order
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Please provide a reason for declining this assignment.
            </p>
            <textarea
              id="declineReason"
              placeholder="Reason for declining..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg mb-4"
              rows={3}
            />
            <div className="flex gap-3">
              <button
                onClick={() => setSelectedOrder(null)}
                className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const reason = document.getElementById('declineReason').value;
                  handleOrderAction(selectedOrder.id, 'decline', reason);
                }}
                disabled={isUpdating}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50"
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Crew Modal */}
      {showCrewModal && (
        <CrewModal
          crew={editingCrew}
          onClose={() => {
            setShowCrewModal(false);
            setEditingCrew(null);
          }}
          onSave={handleSaveCrew}
          isLoading={isUpdating}
          trades={subcontractor?.trades || []}
        />
      )}

      {/* Invoice Modal */}
      {showInvoiceModal && (
        <InvoiceModal
          workOrders={workOrders.filter(w => ['COMPLETED', 'PENDING_REVIEW'].includes(w.status))}
          onClose={() => setShowInvoiceModal(false)}
          onCreate={handleCreateInvoice}
          isLoading={isUpdating}
        />
      )}

      {/* Photo Upload Modal */}
      {showPhotoUploadModal && selectedPhotoOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Upload Photos</h3>
              <button
                onClick={() => {
                  setShowPhotoUploadModal(false);
                  setSelectedPhotoOrder(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600">
                Uploading to: <span className="font-medium">{selectedPhotoOrder.laborOrderNumber}</span>
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const files = formData.getAll('photos');
                const photoType = formData.get('photoType');
                const caption = formData.get('caption');
                if (files.length > 0 && files[0].size > 0) {
                  handlePhotoUpload(files, { photoType, caption });
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Photo Type
                </label>
                <select
                  name="photoType"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="PROGRESS">Progress</option>
                  <option value="BEFORE">Before</option>
                  <option value="AFTER">After</option>
                  <option value="DAMAGE">Damage</option>
                  <option value="MATERIAL">Material</option>
                  <option value="DETAIL">Detail</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Caption (optional)
                </label>
                <input
                  type="text"
                  name="caption"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Describe the photo..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Photos
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center">
                  <input
                    type="file"
                    name="photos"
                    multiple
                    accept="image/*"
                    className="hidden"
                    id="photo-upload"
                    onChange={(e) => {
                      const label = e.target.parentElement.querySelector('p');
                      if (label) {
                        label.textContent = `${e.target.files.length} file(s) selected`;
                      }
                    }}
                  />
                  <label
                    htmlFor="photo-upload"
                    className="cursor-pointer"
                  >
                    <Camera className="w-10 h-10 mx-auto mb-2 text-gray-400" />
                    <p className="text-sm text-gray-600">Click to select photos</p>
                    <p className="text-xs text-gray-400 mt-1">JPG, PNG up to 10MB each</p>
                  </label>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowPhotoUploadModal(false);
                    setSelectedPhotoOrder(null);
                  }}
                  className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {isUpdating ? 'Uploading...' : 'Upload Photos'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Document Upload Modal */}
      {showDocumentUploadModal && selectedDocOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Upload Document</h3>
              <button
                onClick={() => {
                  setShowDocumentUploadModal(false);
                  setSelectedDocOrder(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600">
                Uploading to: <span className="font-medium">{selectedDocOrder.laborOrderNumber}</span>
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const file = formData.get('document');
                const title = formData.get('title');
                const category = formData.get('category');
                if (file && file.size > 0) {
                  handleDocumentUpload(file, { title, category });
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Document Title
                </label>
                <input
                  type="text"
                  name="title"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Work Completion Form"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category
                </label>
                <select
                  name="category"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="work_order">Work Order</option>
                  <option value="completion">Completion Report</option>
                  <option value="warranty">Warranty</option>
                  <option value="permit">Permit</option>
                  <option value="inspection">Inspection</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Document
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center">
                  <input
                    type="file"
                    name="document"
                    required
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                    className="hidden"
                    id="doc-upload"
                    onChange={(e) => {
                      const label = e.target.parentElement.querySelector('p');
                      if (label && e.target.files[0]) {
                        label.textContent = e.target.files[0].name;
                      }
                    }}
                  />
                  <label
                    htmlFor="doc-upload"
                    className="cursor-pointer"
                  >
                    <FolderOpen className="w-10 h-10 mx-auto mb-2 text-gray-400" />
                    <p className="text-sm text-gray-600">Click to select a document</p>
                    <p className="text-xs text-gray-400 mt-1">PDF, Word, Excel, or images up to 25MB</p>
                  </label>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowDocumentUploadModal(false);
                    setSelectedDocOrder(null);
                  }}
                  className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {isUpdating ? 'Uploading...' : 'Upload Document'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rate Request Modal */}
      {showRateRequestModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Request Rate Change</h3>
              <button
                onClick={() => setShowRateRequestModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                handleSubmitRateRequest({
                  tradeType: formData.get('tradeType'),
                  currentRate: parseFloat(formData.get('currentRate')) || 0,
                  requestedRate: parseFloat(formData.get('requestedRate')),
                  unit: formData.get('unit'),
                  justification: formData.get('justification'),
                  effectiveDate: formData.get('effectiveDate'),
                  rateId: formData.get('rateId') || null,
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Existing Rate (optional)
                </label>
                <select
                  name="rateId"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  onChange={(e) => {
                    const selectedRate = rates.find(r => r.id === e.target.value);
                    if (selectedRate) {
                      const form = e.target.form;
                      form.tradeType.value = selectedRate.tradeType;
                      form.currentRate.value = selectedRate.rate;
                      form.unit.value = selectedRate.unit;
                    }
                  }}
                >
                  <option value="">-- New Rate Request --</option>
                  {rates.map(rate => (
                    <option key={rate.id} value={rate.id}>
                      {rate.tradeType} - ${Number(rate.rate).toFixed(2)} {rate.unit}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Trade Type *
                </label>
                <input
                  type="text"
                  name="tradeType"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Shingle Base"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Current Rate ($)
                  </label>
                  <input
                    type="number"
                    name="currentRate"
                    step="0.01"
                    min="0"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Requested Rate ($) *
                  </label>
                  <input
                    type="number"
                    name="requestedRate"
                    required
                    step="0.01"
                    min="0"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Unit *
                </label>
                <select
                  name="unit"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Per SQ">Per SQ</option>
                  <option value="Per LF">Per LF (Linear Foot)</option>
                  <option value="Per Unit">Per Unit</option>
                  <option value="Per Sheet">Per Sheet</option>
                  <option value="Per Job">Per Job</option>
                  <option value="Hourly">Hourly</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Requested Effective Date *
                </label>
                <input
                  type="date"
                  name="effectiveDate"
                  required
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Justification *
                </label>
                <textarea
                  name="justification"
                  required
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Explain why you're requesting this rate change (e.g., increased material costs, additional expertise required, market rate adjustment)..."
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowRateRequestModal(false)}
                  className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {isUpdating ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Photo Lightbox */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="relative max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute -top-12 right-0 text-white hover:text-gray-300"
            >
              <X className="w-8 h-8" />
            </button>
            <img
              src={selectedPhoto.originalUrl || selectedPhoto.url}
              alt={selectedPhoto.caption || 'Job photo'}
              className="w-full h-auto max-h-[80vh] object-contain rounded-lg"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 rounded-b-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-medium">{selectedPhoto.caption || 'No caption'}</p>
                  <p className="text-white/70 text-sm">
                    {selectedPhoto.laborOrder?.laborOrderNumber} • {selectedPhoto.photoType || 'PROGRESS'}
                  </p>
                </div>
                <button
                  onClick={() => handleDeletePhoto(selectedPhoto.id)}
                  disabled={isUpdating}
                  className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-6xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <p className="text-center text-gray-500 text-sm">
            Need help? Contact us at{' '}
            <a href="tel:+1-555-123-4567" className="text-blue-600">
              (555) 123-4567
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
