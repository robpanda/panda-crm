import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Building2,
  User,
  MapPin,
  FileText,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Phone,
  Mail,
  MessageSquare,
  Globe,
  Users,
  Briefcase,
  Clock,
  Plus,
  X,
  AlertCircle,
} from 'lucide-react';
import { useRingCentral } from '../context/RingCentralContext';

// Account Types
const ACCOUNT_TYPES = [
  'Residential',
  'Commercial',
  'Multi-Family',
  'HOA',
  'Property Management',
  'Insurance Company',
  'Contractor',
  'Supplier',
];

// Account Status
const ACCOUNT_STATUSES = [
  { value: 'Prospect', color: 'bg-blue-100 text-blue-800' },
  { value: 'Active', color: 'bg-green-100 text-green-800' },
  { value: 'Onboarding', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'In Progress', color: 'bg-purple-100 text-purple-800' },
  { value: 'Completed', color: 'bg-gray-100 text-gray-800' },
  { value: 'On Hold', color: 'bg-orange-100 text-orange-800' },
  { value: 'Inactive', color: 'bg-red-100 text-red-800' },
];

// Industries
const INDUSTRIES = [
  'Residential Homeowner',
  'Property Management',
  'Real Estate',
  'Construction',
  'Insurance',
  'Government',
  'Healthcare',
  'Education',
  'Retail',
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
  { id: 1, name: 'Info', icon: Building2, description: 'Basic account info' },
  { id: 2, name: 'Address', icon: MapPin, description: 'Location details' },
  { id: 3, name: 'Contacts', icon: Users, description: 'Contact people' },
  { id: 4, name: 'Review', icon: CheckCircle, description: 'Review and create' },
];

export default function AccountWizard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(!isNew);
  const [isSaving, setIsSaving] = useState(false);
  const [account, setAccount] = useState(null);

  const [formData, setFormData] = useState({
    // Basic Info
    name: '',
    type: 'Residential',
    status: 'Prospect',
    industry: 'Residential Homeowner',
    phone: '',
    email: '',
    website: '',
    description: '',
    // Billing Address
    billingStreet: '',
    billingCity: '',
    billingState: '',
    billingPostalCode: '',
    // Shipping Address (Project Address)
    shippingStreet: '',
    shippingCity: '',
    shippingState: '',
    shippingPostalCode: '',
    sameAsBilling: true,
    // Contacts
    contacts: [],
  });

  const [activities, setActivities] = useState([]);
  const { clickToCall } = useRingCentral();

  // Load existing account if editing
  useEffect(() => {
    if (!isNew) {
      loadAccount();
    }
  }, [id]);

  // Copy billing to shipping when sameAsBilling changes
  useEffect(() => {
    if (formData.sameAsBilling) {
      setFormData(prev => ({
        ...prev,
        shippingStreet: prev.billingStreet,
        shippingCity: prev.billingCity,
        shippingState: prev.billingState,
        shippingPostalCode: prev.billingPostalCode,
      }));
    }
  }, [formData.sameAsBilling, formData.billingStreet, formData.billingCity, formData.billingState, formData.billingPostalCode]);

  const loadAccount = async () => {
    setIsLoading(true);
    try {
      // TODO: Replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 500));
      // Mock data
      const mockAccount = {
        id,
        name: 'John Smith',
        type: 'Residential',
        status: 'Active',
        industry: 'Residential Homeowner',
        phone: '(410) 555-1234',
        email: 'john.smith@example.com',
        website: '',
        description: 'Homeowner in Baltimore area',
        billingStreet: '123 Main St',
        billingCity: 'Baltimore',
        billingState: 'MD',
        billingPostalCode: '21201',
        shippingStreet: '123 Main St',
        shippingCity: 'Baltimore',
        shippingState: 'MD',
        shippingPostalCode: '21201',
        sameAsBilling: true,
        contacts: [
          { id: 1, firstName: 'John', lastName: 'Smith', phone: '(410) 555-1234', email: 'john.smith@example.com', isPrimary: true },
          { id: 2, firstName: 'Mary', lastName: 'Smith', phone: '(410) 555-5678', email: 'mary.smith@example.com', isPrimary: false },
        ],
      };
      setAccount(mockAccount);
      setFormData({
        name: mockAccount.name,
        type: mockAccount.type,
        status: mockAccount.status,
        industry: mockAccount.industry,
        phone: mockAccount.phone,
        email: mockAccount.email,
        website: mockAccount.website,
        description: mockAccount.description,
        billingStreet: mockAccount.billingStreet,
        billingCity: mockAccount.billingCity,
        billingState: mockAccount.billingState,
        billingPostalCode: mockAccount.billingPostalCode,
        shippingStreet: mockAccount.shippingStreet,
        shippingCity: mockAccount.shippingCity,
        shippingState: mockAccount.shippingState,
        shippingPostalCode: mockAccount.shippingPostalCode,
        sameAsBilling: mockAccount.sameAsBilling,
        contacts: mockAccount.contacts,
      });
      setActivities([
        { id: 1, type: 'Call', subject: 'Initial inquiry', date: '2024-12-05', status: 'Completed' },
        { id: 2, type: 'Task', subject: 'Schedule inspection', date: '2024-12-10', status: 'Completed' },
        { id: 3, type: 'Job', subject: 'Panda Ext-12345', date: '2024-12-12', status: 'Open' },
      ]);
    } catch (error) {
      console.error('Error loading account:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleAddContact = () => {
    const newContact = {
      id: Date.now(),
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      isPrimary: formData.contacts.length === 0,
    };
    setFormData(prev => ({
      ...prev,
      contacts: [...prev.contacts, newContact],
    }));
  };

  const handleContactChange = (contactId, field, value) => {
    setFormData(prev => ({
      ...prev,
      contacts: prev.contacts.map(contact => {
        if (contact.id === contactId) {
          return { ...contact, [field]: value };
        }
        // If setting as primary, unset others
        if (field === 'isPrimary' && value === true) {
          return { ...contact, isPrimary: contact.id === contactId };
        }
        return contact;
      }),
    }));
  };

  const handleRemoveContact = (contactId) => {
    setFormData(prev => ({
      ...prev,
      contacts: prev.contacts.filter(contact => contact.id !== contactId),
    }));
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
      // TODO: Replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('Saving account:', formData);
      navigate('/accounts');
    } catch (error) {
      console.error('Error saving account:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate completion score
  const calculateCompletionScore = () => {
    let score = 0;
    if (formData.name) score += 20;
    if (formData.phone || formData.email) score += 20;
    if (formData.billingStreet && formData.billingCity) score += 20;
    if (formData.type) score += 15;
    if (formData.status) score += 10;
    if (formData.contacts.length > 0) score += 15;
    return score;
  };

  const completionScore = calculateCompletionScore();

  // Get status style
  const getStatusStyle = (status) => {
    const found = ACCOUNT_STATUSES.find(s => s.value === status);
    return found ? found.color : 'bg-gray-100 text-gray-800';
  };

  // Get primary contact
  const primaryContact = formData.contacts.find(c => c.isPrimary);

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
                {isNew ? 'New Account' : `Edit: ${account?.name || 'Account'}`}
              </h1>
              <p className="text-sm text-gray-500">
                {isNew ? 'Create a new customer account' : 'Update account details'}
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
        {/* Step 1: Basic Info */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <Building2 className="w-5 h-5 mr-2 text-panda-primary" />
              Account Information
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Account Name */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Account Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="e.g., John Smith or ABC Company"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                />
              </div>

              {/* Account Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Account Type *
                </label>
                <select
                  name="type"
                  value={formData.type}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                >
                  {ACCOUNT_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status *
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                >
                  {ACCOUNT_STATUSES.map(status => (
                    <option key={status.value} value={status.value}>{status.value}</option>
                  ))}
                </select>
                {formData.status && (
                  <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium ${getStatusStyle(formData.status)}`}>
                    {formData.status}
                  </span>
                )}
              </div>

              {/* Industry */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Industry
                </label>
                <select
                  name="industry"
                  value={formData.industry}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                >
                  {INDUSTRIES.map(ind => (
                    <option key={ind} value={ind}>{ind}</option>
                  ))}
                </select>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder="(410) 555-1234"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="email@example.com"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                />
              </div>

              {/* Website */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Website
                </label>
                <input
                  type="url"
                  name="website"
                  value={formData.website}
                  onChange={handleInputChange}
                  placeholder="https://example.com"
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
                  placeholder="Notes about this account..."
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                />
              </div>
            </div>

            {/* Quick Actions */}
            {(formData.phone || formData.email) && (
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Quick Actions</h3>
                <div className="flex flex-wrap gap-3">
                  {formData.phone && (
                    <>
                      <button
                        onClick={() => clickToCall(formData.phone)}
                        className="inline-flex items-center px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                      >
                        <Phone className="w-4 h-4 mr-2" />
                        Call
                      </button>
                      <a
                        href={`sms:${formData.phone}`}
                        className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                      >
                        <MessageSquare className="w-4 h-4 mr-2" />
                        SMS
                      </a>
                    </>
                  )}
                  {formData.email && (
                    <a
                      href={`mailto:${formData.email}`}
                      className="inline-flex items-center px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
                    >
                      <Mail className="w-4 h-4 mr-2" />
                      Email
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Address */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <MapPin className="w-5 h-5 mr-2 text-panda-primary" />
              Address Information
            </h2>

            {/* Billing Address */}
            <div className="space-y-4">
              <h3 className="font-medium text-gray-900">Billing Address</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Street</label>
                  <input
                    type="text"
                    name="billingStreet"
                    value={formData.billingStreet}
                    onChange={handleInputChange}
                    placeholder="123 Main St"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input
                    type="text"
                    name="billingCity"
                    value={formData.billingCity}
                    onChange={handleInputChange}
                    placeholder="Baltimore"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                    <select
                      name="billingState"
                      value={formData.billingState}
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
                      name="billingPostalCode"
                      value={formData.billingPostalCode}
                      onChange={handleInputChange}
                      placeholder="21201"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Shipping Address */}
            <div className="pt-6 border-t border-gray-200 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-gray-900">Shipping / Project Address</h3>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="sameAsBilling"
                    checked={formData.sameAsBilling}
                    onChange={handleInputChange}
                    className="w-4 h-4 text-panda-primary border-gray-300 rounded focus:ring-panda-primary"
                  />
                  <span className="text-sm text-gray-600">Same as billing</span>
                </label>
              </div>

              {!formData.sameAsBilling && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Street</label>
                    <input
                      type="text"
                      name="shippingStreet"
                      value={formData.shippingStreet}
                      onChange={handleInputChange}
                      placeholder="123 Main St"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                    <input
                      type="text"
                      name="shippingCity"
                      value={formData.shippingCity}
                      onChange={handleInputChange}
                      placeholder="Baltimore"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                      <select
                        name="shippingState"
                        value={formData.shippingState}
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
                        name="shippingPostalCode"
                        value={formData.shippingPostalCode}
                        onChange={handleInputChange}
                        placeholder="21201"
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Contacts */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                <Users className="w-5 h-5 mr-2 text-panda-primary" />
                Contact People
              </h2>
              <button
                onClick={handleAddContact}
                className="inline-flex items-center px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Contact
              </button>
            </div>

            {formData.contacts.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <Users className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No contacts added</h3>
                <p className="text-gray-500 mb-4">Add contact people for this account</p>
                <button
                  onClick={handleAddContact}
                  className="inline-flex items-center px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 transition-colors"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add First Contact
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {formData.contacts.map((contact, index) => (
                  <div key={contact.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <span className="text-sm font-medium text-gray-500">Contact {index + 1}</span>
                        {contact.isPrimary && (
                          <span className="px-2 py-0.5 bg-panda-primary/10 text-panda-primary text-xs font-medium rounded-full">
                            Primary
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        {!contact.isPrimary && (
                          <button
                            onClick={() => handleContactChange(contact.id, 'isPrimary', true)}
                            className="text-sm text-panda-primary hover:text-panda-primary/80"
                          >
                            Set as Primary
                          </button>
                        )}
                        <button
                          onClick={() => handleRemoveContact(contact.id)}
                          className="p-1 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                        <input
                          type="text"
                          value={contact.firstName}
                          onChange={(e) => handleContactChange(contact.id, 'firstName', e.target.value)}
                          placeholder="John"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                        <input
                          type="text"
                          value={contact.lastName}
                          onChange={(e) => handleContactChange(contact.id, 'lastName', e.target.value)}
                          placeholder="Smith"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                        <input
                          type="tel"
                          value={contact.phone}
                          onChange={(e) => handleContactChange(contact.id, 'phone', e.target.value)}
                          placeholder="(410) 555-1234"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input
                          type="email"
                          value={contact.email}
                          onChange={(e) => handleContactChange(contact.id, 'email', e.target.value)}
                          placeholder="email@example.com"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                        />
                      </div>
                    </div>
                    {/* Contact Quick Actions */}
                    {(contact.phone || contact.email) && (
                      <div className="mt-4 pt-4 border-t border-gray-200 flex flex-wrap gap-2">
                        {contact.phone && (
                          <>
                            <button
                              onClick={() => clickToCall(contact.phone)}
                              className="inline-flex items-center px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm hover:bg-green-200 transition-colors"
                            >
                              <Phone className="w-3 h-3 mr-1.5" />
                              Call
                            </button>
                            <a
                              href={`sms:${contact.phone}`}
                              className="inline-flex items-center px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm hover:bg-blue-200 transition-colors"
                            >
                              <MessageSquare className="w-3 h-3 mr-1.5" />
                              SMS
                            </a>
                          </>
                        )}
                        {contact.email && (
                          <a
                            href={`mailto:${contact.email}`}
                            className="inline-flex items-center px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-sm hover:bg-purple-200 transition-colors"
                          >
                            <Mail className="w-3 h-3 mr-1.5" />
                            Email
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                ))}
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
              {/* Account Details */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                  <Building2 className="w-4 h-4 mr-2" />
                  Account Details
                </h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Name:</dt>
                    <dd className="font-medium text-gray-900">{formData.name || '-'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Type:</dt>
                    <dd className="font-medium text-gray-900">{formData.type}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Status:</dt>
                    <dd>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusStyle(formData.status)}`}>
                        {formData.status}
                      </span>
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Industry:</dt>
                    <dd className="font-medium text-gray-900">{formData.industry}</dd>
                  </div>
                </dl>
              </div>

              {/* Contact Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                  <Phone className="w-4 h-4 mr-2" />
                  Contact Info
                </h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Phone:</dt>
                    <dd className="font-medium text-gray-900">{formData.phone || '-'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Email:</dt>
                    <dd className="font-medium text-gray-900">{formData.email || '-'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Website:</dt>
                    <dd className="font-medium text-gray-900">{formData.website || '-'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Contacts:</dt>
                    <dd className="font-medium text-gray-900">{formData.contacts.length} people</dd>
                  </div>
                </dl>
              </div>

              {/* Billing Address */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                  <MapPin className="w-4 h-4 mr-2" />
                  Billing Address
                </h3>
                <p className="text-sm text-gray-900">
                  {formData.billingStreet ? (
                    <>
                      {formData.billingStreet}<br />
                      {formData.billingCity}, {formData.billingState} {formData.billingPostalCode}
                    </>
                  ) : (
                    <span className="text-gray-500">No address provided</span>
                  )}
                </p>
              </div>

              {/* Shipping Address */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                  <MapPin className="w-4 h-4 mr-2" />
                  Project Address
                </h3>
                {formData.sameAsBilling ? (
                  <p className="text-sm text-gray-500 italic">Same as billing address</p>
                ) : (
                  <p className="text-sm text-gray-900">
                    {formData.shippingStreet ? (
                      <>
                        {formData.shippingStreet}<br />
                        {formData.shippingCity}, {formData.shippingState} {formData.shippingPostalCode}
                      </>
                    ) : (
                      <span className="text-gray-500">No address provided</span>
                    )}
                  </p>
                )}
              </div>
            </div>

            {/* Contacts List */}
            {formData.contacts.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                  <Users className="w-4 h-4 mr-2" />
                  Contacts ({formData.contacts.length})
                </h3>
                <div className="space-y-2">
                  {formData.contacts.map(contact => (
                    <div key={contact.id} className="flex items-center justify-between p-3 bg-white rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-panda-primary/10 rounded-full flex items-center justify-center">
                          <User className="w-4 h-4 text-panda-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {contact.firstName} {contact.lastName}
                            {contact.isPrimary && (
                              <span className="ml-2 text-xs text-panda-primary">(Primary)</span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500">{contact.phone} • {contact.email}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Completion Checklist */}
            <div className="bg-blue-50 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-3">Completion Checklist</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { label: 'Account Name', check: !!formData.name },
                  { label: 'Phone or Email', check: !!formData.phone || !!formData.email },
                  { label: 'Address', check: !!formData.billingStreet && !!formData.billingCity },
                  { label: 'Account Type', check: !!formData.type },
                  { label: 'Status', check: !!formData.status },
                  { label: 'Contacts', check: formData.contacts.length > 0 },
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
                          activity.type === 'Task' ? 'bg-yellow-100' : 'bg-blue-100'
                        }`}>
                          {activity.type === 'Call' && <Phone className="w-4 h-4 text-green-600" />}
                          {activity.type === 'Task' && <CheckCircle className="w-4 h-4 text-yellow-600" />}
                          {activity.type === 'Opportunity' && <Briefcase className="w-4 h-4 text-blue-600" />}
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
                  {isNew ? 'Create Account' : 'Update Account'}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
