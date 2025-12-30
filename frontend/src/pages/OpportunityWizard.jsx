import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Target,
  DollarSign,
  FileText,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Phone,
  Mail,
  MessageSquare,
  Building2,
  User,
  Calendar,
  MapPin,
  Briefcase,
  TrendingUp,
  Clock,
  AlertCircle,
  Plus,
  X,
} from 'lucide-react';
import { opportunitiesApi, accountsApi, contactsApi } from '../services/api';
import { useRingCentral } from '../context/RingCentralContext';

// Opportunity Stages with colors
const STAGES = [
  { value: 'Lead Unassigned', label: 'Lead Unassigned', color: 'bg-gray-100 text-gray-800' },
  { value: 'Lead Assigned', label: 'Lead Assigned', color: 'bg-blue-100 text-blue-800' },
  { value: 'Qualification', label: 'Qualification', color: 'bg-indigo-100 text-indigo-800' },
  { value: 'Needs Analysis', label: 'Needs Analysis', color: 'bg-purple-100 text-purple-800' },
  { value: 'Proposal', label: 'Proposal', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'Negotiation', label: 'Negotiation', color: 'bg-orange-100 text-orange-800' },
  { value: 'Closed Won', label: 'Closed Won', color: 'bg-green-100 text-green-800' },
  { value: 'Closed Lost', label: 'Closed Lost', color: 'bg-red-100 text-red-800' },
];

// Work Types
const WORK_TYPES = [
  'Roofing - Insurance',
  'Roofing - Retail',
  'Siding',
  'Gutters',
  'Windows',
  'Solar',
  'Interior',
  'Multi-Trade',
];

// Lead Sources
const LEAD_SOURCES = [
  'Website',
  'Referral',
  'Phone Inquiry',
  'Door Knock',
  'Storm Chase',
  'Canvassing',
  'Trade Show',
  'Social Media',
  'Partner',
  'Other',
];

// US States
const US_STATES = [
  { value: 'AL', label: 'Alabama' }, { value: 'AK', label: 'Alaska' },
  { value: 'AZ', label: 'Arizona' }, { value: 'AR', label: 'Arkansas' },
  { value: 'CA', label: 'California' }, { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' }, { value: 'DE', label: 'Delaware' },
  { value: 'DC', label: 'District of Columbia' }, { value: 'FL', label: 'Florida' },
  { value: 'GA', label: 'Georgia' }, { value: 'HI', label: 'Hawaii' },
  { value: 'ID', label: 'Idaho' }, { value: 'IL', label: 'Illinois' },
  { value: 'IN', label: 'Indiana' }, { value: 'IA', label: 'Iowa' },
  { value: 'KS', label: 'Kansas' }, { value: 'KY', label: 'Kentucky' },
  { value: 'LA', label: 'Louisiana' }, { value: 'ME', label: 'Maine' },
  { value: 'MD', label: 'Maryland' }, { value: 'MA', label: 'Massachusetts' },
  { value: 'MI', label: 'Michigan' }, { value: 'MN', label: 'Minnesota' },
  { value: 'MS', label: 'Mississippi' }, { value: 'MO', label: 'Missouri' },
  { value: 'MT', label: 'Montana' }, { value: 'NE', label: 'Nebraska' },
  { value: 'NV', label: 'Nevada' }, { value: 'NH', label: 'New Hampshire' },
  { value: 'NJ', label: 'New Jersey' }, { value: 'NM', label: 'New Mexico' },
  { value: 'NY', label: 'New York' }, { value: 'NC', label: 'North Carolina' },
  { value: 'ND', label: 'North Dakota' }, { value: 'OH', label: 'Ohio' },
  { value: 'OK', label: 'Oklahoma' }, { value: 'OR', label: 'Oregon' },
  { value: 'PA', label: 'Pennsylvania' }, { value: 'RI', label: 'Rhode Island' },
  { value: 'SC', label: 'South Carolina' }, { value: 'SD', label: 'South Dakota' },
  { value: 'TN', label: 'Tennessee' }, { value: 'TX', label: 'Texas' },
  { value: 'UT', label: 'Utah' }, { value: 'VT', label: 'Vermont' },
  { value: 'VA', label: 'Virginia' }, { value: 'WA', label: 'Washington' },
  { value: 'WV', label: 'West Virginia' }, { value: 'WI', label: 'Wisconsin' },
  { value: 'WY', label: 'Wyoming' },
];

// Wizard Steps
const steps = [
  { id: 1, name: 'Details', icon: Target, description: 'Basic job info' },
  { id: 2, name: 'Value', icon: DollarSign, description: 'Amount and probability' },
  { id: 3, name: 'Products', icon: FileText, description: 'Line items and services' },
  { id: 4, name: 'Review', icon: CheckCircle, description: 'Review and create' },
];

export default function OpportunityWizard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(!isNew);
  const [isSaving, setIsSaving] = useState(false);
  const [opportunity, setOpportunity] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [contacts, setContacts] = useState([]);

  const [formData, setFormData] = useState({
    // Details
    name: '',
    accountId: '',
    contactId: '',
    stage: 'Lead Unassigned',
    workType: '',
    leadSource: '',
    closeDate: '',
    description: '',
    // Address
    street: '',
    city: '',
    state: '',
    postalCode: '',
    // Value
    amount: '',
    probability: '',
    expectedRevenue: '',
    // Products/Line Items
    lineItems: [],
  });

  const [activities, setActivities] = useState([]);
  const { clickToCall } = useRingCentral();

  // Load existing opportunity if editing
  useEffect(() => {
    if (!isNew) {
      loadOpportunity();
    }
    loadAccounts();
  }, [id]);

  // Load account contacts when account changes
  useEffect(() => {
    if (formData.accountId) {
      loadContacts(formData.accountId);
    }
  }, [formData.accountId]);

  // Calculate expected revenue when amount or probability changes
  useEffect(() => {
    if (formData.amount && formData.probability) {
      const expected = (parseFloat(formData.amount) * parseFloat(formData.probability)) / 100;
      setFormData(prev => ({ ...prev, expectedRevenue: expected.toFixed(2) }));
    }
  }, [formData.amount, formData.probability]);

  const loadOpportunity = async () => {
    setIsLoading(true);
    try {
      const opp = await opportunitiesApi.getOpportunity(id);
      setOpportunity(opp);

      // Map stage from API format to display format
      const stageMap = {
        'LEAD_UNASSIGNED': 'Lead Unassigned',
        'LEAD_ASSIGNED': 'Lead Assigned',
        'QUALIFICATION': 'Qualification',
        'NEEDS_ANALYSIS': 'Needs Analysis',
        'PROPOSAL': 'Proposal',
        'NEGOTIATION': 'Negotiation',
        'CLOSED_WON': 'Closed Won',
        'CLOSED_LOST': 'Closed Lost',
      };

      // Format close date for input
      const formatDateForInput = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toISOString().split('T')[0];
      };

      setFormData({
        name: opp.name || '',
        accountId: opp.accountId || '',
        contactId: opp.contactId || '',
        stage: stageMap[opp.stage] || opp.stageName || opp.stage || 'Lead Unassigned',
        workType: opp.workType || '',
        leadSource: opp.leadSource || '',
        closeDate: formatDateForInput(opp.closeDate),
        description: opp.description || '',
        street: opp.street || '',
        city: opp.city || '',
        state: opp.state || '',
        postalCode: opp.postalCode || '',
        amount: opp.amount ? String(opp.amount) : '',
        probability: opp.probability ? String(opp.probability) : '',
        expectedRevenue: opp.amount && opp.probability ? String((opp.amount * opp.probability / 100).toFixed(2)) : '',
        lineItems: (opp.lineItems || []).map((li, idx) => ({
          id: li.id || idx + 1,
          product: li.name || li.product?.name || '',
          quantity: li.quantity || 1,
          unitPrice: li.unitPrice || 0,
          total: li.totalPrice || li.total || 0,
        })),
      });

      // Load activities from notes/tasks if available
      const activities = [];
      if (opp.tasks) {
        opp.tasks.forEach(task => {
          activities.push({
            id: task.id,
            type: 'Task',
            subject: task.subject,
            date: task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '',
            status: task.status === 'Completed' ? 'Completed' : 'Open',
          });
        });
      }
      setActivities(activities);
    } catch (error) {
      console.error('Error loading opportunity:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAccounts = async () => {
    try {
      const response = await accountsApi.getAccounts({ limit: 100 });
      const accountList = (response.data || []).map(acc => ({
        id: acc.id,
        name: acc.name,
      }));
      setAccounts(accountList);
    } catch (error) {
      console.error('Error loading accounts:', error);
    }
  };

  const loadContacts = async (accountId) => {
    try {
      const response = await contactsApi.getContacts({ accountId, limit: 50 });
      const contactList = (response.data || []).map(con => ({
        id: con.id,
        name: con.name || `${con.firstName || ''} ${con.lastName || ''}`.trim(),
        phone: con.phone || con.mobilePhone,
        email: con.email,
      }));
      setContacts(contactList);
    } catch (error) {
      console.error('Error loading contacts:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAddLineItem = () => {
    const newItem = {
      id: Date.now(),
      product: '',
      quantity: 1,
      unitPrice: 0,
      total: 0,
    };
    setFormData(prev => ({
      ...prev,
      lineItems: [...prev.lineItems, newItem],
    }));
  };

  const handleLineItemChange = (itemId, field, value) => {
    setFormData(prev => ({
      ...prev,
      lineItems: prev.lineItems.map(item => {
        if (item.id === itemId) {
          const updated = { ...item, [field]: value };
          if (field === 'quantity' || field === 'unitPrice') {
            updated.total = (parseFloat(updated.quantity) || 0) * (parseFloat(updated.unitPrice) || 0);
          }
          return updated;
        }
        return item;
      }),
    }));
  };

  const handleRemoveLineItem = (itemId) => {
    setFormData(prev => ({
      ...prev,
      lineItems: prev.lineItems.filter(item => item.id !== itemId),
    }));
  };

  const calculateTotalAmount = () => {
    return formData.lineItems.reduce((sum, item) => sum + (item.total || 0), 0);
  };

  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Map stage back to API format
      const stageMap = {
        'Lead Unassigned': 'LEAD_UNASSIGNED',
        'Lead Assigned': 'LEAD_ASSIGNED',
        'Qualification': 'QUALIFICATION',
        'Needs Analysis': 'NEEDS_ANALYSIS',
        'Proposal': 'PROPOSAL',
        'Negotiation': 'NEGOTIATION',
        'Closed Won': 'CLOSED_WON',
        'Closed Lost': 'CLOSED_LOST',
      };

      const payload = {
        name: formData.name,
        description: formData.description,
        stage: stageMap[formData.stage] || formData.stage,
        workType: formData.workType,
        leadSource: formData.leadSource,
        closeDate: formData.closeDate || null,
        amount: formData.amount ? parseFloat(formData.amount) : null,
        probability: formData.probability ? parseInt(formData.probability) : null,
        street: formData.street,
        city: formData.city,
        state: formData.state,
        postalCode: formData.postalCode,
        accountId: formData.accountId || null,
        contactId: formData.contactId || null,
        lineItems: formData.lineItems.map((li, idx) => ({
          name: li.product,
          quantity: parseInt(li.quantity) || 1,
          unitPrice: parseFloat(li.unitPrice) || 0,
          totalPrice: parseFloat(li.total) || 0,
          sortOrder: idx,
        })),
      };

      if (isNew) {
        await opportunitiesApi.createOpportunity(payload);
      } else {
        await opportunitiesApi.updateOpportunity(id, payload);
      }

      navigate(`/jobs/${isNew ? '' : id}`);
    } catch (error) {
      console.error('Error saving opportunity:', error);
      alert('Error saving opportunity: ' + (error.response?.data?.message || error.message));
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate completion score
  const calculateCompletionScore = () => {
    let score = 0;
    if (formData.name) score += 15;
    if (formData.accountId) score += 15;
    if (formData.stage) score += 10;
    if (formData.workType) score += 10;
    if (formData.closeDate) score += 10;
    if (formData.amount) score += 15;
    if (formData.probability) score += 10;
    if (formData.lineItems.length > 0) score += 15;
    return score;
  };

  const completionScore = calculateCompletionScore();

  // Get stage color
  const getStageStyle = (stage) => {
    const found = STAGES.find(s => s.value === stage);
    return found ? found.color : 'bg-gray-100 text-gray-800';
  };

  // Get selected contact details
  const selectedContact = contacts.find(c => c.id === formData.contactId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-panda-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {isNew ? 'New Job' : `Edit: ${opportunity?.name || 'Job'}`}
              </h1>
              <p className="text-sm text-gray-500">
                {isNew ? 'Create a new job' : 'Update job details'}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {/* Completion Score */}
            <div className="flex items-center space-x-2">
              <div className="text-sm font-medium text-gray-600">Completion</div>
              <div className="w-24 bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${
                    completionScore >= 80 ? 'bg-green-500' :
                    completionScore >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${completionScore}%` }}
                ></div>
              </div>
              <span className="text-sm font-semibold text-gray-900">{completionScore}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center flex-1">
              <button
                onClick={() => setCurrentStep(step.id)}
                className={`flex items-center space-x-3 p-3 rounded-lg transition-all w-full ${
                  currentStep === step.id
                    ? 'bg-panda-primary/10 border-2 border-panda-primary'
                    : currentStep > step.id
                    ? 'bg-green-50 border-2 border-green-500'
                    : 'bg-gray-50 border-2 border-transparent hover:border-gray-200'
                }`}
              >
                <div className={`p-2 rounded-lg ${
                  currentStep === step.id
                    ? 'bg-panda-primary text-white'
                    : currentStep > step.id
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  <step.icon className="w-5 h-5" />
                </div>
                <div className="text-left hidden sm:block">
                  <div className={`text-sm font-semibold ${
                    currentStep === step.id ? 'text-panda-primary' :
                    currentStep > step.id ? 'text-green-600' : 'text-gray-600'
                  }`}>
                    {step.name}
                  </div>
                  <div className="text-xs text-gray-500">{step.description}</div>
                </div>
              </button>
              {index < steps.length - 1 && (
                <div className={`w-8 h-0.5 mx-2 ${
                  currentStep > step.id ? 'bg-green-500' : 'bg-gray-200'
                }`}></div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        {/* Step 1: Details */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <Target className="w-5 h-5 mr-2 text-panda-primary" />
              Job Details
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Job Name */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Job Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="e.g., Panda Ext-12345 John Smith"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                />
              </div>

              {/* Account */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Account *
                </label>
                <select
                  name="accountId"
                  value={formData.accountId}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                >
                  <option value="">Select Account</option>
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                  ))}
                </select>
              </div>

              {/* Primary Contact */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Primary Contact
                </label>
                <select
                  name="contactId"
                  value={formData.contactId}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  disabled={!formData.accountId}
                >
                  <option value="">Select Contact</option>
                  {contacts.map(con => (
                    <option key={con.id} value={con.id}>{con.name}</option>
                  ))}
                </select>
              </div>

              {/* Stage */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Stage *
                </label>
                <select
                  name="stage"
                  value={formData.stage}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                >
                  {STAGES.map(stage => (
                    <option key={stage.value} value={stage.value}>{stage.label}</option>
                  ))}
                </select>
                {formData.stage && (
                  <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium ${getStageStyle(formData.stage)}`}>
                    {formData.stage}
                  </span>
                )}
              </div>

              {/* Work Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Work Type *
                </label>
                <select
                  name="workType"
                  value={formData.workType}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                >
                  <option value="">Select Work Type</option>
                  {WORK_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              {/* Lead Source */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Lead Source
                </label>
                <select
                  name="leadSource"
                  value={formData.leadSource}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                >
                  <option value="">Select Source</option>
                  {LEAD_SOURCES.map(source => (
                    <option key={source} value={source}>{source}</option>
                  ))}
                </select>
              </div>

              {/* Close Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Close Date *
                </label>
                <input
                  type="date"
                  name="closeDate"
                  value={formData.closeDate}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                />
              </div>

              {/* Description */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows={3}
                  placeholder="Describe the job..."
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                />
              </div>
            </div>

            {/* Contact Quick Actions */}
            {selectedContact && (
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Quick Contact Actions</h3>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => clickToCall(selectedContact.phone)}
                    className="inline-flex items-center px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                  >
                    <Phone className="w-4 h-4 mr-2" />
                    Call
                  </button>
                  <a
                    href={`sms:${selectedContact.phone}`}
                    className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    <MessageSquare className="w-4 h-4 mr-2" />
                    SMS
                  </a>
                  <a
                    href={`mailto:${selectedContact.email}`}
                    className="inline-flex items-center px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    Email
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Value */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <DollarSign className="w-5 h-5 mr-2 text-panda-primary" />
              Job Value
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    name="amount"
                    value={formData.amount}
                    onChange={handleInputChange}
                    placeholder="0.00"
                    className="w-full pl-8 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  />
                </div>
              </div>

              {/* Probability */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Probability (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    name="probability"
                    value={formData.probability}
                    onChange={handleInputChange}
                    min="0"
                    max="100"
                    placeholder="0"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
                </div>
              </div>

              {/* Expected Revenue */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Expected Revenue
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="text"
                    name="expectedRevenue"
                    value={formData.expectedRevenue}
                    readOnly
                    className="w-full pl-8 pr-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-600"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">Auto-calculated: Amount × Probability</p>
              </div>
            </div>

            {/* Address Section */}
            <div className="pt-6 border-t border-gray-200">
              <h3 className="text-md font-semibold text-gray-900 flex items-center mb-4">
                <MapPin className="w-5 h-5 mr-2 text-gray-500" />
                Project Address
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Street</label>
                  <input
                    type="text"
                    name="street"
                    value={formData.street}
                    onChange={handleInputChange}
                    placeholder="123 Main St"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleInputChange}
                    placeholder="Baltimore"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                    <select
                      name="state"
                      value={formData.state}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                    >
                      <option value="">Select</option>
                      {US_STATES.map(state => (
                        <option key={state.value} value={state.value}>{state.value}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ZIP</label>
                    <input
                      type="text"
                      name="postalCode"
                      value={formData.postalCode}
                      onChange={handleInputChange}
                      placeholder="21201"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Products */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                <FileText className="w-5 h-5 mr-2 text-panda-primary" />
                Products & Services
              </h2>
              <button
                onClick={handleAddLineItem}
                className="inline-flex items-center px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Line Item
              </button>
            </div>

            {formData.lineItems.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <FileText className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No products added</h3>
                <p className="text-gray-500 mb-4">Add products or services to this job</p>
                <button
                  onClick={handleAddLineItem}
                  className="inline-flex items-center px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 transition-colors"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add First Item
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Line Items Table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Product/Service</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase w-24">Qty</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase w-32">Unit Price</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase w-32">Total</th>
                        <th className="px-4 py-3 w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {formData.lineItems.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={item.product}
                              onChange={(e) => handleLineItemChange(item.id, 'product', e.target.value)}
                              placeholder="Product name"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => handleLineItemChange(item.id, 'quantity', e.target.value)}
                              min="1"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-right focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                              <input
                                type="number"
                                value={item.unitPrice}
                                onChange={(e) => handleLineItemChange(item.id, 'unitPrice', e.target.value)}
                                min="0"
                                step="0.01"
                                className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-right focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-gray-900">
                            ${(item.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleRemoveLineItem(item.id)}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 font-semibold">
                        <td colSpan="3" className="px-4 py-3 text-right text-gray-700">Total Amount:</td>
                        <td className="px-4 py-3 text-right text-lg text-panda-primary">
                          ${calculateTotalAmount().toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Sync Amount Button */}
                {calculateTotalAmount() !== parseFloat(formData.amount || 0) && (
                  <div className="flex items-center justify-end p-4 bg-yellow-50 rounded-lg">
                    <div className="flex items-center text-yellow-800 mr-4">
                      <AlertCircle className="w-5 h-5 mr-2" />
                      <span className="text-sm">Line item total differs from job amount</span>
                    </div>
                    <button
                      onClick={() => setFormData(prev => ({ ...prev, amount: calculateTotalAmount().toString() }))}
                      className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
                    >
                      Sync Amount
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 4: Review */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <CheckCircle className="w-5 h-5 mr-2 text-panda-primary" />
              Review & {isNew ? 'Create' : 'Update'}
            </h2>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Job Details */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                  <Briefcase className="w-4 h-4 mr-2" />
                  Job Details
                </h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Name:</dt>
                    <dd className="font-medium text-gray-900">{formData.name || '-'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Stage:</dt>
                    <dd>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStageStyle(formData.stage)}`}>
                        {formData.stage}
                      </span>
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Work Type:</dt>
                    <dd className="font-medium text-gray-900">{formData.workType || '-'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Lead Source:</dt>
                    <dd className="font-medium text-gray-900">{formData.leadSource || '-'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Close Date:</dt>
                    <dd className="font-medium text-gray-900">{formData.closeDate || '-'}</dd>
                  </div>
                </dl>
              </div>

              {/* Financial Summary */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                  <DollarSign className="w-4 h-4 mr-2" />
                  Financial Summary
                </h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Amount:</dt>
                    <dd className="font-medium text-gray-900">
                      ${parseFloat(formData.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Probability:</dt>
                    <dd className="font-medium text-gray-900">{formData.probability || 0}%</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Expected Revenue:</dt>
                    <dd className="font-medium text-green-600">
                      ${parseFloat(formData.expectedRevenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Line Items:</dt>
                    <dd className="font-medium text-gray-900">{formData.lineItems.length} items</dd>
                  </div>
                </dl>
              </div>

              {/* Account & Contact */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                  <Building2 className="w-4 h-4 mr-2" />
                  Account & Contact
                </h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Account:</dt>
                    <dd className="font-medium text-gray-900">
                      {accounts.find(a => a.id === formData.accountId)?.name || '-'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Contact:</dt>
                    <dd className="font-medium text-gray-900">
                      {contacts.find(c => c.id === formData.contactId)?.name || '-'}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Address */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                  <MapPin className="w-4 h-4 mr-2" />
                  Project Address
                </h3>
                <p className="text-sm text-gray-900">
                  {formData.street && (
                    <>
                      {formData.street}<br />
                      {formData.city}, {formData.state} {formData.postalCode}
                    </>
                  )}
                  {!formData.street && <span className="text-gray-500">No address provided</span>}
                </p>
              </div>
            </div>

            {/* Completion Checklist */}
            <div className="bg-blue-50 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-3">Completion Checklist</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Name', check: !!formData.name },
                  { label: 'Account', check: !!formData.accountId },
                  { label: 'Stage', check: !!formData.stage },
                  { label: 'Work Type', check: !!formData.workType },
                  { label: 'Close Date', check: !!formData.closeDate },
                  { label: 'Amount', check: !!formData.amount },
                  { label: 'Probability', check: !!formData.probability },
                  { label: 'Products', check: formData.lineItems.length > 0 },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center space-x-2">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                      item.check ? 'bg-green-500' : 'bg-gray-300'
                    }`}>
                      {item.check && <CheckCircle className="w-3 h-3 text-white" />}
                    </div>
                    <span className={`text-sm ${item.check ? 'text-green-700' : 'text-gray-500'}`}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Activity */}
            {!isNew && activities.length > 0 && (
              <div className="border-t border-gray-200 pt-6">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                  <Clock className="w-4 h-4 mr-2" />
                  Recent Activity
                </h3>
                <div className="space-y-3">
                  {activities.map(activity => (
                    <div key={activity.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className={`p-2 rounded-lg ${
                          activity.type === 'Call' ? 'bg-green-100' :
                          activity.type === 'Email' ? 'bg-blue-100' : 'bg-yellow-100'
                        }`}>
                          {activity.type === 'Call' && <Phone className="w-4 h-4 text-green-600" />}
                          {activity.type === 'Email' && <Mail className="w-4 h-4 text-blue-600" />}
                          {activity.type === 'Task' && <CheckCircle className="w-4 h-4 text-yellow-600" />}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{activity.subject}</p>
                          <p className="text-xs text-gray-500">{activity.date}</p>
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        activity.status === 'Completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {activity.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <button
          onClick={handlePrevious}
          disabled={currentStep === 1}
          className={`inline-flex items-center px-4 py-2 rounded-lg transition-colors ${
            currentStep === 1
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <ChevronLeft className="w-5 h-5 mr-1" />
          Previous
        </button>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
          >
            Cancel
          </button>
          {currentStep < steps.length ? (
            <button
              onClick={handleNext}
              className="inline-flex items-center px-6 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 transition-colors"
            >
              Next
              <ChevronRight className="w-5 h-5 ml-1" />
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={isSaving || completionScore < 50}
              className={`inline-flex items-center px-6 py-2 rounded-lg transition-colors ${
                isSaving || completionScore < 50
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-green-500 text-white hover:bg-green-600'
              }`}
            >
              {isSaving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5 mr-2" />
                  {isNew ? 'Create Job' : 'Update Job'}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
