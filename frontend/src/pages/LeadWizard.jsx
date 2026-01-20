import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Phone,
  Mail,
  MessageSquare,
  MapPin,
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  User,
  Building,
  Star,
  AlertCircle,
  Loader2,
  Save,
  ArrowRight,
  FileText,
  CheckCircle,
  Target,
  Sparkles,
  Users,
  Search,
  Home,
  Briefcase,
  Send,
  ChevronDown,
  PhoneCall,
} from 'lucide-react';
import { leadsApi, usersApi, bamboogliApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useRingCentral } from '../context/RingCentralContext';
import { useMutation } from '@tanstack/react-query';
import AddressAutocomplete from '../components/AddressAutocomplete';

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

const LEAD_STATUSES = [
  { value: 'New', label: 'New', color: 'bg-blue-100 text-blue-800' },
  { value: 'Lead Not Set', label: 'Lead Not Set', color: 'bg-gray-100 text-gray-800' },
  { value: 'Lead Set', label: 'Lead Set', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'Confirmed', label: 'Confirmed', color: 'bg-green-100 text-green-800' },
  { value: 'Canceled', label: 'Canceled', color: 'bg-red-100 text-red-800' },
  { value: 'Completed', label: 'Completed', color: 'bg-purple-100 text-purple-800' },
];

const LEAD_DISPOSITIONS = [
  { value: '', label: 'Select disposition...' },
  { value: 'Unconfirmed', label: 'Unconfirmed' },
  { value: 'RESET', label: 'RESET' },
  { value: 'Outside Scope', label: 'Outside Scope' },
  { value: 'Renters', label: 'Renters' },
  { value: 'House for Sale', label: 'House for Sale' },
  { value: 'HO Changed Mind', label: 'HO Changed Mind' },
  { value: 'Not Enough Time', label: 'Not Enough Time' },
  { value: 'No Policy', label: 'No Policy' },
  { value: 'Bad Insurance', label: 'Bad Insurance' },
  { value: 'Missing Party', label: 'Missing Party' },
  { value: 'Roof Age', label: 'Roof Age' },
  { value: 'Unable to Speak to HO', label: 'Unable to Speak to HO' },
  { value: 'Too Far Out', label: 'Too Far Out' },
  { value: 'Not Interested', label: 'Not Interested' },
  { value: 'Not Called In', label: 'Not Called In' },
  { value: 'No Answer', label: 'No Answer' },
];

const LEAD_SOURCES = [
  { value: 'Bath Lead', label: 'Bath Lead' },
  { value: 'Company Vehicle', label: 'Company Vehicle' },
  { value: 'Customer Referral', label: 'Customer Referral' },
  { value: 'Digital Marketing', label: 'Digital Marketing' },
  { value: 'Employee Referral', label: 'Employee Referral' },
  { value: 'Flyer', label: 'Flyer' },
  { value: 'Insurance Marketing', label: 'Insurance Marketing' },
  { value: 'Insurance Program', label: 'Insurance Program' },
  { value: 'Lead Aggregator', label: 'Lead Aggregator' },
  { value: 'Radio', label: 'Radio' },
  { value: 'Retail Marketing', label: 'Retail Marketing' },
  { value: 'Roof DRP', label: 'Roof DRP' },
  { value: 'Self-Gen', label: 'Self-Gen' },
  { value: 'Solar Marketing', label: 'Solar Marketing' },
  { value: 'Telemarketing', label: 'Telemarketing' },
  { value: 'Trade Show', label: 'Trade Show' },
  { value: 'Vendor Referral', label: 'Vendor Referral' },
  { value: 'Yard Sign', label: 'Yard Sign' },
];

const PROPERTY_TYPES = [
  { value: 'Commercial', label: 'Commercial' },
  { value: 'Property Management', label: 'Property Management' },
  { value: 'Residential', label: 'Residential' },
];

const ALL_WORK_TYPES = [
  { value: 'Commercial', label: 'Commercial' },
  { value: 'Inspection', label: 'Inspection' },
  { value: 'Insurance', label: 'Insurance' },
  { value: 'Insurance Program', label: 'Insurance Program' },
  { value: 'Interior', label: 'Interior' },
  { value: 'Retail', label: 'Retail' },
  { value: 'Service/Repair', label: 'Service/Repair' },
  { value: 'Subcontractor', label: 'Subcontractor' },
];

// Call center only sees Inspection work type
const CALL_CENTER_WORK_TYPES = [
  { value: 'Inspection', label: 'Inspection' },
];

const RATINGS = [
  { value: 'Hot', label: 'Hot', color: 'bg-red-100 text-red-700' },
  { value: 'Warm', label: 'Warm', color: 'bg-orange-100 text-orange-700' },
  { value: 'Cold', label: 'Cold', color: 'bg-blue-100 text-blue-700' },
];

const steps = [
  { id: 1, name: 'Info', icon: User, description: 'Contact details' },
  { id: 2, name: 'Address', icon: MapPin, description: 'Location info' },
  { id: 3, name: 'Qualify', icon: Target, description: 'Lead classification' },
  { id: 4, name: 'Convert', icon: CheckCircle, description: 'Create opportunity' },
];

export default function LeadWizard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { clickToCall, isReady: isRingCentralReady, currentCall, setVisible: setRingCentralVisible, loadWidget } = useRingCentral();
  const isNewLead = !id || id === 'new';

  // Determine if user is call center based on role or department
  const isCallCenter = user?.role?.name?.toLowerCase()?.includes('call center') ||
                       user?.roleType === 'CALL_CENTER' || user?.roleType === 'CALL_CENTER_MANAGER' ||
                       user?.department?.toLowerCase() === 'call center';

  // Call center users only see Inspection, others see all work types
  const WORK_TYPES = isCallCenter ? CALL_CENTER_WORK_TYPES : ALL_WORK_TYPES;

  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(!isNewLead);
  const [isSaving, setIsSaving] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [conversionResult, setConversionResult] = useState(null);
  const [activities, setActivities] = useState([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  // Lead Set By search state
  const [leadSetBySearchQuery, setLeadSetBySearchQuery] = useState('');
  const [showLeadSetByDropdown, setShowLeadSetByDropdown] = useState(false);

  // Quick Action panels state
  const [showSmsPanel, setShowSmsPanel] = useState(false);
  const [showEmailPanel, setShowEmailPanel] = useState(false);
  const [smsMessage, setSmsMessage] = useState('');
  const [smsPhoneNumber, setSmsPhoneNumber] = useState(''); // Selected phone number for SMS
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [selectedSmsTemplate, setSelectedSmsTemplate] = useState('');
  const [selectedEmailTemplate, setSelectedEmailTemplate] = useState('');

  // Fetch SMS templates
  const { data: smsTemplatesData } = useQuery({
    queryKey: ['bamboogli-templates-sms'],
    queryFn: () => bamboogliApi.getMessageTemplates({ channel: 'SMS', isActive: true }),
    staleTime: 60000,
  });

  // Fetch Email templates
  const { data: emailTemplatesData } = useQuery({
    queryKey: ['bamboogli-templates-email'],
    queryFn: () => bamboogliApi.getMessageTemplates({ channel: 'EMAIL', isActive: true }),
    staleTime: 60000,
  });

  // Replace merge fields in template with actual values
  const replaceMergeFields = (content) => {
    if (!content) return '';
    return content
      .replace(/\{\{firstName\}\}/gi, formData.firstName || '')
      .replace(/\{\{lastName\}\}/gi, formData.lastName || '')
      .replace(/\{\{fullName\}\}/gi, `${formData.firstName || ''} ${formData.lastName || ''}`.trim())
      .replace(/\{\{company\}\}/gi, formData.company || '')
      .replace(/\{\{phone\}\}/gi, formData.phone || formData.mobilePhone || '')
      .replace(/\{\{email\}\}/gi, formData.email || '')
      .replace(/\{\{city\}\}/gi, formData.city || '')
      .replace(/\{\{state\}\}/gi, formData.state || '');
  };

  // Handle SMS template selection
  const handleSmsTemplateSelect = (templateId) => {
    setSelectedSmsTemplate(templateId);
    if (templateId) {
      const template = smsTemplatesData?.templates?.find(t => t.id === templateId);
      if (template) {
        setSmsMessage(replaceMergeFields(template.content));
      }
    }
  };

  // Handle Email template selection
  const handleEmailTemplateSelect = (templateId) => {
    setSelectedEmailTemplate(templateId);
    if (templateId) {
      const template = emailTemplatesData?.templates?.find(t => t.id === templateId);
      if (template) {
        setEmailSubject(replaceMergeFields(template.subject || template.name));
        setEmailBody(replaceMergeFields(template.content));
      }
    }
  };

  // Fetch users for Lead Creator search
  const { data: usersData } = useQuery({
    queryKey: ['users', userSearchQuery],
    queryFn: () => usersApi.getUsers({ search: userSearchQuery, limit: 20 }),
    enabled: userSearchQuery.length >= 2,
    staleTime: 30000,
  });

  // Fetch users for Lead Set By search
  const { data: leadSetByUsersData } = useQuery({
    queryKey: ['users-lead-set-by', leadSetBySearchQuery],
    queryFn: () => usersApi.getUsers({ search: leadSetBySearchQuery, limit: 20 }),
    enabled: leadSetBySearchQuery.length >= 2,
    staleTime: 30000,
  });

  // SMS mutation
  const sendSmsMutation = useMutation({
    mutationFn: (data) => bamboogliApi.sendSms(data),
    onSuccess: () => {
      setSmsMessage('');
      setShowSmsPanel(false);
    },
  });

  // Email mutation
  const sendEmailMutation = useMutation({
    mutationFn: (data) => bamboogliApi.sendEmail(data),
    onSuccess: () => {
      setEmailSubject('');
      setEmailBody('');
      setShowEmailPanel(false);
    },
  });

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    mobilePhone: '',
    company: '',
    street: '',
    city: '',
    state: '',
    postalCode: '',
    status: 'New',
    leadSource: '',
    rating: '',
    description: '',
    // Lead Details fields
    ownerId: '',
    ownerName: '',
    creatorId: '',
    creatorName: '',
    salesRabbitUser: '',
    propertyType: '',
    workType: '',
    leadNotes: '',
    // Call Center ONLY fields
    tentativeAppointmentDate: '',
    tentativeAppointmentTime: '',
    leadSetById: '',
    leadSetByName: '',
    leadDisposition: '',
  });

  const [lead, setLead] = useState(null);

  // Set owner and leadSetBy to current user for new leads
  // This is critical for call center tracking - the person who creates the lead is the "setter"
  useEffect(() => {
    if (isNewLead && user) {
      const userName = user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
      setFormData(prev => ({
        ...prev,
        ownerId: user.id || user.username,
        ownerName: userName,
        // Auto-set leadSetById to current user - tracks who entered the lead
        leadSetById: user.id || user.username,
        leadSetByName: userName,
      }));
    }
  }, [isNewLead, user]);

  // Get navigation state to check if we just saved
  const location = useLocation();

  useEffect(() => {
    // Skip loading if we just saved (lead already in state)
    if (location.state?.justSaved) {
      setIsLoading(false);
      // Clear the justSaved flag from navigation state
      navigate(location.pathname, { replace: true, state: {} });
      return;
    }
    if (!isNewLead) {
      loadLeadData();
    }
  }, [id]);

  const loadLeadData = async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const leadData = await leadsApi.getLead(id);
      setLead(leadData);
      setFormData({
        firstName: leadData.firstName || '',
        lastName: leadData.lastName || '',
        email: leadData.email || '',
        phone: leadData.phone || '',
        mobilePhone: leadData.mobilePhone || '',
        company: leadData.company || '',
        street: leadData.street || '',
        city: leadData.city || '',
        state: leadData.state || '',
        postalCode: leadData.postalCode || '',
        status: leadData.status || 'New',
        leadSource: leadData.source || leadData.leadSource || '',
        rating: leadData.rating || '',
        description: leadData.description || '',
        // Lead Details fields
        ownerId: leadData.ownerId || leadData.owner?.id || '',
        ownerName: leadData.owner ? `${leadData.owner.firstName || ''} ${leadData.owner.lastName || ''}`.trim() : '',
        creatorId: leadData.creatorId || leadData.creator?.id || '',
        creatorName: leadData.creator ? `${leadData.creator.firstName || ''} ${leadData.creator.lastName || ''}`.trim() : '',
        salesRabbitUser: leadData.salesRabbitUser || '',
        propertyType: leadData.propertyType || '',
        workType: leadData.workType || '',
        leadNotes: leadData.leadNotes || '',
        // Call Center ONLY fields - preserve defaults
        tentativeAppointmentDate: leadData.tentativeAppointmentDate || '',
        tentativeAppointmentTime: leadData.tentativeAppointmentTime || '',
        leadSetById: leadData.leadSetById || '',
        leadSetByName: leadData.leadSetByName || '',
        leadDisposition: leadData.leadDisposition || '',
      });

      const leadActivities = [];
      if (leadData.notes) {
        leadData.notes.forEach(note => {
          leadActivities.push({
            id: note.id,
            type: 'note',
            subject: note.title || 'Note added',
            date: new Date(note.createdAt).toLocaleDateString(),
            status: 'Completed',
          });
        });
      }
      if (leadData.tasks) {
        leadData.tasks.forEach(task => {
          leadActivities.push({
            id: task.id,
            type: 'task',
            subject: task.subject || task.title,
            date: new Date(task.dueDate || task.createdAt).toLocaleDateString(),
            status: task.status === 'COMPLETED' ? 'Completed' : 'Open',
          });
        });
      }
      setActivities(leadActivities);
    } catch (error) {
      console.error('Failed to load lead:', error);
      setHasError(true);
      setErrorMessage('Failed to load lead details. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const saveData = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        mobilePhone: formData.mobilePhone,
        company: formData.company,
        street: formData.street,
        city: formData.city,
        state: formData.state,
        postalCode: formData.postalCode,
        status: formData.status,
        source: formData.leadSource,
        rating: formData.rating,
        description: formData.description,
        // New fields
        ownerId: formData.ownerId,
        creatorId: formData.creatorId,
        salesRabbitUser: formData.salesRabbitUser,
        propertyType: formData.propertyType,
        workType: formData.workType,
        leadNotes: formData.leadNotes,
        // Call Center tracking - who entered/set this lead
        leadSetById: formData.leadSetById,
        tentativeAppointmentDate: formData.tentativeAppointmentDate || null,
        tentativeAppointmentTime: formData.tentativeAppointmentTime || null,
        disposition: formData.leadDisposition || null,
      };

      if (isNewLead) {
        const newLead = await leadsApi.createLead(saveData);
        // Set the lead state directly to avoid reload clearing form data
        setLead(newLead);
        // Navigate with replace and state to indicate we just saved
        navigate(`/leads/${newLead.id}/wizard`, { replace: true, state: { justSaved: true } });
      } else {
        const updatedLead = await leadsApi.updateLead(id, saveData);
        setLead(updatedLead);
      }
    } catch (error) {
      console.error('Failed to save lead:', error);
      setErrorMessage('Failed to save lead. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConvert = async () => {
    if (!canConvert) return;
    setIsConverting(true);
    setErrorMessage('');
    try {
      await handleSave();

      // Build tentative appointment datetime if both date and time are set
      let tentativeAppointmentDateTime = null;
      if (formData.tentativeAppointmentDate) {
        if (formData.tentativeAppointmentTime) {
          tentativeAppointmentDateTime = `${formData.tentativeAppointmentDate}T${formData.tentativeAppointmentTime}:00`;
        } else {
          // Default to 9:00 AM if no time specified
          tentativeAppointmentDateTime = `${formData.tentativeAppointmentDate}T09:00:00`;
        }
      }

      const conversionData = {
        accountName: formData.company || `${formData.firstName} ${formData.lastName}`,
        opportunityName: `${formData.company || formData.lastName} - Project`,
        opportunityType: formData.workType === 'Inspection' ? 'INSPECTION' : 'INSURANCE',
        createOpportunity: true,
        // Pass work type and appointment for Service Appointment creation
        workType: formData.workType,
        tentativeAppointmentDate: tentativeAppointmentDateTime,
        createServiceAppointment: !!tentativeAppointmentDateTime,
        leadSetById: formData.leadSetById,
        leadStatus: formData.status,
        leadDisposition: formData.leadDisposition,
      };

      const result = await leadsApi.convertLead(id, conversionData);

      setConversionResult({
        accountId: result.account?.id,
        accountName: result.account?.name,
        contactId: result.contact?.id,
        contactName: result.contact ? `${result.contact.firstName} ${result.contact.lastName}` : '',
        opportunityId: result.opportunity?.id,
        opportunityName: result.opportunity?.name,
      });
    } catch (error) {
      console.error('Failed to convert lead:', error);
      setErrorMessage(error.message || 'Failed to convert lead. Please try again.');
    } finally {
      setIsConverting(false);
    }
  };

  const goToStep = (step) => {
    if (step >= 1 && step <= 4) {
      setCurrentStep(step);
    }
  };

  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Calculate completion score
  const calculateCompletionScore = () => {
    let score = 0;
    // Required fields (60% total)
    if (formData.firstName) score += 10;
    if (formData.lastName) score += 10;
    if (formData.phone || formData.mobilePhone || formData.email) score += 10;
    if (formData.leadSource) score += 10;
    if (formData.propertyType) score += 10;
    if (formData.workType) score += 10;
    // Optional fields (40% total)
    if (formData.street && formData.city) score += 10;
    if (formData.email && (formData.phone || formData.mobilePhone)) score += 10; // Both contact methods
    if (formData.creatorId) score += 5;
    if (formData.salesRabbitUser) score += 5;
    if (formData.leadNotes) score += 5;
    if (formData.status && formData.status !== 'New') score += 5;
    return Math.min(score, 100);
  };

  const completionScore = calculateCompletionScore();

  // Validation differs for call center vs sales reps
  // Call center: firstName, lastName, phone/email, workType, status, leadSource
  // Sales reps: firstName, lastName, phone/email, leadSource, propertyType, workType
  const hasRequiredFields = isCallCenter
    ? (formData.firstName &&
       formData.lastName &&
       formData.workType &&
       formData.status &&
       formData.leadSource &&
       (formData.phone || formData.mobilePhone || formData.email))
    : (formData.firstName &&
       formData.lastName &&
       formData.leadSource &&
       formData.propertyType &&
       formData.workType &&
       (formData.phone || formData.mobilePhone || formData.email));

  // canConvert should match hasRequiredFields validation
  const canConvert = lead &&
    !lead.isConverted &&
    hasRequiredFields;

  const getStatusStyle = (status) => {
    const found = LEAD_STATUSES.find(s => s.value === status);
    return found ? found.color : 'bg-gray-100 text-gray-800';
  };

  const getRatingStyle = (rating) => {
    const found = RATINGS.find(r => r.value === rating);
    return found ? found.color : 'bg-gray-100 text-gray-800';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-panda-primary"></div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <p className="mt-4 text-gray-900 font-medium">Error Loading Lead</p>
          <p className="mt-2 text-gray-500">{errorMessage}</p>
          <button
            onClick={() => navigate('/leads')}
            className="mt-4 px-4 py-2 bg-panda-primary text-white rounded-lg"
          >
            Back to Leads
          </button>
        </div>
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
                {isNewLead ? 'New Lead' : `${formData.firstName} ${formData.lastName}`.trim() || 'Edit Lead'}
              </h1>
              <p className="text-sm text-gray-500">
                {isNewLead ? 'Create a new lead' : 'Update lead details'}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {/* Status Badge */}
            {!isNewLead && formData.status && (
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusStyle(formData.status)}`}>
                {formData.status}
              </span>
            )}
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
                onClick={() => goToStep(step.id)}
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
        {/* Step 1: Contact Info */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <User className="w-5 h-5 mr-2 text-panda-primary" />
              Contact Information
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* ========== CONTACT DETAILS SECTION (TOP) ========== */}

              {/* First Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  placeholder="John"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                />
              </div>

              {/* Last Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  placeholder="Smith"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                />
              </div>

              {/* Company */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company
                </label>
                <input
                  type="text"
                  name="company"
                  value={formData.company}
                  onChange={handleInputChange}
                  placeholder="e.g., Smith Residence (optional)"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone <span className="text-gray-400">(or Email required)</span>
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

              {/* Mobile Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mobile Phone
                </label>
                <input
                  type="tel"
                  name="mobilePhone"
                  value={formData.mobilePhone}
                  onChange={handleInputChange}
                  placeholder="(410) 555-5678"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email <span className="text-gray-400">(or Phone required)</span>
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
            </div>

            {/* Validation Warning */}
            {!(formData.firstName && formData.lastName && (formData.phone || formData.mobilePhone || formData.email)) && (
              <div className="flex items-center space-x-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                <p className="text-sm text-yellow-700">
                  Required fields: First Name, Last Name, and at least one contact method (Phone or Email).
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Address */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <MapPin className="w-5 h-5 mr-2 text-panda-primary" />
              Property Address
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Street - with Google Places Autocomplete */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
                <AddressAutocomplete
                  value={formData.street}
                  onChange={(street) => setFormData(prev => ({ ...prev, street }))}
                  onAddressSelect={(address) => {
                    // Auto-fill city, state, and ZIP when an address is selected
                    setFormData(prev => ({
                      ...prev,
                      street: address.street,
                      city: address.city || prev.city,
                      state: address.state || prev.state,
                      postalCode: address.postalCode || prev.postalCode,
                    }));
                  }}
                  placeholder="Start typing an address..."
                />
              </div>

              {/* City */}
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
                {/* State */}
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

                {/* ZIP */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ZIP Code</label>
                  <input
                    type="text"
                    name="postalCode"
                    value={formData.postalCode}
                    onChange={handleInputChange}
                    placeholder="21201"
                    maxLength={5}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Map Preview */}
            {formData.street && formData.city && formData.state && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Map Preview</p>
                <div className="relative rounded-xl overflow-hidden h-48 bg-gray-100">
                  <img
                    src={`https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(`${formData.street}, ${formData.city}, ${formData.state} ${formData.postalCode}`)}&zoom=10&size=600x200&scale=2&maptype=roadmap&markers=color:red%7C${encodeURIComponent(`${formData.street}, ${formData.city}, ${formData.state} ${formData.postalCode}`)}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''}`}
                    alt="Property location"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'flex';
                    }}
                  />
                  <div className="absolute inset-0 items-center justify-center hidden" style={{display: 'none'}}>
                    <div className="text-center text-gray-500">
                      <MapPin className="w-8 h-8 mx-auto mb-2" />
                      <p className="text-sm font-medium">Map Preview</p>
                      <p className="text-xs">{formData.street}, {formData.city}, {formData.state} {formData.postalCode}</p>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-500">{formData.street}, {formData.city}, {formData.state} {formData.postalCode}</p>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Qualify */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <Target className="w-5 h-5 mr-2 text-panda-primary" />
              Lead Qualification
            </h2>

            {/* Call Center ONLY Section */}
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-orange-800 mb-4 flex items-center">
                <Phone className="w-4 h-4 mr-2" />
                Call Center ONLY
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Tentative Appointment Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tentative Appointment Date
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Date</label>
                      <input
                        type="date"
                        name="tentativeAppointmentDate"
                        value={formData.tentativeAppointmentDate}
                        onChange={handleInputChange}
                        placeholder="mm/dd/yyyy"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Time</label>
                      <input
                        type="time"
                        name="tentativeAppointmentTime"
                        value={formData.tentativeAppointmentTime}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Lead Set By - User Search */}
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Lead Set By
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={formData.leadSetByName || leadSetBySearchQuery}
                      onChange={(e) => {
                        setLeadSetBySearchQuery(e.target.value);
                        setShowLeadSetByDropdown(true);
                        if (!e.target.value) {
                          setFormData(prev => ({ ...prev, leadSetById: '', leadSetByName: '' }));
                        }
                      }}
                      onFocus={() => setShowLeadSetByDropdown(true)}
                      placeholder="Search users..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent text-sm"
                    />
                    {formData.leadSetByName && (
                      <button
                        type="button"
                        onClick={() => {
                          setFormData(prev => ({ ...prev, leadSetById: '', leadSetByName: '' }));
                          setLeadSetBySearchQuery('');
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {/* Lead Set By Dropdown */}
                  {showLeadSetByDropdown && leadSetByUsersData?.data?.length > 0 && !formData.leadSetByName && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {leadSetByUsersData.data.map(u => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => {
                            setFormData(prev => ({
                              ...prev,
                              leadSetById: u.id,
                              leadSetByName: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
                            }));
                            setLeadSetBySearchQuery('');
                            setShowLeadSetByDropdown(false);
                          }}
                          className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-2"
                        >
                          <Users className="w-4 h-4 text-gray-400" />
                          <span className="text-sm">{u.firstName} {u.lastName}</span>
                          <span className="text-xs text-gray-400">{u.email}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Lead Status */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Lead Status <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent text-sm"
                  >
                    {LEAD_STATUSES.map(status => (
                      <option key={status.value} value={status.value}>{status.label}</option>
                    ))}
                  </select>
                  {formData.status && (
                    <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium ${getStatusStyle(formData.status)}`}>
                      {formData.status}
                    </span>
                  )}
                </div>

                {/* Lead Disposition */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Lead Disposition
                  </label>
                  <select
                    name="leadDisposition"
                    value={formData.leadDisposition}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent text-sm"
                  >
                    {LEAD_DISPOSITIONS.map(disp => (
                      <option key={disp.value} value={disp.value}>{disp.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Call Center: Lead Source, Property Type, Work Type */}
            {isCallCenter && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Lead Source */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Lead Source <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Target className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <select
                      name="leadSource"
                      value={formData.leadSource}
                      onChange={handleInputChange}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent appearance-none"
                    >
                      <option value="">Select source...</option>
                      {LEAD_SOURCES.map(source => (
                        <option key={source.value} value={source.value}>{source.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Property Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Property Type <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Home className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <select
                      name="propertyType"
                      value={formData.propertyType}
                      onChange={handleInputChange}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent appearance-none"
                    >
                      <option value="">Select property type...</option>
                      {PROPERTY_TYPES.map(type => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Work Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Work Type <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <select
                      name="workType"
                      value={formData.workType}
                      onChange={handleInputChange}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent appearance-none"
                    >
                      <option value="">Select work type...</option>
                      {WORK_TYPES.map(type => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Lead Details Section - Hidden for Call Center users */}
            {!isCallCenter && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Lead Owner (read-only, shows logged in user) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Lead Owner
                </label>
                <div className="flex items-center px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg">
                  <User className="w-4 h-4 text-gray-400 mr-2" />
                  <span className="text-gray-700">{formData.ownerName || user?.email || 'Current User'}</span>
                </div>
              </div>

              {/* Lead Source */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Lead Source <span className="text-red-500">*</span>
                </label>
                <select
                  name="leadSource"
                  value={formData.leadSource}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                >
                  <option value="">Select source...</option>
                  {LEAD_SOURCES.map(source => (
                    <option key={source.value} value={source.value}>{source.label}</option>
                  ))}
                </select>
              </div>

              {/* Lead Creator - User Search */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Lead Creator
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={formData.creatorName || userSearchQuery}
                    onChange={(e) => {
                      setUserSearchQuery(e.target.value);
                      setShowUserDropdown(true);
                      if (!e.target.value) {
                        setFormData(prev => ({ ...prev, creatorId: '', creatorName: '' }));
                      }
                    }}
                    onFocus={() => setShowUserDropdown(true)}
                    placeholder="Search users..."
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  />
                  {formData.creatorName && (
                    <button
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({ ...prev, creatorId: '', creatorName: '' }));
                        setUserSearchQuery('');
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {/* User Search Dropdown */}
                {showUserDropdown && usersData?.data?.length > 0 && !formData.creatorName && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {usersData.data.map(u => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setFormData(prev => ({
                            ...prev,
                            creatorId: u.id,
                            creatorName: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
                          }));
                          setUserSearchQuery('');
                          setShowUserDropdown(false);
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-2"
                      >
                        <Users className="w-4 h-4 text-gray-400" />
                        <span className="text-sm">{u.firstName} {u.lastName}</span>
                        <span className="text-xs text-gray-400">{u.email}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Property Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Property Type <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Home className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <select
                    name="propertyType"
                    value={formData.propertyType}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent appearance-none"
                  >
                    <option value="">Select property type...</option>
                    {PROPERTY_TYPES.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Work Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Work Type <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <select
                    name="workType"
                    value={formData.workType}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent appearance-none"
                  >
                    <option value="">Select work type...</option>
                    {WORK_TYPES.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* SalesRabbit User */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SalesRabbit User
                </label>
                <input
                  type="text"
                  name="salesRabbitUser"
                  value={formData.salesRabbitUser}
                  onChange={handleInputChange}
                  placeholder="Enter SalesRabbit username"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                />
              </div>

              {/* Rating - on same row as SalesRabbit */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rating</label>
                <div className="flex space-x-2">
                  {RATINGS.map(rating => (
                    <button
                      key={rating.value}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, rating: rating.value }))}
                      className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-all border-2 ${
                        formData.rating === rating.value
                          ? `${rating.color} border-current`
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {rating.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Call Center Notes */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Call Center Notes
                </label>
                <textarea
                  name="leadNotes"
                  value={formData.leadNotes}
                  onChange={handleInputChange}
                  rows={3}
                  placeholder="Add call center notes..."
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                />
              </div>

              {/* Job Notes - visible on account */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Job Notes
                  <span className="text-xs text-gray-400 ml-2">(visible on account)</span>
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows={4}
                  maxLength={5000}
                  placeholder="Add job notes that will be visible on the account..."
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                />
                <p className="text-xs text-gray-400 mt-1">{formData.description.length}/5000</p>
              </div>
            </div>
            )}

            {/* Validation Warning for Qualify Step */}
            {!hasRequiredFields && (
              <div className="flex items-center space-x-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                <p className="text-sm text-yellow-700">
                  Required fields: Lead Source, Property Type, and Work Type must be completed before saving.
                </p>
              </div>
            )}

            {/* Recent Activity */}
            {activities.length > 0 && (
              <div className="pt-6 border-t border-gray-200">
                <h3 className="font-medium text-gray-900 mb-3 flex items-center">
                  <Clock className="w-4 h-4 mr-2 text-gray-400" />
                  Recent Activity
                </h3>
                <div className="space-y-3">
                  {activities.map(activity => (
                    <div
                      key={activity.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`p-2 rounded-lg ${
                          activity.type === 'call' ? 'bg-green-100' :
                          activity.type === 'email' ? 'bg-purple-100' : 'bg-blue-100'
                        }`}>
                          {activity.type === 'call' ? (
                            <Phone className="w-4 h-4 text-green-600" />
                          ) : activity.type === 'email' ? (
                            <Mail className="w-4 h-4 text-purple-600" />
                          ) : (
                            <FileText className="w-4 h-4 text-blue-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{activity.subject}</p>
                          <p className="text-xs text-gray-500">{activity.date}</p>
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        activity.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
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

        {/* Step 4: Convert */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <CheckCircle className="w-5 h-5 mr-2 text-panda-primary" />
              Review & Convert
            </h2>

            {conversionResult ? (
              // Conversion Success
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Lead Converted Successfully!</h3>
                <p className="text-gray-500 mb-6">The following records were created:</p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
                  <div className="p-4 bg-blue-50 rounded-xl">
                    <Building className="w-6 h-6 text-blue-600 mx-auto mb-2" />
                    <p className="text-sm text-blue-600">Account</p>
                    <p className="font-medium text-blue-900">{conversionResult.accountName}</p>
                  </div>
                  <div className="p-4 bg-purple-50 rounded-xl">
                    <User className="w-6 h-6 text-purple-600 mx-auto mb-2" />
                    <p className="text-sm text-purple-600">Contact</p>
                    <p className="font-medium text-purple-900">{conversionResult.contactName}</p>
                  </div>
                  <div className="p-4 bg-green-50 rounded-xl">
                    <Target className="w-6 h-6 text-green-600 mx-auto mb-2" />
                    <p className="text-sm text-green-600">Job</p>
                    <p className="font-medium text-green-900 text-xs">{conversionResult.opportunityName}</p>
                  </div>
                </div>

                <button
                  onClick={() => navigate(`/jobs/${conversionResult.opportunityId}`)}
                  className="mt-6 px-6 py-3 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg font-medium hover:opacity-90 inline-flex items-center"
                >
                  Go to Job
                  <ArrowRight className="w-4 h-4 ml-2" />
                </button>
              </div>
            ) : (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Contact Summary */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                      <User className="w-4 h-4 mr-2" />
                      Lead Details
                    </h3>
                    <dl className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-gray-500">Name:</dt>
                        <dd className="font-medium text-gray-900">{formData.firstName} {formData.lastName}</dd>
                      </div>
                      {formData.company && (
                        <div className="flex justify-between">
                          <dt className="text-gray-500">Company:</dt>
                          <dd className="font-medium text-gray-900">{formData.company}</dd>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <dt className="text-gray-500">Phone:</dt>
                        <dd className="font-medium text-gray-900">{formData.phone || formData.mobilePhone || '-'}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-gray-500">Email:</dt>
                        <dd className="font-medium text-gray-900">{formData.email || '-'}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-gray-500">Status:</dt>
                        <dd>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusStyle(formData.status)}`}>
                            {formData.status}
                          </span>
                        </dd>
                      </div>
                    </dl>
                  </div>

                  {/* Address Summary */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                      <MapPin className="w-4 h-4 mr-2" />
                      Property Address
                    </h3>
                    <p className="text-sm text-gray-900">
                      {formData.street ? (
                        <>
                          {formData.street}<br />
                          {formData.city}, {formData.state} {formData.postalCode}
                        </>
                      ) : (
                        <span className="text-gray-500">No address provided</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Lead Source for Call Center - Editable in Step 4 */}
                {isCallCenter && (
                  <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                    <h3 className="font-semibold text-amber-900 mb-3 flex items-center">
                      <Target className="w-4 h-4 mr-2" />
                      Lead Source
                    </h3>
                    <select
                      name="leadSource"
                      value={formData.leadSource || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, leadSource: e.target.value }))}
                      className="w-full px-4 py-2.5 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white"
                    >
                      <option value="">Select Lead Source</option>
                      {LEAD_SOURCES.map(source => (
                        <option key={source.value} value={source.value}>{source.label}</option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs text-amber-700">
                      Required: Select where this lead originated from
                    </p>
                  </div>
                )}

                {/* Conversion Preview */}
                <div className="pt-6 border-t border-gray-200">
                  <h3 className="font-semibold text-gray-900 mb-4">Records to Create</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                      <Building className="w-6 h-6 text-gray-400 mb-2" />
                      <p className="text-sm text-gray-500">Account</p>
                      <p className="font-medium text-gray-900">{formData.company || `${formData.firstName} ${formData.lastName}`}</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                      <User className="w-6 h-6 text-gray-400 mb-2" />
                      <p className="text-sm text-gray-500">Contact</p>
                      <p className="font-medium text-gray-900">{formData.firstName} {formData.lastName}</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                      <Target className="w-6 h-6 text-gray-400 mb-2" />
                      <p className="text-sm text-gray-500">Job</p>
                      <p className="font-medium text-gray-900 text-sm">{formData.company || formData.lastName} - Project</p>
                    </div>
                  </div>
                </div>

                {/* Completion Checklist - varies by role */}
                <div className="bg-blue-50 rounded-lg p-4">
                  <h3 className="font-semibold text-blue-900 mb-3">Conversion Checklist</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {(isCallCenter ? [
                      // Call Center required fields
                      { label: 'First Name', check: !!formData.firstName, step: 1, field: 'firstName' },
                      { label: 'Last Name', check: !!formData.lastName, step: 1, field: 'lastName' },
                      { label: 'Phone or Email', check: !!(formData.phone || formData.mobilePhone || formData.email), step: 1, field: 'phone' },
                      { label: 'Work Type', check: !!formData.workType, step: 3, field: 'workType' },
                      { label: 'Lead Status', check: !!formData.status, step: 3, field: 'status' },
                      { label: 'Lead Source', check: !!formData.leadSource, step: 4, field: 'leadSource' },
                      { label: 'Lead Set By', check: !!formData.leadSetById, optional: true, step: 3, field: 'leadSetBy' },
                      { label: 'Appointment Date', check: !!formData.tentativeAppointmentDate, optional: true, step: 3, field: 'tentativeAppointmentDate' },
                    ] : [
                      // Sales Rep required fields
                      { label: 'First Name', check: !!formData.firstName, step: 1, field: 'firstName' },
                      { label: 'Last Name', check: !!formData.lastName, step: 1, field: 'lastName' },
                      { label: 'Phone or Email', check: !!(formData.phone || formData.mobilePhone || formData.email), step: 1, field: 'phone' },
                      { label: 'Company', check: !!formData.company, optional: true, step: 1, field: 'company' },
                      { label: 'Address', check: !!(formData.street && formData.city), optional: true, step: 2, field: 'street' },
                      { label: 'Lead Source', check: !!formData.leadSource, step: 3, field: 'leadSource' },
                      { label: 'Property Type', check: !!formData.propertyType, step: 3, field: 'propertyType' },
                      { label: 'Work Type', check: !!formData.workType, step: 3, field: 'workType' },
                    ]).map((item, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setCurrentStep(item.step);
                          // Focus the field after navigation
                          setTimeout(() => {
                            const input = document.querySelector(`[name="${item.field}"]`);
                            if (input) input.focus();
                          }, 100);
                        }}
                        className="flex items-center space-x-2 hover:bg-blue-100 rounded-lg p-1 -m-1 transition-colors cursor-pointer group"
                      >
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                          item.check ? 'bg-green-500' : item.optional ? 'bg-gray-300' : 'bg-red-500'
                        }`}>
                          {item.check ? (
                            <Check className="w-3 h-3 text-white" />
                          ) : (
                            <X className="w-3 h-3 text-white" />
                          )}
                        </div>
                        <span className={`text-sm group-hover:underline ${
                          item.check ? 'text-green-700' : item.optional ? 'text-gray-500' : 'text-red-600'
                        }`}>
                          {item.label} {item.optional && !item.check && '(optional)'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Convert Button */}
                {!isNewLead && (
                  <div className="flex justify-center pt-4">
                    <button
                      onClick={handleConvert}
                      disabled={!canConvert || isConverting}
                      className={`px-8 py-3 rounded-lg font-medium flex items-center space-x-2 ${
                        canConvert
                          ? 'bg-gradient-to-r from-panda-primary to-panda-secondary text-white hover:opacity-90'
                          : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      {isConverting ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Converting...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-5 h-5" />
                          <span>Convert Lead to Job</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {!canConvert && !isNewLead && (
                  <p className="text-center text-sm text-red-500">
                    {isCallCenter
                      ? 'Please complete all required fields (First Name, Last Name, Phone/Email, Work Type, and Lead Status) before converting'
                      : 'Please complete all required fields (First Name, Last Name, Phone/Email, Lead Source, Property Type, and Work Type) before converting'
                    }
                  </p>
                )}

                {errorMessage && (
                  <div className="flex items-center justify-center space-x-2 text-red-500 bg-red-50 p-3 rounded-lg">
                    <AlertCircle className="w-4 h-4" />
                    <p className="text-sm">{errorMessage}</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      {!conversionResult && (
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
            <button
              onClick={handleSave}
              disabled={isSaving || !hasRequiredFields}
              className={`inline-flex items-center px-4 py-2 rounded-lg transition-colors ${
                isSaving || !hasRequiredFields
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save
            </button>
            {currentStep < steps.length ? (
              <button
                onClick={handleNext}
                className="inline-flex items-center px-6 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 transition-colors"
              >
                Next
                <ChevronRight className="w-5 h-5 ml-1" />
              </button>
            ) : isNewLead ? (
              <button
                onClick={handleSave}
                disabled={isSaving || !hasRequiredFields}
                className={`inline-flex items-center px-6 py-2 rounded-lg transition-colors ${
                  isSaving || !hasRequiredFields
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-green-500 text-white hover:bg-green-600'
                }`}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5 mr-2" />
                    Create Lead
                  </>
                )}
              </button>
            ) : null}
          </div>
        </div>
      )}

      {/* Quick Actions Bar - Fixed at bottom of page */}
      {!conversionResult && (
        <>
          {/* Quick Actions Bar */}
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-40">
            <div className="max-w-4xl mx-auto px-4 py-3">
              <div className="flex items-center justify-center space-x-4">
                {/* Call Button - RingCentral Integration */}
                <button
                  type="button"
                  onClick={async () => {
                    const phoneNumber = formData.phone || formData.mobilePhone;
                    if (phoneNumber) {
                      // Load widget first if not loaded, then show it and place call
                      if (!isRingCentralReady) {
                        await loadWidget();
                      }
                      setRingCentralVisible(true);
                      clickToCall(phoneNumber);
                    }
                  }}
                  disabled={!formData.phone && !formData.mobilePhone}
                  className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-all ${
                    (formData.phone || formData.mobilePhone)
                      ? currentCall
                        ? 'bg-red-500 text-white hover:bg-red-600 animate-pulse'
                        : 'bg-green-500 text-white hover:bg-green-600'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {currentCall ? (
                    <>
                      <PhoneCall className="w-5 h-5" />
                      <span>On Call</span>
                    </>
                  ) : (
                    <>
                      <Phone className="w-5 h-5" />
                      <span>Call</span>
                    </>
                  )}
                </button>

                {/* SMS Button */}
                <button
                  type="button"
                  onClick={() => {
                    // Default to mobile phone, fall back to regular phone
                    setSmsPhoneNumber(formData.mobilePhone || formData.phone || '');
                    setShowSmsPanel(true);
                  }}
                  disabled={!formData.phone && !formData.mobilePhone}
                  className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-all ${
                    formData.phone || formData.mobilePhone
                      ? 'bg-blue-500 text-white hover:bg-blue-600'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <MessageSquare className="w-5 h-5" />
                  <span>SMS</span>
                </button>

                {/* Email Button */}
                <button
                  type="button"
                  onClick={() => setShowEmailPanel(true)}
                  disabled={!formData.email}
                  className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-all ${
                    formData.email
                      ? 'bg-purple-500 text-white hover:bg-purple-600'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <Mail className="w-5 h-5" />
                  <span>Email</span>
                </button>
              </div>
            </div>
          </div>

          {/* SMS Sliding Panel */}
          <div className={`fixed inset-x-0 bottom-0 transform transition-transform duration-300 ease-in-out z-50 ${
            showSmsPanel ? 'translate-y-0' : 'translate-y-full'
          }`}>
            <div className="bg-white border-t border-gray-200 shadow-2xl rounded-t-2xl max-h-[60vh] overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <MessageSquare className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Send SMS</h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSmsPanel(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronDown className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-4 space-y-4">
                {/* Phone Number Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Send to:</label>
                  <div className="flex items-center space-x-2">
                    {/* Phone number dropdown if both numbers exist */}
                    {formData.mobilePhone && formData.phone && formData.mobilePhone !== formData.phone ? (
                      <select
                        value={smsPhoneNumber}
                        onChange={(e) => setSmsPhoneNumber(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value={formData.mobilePhone}>📱 Mobile: {formData.mobilePhone}</option>
                        <option value={formData.phone}>☎️ Phone: {formData.phone}</option>
                      </select>
                    ) : (
                      <input
                        type="tel"
                        value={smsPhoneNumber}
                        onChange={(e) => setSmsPhoneNumber(e.target.value)}
                        placeholder="Phone number"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    )}
                  </div>
                  {formData.mobilePhone && (
                    <p className="text-xs text-gray-500 mt-1">
                      {smsPhoneNumber === formData.mobilePhone ? '📱 Using mobile phone' : '☎️ Using alternate phone'}
                    </p>
                  )}
                </div>

                {/* Template Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Template:</label>
                  <select
                    value={selectedSmsTemplate}
                    onChange={(e) => handleSmsTemplateSelect(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  >
                    <option value="">Select a template (optional)</option>
                    {smsTemplatesData?.templates?.map(template => (
                      <option key={template.id} value={template.id}>{template.name}</option>
                    ))}
                  </select>
                </div>

                {/* Message textarea */}
                <textarea
                  value={smsMessage}
                  onChange={(e) => {
                    setSmsMessage(e.target.value);
                    setSelectedSmsTemplate(''); // Clear template selection when manually editing
                  }}
                  placeholder="Type your message or select a template..."
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">{smsMessage.length}/160 characters</span>
                  <button
                    type="button"
                    onClick={() => {
                      sendSmsMutation.mutate({
                        to: smsPhoneNumber,
                        body: smsMessage,
                        leadId: id,
                      });
                    }}
                    disabled={!smsMessage.trim() || !smsPhoneNumber || sendSmsMutation.isPending}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  >
                    {sendSmsMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    <span>Send</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Email Sliding Panel */}
          <div className={`fixed inset-x-0 bottom-0 transform transition-transform duration-300 ease-in-out z-50 ${
            showEmailPanel ? 'translate-y-0' : 'translate-y-full'
          }`}>
            <div className="bg-white border-t border-gray-200 shadow-2xl rounded-t-2xl max-h-[70vh] overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Mail className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Send Email</h3>
                    <p className="text-sm text-gray-500">To: {formData.email}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEmailPanel(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronDown className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-4 space-y-3">
                {/* Template Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Template:</label>
                  <select
                    value={selectedEmailTemplate}
                    onChange={(e) => handleEmailTemplateSelect(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
                  >
                    <option value="">Select a template (optional)</option>
                    {emailTemplatesData?.templates?.map(template => (
                      <option key={template.id} value={template.id}>{template.name}</option>
                    ))}
                  </select>
                </div>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => {
                    setEmailSubject(e.target.value);
                    setSelectedEmailTemplate(''); // Clear template selection when manually editing
                  }}
                  placeholder="Subject"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <textarea
                  value={emailBody}
                  onChange={(e) => {
                    setEmailBody(e.target.value);
                    setSelectedEmailTemplate(''); // Clear template selection when manually editing
                  }}
                  placeholder="Compose your email or select a template..."
                  rows={6}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      sendEmailMutation.mutate({
                        to: formData.email,
                        subject: emailSubject,
                        body: emailBody,
                        leadId: id,
                      });
                    }}
                    disabled={!emailSubject.trim() || !emailBody.trim() || sendEmailMutation.isPending}
                    className="flex items-center space-x-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  >
                    {sendEmailMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    <span>Send Email</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Overlay when panels are open */}
          {(showSmsPanel || showEmailPanel) && (
            <div
              className="fixed inset-0 bg-black/20 z-40"
              onClick={() => {
                setShowSmsPanel(false);
                setShowEmailPanel(false);
              }}
            />
          )}
        </>
      )}

      {/* Add padding at bottom to account for fixed Quick Actions bar */}
      <div className="h-20" />
    </div>
  );
}
