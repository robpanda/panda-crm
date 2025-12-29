import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Wrench,
  Building2,
  User,
  Calendar,
  Clock,
  MapPin,
  Truck,
  Users,
  FileText,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Package,
  DollarSign,
  ClipboardList,
  Camera,
  Link as LinkIcon,
  AlertCircle,
  Loader2,
  Navigation,
  RefreshCw,
} from 'lucide-react';
import { workOrdersApi, accountsApi, contactsApi, scheduleApi, usersApi } from '../services/api';

// Work Order Statuses
const WORK_ORDER_STATUSES = [
  { value: 'READY_TO_SCHEDULE', label: 'Ready to Schedule' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'ON_HOLD', label: 'On Hold' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

// Decking Inspection Options
const DECKING_INSPECTION_OPTIONS = [
  { value: '', label: '--None--' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'PASSED', label: 'Passed' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'NOT_REQUIRED', label: 'Not Required' },
];

// Work Completed Options
const WORK_COMPLETED_OPTIONS = [
  { value: '', label: '--None--' },
  { value: 'YES', label: 'Yes' },
  { value: 'NO', label: 'No' },
  { value: 'PARTIAL', label: 'Partial' },
];

// Priority Options
const PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Low' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
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

// Wizard Steps matching Salesforce sections
const steps = [
  { id: 1, name: 'Information', icon: ClipboardList, description: 'Account, Contact, Work Type' },
  { id: 2, name: 'Orders', icon: Package, description: 'Material & Labor Orders' },
  { id: 3, name: 'Assignment', icon: Users, description: 'PM, Crew, Instructions' },
  { id: 4, name: 'Description', icon: FileText, description: 'Subject, Description, Address' },
  { id: 5, name: 'Review', icon: CheckCircle, description: 'Review and create' },
];

export default function WorkOrderWizard() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  // Pre-populate from query params (e.g., from Opportunity)
  const opportunityId = searchParams.get('opportunityId');
  const accountIdParam = searchParams.get('accountId');

  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(!isNew);
  const [isSaving, setIsSaving] = useState(false);
  const [workOrder, setWorkOrder] = useState(null);

  // Lookup data
  const [accounts, setAccounts] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [workTypes, setWorkTypes] = useState([]);
  const [crews, setCrews] = useState([]);
  const [users, setUsers] = useState([]);

  // Search states
  const [accountSearch, setAccountSearch] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [crewSearch, setCrewSearch] = useState('');
  const [crewLeadSearch, setCrewLeadSearch] = useState('');

  // Map states for pin drop
  const [isGeocodingAddress, setIsGeocodingAddress] = useState(false);
  const [mapError, setMapError] = useState('');

  // Form data matching Salesforce Work Order fields
  const [formData, setFormData] = useState({
    // Information Section
    accountId: accountIdParam || '',
    accountName: '',
    contactId: '',
    contactName: '',
    companyCamProjectLink: '', // Calculated on save
    companyCamInvitation: '',
    workTypeId: '',
    workTypeName: '',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',

    // Orders Section
    materialOrderId: '',
    materialOrderTotal: 0,
    laborOrderId: '',
    laborOrderTotal: 0,

    // Assignment Section
    projectManagerId: '', // Calculated
    projectManagerName: '',
    crewAssignedId: '',
    crewAssignedName: '',
    crewLeadAssignedId: '',
    crewLeadAssignedName: '',
    crewInstructions: '',

    // Description Section
    subject: '',
    description: '',
    street: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'USA',
    latitude: '',
    longitude: '',

    // Material Order Details
    materialOrderStatus: '',

    // Labor Order Details
    laborOrderStatus: '',

    // Remote PM
    remotePM: false,

    // Status Section
    status: 'READY_TO_SCHEDULE',
    deckingInspection: '',
    workCompleted: '',

    // Priority
    priority: 'NORMAL',

    // Related
    opportunityId: opportunityId || '',
  });

  // Load data
  useEffect(() => {
    loadWorkTypes();
    loadUsers();
    if (!isNew) {
      loadWorkOrder();
    } else if (accountIdParam) {
      loadAccountDetails(accountIdParam);
    }
  }, [id, accountIdParam]);

  // Load contacts when account changes
  useEffect(() => {
    if (formData.accountId) {
      loadContacts(formData.accountId);
    }
  }, [formData.accountId]);

  const loadWorkOrder = async () => {
    setIsLoading(true);
    try {
      const data = await workOrdersApi.getWorkOrder(id);
      setWorkOrder(data);

      // Format dates for input
      const formatDateForInput = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toISOString().split('T')[0];
      };

      const formatTimeForInput = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toTimeString().slice(0, 5);
      };

      setFormData({
        accountId: data.accountId || '',
        accountName: data.account?.name || '',
        contactId: data.contactId || '',
        contactName: data.contact?.name || '',
        companyCamProjectLink: data.companyCamProjectLink || '',
        companyCamInvitation: data.companyCamInvitation || '',
        workTypeId: data.workTypeId || '',
        workTypeName: data.workType?.name || '',
        startDate: formatDateForInput(data.startDate),
        startTime: formatTimeForInput(data.startDate),
        endDate: formatDateForInput(data.endDate),
        endTime: formatTimeForInput(data.endDate),
        materialOrderId: data.materialOrderId || '',
        materialOrderTotal: data.materialOrderTotal || 0,
        laborOrderId: data.laborOrderId || '',
        laborOrderTotal: data.laborOrderTotal || 0,
        projectManagerId: data.projectManagerId || '',
        projectManagerName: data.projectManager?.name || '',
        crewAssignedId: data.crewAssignedId || '',
        crewAssignedName: data.crewAssigned?.name || '',
        crewLeadAssignedId: data.crewLeadAssignedId || '',
        crewLeadAssignedName: data.crewLeadAssigned?.name || '',
        crewInstructions: data.crewInstructions || '',
        subject: data.subject || '',
        description: data.description || '',
        street: data.street || '',
        city: data.city || '',
        state: data.state || '',
        postalCode: data.postalCode || '',
        country: data.country || 'USA',
        latitude: data.latitude || '',
        longitude: data.longitude || '',
        materialOrderStatus: data.materialOrderStatus || '',
        laborOrderStatus: data.laborOrderStatus || '',
        remotePM: data.remotePM || false,
        status: data.status || 'READY_TO_SCHEDULE',
        deckingInspection: data.deckingInspection || '',
        workCompleted: data.workCompleted || '',
        priority: data.priority || 'NORMAL',
        opportunityId: data.opportunityId || '',
      });
    } catch (error) {
      console.error('Error loading work order:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAccountDetails = async (accountId) => {
    try {
      const account = await accountsApi.getAccount(accountId);
      setFormData(prev => ({
        ...prev,
        accountId: account.id,
        accountName: account.name,
        street: account.billingStreet || account.shippingStreet || '',
        city: account.billingCity || account.shippingCity || '',
        state: account.billingState || account.shippingState || '',
        postalCode: account.billingPostalCode || account.shippingPostalCode || '',
      }));
    } catch (error) {
      console.error('Error loading account:', error);
    }
  };

  const loadContacts = async (accountId) => {
    try {
      const response = await contactsApi.getContacts({ accountId, limit: 50 });
      setContacts(response.data || []);
    } catch (error) {
      console.error('Error loading contacts:', error);
    }
  };

  const loadWorkTypes = async () => {
    try {
      const response = await workOrdersApi.getWorkTypes();
      setWorkTypes(response || []);
    } catch (error) {
      console.error('Error loading work types:', error);
      // Fallback work types matching Salesforce
      setWorkTypes([
        { id: '1', name: 'Installation' },
        { id: '2', name: 'Inspection' },
        { id: '3', name: 'Retail Demo' },
        { id: '4', name: '2nd Visit' },
        { id: '5', name: 'Adjustment' },
        { id: '6', name: 'ATR' },
        { id: '7', name: 'Spec' },
        { id: '8', name: 'Repair' },
        { id: '9', name: 'Warranty' },
        { id: '10', name: 'Roof Replacement' },
        { id: '11', name: 'Gutter Installation' },
        { id: '12', name: 'Siding Installation' },
      ]);
    }
  };

  const loadUsers = async () => {
    try {
      const response = await usersApi.getUsers({ limit: 100 });
      setUsers(response.data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleAccountSelect = async (account) => {
    setFormData(prev => ({
      ...prev,
      accountId: account.id,
      accountName: account.name,
    }));
    setAccountSearch('');

    // Load contacts for this account
    await loadContacts(account.id);
  };

  const handleContactSelect = (contact) => {
    setFormData(prev => ({
      ...prev,
      contactId: contact.id,
      contactName: contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
    }));
    setContactSearch('');
  };

  const handleCrewSelect = (crew) => {
    setFormData(prev => ({
      ...prev,
      crewAssignedId: crew.id,
      crewAssignedName: crew.name,
    }));
    setCrewSearch('');
  };

  const handleCrewLeadSelect = (contact) => {
    setFormData(prev => ({
      ...prev,
      crewLeadAssignedId: contact.id,
      crewLeadAssignedName: contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
    }));
    setCrewLeadSearch('');
  };

  const handleWorkTypeSelect = (workType) => {
    setFormData(prev => ({
      ...prev,
      workTypeId: workType.id,
      workTypeName: workType.name,
    }));
  };

  // Geocode address to get lat/long
  const geocodeAddress = async () => {
    const { street, city, state, postalCode } = formData;
    if (!street || !city || !state) {
      setMapError('Please enter street, city, and state to locate on map');
      return;
    }

    setIsGeocodingAddress(true);
    setMapError('');

    try {
      const address = `${street}, ${city}, ${state} ${postalCode}`.trim();
      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

      if (!apiKey) {
        setMapError('Google Maps API key not configured');
        return;
      }

      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`
      );
      const data = await response.json();

      if (data.status === 'OK' && data.results.length > 0) {
        const location = data.results[0].geometry.location;
        setFormData(prev => ({
          ...prev,
          latitude: location.lat.toFixed(6),
          longitude: location.lng.toFixed(6),
        }));
        setMapError('');
      } else {
        setMapError('Could not find location. Please verify the address or adjust the pin manually.');
      }
    } catch (error) {
      console.error('Geocoding error:', error);
      setMapError('Error looking up address. Please try again.');
    } finally {
      setIsGeocodingAddress(false);
    }
  };

  // Handle manual lat/long input
  const handleLatLongChange = (field, value) => {
    // Allow numbers, decimal point, and negative sign
    const cleanValue = value.replace(/[^0-9.-]/g, '');
    setFormData(prev => ({
      ...prev,
      [field]: cleanValue,
    }));
  };

  const searchAccounts = async (query) => {
    if (query.length < 2) {
      setAccounts([]);
      return;
    }
    try {
      const response = await accountsApi.searchAccounts(query);
      setAccounts(response || []);
    } catch (error) {
      console.error('Error searching accounts:', error);
    }
  };

  const searchCrews = async (query) => {
    if (query.length < 2) {
      setCrews([]);
      return;
    }
    try {
      // Search for accounts that are contractors/crews
      const response = await accountsApi.searchAccounts(query);
      setCrews(response || []);
    } catch (error) {
      console.error('Error searching crews:', error);
    }
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
      // Combine date and time
      const combineDateTime = (date, time) => {
        if (!date) return null;
        if (!time) return new Date(date).toISOString();
        return new Date(`${date}T${time}`).toISOString();
      };

      const payload = {
        accountId: formData.accountId || null,
        contactId: formData.contactId || null,
        opportunityId: formData.opportunityId || null,
        workTypeId: formData.workTypeId || null,
        subject: formData.subject,
        description: formData.description,
        status: formData.status,
        priority: formData.priority,
        startDate: combineDateTime(formData.startDate, formData.startTime),
        endDate: combineDateTime(formData.endDate, formData.endTime),
        street: formData.street,
        city: formData.city,
        state: formData.state,
        postalCode: formData.postalCode,
        country: formData.country,
        crewAssignedId: formData.crewAssignedId || null,
        crewLeadAssignedId: formData.crewLeadAssignedId || null,
        crewInstructions: formData.crewInstructions,
        materialOrderId: formData.materialOrderId || null,
        laborOrderId: formData.laborOrderId || null,
        deckingInspection: formData.deckingInspection || null,
        workCompleted: formData.workCompleted || null,
        remotePM: formData.remotePM,
      };

      if (isNew) {
        await workOrdersApi.createWorkOrder(payload);
      } else {
        await workOrdersApi.updateWorkOrder(id, payload);
      }

      navigate('/workorders');
    } catch (error) {
      console.error('Error saving work order:', error);
      alert('Error saving work order: ' + (error.response?.data?.message || error.message));
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate completion score
  const calculateCompletionScore = () => {
    let score = 0;
    if (formData.accountId) score += 15;
    if (formData.workTypeId) score += 15;
    if (formData.subject) score += 15;
    if (formData.startDate) score += 10;
    if (formData.street) score += 10;
    if (formData.crewAssignedId) score += 15;
    if (formData.status) score += 10;
    if (formData.description) score += 10;
    return score;
  };

  const completionScore = calculateCompletionScore();

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
                {isNew ? 'New Work Order' : `Edit: ${workOrder?.workOrderNumber || 'Work Order'}`}
              </h1>
              <p className="text-sm text-gray-500">
                {isNew ? 'Create a new work order' : 'Update work order details'}
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

        {/* Step 1: Information */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <ClipboardList className="w-5 h-5 mr-2 text-panda-primary" />
              Information
            </h2>
            <p className="text-sm text-gray-500">* = Required Information</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Account Search */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Account *
                </label>
                <div className="relative">
                  {formData.accountId ? (
                    <div className="flex items-center justify-between px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50">
                      <div className="flex items-center space-x-2">
                        <Building2 className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-900">{formData.accountName}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, accountId: '', accountName: '' }))}
                        className="p-1 hover:bg-gray-200 rounded"
                      >
                        <X className="w-4 h-4 text-gray-500" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={accountSearch}
                        onChange={(e) => {
                          setAccountSearch(e.target.value);
                          searchAccounts(e.target.value);
                        }}
                        placeholder="Search Accounts..."
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                      />
                      {accounts.length > 0 && accountSearch && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
                          {accounts.map(account => (
                            <button
                              key={account.id}
                              type="button"
                              onClick={() => handleAccountSelect(account)}
                              className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-2"
                            >
                              <Building2 className="w-4 h-4 text-gray-400" />
                              <span>{account.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Contact Search */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact
                </label>
                <div className="relative">
                  {formData.contactId ? (
                    <div className="flex items-center justify-between px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50">
                      <div className="flex items-center space-x-2">
                        <User className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-900">{formData.contactName}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, contactId: '', contactName: '' }))}
                        className="p-1 hover:bg-gray-200 rounded"
                      >
                        <X className="w-4 h-4 text-gray-500" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={contactSearch}
                        onChange={(e) => setContactSearch(e.target.value)}
                        placeholder="Search Contacts..."
                        disabled={!formData.accountId}
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent disabled:bg-gray-100"
                      />
                      {contacts.length > 0 && contactSearch && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
                          {contacts
                            .filter(c => {
                              const name = c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim();
                              return name.toLowerCase().includes(contactSearch.toLowerCase());
                            })
                            .map(contact => (
                              <button
                                key={contact.id}
                                type="button"
                                onClick={() => handleContactSelect(contact)}
                                className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-2"
                              >
                                <User className="w-4 h-4 text-gray-400" />
                                <span>{contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim()}</span>
                              </button>
                            ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* CompanyCam Project Link */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CompanyCam Project Link
                </label>
                <div className="relative">
                  <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    name="companyCamProjectLink"
                    value={formData.companyCamProjectLink}
                    readOnly
                    placeholder="This field is calculated upon save"
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
                  />
                </div>
              </div>

              {/* CompanyCam Invitation */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CompanyCam Invitation
                </label>
                <div className="relative">
                  <Camera className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    name="companyCamInvitation"
                    value={formData.companyCamInvitation}
                    onChange={handleInputChange}
                    placeholder="Invitation link..."
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  />
                </div>
              </div>

              {/* Work Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Work Type *
                </label>
                <select
                  name="workTypeId"
                  value={formData.workTypeId}
                  onChange={(e) => {
                    const selected = workTypes.find(w => w.id === e.target.value);
                    handleInputChange(e);
                    if (selected) {
                      setFormData(prev => ({ ...prev, workTypeName: selected.name }));
                    }
                  }}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                >
                  <option value="">Search Work Types...</option>
                  {workTypes.map(wt => (
                    <option key={wt.id} value={wt.id}>{wt.name}</option>
                  ))}
                </select>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Priority
                </label>
                <select
                  name="priority"
                  value={formData.priority}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                >
                  {PRIORITY_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Start Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="date"
                      name="startDate"
                      value={formData.startDate}
                      onChange={handleInputChange}
                      placeholder="Format: 12/31/2024"
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                    />
                  </div>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="time"
                      name="startTime"
                      value={formData.startTime}
                      onChange={handleInputChange}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* End Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="date"
                      name="endDate"
                      value={formData.endDate}
                      onChange={handleInputChange}
                      placeholder="Format: 12/31/2024"
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                    />
                  </div>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="time"
                      name="endTime"
                      value={formData.endTime}
                      onChange={handleInputChange}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Orders */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <Package className="w-5 h-5 mr-2 text-panda-primary" />
              Orders
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Material Order */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                <h3 className="font-medium text-gray-900 flex items-center">
                  <Truck className="w-4 h-4 mr-2 text-gray-500" />
                  Material Order
                </h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Material Order
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      name="materialOrderId"
                      value={formData.materialOrderId}
                      onChange={handleInputChange}
                      placeholder="Search Orders..."
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Material Order Total
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={`$${formData.materialOrderTotal.toFixed(2)}`}
                      readOnly
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg bg-gray-100 text-gray-500"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">This field is calculated upon save</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    name="materialOrderStatus"
                    value={formData.materialOrderStatus}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  >
                    <option value="">Select status...</option>
                    <option value="PENDING">Pending</option>
                    <option value="ORDERED">Ordered</option>
                    <option value="DELIVERED">Delivered</option>
                  </select>
                </div>
              </div>

              {/* Labor Order */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                <h3 className="font-medium text-gray-900 flex items-center">
                  <Users className="w-4 h-4 mr-2 text-gray-500" />
                  Labor Order
                </h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Labor Order
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      name="laborOrderId"
                      value={formData.laborOrderId}
                      onChange={handleInputChange}
                      placeholder="Search Orders..."
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Labor Order Total
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={`$${formData.laborOrderTotal.toFixed(2)}`}
                      readOnly
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg bg-gray-100 text-gray-500"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">This field is calculated upon save</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    name="laborOrderStatus"
                    value={formData.laborOrderStatus}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  >
                    <option value="">Select status...</option>
                    <option value="PENDING">Pending</option>
                    <option value="ASSIGNED">Assigned</option>
                    <option value="COMPLETED">Completed</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Assignment */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <Users className="w-5 h-5 mr-2 text-panda-primary" />
              Assignment
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Project Manager */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project Manager
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={formData.projectManagerName || 'This field is calculated upon save'}
                    readOnly
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
                  />
                </div>
              </div>

              {/* Remote PM Toggle */}
              <div className="flex items-center">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    name="remotePM"
                    checked={formData.remotePM}
                    onChange={handleInputChange}
                    className="w-5 h-5 rounded border-gray-300 text-panda-primary focus:ring-panda-primary"
                  />
                  <span className="ml-2 text-sm font-medium text-gray-700">Remote PM</span>
                </label>
              </div>

              {/* Crew Assigned */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Crew Assigned
                </label>
                <div className="relative">
                  {formData.crewAssignedId ? (
                    <div className="flex items-center justify-between px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50">
                      <div className="flex items-center space-x-2">
                        <Users className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-900">{formData.crewAssignedName}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, crewAssignedId: '', crewAssignedName: '' }))}
                        className="p-1 hover:bg-gray-200 rounded"
                      >
                        <X className="w-4 h-4 text-gray-500" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={crewSearch}
                        onChange={(e) => {
                          setCrewSearch(e.target.value);
                          searchCrews(e.target.value);
                        }}
                        placeholder="Search Accounts..."
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                      />
                      {crews.length > 0 && crewSearch && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
                          {crews.map(crew => (
                            <button
                              key={crew.id}
                              type="button"
                              onClick={() => handleCrewSelect(crew)}
                              className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-2"
                            >
                              <Users className="w-4 h-4 text-gray-400" />
                              <span>{crew.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Crew Lead Assigned */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Crew Lead Assigned
                </label>
                <div className="relative">
                  {formData.crewLeadAssignedId ? (
                    <div className="flex items-center justify-between px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50">
                      <div className="flex items-center space-x-2">
                        <User className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-900">{formData.crewLeadAssignedName}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, crewLeadAssignedId: '', crewLeadAssignedName: '' }))}
                        className="p-1 hover:bg-gray-200 rounded"
                      >
                        <X className="w-4 h-4 text-gray-500" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={crewLeadSearch}
                        onChange={(e) => setCrewLeadSearch(e.target.value)}
                        placeholder="Search Contacts..."
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                      />
                    </>
                  )}
                </div>
              </div>

              {/* Crew Instructions */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Crew Instructions
                </label>
                <textarea
                  name="crewInstructions"
                  value={formData.crewInstructions}
                  onChange={handleInputChange}
                  rows={4}
                  placeholder="Enter instructions for the crew..."
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Description */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <FileText className="w-5 h-5 mr-2 text-panda-primary" />
              Description
            </h2>

            <div className="grid grid-cols-1 gap-6">
              {/* Subject */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Subject *
                </label>
                <input
                  type="text"
                  name="subject"
                  value={formData.subject}
                  onChange={handleInputChange}
                  placeholder="e.g., Roof Installation"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows={4}
                  placeholder="Add any notes or special instructions..."
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                />
              </div>
            </div>

            {/* Address Section */}
            <div className="pt-6 border-t border-gray-200">
              <h3 className="text-md font-semibold text-gray-900 flex items-center mb-4">
                <MapPin className="w-5 h-5 mr-2 text-gray-500" />
                Address
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">State/Province</label>
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Zip/Postal Code</label>
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                  <input
                    type="text"
                    name="country"
                    value={formData.country}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  />
                </div>
              </div>

              {/* Map with Pin Drop for Quick Measurements */}
              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-900 flex items-center">
                    <Navigation className="w-4 h-4 mr-2 text-panda-primary" />
                    Location Coordinates (for Quick Measurements)
                  </h4>
                  <button
                    type="button"
                    onClick={geocodeAddress}
                    disabled={isGeocodingAddress || !formData.street || !formData.city || !formData.state}
                    className="flex items-center space-x-2 px-3 py-1.5 text-sm font-medium text-panda-primary bg-panda-primary/10 rounded-lg hover:bg-panda-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isGeocodingAddress ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Locating...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        <span>Get Coordinates</span>
                      </>
                    )}
                  </button>
                </div>

                {mapError && (
                  <div className="flex items-center space-x-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                    <p className="text-sm text-yellow-700">{mapError}</p>
                  </div>
                )}

                {/* Map Preview with Pin */}
                {formData.street && formData.city && formData.state && (
                  <div className="relative rounded-xl overflow-hidden border border-gray-200">
                    <div className="h-64 bg-gray-100">
                      {formData.latitude && formData.longitude ? (
                        <img
                          src={`https://maps.googleapis.com/maps/api/staticmap?center=${formData.latitude},${formData.longitude}&zoom=18&size=800x300&scale=2&maptype=satellite&markers=color:red%7C${formData.latitude},${formData.longitude}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''}`}
                          alt="Property location"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                          }}
                        />
                      ) : (
                        <img
                          src={`https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(`${formData.street}, ${formData.city}, ${formData.state} ${formData.postalCode}`)}&zoom=18&size=800x300&scale=2&maptype=satellite&markers=color:red%7C${encodeURIComponent(`${formData.street}, ${formData.city}, ${formData.state} ${formData.postalCode}`)}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''}`}
                          alt="Property location"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                          }}
                        />
                      )}
                      <div className="absolute inset-0 items-center justify-center hidden bg-gray-100">
                        <div className="text-center text-gray-500">
                          <MapPin className="w-8 h-8 mx-auto mb-2" />
                          <p className="text-sm font-medium">Map Preview</p>
                          <p className="text-xs">{formData.street}, {formData.city}, {formData.state}</p>
                        </div>
                      </div>
                    </div>
                    {/* Coordinate Overlay */}
                    {formData.latitude && formData.longitude && (
                      <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                        {formData.latitude}, {formData.longitude}
                      </div>
                    )}
                  </div>
                )}

                {/* Latitude & Longitude Inputs */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Latitude
                    </label>
                    <input
                      type="text"
                      value={formData.latitude}
                      onChange={(e) => handleLatLongChange('latitude', e.target.value)}
                      placeholder="e.g., 39.290385"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Longitude
                    </label>
                    <input
                      type="text"
                      value={formData.longitude}
                      onChange={(e) => handleLatLongChange('longitude', e.target.value)}
                      placeholder="e.g., -76.612189"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent font-mono text-sm"
                    />
                  </div>
                </div>

                <p className="text-xs text-gray-500 flex items-center">
                  <AlertCircle className="w-3.5 h-3.5 mr-1" />
                  Click "Get Coordinates" to auto-fill from address, or enter manually. Coordinates are required for EagleView/GAF Quick Measurements.
                </p>
              </div>
            </div>

            {/* Status Section */}
            <div className="pt-6 border-t border-gray-200">
              <h3 className="text-md font-semibold text-gray-900 flex items-center mb-4">
                <AlertCircle className="w-5 h-5 mr-2 text-gray-500" />
                Status
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  >
                    {WORK_ORDER_STATUSES.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Decking Inspection</label>
                  <select
                    name="deckingInspection"
                    value={formData.deckingInspection}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  >
                    {DECKING_INSPECTION_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Work Completed</label>
                  <select
                    name="workCompleted"
                    value={formData.workCompleted}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  >
                    {WORK_COMPLETED_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Review */}
        {currentStep === 5 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <CheckCircle className="w-5 h-5 mr-2 text-panda-primary" />
              Review & {isNew ? 'Create' : 'Update'}
            </h2>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Information */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                  <ClipboardList className="w-4 h-4 mr-2" />
                  Information
                </h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Account:</dt>
                    <dd className="font-medium text-gray-900">{formData.accountName || '-'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Contact:</dt>
                    <dd className="font-medium text-gray-900">{formData.contactName || '-'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Work Type:</dt>
                    <dd className="font-medium text-gray-900">{formData.workTypeName || '-'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Start Date:</dt>
                    <dd className="font-medium text-gray-900">
                      {formData.startDate ? `${formData.startDate} ${formData.startTime || ''}` : '-'}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Orders */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                  <Package className="w-4 h-4 mr-2" />
                  Orders
                </h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Material Order:</dt>
                    <dd className="font-medium text-gray-900">{formData.materialOrderId || '-'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Material Total:</dt>
                    <dd className="font-medium text-gray-900">${formData.materialOrderTotal.toFixed(2)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Labor Order:</dt>
                    <dd className="font-medium text-gray-900">{formData.laborOrderId || '-'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Labor Total:</dt>
                    <dd className="font-medium text-gray-900">${formData.laborOrderTotal.toFixed(2)}</dd>
                  </div>
                </dl>
              </div>

              {/* Assignment */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                  <Users className="w-4 h-4 mr-2" />
                  Assignment
                </h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Crew Assigned:</dt>
                    <dd className="font-medium text-gray-900">{formData.crewAssignedName || '-'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Crew Lead:</dt>
                    <dd className="font-medium text-gray-900">{formData.crewLeadAssignedName || '-'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Remote PM:</dt>
                    <dd className="font-medium text-gray-900">{formData.remotePM ? 'Yes' : 'No'}</dd>
                  </div>
                </dl>
              </div>

              {/* Status */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                  <AlertCircle className="w-4 h-4 mr-2" />
                  Status
                </h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Status:</dt>
                    <dd className="font-medium text-gray-900">
                      {WORK_ORDER_STATUSES.find(s => s.value === formData.status)?.label || formData.status}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Priority:</dt>
                    <dd className="font-medium text-gray-900">
                      {PRIORITY_OPTIONS.find(p => p.value === formData.priority)?.label || formData.priority}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Decking Inspection:</dt>
                    <dd className="font-medium text-gray-900">
                      {DECKING_INSPECTION_OPTIONS.find(d => d.value === formData.deckingInspection)?.label || '-'}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Description & Address */}
              <div className="md:col-span-2 bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                  <FileText className="w-4 h-4 mr-2" />
                  Description & Address
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Subject:</p>
                    <p className="text-sm font-medium text-gray-900">{formData.subject || '-'}</p>
                    {formData.description && (
                      <>
                        <p className="text-sm text-gray-500 mb-1 mt-3">Description:</p>
                        <p className="text-sm text-gray-900">{formData.description}</p>
                      </>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Address:</p>
                    <p className="text-sm text-gray-900">
                      {formData.street ? (
                        <>
                          {formData.street}<br />
                          {formData.city}, {formData.state} {formData.postalCode}<br />
                          {formData.country}
                        </>
                      ) : (
                        <span className="text-gray-500">No address provided</span>
                      )}
                    </p>
                  </div>
                  {/* Coordinates for Quick Measurements */}
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Coordinates:</p>
                    <p className="text-sm text-gray-900 font-mono">
                      {formData.latitude && formData.longitude ? (
                        <>
                          Lat: {formData.latitude}<br />
                          Long: {formData.longitude}
                        </>
                      ) : (
                        <span className="text-yellow-600">⚠ Not set (required for Quick Measurements)</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Completion Checklist */}
            <div className="bg-blue-50 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-3">Completion Checklist</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Account', check: !!formData.accountId },
                  { label: 'Work Type', check: !!formData.workTypeId },
                  { label: 'Subject', check: !!formData.subject },
                  { label: 'Start Date', check: !!formData.startDate },
                  { label: 'Address', check: !!formData.street },
                  { label: 'Coordinates', check: !!(formData.latitude && formData.longitude) },
                  { label: 'Crew Assigned', check: !!formData.crewAssignedId },
                  { label: 'Status', check: !!formData.status },
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
              disabled={isSaving || completionScore < 30}
              className={`inline-flex items-center px-6 py-2 rounded-lg transition-colors ${
                isSaving || completionScore < 30
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
                  {isNew ? 'Create Work Order' : 'Update Work Order'}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
