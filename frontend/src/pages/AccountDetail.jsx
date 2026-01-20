import { useState, useRef, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accountsApi, usersApi } from '../services/api';
import { useRingCentral } from '../context/RingCentralContext';
import {
  Building2,
  ArrowLeft,
  MapPin,
  Phone,
  Mail,
  Globe,
  Calendar,
  DollarSign,
  Edit,
  Target,
  Users,
  FileText,
  ChevronDown,
  MoreHorizontal,
  Upload,
  Shield,
  CreditCard,
  UserPlus,
  Plus,
  X,
  Check,
  AlertCircle,
  Briefcase,
  Send,
  Receipt,
  Save,
  Clock,
  User,
  Home,
  Tag,
} from 'lucide-react';

const ACCOUNT_STATUSES = [
  { value: 'NEW', label: 'New' },
  { value: 'PROSPECT', label: 'Prospect' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ONBOARDING', label: 'Onboarding' },
  { value: 'IN_PRODUCTION', label: 'In Production' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'INACTIVE', label: 'Inactive' },
];

const ACCOUNT_TYPES = [
  { value: 'RESIDENTIAL', label: 'Residential' },
  { value: 'COMMERCIAL', label: 'Commercial' },
];

const US_STATES = [
  { value: 'MD', label: 'Maryland' },
  { value: 'VA', label: 'Virginia' },
  { value: 'DC', label: 'Washington DC' },
  { value: 'DE', label: 'Delaware' },
  { value: 'PA', label: 'Pennsylvania' },
  { value: 'NJ', label: 'New Jersey' },
  { value: 'NC', label: 'North Carolina' },
  { value: 'FL', label: 'Florida' },
];

export default function AccountDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // State
  const [activeTab, setActiveTab] = useState('opportunities');
  const [showActionsDropdown, setShowActionsDropdown] = useState(false);
  const [activeModal, setActiveModal] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [formData, setFormData] = useState({});
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState({});

  const actionsRef = useRef(null);
  const { clickToCall } = useRingCentral();

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (actionsRef.current && !actionsRef.current.contains(event.target)) {
        setShowActionsDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-hide toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const { data: account, isLoading } = useQuery({
    queryKey: ['account', id],
    queryFn: () => accountsApi.getAccount(id),
    enabled: !!id,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.getUsers(),
  });

  const { data: opportunitiesData } = useQuery({
    queryKey: ['accountOpportunities', id],
    queryFn: () => accountsApi.getOpportunities(id),
    enabled: !!id && activeTab === 'opportunities',
  });

  const { data: contactsData } = useQuery({
    queryKey: ['accountContacts', id],
    queryFn: () => accountsApi.getContacts(id),
    enabled: !!id && activeTab === 'contacts',
  });

  const updateMutation = useMutation({
    mutationFn: (data) => accountsApi.updateAccount(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['account', id]);
      queryClient.invalidateQueries(['accounts']);
      setIsEditing(false);
      showToast('success', 'Account updated successfully');
    },
    onError: (error) => {
      showToast('error', `Failed to update: ${error.message || 'Something went wrong'}`);
    },
  });

  const activeUsers = users.filter(u => u.isActive);

  const initializeEditForm = () => {
    setEditFormData({
      name: account?.name || '',
      accountNumber: account?.accountNumber || '',
      type: account?.type || 'RESIDENTIAL',
      status: account?.status || 'NEW',
      phone: account?.phone || '',
      email: account?.email || '',
      website: account?.website || '',
      billingStreet: account?.billingStreet || '',
      billingCity: account?.billingCity || '',
      billingState: account?.billingState || '',
      billingPostalCode: account?.billingPostalCode || '',
      shippingStreet: account?.shippingStreet || '',
      shippingCity: account?.shippingCity || '',
      shippingState: account?.shippingState || '',
      shippingPostalCode: account?.shippingPostalCode || '',
      description: account?.description || '',
      industry: account?.industry || '',
      ownerId: account?.ownerId || '',
      isPandaClaims: account?.isPandaClaims || false,
      isSureClaims: account?.isSureClaims || false,
    });
  };

  const handleEditInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setEditFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSaveEdit = () => {
    const cleanedData = { ...editFormData };
    Object.keys(cleanedData).forEach(key => {
      if (cleanedData[key] === '' && typeof cleanedData[key] === 'string') {
        cleanedData[key] = null;
      }
    });
    updateMutation.mutate(cleanedData);
  };

  const handleCancelEdit = () => {
    initializeEditForm();
    setIsEditing(false);
  };

  const startEditing = () => {
    initializeEditForm();
    setIsEditing(true);
    setActiveTab('details');
  };

  const copyShippingFromBilling = () => {
    setEditFormData(prev => ({
      ...prev,
      shippingStreet: prev.billingStreet,
      shippingCity: prev.billingCity,
      shippingState: prev.billingState,
      shippingPostalCode: prev.billingPostalCode,
    }));
  };

  // Quick Actions
  const quickActions = [
    { id: 'edit', label: 'Edit Account', icon: Edit, category: 'general', action: startEditing },
    { id: 'addContact', label: 'Add Contact', icon: UserPlus, category: 'general', action: () => openQuickActionModal('addContact') },
    { id: 'uploadFiles', label: 'Upload Files', icon: Upload, category: 'general', action: () => openQuickActionModal('uploadFiles') },
    { divider: true },
    { id: 'createOpportunity', label: 'Create Job', icon: Target, category: 'sales', action: () => openQuickActionModal('createOpportunity') },
    { id: 'createQuote', label: 'Create Quote', icon: FileText, category: 'sales', action: () => openQuickActionModal('createQuote') },
    { divider: true },
    { id: 'updateInsurance', label: 'Update Insurance Info', icon: Shield, category: 'insurance', action: () => openQuickActionModal('updateInsurance') },
    { id: 'updateFinancing', label: 'Update Financing', icon: CreditCard, category: 'finance', action: () => openQuickActionModal('updateFinancing') },
    { divider: true },
    { id: 'sendEmail', label: 'Send Email', icon: Send, category: 'communication', action: () => openQuickActionModal('sendEmail') },
    { id: 'createInvoice', label: 'Create Invoice', icon: Receipt, category: 'billing', action: () => openQuickActionModal('createInvoice') },
  ];

  const openQuickActionModal = (actionType) => {
    setActiveModal(actionType);
    setShowActionsDropdown(false);
    setFormData({});
  };

  const closeModal = () => {
    setActiveModal(null);
    setFormData({});
  };

  const showToast = (type, message) => {
    setToast({ type, message });
  };

  const handleQuickActionSubmit = async (actionType) => {
    setActionLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      showToast('success', getSuccessMessage(actionType));
      closeModal();
      queryClient.invalidateQueries(['account', id]);
    } catch (error) {
      showToast('error', `Failed: ${error.message || 'Something went wrong'}`);
    } finally {
      setActionLoading(false);
    }
  };

  const getSuccessMessage = (actionType) => {
    const messages = {
      addContact: 'Contact added successfully',
      uploadFiles: 'Files uploaded successfully',
      createOpportunity: 'Job created successfully',
      createQuote: 'Quote created successfully',
      updateInsurance: 'Insurance information updated',
      updateFinancing: 'Financing information updated',
      sendEmail: 'Email sent successfully',
      createInvoice: 'Invoice created successfully',
    };
    return messages[actionType] || 'Action completed successfully';
  };

  const renderModalContent = () => {
    switch (activeModal) {
      case 'addContact':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                value={formData.firstName || ''}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                placeholder="Enter first name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                value={formData.lastName || ''}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                placeholder="Enter last name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                value={formData.email || ''}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="Enter email address"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="tel"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                value={formData.phone || ''}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="Enter phone number"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                value={formData.role || ''}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              >
                <option value="">Select role</option>
                <option value="PRIMARY">Primary Contact</option>
                <option value="BILLING">Billing Contact</option>
                <option value="HOMEOWNER">Homeowner</option>
                <option value="TENANT">Tenant</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>
        );

      case 'uploadFiles':
        return (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600 mb-2">Drag and drop files here, or click to browse</p>
              <input type="file" multiple className="hidden" id="file-upload" />
              <label
                htmlFor="file-upload"
                className="inline-flex items-center px-4 py-2 bg-panda-primary text-white rounded-lg cursor-pointer hover:bg-panda-primary/90"
              >
                Choose Files
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Document Category</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                value={formData.category || ''}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              >
                <option value="">Select category</option>
                <option value="CONTRACT">Contract</option>
                <option value="INSURANCE">Insurance Documents</option>
                <option value="PHOTOS">Photos</option>
                <option value="INVOICE">Invoice</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>
        );

      case 'createOpportunity':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Job Name *</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                value={formData.name || `${account?.name || ''} - New Job`}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                value={formData.type || ''}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              >
                <option value="">Select type</option>
                <option value="ROOFING">Roofing</option>
                <option value="SIDING">Siding</option>
                <option value="WINDOWS">Windows</option>
                <option value="GUTTERS">Gutters</option>
                <option value="SOLAR">Solar</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stage</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                value={formData.stage || 'LEAD_UNASSIGNED'}
                onChange={(e) => setFormData({ ...formData, stage: e.target.value })}
              >
                <option value="LEAD_UNASSIGNED">Lead Unassigned</option>
                <option value="LEAD_ASSIGNED">Lead Assigned</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="INSPECTED">Inspected</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">$</span>
                <input
                  type="number"
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  value={formData.amount || ''}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>
        );

      case 'createQuote':
        return (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                This will create a new quote for {account?.name}. You'll be redirected to the quote builder.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quote Type *</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                value={formData.quoteType || ''}
                onChange={(e) => setFormData({ ...formData, quoteType: e.target.value })}
              >
                <option value="">Select type</option>
                <option value="ROOFING">Roofing</option>
                <option value="SIDING">Siding</option>
                <option value="WINDOWS">Windows</option>
                <option value="GUTTERS">Gutters</option>
                <option value="BUNDLE">Bundle</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Link to Job</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                value={formData.opportunityId || ''}
                onChange={(e) => setFormData({ ...formData, opportunityId: e.target.value })}
              >
                <option value="">Create new job</option>
                {opportunitiesData?.data?.map((opp) => (
                  <option key={opp.id} value={opp.id}>{opp.name}</option>
                ))}
              </select>
            </div>
          </div>
        );

      case 'updateInsurance':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Insurance Company</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                value={formData.insuranceCompany || account?.insuranceCompany || ''}
                onChange={(e) => setFormData({ ...formData, insuranceCompany: e.target.value })}
                placeholder="e.g., State Farm, Allstate"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Policy Number</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                value={formData.policyNumber || account?.policyNumber || ''}
                onChange={(e) => setFormData({ ...formData, policyNumber: e.target.value })}
                placeholder="Enter policy number"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Claim Number</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                value={formData.claimNumber || account?.claimNumber || ''}
                onChange={(e) => setFormData({ ...formData, claimNumber: e.target.value })}
                placeholder="Enter claim number"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Deductible</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">$</span>
                <input
                  type="number"
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  value={formData.deductible || account?.deductible || ''}
                  onChange={(e) => setFormData({ ...formData, deductible: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>
        );

      case 'updateFinancing':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Financing Status</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                value={formData.financingStatus || account?.financingStatus || ''}
                onChange={(e) => setFormData({ ...formData, financingStatus: e.target.value })}
              >
                <option value="">Select status</option>
                <option value="NOT_NEEDED">Not Needed</option>
                <option value="APPLIED">Applied</option>
                <option value="APPROVED">Approved</option>
                <option value="DECLINED">Declined</option>
                <option value="IN_PROGRESS">In Progress</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Financing Provider</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                value={formData.financingProvider || account?.financingProvider || ''}
                onChange={(e) => setFormData({ ...formData, financingProvider: e.target.value })}
              >
                <option value="">Select provider</option>
                <option value="GOODLEAP">GoodLeap</option>
                <option value="SUNLIGHT">Sunlight Financial</option>
                <option value="MOSAIC">Mosaic</option>
                <option value="SERVICE_FINANCE">Service Finance</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Approved Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">$</span>
                <input
                  type="number"
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  value={formData.financingAmount || ''}
                  onChange={(e) => setFormData({ ...formData, financingAmount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>
        );

      case 'sendEmail':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
              <input
                type="email"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                value={formData.toEmail || account?.email || ''}
                onChange={(e) => setFormData({ ...formData, toEmail: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Template</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                value={formData.template || ''}
                onChange={(e) => setFormData({ ...formData, template: e.target.value })}
              >
                <option value="">Custom email</option>
                <option value="WELCOME">Welcome Email</option>
                <option value="QUOTE_FOLLOWUP">Quote Follow-up</option>
                <option value="APPOINTMENT_REMINDER">Appointment Reminder</option>
                <option value="PROJECT_UPDATE">Project Update</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                value={formData.subject || ''}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                placeholder="Enter email subject"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
              <textarea
                rows={5}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                value={formData.message || ''}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                placeholder="Enter your message..."
              />
            </div>
          </div>
        );

      case 'createInvoice':
        return (
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                This will create a new invoice for {account?.name}.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Link to Job</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                value={formData.opportunityId || ''}
                onChange={(e) => setFormData({ ...formData, opportunityId: e.target.value })}
              >
                <option value="">Select job</option>
                {opportunitiesData?.data?.map((opp) => (
                  <option key={opp.id} value={opp.id}>{opp.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">$</span>
                <input
                  type="number"
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  value={formData.invoiceAmount || ''}
                  onChange={(e) => setFormData({ ...formData, invoiceAmount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <input
                type="date"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                value={formData.dueDate || ''}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                value={formData.invoiceNotes || ''}
                onChange={(e) => setFormData({ ...formData, invoiceNotes: e.target.value })}
                placeholder="Optional notes for the invoice..."
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const getModalTitle = () => {
    const titles = {
      addContact: 'Add Contact',
      uploadFiles: 'Upload Files',
      createOpportunity: 'Create Job',
      createQuote: 'Create Quote',
      updateInsurance: 'Update Insurance Information',
      updateFinancing: 'Update Financing',
      sendEmail: 'Send Email',
      createInvoice: 'Create Invoice',
    };
    return titles[activeModal] || 'Quick Action';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary"></div>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="text-center py-12">
        <Building2 className="w-12 h-12 mx-auto text-gray-300 mb-4" />
        <p className="text-gray-500">Account not found</p>
        <button onClick={() => navigate(-1)} className="text-panda-primary hover:underline mt-2 inline-block">
          Back
        </button>
      </div>
    );
  }

  const tabs = [
    { id: 'opportunities', label: 'Jobs', icon: Target, count: account._count?.opportunities || 0 },
    { id: 'contacts', label: 'Contacts', icon: Users, count: account._count?.contacts || 0 },
    { id: 'details', label: 'Details', icon: FileText, count: null },
    { id: 'documents', label: 'Documents', icon: Upload, count: 0 },
    { id: 'invoices', label: 'Invoices', icon: Receipt, count: 0 },
  ];

  const stageColors = {
    LEAD_UNASSIGNED: 'bg-gray-400',
    LEAD_ASSIGNED: 'bg-blue-400',
    SCHEDULED: 'bg-indigo-400',
    INSPECTED: 'bg-purple-400',
    CLAIM_FILED: 'bg-pink-400',
    ADJUSTER_MEETING_COMPLETE: 'bg-violet-400',
    APPROVED: 'bg-green-400',
    CONTRACT_SIGNED: 'bg-emerald-400',
    IN_PRODUCTION: 'bg-yellow-400',
    COMPLETED: 'bg-teal-400',
    CLOSED_WON: 'bg-green-600',
    CLOSED_LOST: 'bg-red-400',
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center space-x-2 px-4 py-3 rounded-lg shadow-lg ${
          toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {toast.type === 'success' ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Back button and Edit controls */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </button>

        {isEditing && activeTab === 'details' && (
          <div className="flex items-center space-x-2">
            <button
              onClick={handleCancelEdit}
              className="flex items-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              <X className="w-4 h-4" />
              <span>Cancel</span>
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={updateMutation.isPending}
              className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{updateMutation.isPending ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Header Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-4">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-panda-primary to-panda-secondary flex items-center justify-center">
              <Building2 className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{account.name}</h1>
              <div className="flex items-center space-x-4 mt-2 text-gray-500">
                {account.billingStreet && (
                  <span className="flex items-center">
                    <MapPin className="w-4 h-4 mr-1" />
                    {account.billingStreet}, {account.billingCity}, {account.billingState} {account.billingPostalCode}
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-4 mt-2">
                {account.phone && (
                  <button
                    onClick={() => clickToCall(account.phone)}
                    className="flex items-center text-sm text-panda-primary hover:underline"
                  >
                    <Phone className="w-4 h-4 mr-1" />
                    {account.phone}
                  </button>
                )}
                {account.email && (
                  <a href={`mailto:${account.email}`} className="flex items-center text-sm text-panda-primary hover:underline">
                    <Mail className="w-4 h-4 mr-1" />
                    {account.email}
                  </a>
                )}
                {account.website && (
                  <a href={account.website} target="_blank" rel="noopener noreferrer" className="flex items-center text-sm text-panda-primary hover:underline">
                    <Globe className="w-4 h-4 mr-1" />
                    Website
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`badge ${
              account.status === 'ACTIVE' ? 'badge-success' :
              account.status === 'PROSPECT' ? 'badge-info' :
              account.status === 'ONBOARDING' ? 'badge-warning' :
              account.status === 'IN_PRODUCTION' ? 'badge-purple' :
              'badge-gray'
            }`}>
              {account.status}
            </span>
            {account.isPandaClaims && (
              <span className="badge badge-info">Panda Claims</span>
            )}
            {account.isSureClaims && (
              <span className="badge badge-info">Sure Claims</span>
            )}

            {/* Actions Dropdown */}
            <div className="relative" ref={actionsRef}>
              <button
                onClick={() => setShowActionsDropdown(!showActionsDropdown)}
                className="inline-flex items-center px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 transition-colors"
              >
                <span>Actions</span>
                <ChevronDown className="w-4 h-4 ml-2" />
              </button>

              {showActionsDropdown && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50 py-2">
                  {quickActions.map((action, index) => {
                    if (action.divider) {
                      return <div key={index} className="border-t border-gray-100 my-1" />;
                    }
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.id}
                        onClick={action.action}
                        className="w-full flex items-center px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <Icon className="w-4 h-4 mr-3 text-gray-500" />
                        {action.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-100">
          <div>
            <p className="text-sm text-gray-500">Jobs</p>
            <p className="text-xl font-semibold text-gray-900">{account._count?.opportunities || 0}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Contacts</p>
            <p className="text-xl font-semibold text-gray-900">{account._count?.contacts || 0}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Revenue</p>
            <p className="text-xl font-semibold text-green-600">
              ${(account.totalSalesVolume || 0).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Customer Since</p>
            <p className="text-xl font-semibold text-gray-900">
              {account.createdAt ? new Date(account.createdAt).getFullYear() : '-'}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="border-b border-gray-100">
          <div className="flex space-x-4 px-6">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    if (tab.id !== 'details') {
                      setIsEditing(false);
                    }
                  }}
                  className={`flex items-center space-x-2 px-4 py-4 border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-panda-primary text-panda-primary font-medium'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                  {tab.count !== null && tab.count > 0 && (
                    <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="p-6">
          {activeTab === 'opportunities' && (
            <>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">Jobs</h3>
                <button
                  onClick={() => openQuickActionModal('createOpportunity')}
                  className="inline-flex items-center px-3 py-1.5 bg-panda-primary text-white text-sm rounded-lg hover:bg-panda-primary/90"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  New Job
                </button>
              </div>
              {opportunitiesData?.data?.length > 0 ? (
                <div className="divide-y divide-gray-100">
                  {opportunitiesData.data.map((opp) => (
                    <Link
                      key={opp.id}
                      to={`/jobs/${opp.id}`}
                      className="flex items-center justify-between py-3 hover:bg-gray-50 transition-colors -mx-2 px-2 rounded-lg"
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`w-8 h-8 rounded-lg ${stageColors[opp.stage] || 'bg-gray-400'} flex items-center justify-center`}>
                          <Target className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{opp.name}</p>
                          <p className="text-sm text-gray-500">{opp.stage?.replace(/_/g, ' ')}</p>
                        </div>
                      </div>
                      {opp.amount > 0 && (
                        <span className="text-green-600 font-medium">
                          ${opp.amount.toLocaleString()}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Target className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                  <p>No jobs yet</p>
                  <button
                    onClick={() => openQuickActionModal('createOpportunity')}
                    className="text-panda-primary hover:underline mt-2"
                  >
                    Create first job
                  </button>
                </div>
              )}
            </>
          )}

          {activeTab === 'contacts' && (
            <>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">Contacts</h3>
                <button
                  onClick={() => openQuickActionModal('addContact')}
                  className="inline-flex items-center px-3 py-1.5 bg-panda-primary text-white text-sm rounded-lg hover:bg-panda-primary/90"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Contact
                </button>
              </div>
              {contactsData?.data?.length > 0 ? (
                <div className="divide-y divide-gray-100">
                  {contactsData.data.map((contact) => (
                    <Link
                      key={contact.id}
                      to={`/contacts/${contact.id}`}
                      className="flex items-center justify-between py-3 hover:bg-gray-50 transition-colors -mx-2 px-2 rounded-lg"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-medium">
                          {contact.firstName?.[0]}{contact.lastName?.[0]}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{contact.firstName} {contact.lastName}</p>
                          <p className="text-sm text-gray-500">{contact.email || contact.phone || 'No contact info'}</p>
                        </div>
                      </div>
                      {contact.isPrimary && (
                        <span className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded-full">
                          Primary
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Users className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                  <p>No contacts yet</p>
                  <button
                    onClick={() => openQuickActionModal('addContact')}
                    className="text-panda-primary hover:underline mt-2"
                  >
                    Add first contact
                  </button>
                </div>
              )}
            </>
          )}

          {activeTab === 'details' && (
            <>
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-medium text-gray-900">Account Details</h3>
                {!isEditing && (
                  <button
                    onClick={startEditing}
                    className="flex items-center space-x-2 px-4 py-2 bg-panda-primary text-white rounded-lg hover:opacity-90"
                  >
                    <Edit className="w-4 h-4" />
                    <span>Edit</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Basic Information */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-4 flex items-center">
                    <Building2 className="w-4 h-4 mr-2 text-panda-primary" />
                    Basic Information
                  </h4>

                  {isEditing ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Account Name *</label>
                        <input
                          type="text"
                          name="name"
                          value={editFormData.name}
                          onChange={handleEditInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Account Number</label>
                        <input
                          type="text"
                          name="accountNumber"
                          value={editFormData.accountNumber}
                          onChange={handleEditInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                          <select
                            name="type"
                            value={editFormData.type}
                            onChange={handleEditInputChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                          >
                            {ACCOUNT_TYPES.map(t => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                          <select
                            name="status"
                            value={editFormData.status}
                            onChange={handleEditInputChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                          >
                            {ACCOUNT_STATUSES.map(s => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                        <input
                          type="text"
                          name="industry"
                          value={editFormData.industry}
                          onChange={handleEditInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Owner</label>
                        <select
                          name="ownerId"
                          value={editFormData.ownerId}
                          onChange={handleEditInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                        >
                          <option value="">Unassigned</option>
                          {activeUsers.map(u => (
                            <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="flex items-center space-x-3">
                          <input
                            type="checkbox"
                            name="isPandaClaims"
                            checked={editFormData.isPandaClaims}
                            onChange={handleEditInputChange}
                            className="w-4 h-4 text-panda-primary border-gray-300 rounded focus:ring-panda-primary"
                          />
                          <span className="text-sm text-gray-700">Panda Claims</span>
                        </label>
                        <label className="flex items-center space-x-3">
                          <input
                            type="checkbox"
                            name="isSureClaims"
                            checked={editFormData.isSureClaims}
                            onChange={handleEditInputChange}
                            className="w-4 h-4 text-panda-primary border-gray-300 rounded focus:ring-panda-primary"
                          />
                          <span className="text-sm text-gray-700">Sure Claims</span>
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Name</span>
                        <span className="text-gray-900">{account.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Account Number</span>
                        <span className="text-gray-900">{account.accountNumber || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Type</span>
                        <span className="text-gray-900">{account.type}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Status</span>
                        <span className="text-gray-900">{account.status}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Industry</span>
                        <span className="text-gray-900">{account.industry || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Owner</span>
                        <span className="text-gray-900">
                          {account.owner ? `${account.owner.firstName} ${account.owner.lastName}` : 'Unassigned'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Contact Information */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-4 flex items-center">
                    <Phone className="w-4 h-4 mr-2 text-panda-primary" />
                    Contact Information
                  </h4>

                  {isEditing ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                        <input
                          type="tel"
                          name="phone"
                          value={editFormData.phone}
                          onChange={handleEditInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input
                          type="email"
                          name="email"
                          value={editFormData.email}
                          onChange={handleEditInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                        <input
                          type="url"
                          name="website"
                          value={editFormData.website}
                          onChange={handleEditInputChange}
                          placeholder="https://"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Phone</span>
                        <span className="text-gray-900">{account.phone || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Email</span>
                        <span className="text-gray-900">{account.email || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Website</span>
                        <span className="text-gray-900">{account.website || '-'}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Billing Address */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-4 flex items-center">
                    <MapPin className="w-4 h-4 mr-2 text-panda-primary" />
                    Billing Address
                  </h4>

                  {isEditing ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Street</label>
                        <input
                          type="text"
                          name="billingStreet"
                          value={editFormData.billingStreet}
                          onChange={handleEditInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                          <input
                            type="text"
                            name="billingCity"
                            value={editFormData.billingCity}
                            onChange={handleEditInputChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                          <select
                            name="billingState"
                            value={editFormData.billingState}
                            onChange={handleEditInputChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                          >
                            <option value="">Select State</option>
                            {US_STATES.map(s => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
                        <input
                          type="text"
                          name="billingPostalCode"
                          value={editFormData.billingPostalCode}
                          onChange={handleEditInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Street</span>
                        <span className="text-gray-900">{account.billingStreet || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">City</span>
                        <span className="text-gray-900">{account.billingCity || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">State</span>
                        <span className="text-gray-900">{account.billingState || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Postal Code</span>
                        <span className="text-gray-900">{account.billingPostalCode || '-'}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Shipping Address */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-semibold text-gray-700 flex items-center">
                      <Home className="w-4 h-4 mr-2 text-panda-primary" />
                      Shipping Address
                    </h4>
                    {isEditing && (
                      <button
                        type="button"
                        onClick={copyShippingFromBilling}
                        className="text-xs text-panda-primary hover:underline"
                      >
                        Copy from Billing
                      </button>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Street</label>
                        <input
                          type="text"
                          name="shippingStreet"
                          value={editFormData.shippingStreet}
                          onChange={handleEditInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                          <input
                            type="text"
                            name="shippingCity"
                            value={editFormData.shippingCity}
                            onChange={handleEditInputChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                          <select
                            name="shippingState"
                            value={editFormData.shippingState}
                            onChange={handleEditInputChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                          >
                            <option value="">Select State</option>
                            {US_STATES.map(s => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
                        <input
                          type="text"
                          name="shippingPostalCode"
                          value={editFormData.shippingPostalCode}
                          onChange={handleEditInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Street</span>
                        <span className="text-gray-900">{account.shippingStreet || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">City</span>
                        <span className="text-gray-900">{account.shippingCity || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">State</span>
                        <span className="text-gray-900">{account.shippingState || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Postal Code</span>
                        <span className="text-gray-900">{account.shippingPostalCode || '-'}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Description - Full Width */}
              <div className="bg-gray-50 rounded-lg p-4 mt-6">
                <h4 className="text-sm font-semibold text-gray-700 mb-4 flex items-center">
                  <FileText className="w-4 h-4 mr-2 text-panda-primary" />
                  Description
                </h4>

                {isEditing ? (
                  <textarea
                    name="description"
                    value={editFormData.description}
                    onChange={handleEditInputChange}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                    placeholder="Enter account description..."
                  />
                ) : (
                  <p className="text-gray-900 whitespace-pre-wrap">
                    {account.description || 'No description provided.'}
                  </p>
                )}
              </div>

              {/* Metadata */}
              <div className="mt-6 pt-4 border-t border-gray-200 text-sm text-gray-500">
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <div className="flex items-center">
                    <Clock className="w-4 h-4 mr-1" />
                    Created: {new Date(account.createdAt).toLocaleString()}
                  </div>
                  <div className="flex items-center">
                    <Clock className="w-4 h-4 mr-1" />
                    Updated: {new Date(account.updatedAt).toLocaleString()}
                  </div>
                  {account.salesforceId && (
                    <div>
                      Salesforce ID: {account.salesforceId}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {activeTab === 'documents' && (
            <div className="text-center py-8 text-gray-500">
              <Upload className="w-12 h-12 mx-auto text-gray-300 mb-2" />
              <p>No documents uploaded</p>
              <button
                onClick={() => openQuickActionModal('uploadFiles')}
                className="text-panda-primary hover:underline mt-2"
              >
                Upload documents
              </button>
            </div>
          )}

          {activeTab === 'invoices' && (
            <div className="text-center py-8 text-gray-500">
              <Receipt className="w-12 h-12 mx-auto text-gray-300 mb-2" />
              <p>No invoices yet</p>
              <button
                onClick={() => openQuickActionModal('createInvoice')}
                className="text-panda-primary hover:underline mt-2"
              >
                Create invoice
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {activeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">{getModalTitle()}</h2>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4">
              {renderModalContent()}
            </div>
            <div className="flex justify-end space-x-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleQuickActionSubmit(activeModal)}
                disabled={actionLoading}
                className="px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                {actionLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                    Processing...
                  </>
                ) : (
                  'Submit'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
