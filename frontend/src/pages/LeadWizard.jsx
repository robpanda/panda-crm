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
import MentionTextarea from '../components/MentionTextarea';
import LoadingSpinner from '../components/LoadingSpinner';
import { isValidPhoneFormat, isValidEmailFormat } from '../utils/formatters';
import { WIZARD_LEAD_SOURCES } from '../constants/leadOptions';

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

// Call Center statuses (used during initial lead intake)
const CALL_CENTER_STATUSES = [
  { value: 'New', label: 'New', color: 'bg-blue-100 text-blue-800' },
  { value: 'Confirmed', label: 'Confirmed', color: 'bg-green-100 text-green-800' },
  { value: 'No Inspection', label: 'No Inspection', color: 'bg-orange-100 text-orange-800' },
];

// Call Center dispositions
const CALL_CENTER_DISPOSITIONS = [
  { value: '', label: 'Select disposition...' },
  { value: 'No Show', label: 'No Show' },
  { value: 'Out of Scope', label: 'Out of Scope' },
];

// Legacy statuses (for backwards compatibility)
const LEAD_STATUSES = [
  { value: 'New', label: 'New', color: 'bg-blue-100 text-blue-800' },
  { value: 'Lead Not Set', label: 'Lead Not Set', color: 'bg-gray-100 text-gray-800' },
  { value: 'Lead Set', label: 'Lead Set', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'Confirmed', label: 'Confirmed', color: 'bg-green-100 text-green-800' },
  { value: 'Canceled', label: 'Canceled', color: 'bg-red-100 text-red-800' },
  { value: 'Completed', label: 'Completed', color: 'bg-purple-100 text-purple-800' },
];

// Legacy dispositions (for backwards compatibility)
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

// ============================================================================
// SALES REP WORKFLOW: Dynamic Stage/Status/Disposition based on Work Type
// ============================================================================

// Stages available for sales reps
const SALES_REP_STAGES = [
  { value: 'Lead Assigned', label: 'Lead Assigned' },
  { value: 'Prospect', label: 'Prospect' },
];

// Insurance Work Type - Status options by Stage
const INSURANCE_STATUSES_BY_STAGE = {
  'Lead Assigned': [
    { value: '3 Day Follow Up', label: '3 Day Follow Up', color: 'bg-yellow-100 text-yellow-800' },
    { value: 'Not Moving Forward', label: 'Not Moving Forward', color: 'bg-red-100 text-red-800' },
  ],
  'Prospect': [
    { value: 'Claim Filed', label: 'Claim Filed', color: 'bg-blue-100 text-blue-800' },
  ],
};

// Insurance Work Type - Disposition options by Status
const INSURANCE_DISPOSITIONS_BY_STATUS = {
  '3 Day Follow Up': [
    { value: '', label: 'Select disposition...' },
    { value: 'Scheduled', label: 'Scheduled' },
    { value: 'Not Able to Schedule', label: 'Not Able to Schedule' },
  ],
  'Not Moving Forward': [
    { value: '', label: 'Select disposition...' },
    { value: 'Not Enough Damage', label: 'Not Enough Damage' },
    { value: 'Damage Found - Customer Decline', label: 'Damage Found - Customer Decline' },
  ],
  'Claim Filed': [
    { value: '', label: 'Select disposition...' },
    { value: 'SA Signed', label: 'SA Signed' },
    { value: 'SA Not Signed', label: 'SA Not Signed' },
  ],
};

// Retail Work Type - Status options by Stage
const RETAIL_STATUSES_BY_STAGE = {
  'Lead Assigned': [
    { value: 'Second Visit Needed', label: 'Second Visit Needed', color: 'bg-orange-100 text-orange-800' },
  ],
  'Prospect': [
    { value: 'Pitch Miss', label: 'Pitch Miss', color: 'bg-red-100 text-red-800' },
    { value: '3 Day Follow Up', label: '3 Day Follow Up', color: 'bg-yellow-100 text-yellow-800' },
  ],
};

// Retail Work Type - Disposition options by Status
const RETAIL_DISPOSITIONS_BY_STATUS = {
  'Second Visit Needed': [
    { value: '', label: 'Select disposition...' },
    { value: 'Scheduled', label: 'Scheduled' },
    { value: 'Not Able to Schedule', label: 'Not Able to Schedule' },
  ],
  'Pitch Miss': [
    { value: '', label: 'Select disposition...' },
    { value: 'Price', label: 'Price' },
    { value: 'Timing', label: 'Timing' },
    { value: 'Competition', label: 'Competition' },
    { value: 'No Decision Made', label: 'No Decision Made' },
    { value: 'Other', label: 'Other' },
  ],
  '3 Day Follow Up': [
    { value: '', label: 'Select disposition...' },
    { value: 'Scheduled', label: 'Scheduled' },
    { value: 'Not Able to Schedule', label: 'Not Able to Schedule' },
  ],
};

const LEAD_SOURCES = WIZARD_LEAD_SOURCES;

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

const INSPECTION_SUGGESTION_WINDOW_DAYS = 14;
const APPOINTMENT_SLOT_TIMES = ['09:00', '11:00', '13:00', '15:00'];

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

  const roleName = (user?.role?.name || user?.role || '').toString().toLowerCase();
  const roleType = (user?.roleType || '').toString().toLowerCase();
  const userTitle = (user?.title || user?.jobTitle || '').toString().toLowerCase();
  const hasSalesInRoleOrTitle = [roleName, roleType, userTitle].some((value) => value.includes('sales'));

  // Determine if user is call center based on role or department
  const isCallCenter = roleName.includes('call center') ||
                       roleName.includes('call_center') ||
                       roleType.includes('call_center') ||
                       user?.department?.toLowerCase() === 'call center' ||
                       userTitle.includes('call center') ||
                       userTitle.includes('call_center');

  const disableGuidedFlow = true;

  const canForceConvert = isCallCenter ||
                          roleName === 'admin' ||
                          roleName === 'super admin' ||
                          roleName === 'super_admin' ||
                          roleName === 'system admin' ||
                          roleName === 'system_admin' ||
                          roleType.includes('admin');

  const isCallCenterManager = roleName.includes('call center manager') ||
                              roleName.includes('call_center_manager') ||
                              roleType.includes('call_center_manager') ||
                              roleName.includes('manager') ||
                              roleType.includes('manager') ||
                              roleType.includes('admin') ||
                              roleName.includes('admin');
  const canOverrideOwner = isCallCenterManager;

  // Call center users only see Inspection, others see all work types
  const WORK_TYPES = isCallCenter ? CALL_CENTER_WORK_TYPES : ALL_WORK_TYPES;
  const totalSteps = isCallCenter ? 3 : steps.length;
  const visibleSteps = isCallCenter ? steps.slice(0, 3) : steps;
  const useLeadPromptFlow = true;
  const isSelfGenLeadSource = (value) => {
    if (!value) return false;
    return value.toString().toLowerCase().replace(/[^a-z]/g, '') === 'selfgen';
  };

  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(!isNewLead);
  const [isSaving, setIsSaving] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [conversionResult, setConversionResult] = useState(null);
  const [lead, setLead] = useState(null);
  const [activities, setActivities] = useState([]);
  const [gatingState, setGatingState] = useState(null);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [ownerSearchQuery, setOwnerSearchQuery] = useState('');
  const [showOwnerDropdown, setShowOwnerDropdown] = useState(false);

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

  // Inspection modal state
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  const [wasInspected, setWasInspected] = useState(null);
  const [selectedOpportunityType, setSelectedOpportunityType] = useState(null);
  const [showGuidedFlowModal, setShowGuidedFlowModal] = useState(false);
  const [guidedFlowLeadId, setGuidedFlowLeadId] = useState(null);
  const [guidedFlowStep, setGuidedFlowStep] = useState('project-type');
  const [guidedOwnerId, setGuidedOwnerId] = useState('');
  const [guidedOwnerName, setGuidedOwnerName] = useState('');
  const [guidedProjectType, setGuidedProjectType] = useState('');
  const [guidedWasInspected, setGuidedWasInspected] = useState(null);
  const [guidedWorkType, setGuidedWorkType] = useState('');
  const [guidedFlowError, setGuidedFlowError] = useState('');
  const [hasAutoStartedGuidedFlow, setHasAutoStartedGuidedFlow] = useState(false);
  const [isGuidedFlowMandatory, setIsGuidedFlowMandatory] = useState(false);
  const [isSuggestingAppointment, setIsSuggestingAppointment] = useState(false);
  const [showLeadSourcePrompt, setShowLeadSourcePrompt] = useState(false);
  const [showAppointmentPrompt, setShowAppointmentPrompt] = useState(false);
  const [isPersistingPromptCompletion, setIsPersistingPromptCompletion] = useState(false);
  const [hasPersistedPromptCompletion, setHasPersistedPromptCompletion] = useState(false);
  const [leadSourcePromptError, setLeadSourcePromptError] = useState('');
  const [appointmentPromptError, setAppointmentPromptError] = useState('');
  const [appointmentPromptInfo, setAppointmentPromptInfo] = useState('');
  const [pendingSuggestedSlot, setPendingSuggestedSlot] = useState(null);
  const [hasManualAppointmentChange, setHasManualAppointmentChange] = useState(false);
  const [lastSuggestedSlot, setLastSuggestedSlot] = useState(null);
  const [hasInitializedCallCenterPrompts, setHasInitializedCallCenterPrompts] = useState(false);
  const [hasAutoSavedLead, setHasAutoSavedLead] = useState(false);

  const normalizeLeadId = (value) => {
    if (!(typeof value === 'string' || typeof value === 'number')) return null;
    const normalized = String(value).trim();
    if (!normalized) return null;
    if (['new', 'undefined', 'null'].includes(normalized.toLowerCase())) return null;
    return normalized;
  };

  const resolveLeadId = (leadIdOverride) => {
    const normalizedOverride = normalizeLeadId(leadIdOverride);
    const normalizedRouteId = normalizeLeadId(id);
    const normalizedGuidedId = normalizeLeadId(guidedFlowLeadId);
    const normalizedLeadStateId = normalizeLeadId(lead?.id);
    return normalizedOverride || normalizedGuidedId || normalizedLeadStateId || normalizedRouteId || null;
  };

  const ensureLeadId = async (leadIdOverride) => {
    const existingLeadId = resolveLeadId(leadIdOverride);
    if (existingLeadId) return existingLeadId;

    const savedLeadId = await handleSave();
    return resolveLeadId(savedLeadId);
  };

  const formatDateForInput = (value) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return typeof value === 'string' ? value.slice(0, 10) : '';
    }
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const isAppointmentWithinWindow = (dateValue, timeValue) => {
    if (!dateValue || !timeValue) return false;
    const appointment = new Date(`${dateValue}T${timeValue}:00`);
    if (Number.isNaN(appointment.getTime())) return false;

    const now = new Date();
    const windowEnd = new Date(now);
    windowEnd.setDate(windowEnd.getDate() + INSPECTION_SUGGESTION_WINDOW_DAYS);

    return appointment >= now && appointment <= windowEnd;
  };

  const buildLocalAppointmentSuggestion = () => {
    const now = new Date();
    const minimumLeadTime = new Date(now.getTime() + (30 * 60 * 1000));

    for (let dayOffset = 0; dayOffset < INSPECTION_SUGGESTION_WINDOW_DAYS; dayOffset += 1) {
      const day = new Date(now);
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() + dayOffset);
      const dateString = formatDateForInput(day);

      for (const slot of APPOINTMENT_SLOT_TIMES) {
        const candidate = new Date(`${dateString}T${slot}:00`);
        if (candidate <= minimumLeadTime) continue;
        return { appointmentDate: dateString, appointmentTime: slot };
      }
    }

    return null;
  };

  const applyAppointmentSuggestionToForm = (suggestion) => {
    if (!suggestion?.appointmentDate || !suggestion?.appointmentTime) return;

    setFormData(prev => ({
      ...prev,
      tentativeAppointmentDate: suggestion.appointmentDate,
      tentativeAppointmentTime: suggestion.appointmentTime,
      ...(suggestion.ownerId && !prev.ownerId ? { ownerId: suggestion.ownerId } : {}),
      ...(suggestion.ownerName && !prev.ownerName ? { ownerName: suggestion.ownerName } : {}),
    }));
    setHasManualAppointmentChange(false);
    setPendingSuggestedSlot(null);
    setAppointmentPromptInfo('');
  };

  const persistPromptCompletion = async (options = {}) => {
    const { leadId: leadIdOverride } = options;
    if (isPersistingPromptCompletion) return null;
    setIsPersistingPromptCompletion(true);
    try {
      let leadId = resolveLeadId(leadIdOverride);
      if (!leadId) {
        leadId = await handleSave();
      }
      if (!leadId) return null;

      const leadSetById = formData.leadSetById || user?.id || null;
      const selfGen = isSelfGenLeadSource(formData.leadSource);
      const updatePayload = {
        source: formData.leadSource,
        leadSetById,
        ...(selfGen ? { isSelfGen: true, selfGenRepId: leadSetById || null } : {}),
      };

      const updatedLead = await leadsApi.updateLead(leadId, updatePayload);

      let assignedLead = updatedLead;
      if (selfGen && leadSetById) {
        try {
          assignedLead = await leadsApi.manualAssignLead(leadId, leadSetById, 'Self-Gen assignment');
        } catch (assignError) {
          console.error('Failed to manual-assign self-gen lead:', assignError);
        }
      } else if (!updatedLead?.ownerId && !formData.ownerId) {
        try {
          const assignmentResult = await leadsApi.autoAssignLead(leadId);
          if (assignmentResult?.lead) {
            assignedLead = assignmentResult.lead;
          } else if (assignmentResult?.assigned && assignmentResult?.lead?.ownerId) {
            assignedLead = assignmentResult.lead;
          }
          if (assignmentResult?.assignee) {
            const assigneeName = `${assignmentResult.assignee.firstName || ''} ${assignmentResult.assignee.lastName || ''}`.trim();
            setFormData(prev => ({
              ...prev,
              ownerId: prev.ownerId || assignmentResult.assignee.id || '',
              ownerName: prev.ownerName || assigneeName,
            }));
          }
        } catch (assignmentError) {
          console.error('Auto-assignment failed after prompt completion:', assignmentError);
        }
      }

      if (assignedLead) {
        setLead(assignedLead);
        const ownerName = assignedLead.owner
          ? `${assignedLead.owner.firstName || ''} ${assignedLead.owner.lastName || ''}`.trim()
          : assignedLead.ownerName || '';
        const leadSetByName = assignedLead.leadSetBy
          ? `${assignedLead.leadSetBy.firstName || ''} ${assignedLead.leadSetBy.lastName || ''}`.trim()
          : assignedLead.leadSetByName || '';
        setFormData(prev => ({
          ...prev,
          ownerId: prev.ownerId || assignedLead.ownerId || '',
          ownerName: prev.ownerName || ownerName,
          leadSetById: prev.leadSetById || assignedLead.leadSetById || '',
          leadSetByName: prev.leadSetByName || leadSetByName,
        }));
      }

      setHasPersistedPromptCompletion(true);
      return assignedLead || updatedLead;
    } finally {
      setIsPersistingPromptCompletion(false);
    }
  };

  const routeLeadToConfirmationQueue = async (leadId) => {
    let ownerId = formData.ownerId || null;
    let ownerName = formData.ownerName || '';

    if (!ownerId) {
      try {
        const assignmentResult = await leadsApi.autoAssignLead(leadId);
        if (assignmentResult?.assigned && assignmentResult?.lead?.ownerId) {
          ownerId = assignmentResult.lead.ownerId;
          ownerName = assignmentResult?.assignee
            ? `${assignmentResult.assignee.firstName || ''} ${assignmentResult.assignee.lastName || ''}`.trim()
            : ownerName;
        }
      } catch (assignmentError) {
        console.error('Auto-assignment failed for confirmation queue fallback:', assignmentError);
      }
    }

    if (!ownerId) {
      ownerId = formData.leadSetById || user?.id || null;
    }

    try {
      await leadsApi.updateLead(leadId, {
        ownerId,
        tentativeAppointmentDate: null,
        tentativeAppointmentTime: null,
      });
    } catch (fallbackOwnerError) {
      console.error('Failed to route lead to confirmation queue fallback:', fallbackOwnerError);
    }

    if (ownerId) {
      setFormData(prev => ({
        ...prev,
        ownerId: prev.ownerId || ownerId,
        ownerName: prev.ownerName || ownerName,
      }));
    }
  };

  const ensureInspectionAppointment = async (leadId, options = {}) => {
    const {
      force = false,
      preferredDateTime = null,
      allowFallback = true,
      routeToQueue = true,
      applySuggestion = true,
    } = options;
    const hasValidCurrentAppointment = isAppointmentWithinWindow(
      formData.tentativeAppointmentDate,
      formData.tentativeAppointmentTime
    );

    if (hasValidCurrentAppointment && !force) {
      return {
        ready: true,
        suggestion: {
          appointmentDate: formData.tentativeAppointmentDate,
          appointmentTime: formData.tentativeAppointmentTime,
        },
      };
    }

    setIsSuggestingAppointment(true);
    try {
      let suggestion = null;

      if (leadId) {
        try {
          suggestion = await leadsApi.suggestInspectionAppointment(leadId, {
            workType: formData.workType || 'Inspection',
            daysToSearch: INSPECTION_SUGGESTION_WINDOW_DAYS,
            durationMinutes: 120,
            preferredDateTime,
            allowFallback,
          });
        } catch (suggestionError) {
          console.error('Failed to fetch backend appointment suggestion:', suggestionError);
        }
      }

      if (!suggestion?.found && allowFallback) {
        const localSuggestion = buildLocalAppointmentSuggestion();
        if (localSuggestion) {
          suggestion = {
            found: true,
            ...localSuggestion,
          };
        }
      }

      if (suggestion?.found && suggestion?.appointmentDate && suggestion?.appointmentTime) {
        if (applySuggestion) {
          applyAppointmentSuggestionToForm(suggestion);

          if (leadId) {
            let resolvedOwnerId = suggestion.ownerId || null;
            let resolvedOwnerName = suggestion.ownerName || '';

            if (!resolvedOwnerId && !formData.ownerId) {
              try {
                const assignmentResult = await leadsApi.autoAssignLead(leadId);
                if (assignmentResult?.assigned && assignmentResult?.lead?.ownerId) {
                  resolvedOwnerId = assignmentResult.lead.ownerId;
                  resolvedOwnerName = assignmentResult?.assignee
                    ? `${assignmentResult.assignee.firstName || ''} ${assignmentResult.assignee.lastName || ''}`.trim()
                    : resolvedOwnerName;
                }
              } catch (assignmentError) {
                console.error('Auto-assignment failed after appointment suggestion:', assignmentError);
              }
            }

            const updatePayload = {
              tentativeAppointmentDate: buildAppointmentDateTimeIso(
                suggestion.appointmentDate,
                suggestion.appointmentTime || '09:00'
              ),
              tentativeAppointmentTime: suggestion.appointmentTime,
            };

            if (!formData.ownerId && resolvedOwnerId) {
              updatePayload.ownerId = resolvedOwnerId;
            }

            const updatedLead = await leadsApi.updateLead(leadId, updatePayload);
            const updatedOwnerName = updatedLead?.owner
              ? `${updatedLead.owner.firstName || ''} ${updatedLead.owner.lastName || ''}`.trim()
              : '';
            if ((!formData.ownerName || !formData.ownerId) && (updatedLead?.owner || resolvedOwnerId)) {
              setFormData(prev => ({
                ...prev,
                ownerId: prev.ownerId || updatedLead?.owner?.id || resolvedOwnerId || '',
                ownerName: prev.ownerName || updatedOwnerName || resolvedOwnerName,
              }));
            }
          }
        }

        return { ready: true, suggestion };
      }

      if (leadId && allowFallback && routeToQueue) {
        await routeLeadToConfirmationQueue(leadId);
        return { ready: false, queued: true };
      }

      return {
        ready: false,
        queued: false,
        reason: suggestion?.reason || (preferredDateTime ? 'PREFERRED_SLOT_UNAVAILABLE' : 'NO_AVAILABLE_SLOTS_IN_2_WEEKS'),
      };
    } finally {
      setIsSuggestingAppointment(false);
    }
  };

  const handleRefreshAppointmentSuggestion = async () => {
    setErrorMessage('');

    try {
      const result = await requestAppointmentSuggestion({ allowFallback: true });
      if (!result?.ready) {
        alert('No appointment slot was available in the next 2 weeks. Please try another time.');
      }
    } catch (error) {
      console.error('Failed to refresh appointment suggestion:', error);
      setErrorMessage(error.message || 'Failed to refresh appointment suggestion. Please try again.');
    }
  };

  const requestAppointmentSuggestion = async (options = {}) => {
    const {
      preferredDateTime = null,
      allowFallback = true,
      applySuggestion = true,
      infoMessage = '',
    } = options;
    setAppointmentPromptError('');
    setAppointmentPromptInfo('');

    let leadId = resolveLeadId();
    if (!leadId) {
      leadId = await handleSave();
    }
    if (!leadId) {
      setAppointmentPromptError('Please complete required lead fields before scheduling.');
      return { ready: false };
    }

    const result = await ensureInspectionAppointment(leadId, {
      force: true,
      preferredDateTime,
      allowFallback,
      routeToQueue: false,
      applySuggestion,
    });

    if (result?.ready) {
      if (applySuggestion) {
        setLastSuggestedSlot(result?.suggestion || null);
        setPendingSuggestedSlot(null);
        setAppointmentPromptInfo('');
      } else {
        setPendingSuggestedSlot(result?.suggestion || null);
        setAppointmentPromptInfo(infoMessage || 'Suggested slot is ready. Click Use suggested time to apply it.');
      }
      return result;
    }

    if (result?.reason === 'PREFERRED_SLOT_UNAVAILABLE') {
      setAppointmentPromptError('Requested time is unavailable. Try a different time or use Suggest Best Time.');
    } else if (result?.queued) {
      setAppointmentPromptError('No appointment slot available. Lead routed to Unconfirmed Leads for follow-up.');
    } else {
      setAppointmentPromptError('No appointment slot available. Please try a different time.');
    }

    return result;
  };

  const handleAppointmentPromptInputChange = (event) => {
    handleInputChange(event);
    setHasManualAppointmentChange(true);
    setPendingSuggestedSlot(null);
    setAppointmentPromptInfo('');
  };

  const handleAppointmentPromptClose = () => {
    if (!hasCallCenterAppointment) {
      navigate('/leads');
      return;
    }
    setShowAppointmentPrompt(false);
  };

  const handleOwnerOverrideSelect = async (owner) => {
    if (!owner) return;
    setFormData(prev => ({
      ...prev,
      ownerId: owner.id || '',
      ownerName: `${owner.firstName || ''} ${owner.lastName || ''}`.trim(),
    }));
    setOwnerSearchQuery('');
    setShowOwnerDropdown(false);

    const leadId = resolveLeadId();
    if (leadId) {
      try {
        await leadsApi.updateLead(leadId, { ownerId: owner.id });
      } catch (error) {
        console.error('Failed to override owner assignment:', error);
      }
    }
  };

  const formatTimeForInput = (value) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    const hours = String(parsed.getHours()).padStart(2, '0');
    const minutes = String(parsed.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const buildAppointmentDateTimeIso = (dateValue, timeValue = '00:00') => {
    if (!dateValue) return null;
    const normalizedTime = /^\d{2}:\d{2}$/.test(String(timeValue || '').trim())
      ? String(timeValue).trim()
      : '00:00';
    const parsed = new Date(`${dateValue}T${normalizedTime}:00`);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
  };

  const buildPreferredDateTime = () => {
    if (!formData.tentativeAppointmentDate || !formData.tentativeAppointmentTime) return null;
    return buildAppointmentDateTimeIso(
      formData.tentativeAppointmentDate,
      formData.tentativeAppointmentTime
    );
  };

  const buildPreferredDateTimeFromSlot = (slot) => {
    if (!slot?.appointmentDate || !slot?.appointmentTime) return null;
    return buildAppointmentDateTimeIso(slot.appointmentDate, slot.appointmentTime);
  };

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

  // Get templates array (API returns array directly, not { templates: [...] })
  const smsTemplates = Array.isArray(smsTemplatesData) ? smsTemplatesData : smsTemplatesData?.templates || [];
  const emailTemplates = Array.isArray(emailTemplatesData) ? emailTemplatesData : emailTemplatesData?.templates || [];

  // Handle SMS template selection
  const handleSmsTemplateSelect = (templateId) => {
    setSelectedSmsTemplate(templateId);
    if (templateId) {
      const template = smsTemplates.find(t => t.id === templateId);
      if (template) {
        // Template content is in 'body' field
        setSmsMessage(replaceMergeFields(template.body || template.content || ''));
      }
    }
  };

  // Handle Email template selection
  const handleEmailTemplateSelect = (templateId) => {
    setSelectedEmailTemplate(templateId);
    if (templateId) {
      const template = emailTemplates.find(t => t.id === templateId);
      if (template) {
        setEmailSubject(replaceMergeFields(template.subject || template.name));
        // Template content is in 'body' field
        setEmailBody(replaceMergeFields(template.body || template.content || ''));
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

  // Fetch users for Lead Assigned (Owner) search
  const { data: ownerUsersData } = useQuery({
    queryKey: ['users-owner', ownerSearchQuery],
    queryFn: () => usersApi.getUsers({ search: ownerSearchQuery, limit: 20, isActive: true }),
    enabled: ownerSearchQuery.length >= 2,
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

  // Validation warnings state (non-blocking warnings for format issues)
  const [formatWarnings, setFormatWarnings] = useState({
    phone: false,
    mobilePhone: false,
    email: false,
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
    jobNotes: '',
    // Call Center ONLY fields
    tentativeAppointmentDate: '',
    tentativeAppointmentTime: '',
    leadSetById: '',
    leadSetByName: '',
    leadDisposition: '',
    // Sales Rep workflow fields
    stage: isCallCenter ? '' : 'Prospect',
  });

  const leadSetByIdForManager = formData.leadSetById || null;
  const { data: leadSetByUserData } = useQuery({
    queryKey: ['lead-set-by-user', leadSetByIdForManager],
    queryFn: () => usersApi.getUser(leadSetByIdForManager),
    enabled: !!leadSetByIdForManager,
    staleTime: 60000,
  });

  const leadSetByManagerId =
    leadSetByUserData?.managerId ||
    leadSetByUserData?.manager?.id ||
    null;

  const { data: leadSetByManagerData } = useQuery({
    queryKey: ['lead-set-by-manager', leadSetByManagerId],
    queryFn: () => usersApi.getUser(leadSetByManagerId),
    enabled: !!leadSetByManagerId,
    staleTime: 60000,
  });

  const leadSetByManagerName = leadSetByManagerData
    ? `${leadSetByManagerData.firstName || ''} ${leadSetByManagerData.lastName || ''}`.trim()
    : leadSetByUserData?.manager
      ? `${leadSetByUserData.manager.firstName || ''} ${leadSetByUserData.manager.lastName || ''}`.trim()
      : '';

  // Helper functions for dynamic Sales Rep workflow
  const getStagesForWorkType = (workType) => {
    if (workType === 'Insurance' || workType === 'Retail') {
      return SALES_REP_STAGES;
    }
    return [];
  };

  const getStatusesForStage = (workType, stage) => {
    if (!workType || !stage) return [];
    if (workType === 'Insurance') {
      return INSURANCE_STATUSES_BY_STAGE[stage] || [];
    }
    if (workType === 'Retail') {
      return RETAIL_STATUSES_BY_STAGE[stage] || [];
    }
    return [];
  };

  const getDispositionsForStatus = (workType, status) => {
    if (!workType || !status) return [{ value: '', label: 'Select disposition...' }];
    if (workType === 'Insurance') {
      return INSURANCE_DISPOSITIONS_BY_STATUS[status] || [{ value: '', label: 'Select disposition...' }];
    }
    if (workType === 'Retail') {
      return RETAIL_DISPOSITIONS_BY_STATUS[status] || [{ value: '', label: 'Select disposition...' }];
    }
    return [{ value: '', label: 'Select disposition...' }];
  };

  // Check if sales rep workflow applies (Insurance or Retail work type, non-call-center user)
  const showSalesRepWorkflow = !isCallCenter && (formData.workType === 'Insurance' || formData.workType === 'Retail');
  const hasCallCenterAppointment =
    Boolean(formData.tentativeAppointmentDate && formData.tentativeAppointmentTime);
  const appointmentDateMin = formatDateForInput(new Date());
  const displayedOwnerName = pendingSuggestedSlot?.ownerName || formData.ownerName || 'Unassigned';

  // Sales rep stage is derived from owner assignment in the lead phase.
  useEffect(() => {
    if (isCallCenter) return;
    const hasAssignedOwner = Boolean(formData.ownerId || (formData.ownerName || '').trim());
    const targetStage = hasAssignedOwner ? 'Lead Assigned' : 'Prospect';
    if (formData.stage === targetStage) return;
    setFormData(prev => ({ ...prev, stage: targetStage }));
  }, [isCallCenter, formData.ownerId, formData.ownerName, formData.stage]);

  // Auto-suggest the soonest appointment in the next 2 weeks for call center flows.
  useEffect(() => {
    if (!useLeadPromptFlow || currentStep !== 3 || isSuggestingAppointment) return;
    if (showLeadSourcePrompt || showAppointmentPrompt) return;
    if (formData.tentativeAppointmentDate && formData.tentativeAppointmentTime) return;

    const suggestion = buildLocalAppointmentSuggestion();
    if (!suggestion) return;

    setFormData(prev => ({
      ...prev,
      tentativeAppointmentDate: suggestion.appointmentDate,
      tentativeAppointmentTime: suggestion.appointmentTime,
    }));
  }, [
    currentStep,
    formData.tentativeAppointmentDate,
    formData.tentativeAppointmentTime,
    isSuggestingAppointment,
    showLeadSourcePrompt,
    showAppointmentPrompt,
    useLeadPromptFlow,
  ]);

  // Initialize call center prompts on step 3
  useEffect(() => {
    if (!useLeadPromptFlow || currentStep !== 3 || hasInitializedCallCenterPrompts) return;
    const hasValidAppointment = Boolean(
      formData.tentativeAppointmentDate && formData.tentativeAppointmentTime
    );

    if (!hasValidAppointment) {
      setShowAppointmentPrompt(true);
      setShowLeadSourcePrompt(false);
    } else if (!formData.leadSource) {
      setShowLeadSourcePrompt(true);
    }

    setHasInitializedCallCenterPrompts(true);
  }, [
    currentStep,
    hasInitializedCallCenterPrompts,
    formData.leadSource,
    formData.tentativeAppointmentDate,
    formData.tentativeAppointmentTime,
    useLeadPromptFlow,
  ]);

  // Auto-save new lead when step 3 begins and Lead Source is set (call center flow)
  useEffect(() => {
    if (!useLeadPromptFlow || currentStep !== 3) return;
    if (hasAutoSavedLead) return;
    if (!formData.leadSource) return;
    if (resolveLeadId()) return;
    if (!formData.firstName || !formData.lastName) return;
    if (!(formData.phone || formData.mobilePhone || formData.email)) return;

    let isActive = true;
    const autoSave = async () => {
      const leadId = await handleSave();
      if (isActive && leadId) {
        setHasAutoSavedLead(true);
      }
    };
    autoSave();

    return () => {
      isActive = false;
    };
  }, [
    currentStep,
    hasAutoSavedLead,
    formData.leadSource,
    formData.firstName,
    formData.lastName,
    formData.phone,
    formData.mobilePhone,
    formData.email,
    useLeadPromptFlow,
  ]);

  useEffect(() => {
    if (!useLeadPromptFlow || currentStep !== 3) return;
    if (showLeadSourcePrompt || showAppointmentPrompt) return;
    if (!formData.leadSource || !hasCallCenterAppointment) return;
    if (hasPersistedPromptCompletion) return;

    persistPromptCompletion();
  }, [
    currentStep,
    formData.leadSource,
    hasCallCenterAppointment,
    hasPersistedPromptCompletion,
    showLeadSourcePrompt,
    showAppointmentPrompt,
    useLeadPromptFlow,
  ]);

  // Set lead creator and leadSetBy to current user for new leads
  // This is critical for call center tracking - the person who creates the lead is the "setter"
  useEffect(() => {
    if (isNewLead && user) {
      const userName = user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
      setFormData(prev => ({
        ...prev,
        // Auto-set leadSetById to current user - tracks who entered the lead
        leadSetById: prev.leadSetById || user.id || user.username,
        leadSetByName: prev.leadSetByName || userName,
        // Lead Creator for audit/history
        creatorId: prev.creatorId || user.id || user.username,
        creatorName: prev.creatorName || userName,
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
        jobNotes: leadData.jobNotes || '',
        // Call Center ONLY fields - preserve defaults
        tentativeAppointmentDate: formatDateForInput(leadData.tentativeAppointmentDate),
        tentativeAppointmentTime: leadData.tentativeAppointmentTime || formatTimeForInput(leadData.tentativeAppointmentDate),
        leadSetById: leadData.leadSetById || '',
        leadSetByName: leadData.leadSetBy ? `${leadData.leadSetBy.firstName || ''} ${leadData.leadSetBy.lastName || ''}`.trim() : '',
        leadDisposition: leadData.leadDisposition || '',
        stage: leadData.stage || 'Prospect',
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

    if (name === 'tentativeAppointmentDate' || name === 'tentativeAppointmentTime') {
      setHasManualAppointmentChange(true);
      setPendingSuggestedSlot(null);
      setAppointmentPromptInfo('');
    }

    // Check format warnings for phone and email fields
    if (name === 'phone' || name === 'mobilePhone') {
      setFormatWarnings(prev => ({ ...prev, [name]: !isValidPhoneFormat(value) }));
    } else if (name === 'email') {
      setFormatWarnings(prev => ({ ...prev, email: !isValidEmailFormat(value) }));
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const tentativeAppointmentDateTime = buildAppointmentDateTimeIso(
        formData.tentativeAppointmentDate,
        formData.tentativeAppointmentTime || '00:00'
      );

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
        stage: formData.stage,
        ownerId: formData.ownerId,
        creatorId: formData.creatorId,
        salesRabbitUser: formData.salesRabbitUser,
        propertyType: formData.propertyType,
        workType: formData.workType,
        leadNotes: formData.leadNotes,
        jobNotes: formData.jobNotes,
        // Call Center tracking - who entered/set this lead
        leadSetById: formData.leadSetById,
        tentativeAppointmentDate: tentativeAppointmentDateTime,
        tentativeAppointmentTime: formData.tentativeAppointmentTime || null,
        disposition: formData.leadDisposition || null,
      };

      if (isNewLead) {
        const newLead = await leadsApi.createLead(saveData);
        // Set the lead state directly to avoid reload clearing form data
        setLead(newLead);
        // Navigate with replace and state to indicate we just saved
        navigate(`/leads/${newLead.id}/wizard`, { replace: true, state: { justSaved: true } });
        return newLead.id;
      } else {
        const updatedLead = await leadsApi.updateLead(id, saveData);
        setLead(updatedLead);
        return updatedLead?.id || id;
      }
    } catch (error) {
      console.error('Failed to save lead:', error);
      setErrorMessage('Failed to save lead. Please try again.');
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const convertLeadWithOpportunityType = async (opportunityType, options = {}) => {
    const effectiveWorkType = options.workType || formData.workType;
    const effectiveLeadStatus = options.leadStatus || formData.status;
    const effectiveLeadDisposition = options.leadDisposition || formData.leadDisposition;
    const effectiveTentativeAppointmentDate = options.tentativeAppointmentDate || formData.tentativeAppointmentDate;
    const effectiveTentativeAppointmentTime = options.tentativeAppointmentTime || formData.tentativeAppointmentTime;
    const targetLeadId = resolveLeadId(options.leadId);

    if (!targetLeadId) {
      throw new Error('Lead ID is missing. Please save the lead and try again.');
    }

    // Build timezone-safe appointment datetime for conversion
    let tentativeAppointmentDateTime = null;
    if (effectiveTentativeAppointmentDate) {
      if (effectiveTentativeAppointmentTime) {
        tentativeAppointmentDateTime = buildAppointmentDateTimeIso(
          effectiveTentativeAppointmentDate,
          effectiveTentativeAppointmentTime
        );
      } else {
        // Default to 9:00 AM if no time specified
        tentativeAppointmentDateTime = buildAppointmentDateTimeIso(
          effectiveTentativeAppointmentDate,
          '09:00'
        );
      }
    }

    const conversionData = {
      // Backend enforces naming:
      // Opportunity name -> customer full name or company
      // Account name -> "<jobId> <customer full name/company>"
      opportunityType,
      createOpportunity: true,
      // Pass work type and appointment for Service Appointment creation
      workType: effectiveWorkType,
      tentativeAppointmentDate: tentativeAppointmentDateTime,
      tentativeAppointmentTime: effectiveTentativeAppointmentTime || null,
      createServiceAppointment: !!tentativeAppointmentDateTime,
      leadSetById: formData.leadSetById,
      leadStatus: effectiveLeadStatus,
      leadDisposition: effectiveLeadDisposition,
    };

    const result = await leadsApi.convertLead(targetLeadId, conversionData);

    setConversionResult({
      accountId: result.account?.id,
      accountName: result.account?.name,
      contactId: result.contact?.id,
      contactName: result.contact ? `${result.contact.firstName} ${result.contact.lastName}` : '',
      opportunityId: result.opportunity?.id,
      opportunityName: result.opportunity?.name,
    });
  };

  const openGuidedFlowModal = (leadIdOverride, options = {}) => {
    if (disableGuidedFlow) return false;
    const { mandatory = false } = options;
    const targetLeadId = resolveLeadId(leadIdOverride);
    if (!targetLeadId) {
      setErrorMessage('Please save the lead before starting qualification prompts.');
      return false;
    }

    setGuidedFlowLeadId(targetLeadId);
    setGuidedOwnerId('');
    setGuidedOwnerName('');
    setGuidedProjectType(formData.propertyType || '');
    setGuidedWorkType(formData.workType === 'Retail' || formData.workType === 'Insurance' ? formData.workType : '');
    setGuidedWasInspected(null);
    setGuidedFlowStep('project-type');
    setGuidedFlowError('');
    setOwnerSearchQuery('');
    setShowOwnerDropdown(false);
    setIsGuidedFlowMandatory(mandatory);
    setShowGuidedFlowModal(true);
    return true;
  };

  const closeGuidedFlowModal = () => {
    if (isConverting || isGuidedFlowMandatory) return;
    setShowGuidedFlowModal(false);
    setGuidedFlowLeadId(null);
    setGuidedFlowStep('project-type');
    setGuidedFlowError('');
    setGuidedWasInspected(null);
  };

  const persistGuidedSelections = async ({ inspected, workType, leadId: leadIdOverride }) => {
    const targetLeadId = resolveLeadId(leadIdOverride);
    if (!targetLeadId) {
      throw new Error('Lead ID is missing. Please save the lead first.');
    }
    const updateData = {
      propertyType: guidedProjectType,
      leadNotes: formData.leadNotes,
      description: formData.description,
    };

    if (workType) {
      updateData.workType = workType;
      updateData.jobNotes = formData.jobNotes;
    }

    if (inspected === true) {
      updateData.disposition = 'INSPECTED';
    }

    if (inspected === false) {
      updateData.disposition = 'NO_INSPECTION';
    }

    const updatedLead = await leadsApi.updateLead(targetLeadId, updateData);
    setLead(updatedLead);
    setFormData(prev => ({
      ...prev,
      ownerId: guidedOwnerId || '',
      ownerName: guidedOwnerName || '',
      propertyType: guidedProjectType,
      stage: nextStage,
      ...(workType ? { workType } : {}),
      ...(inspected === true ? { leadDisposition: 'INSPECTED' } : {}),
      ...(inspected === false ? { leadDisposition: 'NO_INSPECTION' } : {}),
    }));
    return updatedLead;
  };

  const handleStartGuidedFlow = async (options = {}) => {
    const { mandatory = false } = options;
    setErrorMessage('');
    setGuidedFlowError('');

    try {
      let targetLeadId = resolveLeadId();
      if (!targetLeadId) {
        const savedLeadId = await handleSave();
        if (!savedLeadId) {
          setIsGuidedFlowMandatory(false);
          return false;
        }
        targetLeadId = savedLeadId;
      }
      const opened = openGuidedFlowModal(targetLeadId, { mandatory });
      if (!opened) {
        setIsGuidedFlowMandatory(false);
      }
      return opened;
    } catch (error) {
      console.error('Failed to start guided flow:', error);
      setIsGuidedFlowMandatory(false);
      setErrorMessage(error.message || 'Failed to start guided prompts. Please try again.');
      return false;
    }
  };

  // Launch guided prompts automatically the first time sales reps land on Step 3.
  useEffect(() => {
    if (disableGuidedFlow) return;
    if (isCallCenter || currentStep !== 3 || showGuidedFlowModal || hasAutoStartedGuidedFlow) return;
    if (useLeadPromptFlow && (showLeadSourcePrompt || showAppointmentPrompt)) return;
    let isActive = true;
    const autoStartGuidedFlow = async () => {
      setHasAutoStartedGuidedFlow(true);
      const started = await handleStartGuidedFlow({ mandatory: true });
      if (!started && isActive) {
        setIsGuidedFlowMandatory(false);
      }
    };
    autoStartGuidedFlow();
    return () => {
      isActive = false;
    };
  }, [isCallCenter, currentStep, showGuidedFlowModal, hasAutoStartedGuidedFlow]);

  // Call center workflow stops at step 3
  useEffect(() => {
    if (isCallCenter && currentStep > 3) {
      setCurrentStep(3);
    }
  }, [isCallCenter, currentStep]);

  const handleGuidedProjectTypeNext = () => {
    if (!guidedProjectType) {
      setGuidedFlowError('Project Type is required.');
      return;
    }
    setGuidedFlowError('');
    setGuidedFlowStep('inspection');
  };

  const handleGuidedInspectionChoice = async (inspected) => {
    setGuidedWasInspected(inspected);
    setGuidedFlowError('');

    if (inspected) {
      setGuidedFlowStep('work-type');
      return;
    }

    setGuidedFlowStep('no-inspection-notes');
  };

  const handleGuidedNoInspectionSubmit = async () => {
    const targetLeadId = await ensureLeadId();
    if (!targetLeadId) {
      setGuidedFlowError('Lead ID is missing. Please save and retry.');
      return;
    }

    setIsConverting(true);
    setGuidedFlowError('');
    try {
      await persistGuidedSelections({ inspected: false, leadId: targetLeadId });

      const transitionResult = await leadsApi.applyGatingTransition(targetLeadId, 'NO_INSPECTION');
      const transitionSucceeded = transitionResult?.data?.success !== false;
      if (!transitionSucceeded) {
        await leadsApi.updateLead(targetLeadId, { disposition: 'NO_INSPECTION' });
      }

      const gatingStateResponse = await leadsApi.getGatingState(targetLeadId);
      const currentGatingState = gatingStateResponse?.data || gatingStateResponse;
      setGatingState(currentGatingState);

      setIsGuidedFlowMandatory(false);
      setShowGuidedFlowModal(false);
      alert('Lead set to No Inspection. Allowed next statuses: Reschedule — Scheduled, Reschedule — Unscheduled, Closed Lost.');
      setCurrentStep(3);
    } catch (error) {
      console.error('Failed to process No Inspection flow:', error);
      setGuidedFlowError(error.message || 'Failed to set No Inspection. Please try again.');
    } finally {
      setIsConverting(false);
    }
  };

  const handleGuidedConvert = async () => {
    const targetLeadId = await ensureLeadId();
    if (!targetLeadId) {
      setGuidedFlowError('Lead ID is missing. Please save and retry.');
      return;
    }

    if (!guidedWorkType) {
      setGuidedFlowError('Work Type is required.');
      return;
    }

    const salesPath = guidedWorkType === 'Retail' ? 'RETAIL' : 'INSURANCE';
    setIsConverting(true);
    setGuidedFlowError('');

    try {
      await persistGuidedSelections({ inspected: true, workType: guidedWorkType, leadId: targetLeadId });

      const gatingStateResponse = await leadsApi.getGatingState(targetLeadId);
      const currentGatingState = gatingStateResponse?.data || gatingStateResponse;
      if (currentGatingState?.salesPath !== salesPath) {
        await leadsApi.selectSalesPath(targetLeadId, salesPath);
      }

      if (!canForceConvert) {
        const gatingResult = await leadsApi.validatePreConversion(targetLeadId);
        const preConversion = gatingResult?.data || gatingResult;
        if (!gatingResult?.success || preConversion?.allowed === false) {
          const blockers = preConversion?.blockers || ['Lead cannot be converted. Please check all gating requirements.'];
          alert(blockers.join('\n'));
          return;
        }
      }

      await convertLeadWithOpportunityType(salesPath, {
        leadId: targetLeadId,
        workType: guidedWorkType,
        leadDisposition: 'INSPECTED',
      });

      setCurrentStep(4);
      setIsGuidedFlowMandatory(false);
      setShowGuidedFlowModal(false);
    } catch (error) {
      console.error('Failed guided conversion:', error);
      setGuidedFlowError(error.message || 'Failed to convert lead. Please try again.');
    } finally {
      setIsConverting(false);
    }
  };

  const handleInspectionDecision = async (inspected) => {
    const targetLeadId = await ensureLeadId();
    if (!targetLeadId) {
      setErrorMessage('Lead ID is missing. Please save and retry.');
      return;
    }

    // "No Inspection" moves the lead to reschedule funnel and exits conversion.
    if (!inspected) {
      setWasInspected(false);
      setSelectedOpportunityType(null);
      setShowInspectionModal(false);
      setIsConverting(true);
      setErrorMessage('');

      try {
        const transitionResult = await leadsApi.applyGatingTransition(targetLeadId, 'NO_INSPECTION');
        const transitionSucceeded = transitionResult?.data?.success !== false;

        // Fallback: some environments reject NO_INSPECTION from INSPECTED via transition API.
        // Persist the no-inspection decision directly so users can continue to reschedule flow.
        if (!transitionSucceeded) {
          await leadsApi.updateLead(targetLeadId, { disposition: 'NO_INSPECTION' });
        }

        const gatingStateResponse = await leadsApi.getGatingState(targetLeadId);
        const currentGatingState = gatingStateResponse?.data || gatingStateResponse;
        setGatingState(currentGatingState);

        if (currentGatingState?.funnelStatus !== 'NO_INSPECTION') {
          throw new Error('Could not route lead to No Inspection.');
        }

        alert('Lead moved to No Inspection. Please reschedule or close the lead before converting.');
        setCurrentStep(3);
      } catch (error) {
        console.error('Failed to update lead status:', error);
        setErrorMessage(error.message || 'Failed to set No Inspection status. Please try again.');
      } finally {
        setIsConverting(false);
      }
      return;
    }

    // If inspected, proceed to sales-path selection.
    setWasInspected(true);
    setSelectedOpportunityType(null);
  };

  const handleSalesPathSelection = async (salesPath) => {
    const targetLeadId = await ensureLeadId();
    if (!targetLeadId) {
      setErrorMessage('Lead ID is missing. Please save and retry.');
      return;
    }

    setSelectedOpportunityType(salesPath);
    setIsConverting(true);
    setErrorMessage('');

    try {
      // Persist sales path decision gate before conversion.
      const gatingStateResponse = await leadsApi.getGatingState(targetLeadId);
      const currentGatingState = gatingStateResponse?.data || gatingStateResponse;
      if (currentGatingState?.salesPath !== salesPath) {
        await leadsApi.selectSalesPath(targetLeadId, salesPath);
      }

      // Final blocker check before conversion.
      if (!canForceConvert) {
        const gatingResult = await leadsApi.validatePreConversion(targetLeadId);
        const preConversion = gatingResult?.data || gatingResult;
        if (!gatingResult?.success || preConversion?.allowed === false) {
          const blockers = preConversion?.blockers || ['Lead cannot be converted. Please check all gating requirements.'];
          alert(blockers.join('\n'));
          return;
        }
      }

      await convertLeadWithOpportunityType(salesPath, { leadId: targetLeadId });
      setShowInspectionModal(false);
    } catch (error) {
      console.error('Failed to convert lead:', error);
      setErrorMessage(error.message || 'Failed to convert lead. Please try again.');
    } finally {
      setIsConverting(false);
    }
  };

  const handleInspectionModalClose = () => {
    setShowInspectionModal(false);
    setWasInspected(null);
    setSelectedOpportunityType(null);
  };

  const handleConvert = async () => {
    if (!canConvert) return;

    setIsConverting(true);
    setErrorMessage('');
    try {
      const leadId = await handleSave();
      if (!leadId) return;

      let appointmentResult = null;
      if (isCallCenter && !canForceConvert) {
        appointmentResult = await ensureInspectionAppointment(leadId);
        if (!appointmentResult?.ready) {
          alert('Could not secure an inspection appointment in the next 2 weeks. Lead was routed to Unconfirmed Leads for RingCentral confirmation calls.');
          return;
        }
      } else {
        appointmentResult = {
          ready: true,
          suggestion: {
            appointmentDate: formData.tentativeAppointmentDate || null,
            appointmentTime: formData.tentativeAppointmentTime || null,
          },
        };
      }

      // Gating: validate pre-conversion rules.
      // Allow the flow to continue when the only blocker is missing Sales Path,
      // because the modal handles that decision.
      if (!canForceConvert) {
        const gatingResult = await leadsApi.validatePreConversion(leadId);
        const preConversion = gatingResult?.data || gatingResult;
        const blockers = preConversion?.blockers || [];
        const nonSalesPathBlockers = blockers.filter((msg) => !msg.toLowerCase().includes('sales path'));
        if (!gatingResult?.success || (preConversion?.allowed === false && nonSalesPathBlockers.length > 0)) {
          const blockerMessages = blockers.length > 0
            ? blockers
            : ['Lead cannot be converted. Please check all gating requirements.'];
          alert(blockerMessages.join('\n'));
          return;
        }
      }
      const gatingStateResponse = await leadsApi.getGatingState(leadId);
      const currentGatingState = gatingStateResponse?.data || gatingStateResponse;
      setGatingState(currentGatingState);

      // Decision gate is only required for INSPECTED leads that do not yet have a sales path.
      if (currentGatingState?.funnelStatus === 'INSPECTED' && !currentGatingState?.salesPath) {
        setWasInspected(null);
        setSelectedOpportunityType(null);
        setShowInspectionModal(true);
        return;
      }

      // When sales path is already set (or lead is not at decision gate), convert directly.
      const resolvedOpportunityType = currentGatingState?.salesPath === 'RETAIL'
        ? 'RETAIL'
        : currentGatingState?.salesPath === 'INSURANCE'
          ? 'INSURANCE'
        : formData.workType === 'Retail'
          ? 'RETAIL'
          : 'INSURANCE';
      await convertLeadWithOpportunityType(resolvedOpportunityType, {
        leadId,
        tentativeAppointmentDate: appointmentResult?.suggestion?.appointmentDate,
        tentativeAppointmentTime: appointmentResult?.suggestion?.appointmentTime,
      });
      return;
    } catch (error) {
      console.error('Failed to convert lead:', error);
      setErrorMessage(error.message || 'Failed to convert lead. Please try again.');
    } finally {
      setIsConverting(false);
    }
  };

  const goToStep = (step) => {
    if (isCallCenter && step > 3) return;
    if (step >= 1 && step <= totalSteps) {
      setCurrentStep(step);
    }
  };

  const handleNext = async () => {
    if (currentStep === 3) {
      try {
        const leadId = await handleSave();
        if (!leadId) return;

        if (isNewLead && !hasSalesInRoleOrTitle && formData.leadSource) {
          navigate(`/leads/${leadId}`);
          return;
        }

        if (!hasCallCenterAppointment) {
          setShowAppointmentPrompt(true);
          return;
        }

        if (!formData.leadSource) {
          setShowLeadSourcePrompt(true);
          return;
        }

        const preferredDateTime = buildPreferredDateTime();

        if (preferredDateTime && !hasManualAppointmentChange) {
          const appointmentResult = await requestAppointmentSuggestion({
            preferredDateTime,
            allowFallback: false,
          });
          if (!appointmentResult?.ready) {
            setShowAppointmentPrompt(true);
            return;
          }
        }

                if (isCallCenter) {
                  await handleOpenLeadRecord();
                  return;
                }

        openGuidedFlowModal(leadId);
        return;
      } catch (err) {
        console.error('[LeadWizard] Gating check failed:', err);
        alert('Unable to validate lead gating rules. Please try again.');
      }
    } else if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleOpenLeadRecord = async () => {
    const targetLeadId = await ensureLeadId();
    if (!targetLeadId) {
      alert('Please save the lead before opening the record.');
      return;
    }
    navigate(`/leads/${targetLeadId}`);
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
  // Call center: firstName, lastName, phone/email, workType, status, leadSource, appointment
  // Sales reps: firstName, lastName, phone/email, leadSource
  const hasRequiredFields = isCallCenter
    ? (formData.firstName &&
       formData.lastName &&
       formData.workType &&
       formData.status &&
       formData.leadSource &&
       hasCallCenterAppointment &&
       (formData.phone || formData.mobilePhone || formData.email))
    : (formData.firstName &&
       formData.lastName &&
       formData.leadSource &&
       (formData.phone || formData.mobilePhone || formData.email));

  // canConvert should match hasRequiredFields validation
  const canConvert = lead &&
    !lead.isConverted &&
    (hasRequiredFields || canForceConvert);

  const getStatusStyle = (status) => {
    const found = LEAD_STATUSES.find(s => s.value === status);
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
    <div className="space-y-6 pb-32 sm:pb-36">
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
          {visibleSteps.map((step, index) => (
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
              {index < visibleSteps.length - 1 && (
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
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
                  className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent ${
                    formatWarnings.phone ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300'
                  }`}
                />
                {formatWarnings.phone && (
                  <p className="mt-1 text-xs text-yellow-600 flex items-center">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Phone format may not be standard (e.g., (410) 555-1234)
                  </p>
                )}
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
                  className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent ${
                    formatWarnings.mobilePhone ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300'
                  }`}
                />
                {formatWarnings.mobilePhone && (
                  <p className="mt-1 text-xs text-yellow-600 flex items-center">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Phone format may not be standard (e.g., (410) 555-1234)
                  </p>
                )}
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
                  className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent ${
                    formatWarnings.email ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300'
                  }`}
                />
                {formatWarnings.email && (
                  <p className="mt-1 text-xs text-yellow-600 flex items-center">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Email format may not be valid (e.g., name@example.com)
                  </p>
                )}
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


      {/* Two-column layout: fields left, map right */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT COLUMN - Form Fields */}
        <div className="space-y-4">
          {/* Street Address */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
            <AddressAutocomplete
              value={formData.street}
              onChange={(street) => setFormData(prev => ({ ...prev, street }))}
              onAddressSelect={(address) => {
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

          {/* State and ZIP in grid */}
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

          {/* RIGHT COLUMN - Map Display */}
          <div className="flex items-center justify-center">
            {!formData.street ? (
              <div className="w-full h-[400px] bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center">
                <div className="text-gray-400 mb-2">
                  <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                </div>
                <p className="text-sm text-gray-500 font-medium">Map Preview</p>
                <p className="text-xs text-gray-400 mt-1">Enter an address to see location</p>
              </div>
            ) : (
              <div className="w-full h-[400px] bg-gray-100 rounded-lg overflow-hidden shadow-sm">
                <img
                  src={`https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(
                    `${formData.street}, ${formData.city}, ${formData.state} ${formData.postalCode}`
                  )}&zoom=15&size=600x400&markers=color:red%7C${encodeURIComponent(
                    `${formData.street}, ${formData.city}, ${formData.state} ${formData.postalCode}`
                  )}&key=AIzaSyDYWtN_izjZbVQaazwNykvyv3YAe6Rs7c4`}
                  alt="Location Map"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.style.display = "none";
                    e.target.parentElement.innerHTML = `<div class="flex items-center justify-center h-full text-gray-400"><p>Map unavailable</p></div>`;
                  }}
                />
              </div>
            )}
          </div>
          </div>
          </div>
        )}

        {/* Step 3: Qualify */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <Target className="w-5 h-5 mr-2 text-panda-primary" />
              Lead Qualification
            </h2>

            {useLeadPromptFlow && (
              <div className={`border rounded-xl p-4 text-sm ${
                hasCallCenterAppointment && formData.leadSource
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-gray-50 border-gray-200 text-gray-600'
              }`}>
                {hasCallCenterAppointment && formData.leadSource ? (
                  <div className="space-y-1">
                    <p className="font-semibold">Call Center Process Complete! The Sales Rep will take the lead from here.</p>
                    <p className="text-xs">
                      {formData.ownerName
                        ? `Assigned to ${formData.ownerName}.`
                        : isPersistingPromptCompletion
                          ? 'Assigning the best-fit rep...'
                          : 'Assigning the best-fit rep...'}
                    </p>
                  </div>
                ) : (
                  'Qualification is handled in the prompts. Set the appointment and lead source to continue.'
                )}
              </div>
            )}

            {!useLeadPromptFlow && (
              <>
            {/* Call Center ONLY Section - Only visible to call center users */}
            {isCallCenter && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 sm:p-6">
              <h3 className="text-sm font-semibold text-orange-800 mb-4 flex items-center">
                <Phone className="w-4 h-4 mr-2" />
                Call Center ONLY
              </h3>
              <p className="text-xs text-orange-700 mb-4">
                Call Center Process Complete! The Sales Rep will take the lead from here.
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                {/* Tentative Appointment Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tentative Appointment Date & Time <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-gray-500">
                      Auto-suggested to the soonest available slot in the next {INSPECTION_SUGGESTION_WINDOW_DAYS} days.
                    </p>
                    <button
                      type="button"
                      onClick={handleRefreshAppointmentSuggestion}
                      disabled={isSuggestingAppointment}
                      className="text-xs px-2 py-1 bg-white border border-orange-300 rounded hover:bg-orange-50 disabled:opacity-60"
                    >
                      {isSuggestingAppointment ? 'Finding...' : 'Re-suggest'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Date</label>
                      <input
                        type="date"
                        name="tentativeAppointmentDate"
                        value={formData.tentativeAppointmentDate}
                        onChange={handleInputChange}
                        min={appointmentDateMin}
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
                  {!hasCallCenterAppointment && (
                    <p className="text-xs text-red-600 mt-2">
                      Appointment date and time are required.
                    </p>
                  )}
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

                {/* Manager (auto-populated from Lead Set By) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Manager
                  </label>
                  <input
                    type="text"
                    value={leadSetByManagerName || 'Unassigned'}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                  />
                </div>

                {/* Lead Status - Call Center uses specific statuses */}
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
                    {CALL_CENTER_STATUSES.map(status => (
                      <option key={status.value} value={status.value}>{status.label}</option>
                    ))}
                  </select>
                  {formData.status && (
                    <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium ${getStatusStyle(formData.status)}`}>
                      {formData.status}
                    </span>
                  )}
                </div>

                {/* Lead Disposition - Call Center uses specific dispositions */}
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
                    {CALL_CENTER_DISPOSITIONS.map(disp => (
                      <option key={disp.value} value={disp.value}>{disp.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            )}

            {/* Call Center: Lead Source, Property Type, Work Type */}
            {isCallCenter && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
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
              <>
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
              <div className="hidden">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Property Type <span className="text-gray-400">(guided prompt)</span>
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
              <div className="hidden">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Work Type <span className="text-gray-400">(guided prompt)</span>
                </label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <select
                    name="workType"
                    value={formData.workType}
                    onChange={(e) => {
                      // Reset stage, status, disposition when work type changes
                      handleInputChange(e);
                      setFormData(prev => ({
                        ...prev,
                        workType: e.target.value,
                        stage: 'Prospect',
                        status: 'New',
                        leadDisposition: '',
                      }));
                    }}
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
            </>
            )}
            {/* Sales Rep Workflow - Stage is fixed in lead phase */}
            {showSalesRepWorkflow && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 sm:p-6 mt-6">
                <h3 className="text-sm font-semibold text-blue-800 mb-2 flex items-center">
                  <Target className="w-4 h-4 mr-2" />
                  Lead Workflow
                </h3>
                <p className="text-sm text-blue-700">
                  Stage is automatically <span className="font-semibold">Lead Assigned</span> when owner is set, otherwise <span className="font-semibold">Prospect</span>.
                </p>
                <p className="text-xs text-blue-600 mt-2">
                  Conversion decisions (assign rep, project type, inspected, work type) are guided through prompts.
                </p>
              </div>
            )}

            {/* Notes Section - Sales Rep Only */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mt-6">
              {/* Call Center Notes */}
              <div className="lg:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Call Center Notes
                  <span className="text-xs text-gray-400 ml-2">Use @ to mention users</span>
                </label>
                <MentionTextarea
                  value={formData.leadNotes}
                  onChange={(val) => setFormData(prev => ({ ...prev, leadNotes: val }))}
                  rows={3}
                  placeholder="Add call center notes... Use @name to mention users"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                />
              </div>

              {/* Job Notes - visible on Job */}
              <div className="lg:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Job Notes
                  <span className="text-xs text-gray-400 ml-2">(visible on Job) Use @ to mention users</span>
                </label>
                <MentionTextarea
                  value={formData.jobNotes}
                  onChange={(val) => setFormData(prev => ({ ...prev, jobNotes: val }))}
                  rows={3}
                  placeholder="Add job notes that will be visible on the job... Use @name to mention users"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                />
                <p className="text-xs text-gray-400 mt-1">{(formData.jobNotes || '').length}/5000</p>
              </div>

              {/* Additional Information */}
              <div className="lg:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Additional Information
                  <span className="text-xs text-gray-400 ml-2">Use @ to mention users</span>
                </label>
                <MentionTextarea
                  value={formData.description}
                  onChange={(val) => setFormData(prev => ({ ...prev, description: val }))}
                  rows={3}
                  placeholder="Any additional information... Use @name to mention users"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                />
                <p className="text-xs text-gray-400 mt-1">{(formData.description || '').length}/5000</p>
              </div>
            </div>


            {/* Validation Warning for Qualify Step */}
            {!hasRequiredFields && (
              <div className="flex items-center space-x-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                <p className="text-sm text-yellow-700">
                  {isCallCenter
                    ? 'Required fields: Lead Source, Property Type, Work Type, and Appointment Date/Time must be completed before saving.'
                    : 'Required fields: Lead Source plus basic contact information must be completed before saving.'
                  }
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
              </>
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
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
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
                      <p className="font-medium text-gray-900 text-sm">{formData.company || `${formData.firstName} ${formData.lastName}`} - <span className="text-gray-400 italic">Job # auto-assigned</span></p>
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
                      { label: 'Appointment Date/Time', check: hasCallCenterAppointment, step: 3, field: 'tentativeAppointmentDate' },
                    ] : [
                      // Sales Rep required fields
                      { label: 'First Name', check: !!formData.firstName, step: 1, field: 'firstName' },
                      { label: 'Last Name', check: !!formData.lastName, step: 1, field: 'lastName' },
                      { label: 'Phone or Email', check: !!(formData.phone || formData.mobilePhone || formData.email), step: 1, field: 'phone' },
                      { label: 'Company', check: !!formData.company, optional: true, step: 1, field: 'company' },
                      { label: 'Address', check: !!(formData.street && formData.city), optional: true, step: 2, field: 'street' },
                      { label: 'Lead Source', check: !!formData.leadSource, step: 3, field: 'leadSource' },
                      { label: 'Project Type', check: !!formData.propertyType, optional: true, step: 4, field: 'propertyType' },
                      { label: 'Work Type', check: !!formData.workType, optional: true, step: 4, field: 'workType' },
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
                      ? 'Please complete all required fields (First Name, Last Name, Phone/Email, Work Type, Lead Status, Lead Source, and Appointment Date/Time) before converting'
                      : 'Please complete all required fields (First Name, Last Name, Phone/Email, and Lead Source) before converting'
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
        <div className="fixed inset-x-0 bottom-0 z-50 px-2 pb-2 sm:px-4 sm:pb-3">
          <div className="mx-auto max-w-screen-2xl">
            <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white/95 p-2 shadow-lg backdrop-blur sm:gap-3 sm:p-2.5">
              <button
                onClick={handlePrevious}
                disabled={currentStep === 1}
                className={`inline-flex items-center rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  currentStep === 1
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </button>

              <div className="flex flex-wrap items-center justify-center gap-2">
                {/* Call Button - RingCentral Integration */}
                <button
                  type="button"
                  onClick={async () => {
                    const phoneNumber = formData.phone || formData.mobilePhone;
                    if (phoneNumber) {
                      if (!isRingCentralReady) {
                        await loadWidget();
                      }
                      setRingCentralVisible(true);
                      clickToCall(phoneNumber);
                    }
                  }}
                  disabled={!formData.phone && !formData.mobilePhone}
                  className={`inline-flex items-center space-x-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all sm:text-sm ${
                    (formData.phone || formData.mobilePhone)
                      ? currentCall
                        ? 'bg-red-500 text-white hover:bg-red-600'
                        : 'bg-green-500 text-white hover:bg-green-600'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {currentCall ? <PhoneCall className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
                  <span>{currentCall ? 'On Call' : 'Call'}</span>
                </button>

                {/* SMS Button */}
                <button
                  type="button"
                  onClick={() => {
                    setSmsPhoneNumber(formData.mobilePhone || formData.phone || '');
                    setShowSmsPanel(true);
                  }}
                  disabled={!formData.phone && !formData.mobilePhone}
                  className={`inline-flex items-center space-x-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all sm:text-sm ${
                    formData.phone || formData.mobilePhone
                      ? 'bg-blue-500 text-white hover:bg-blue-600'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>SMS</span>
                </button>

                {/* Email Button */}
                <button
                  type="button"
                  onClick={() => setShowEmailPanel(true)}
                  disabled={!formData.email}
                  className={`inline-flex items-center space-x-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all sm:text-sm ${
                    formData.email
                      ? 'bg-indigo-500 text-white hover:bg-indigo-600'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <Mail className="w-4 h-4" />
                  <span>Email</span>
                </button>
              </div>

              <div className="flex items-center space-x-2 sm:space-x-3">
                <button
                  onClick={() => navigate(-1)}
                  className="px-3 py-1.5 text-sm text-gray-600 transition-colors hover:text-gray-800"
                >
                  Cancel
                </button>
                {currentStep < totalSteps ? (
                  <button
                    onClick={handleNext}
                    className="inline-flex items-center rounded-lg bg-panda-primary px-4 py-1.5 text-sm text-white transition-colors hover:bg-panda-primary/90"
                  >
                    Next
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </button>
                ) : isCallCenter ? (
                  <button
                    onClick={handleOpenLeadRecord}
                    disabled={isSaving || !formData.leadSource}
                    className={`inline-flex items-center rounded-lg px-4 py-1.5 text-sm transition-colors ${
                      isSaving || !formData.leadSource
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-panda-primary text-white hover:bg-panda-primary/90'
                    }`}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        {isNewLead ? 'Create & Open Lead' : 'Open Lead Record'}
                        <ArrowRight className="ml-1 h-4 w-4" />
                      </>
                    )}
                  </button>
                ) : isNewLead ? (
                  <button
                    onClick={handleSave}
                    disabled={isSaving || !hasRequiredFields}
                    className={`inline-flex items-center rounded-lg px-4 py-1.5 text-sm transition-colors ${
                      isSaving || !hasRequiredFields
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-green-500 text-white hover:bg-green-600'
                    }`}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Create Lead
                      </>
                    )}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Call Center Lead Source Prompt */}
      {useLeadPromptFlow && showLeadSourcePrompt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Lead Source (Required)</h3>
                <p className="text-sm text-gray-600 mt-1">Select a lead source to continue qualification.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowLeadSourcePrompt(false)}
                className="p-1 rounded hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Lead Source <span className="text-red-500">*</span>
              </label>
              <select
                name="leadSource"
                value={formData.leadSource}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, leadSource: e.target.value }));
                  setLeadSourcePromptError('');
                }}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
              >
                <option value="">Select source...</option>
                {LEAD_SOURCES.map(source => (
                  <option key={source.value} value={source.value}>{source.label}</option>
                ))}
              </select>
              {leadSourcePromptError && (
                <p className="text-xs text-red-600 mt-2">{leadSourcePromptError}</p>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowLeadSourcePrompt(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!formData.leadSource) {
                    setLeadSourcePromptError('Lead source is required.');
                    return;
                  }
                  setLeadSourcePromptError('');
                  setShowLeadSourcePrompt(false);
                  persistPromptCompletion();
                  if (!hasCallCenterAppointment) {
                    setHasManualAppointmentChange(false);
                    setPendingSuggestedSlot(null);
                    setAppointmentPromptInfo('');
                    setShowAppointmentPrompt(true);
                    requestAppointmentSuggestion({ allowFallback: true, applySuggestion: true });
                  }
                }}
                className="px-4 py-2 text-sm bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Call Center Appointment Prompt */}
      {useLeadPromptFlow && showAppointmentPrompt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Inspection Appointment</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Suggest the optimal time from Production Center and allow customers to request a specific slot.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAppointmentPromptClose}
                className="p-1 rounded hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  name="tentativeAppointmentDate"
                  value={formData.tentativeAppointmentDate}
                  onChange={handleAppointmentPromptInputChange}
                  min={appointmentDateMin}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
                <input
                  type="time"
                  name="tentativeAppointmentTime"
                  value={formData.tentativeAppointmentTime}
                  onChange={handleAppointmentPromptInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent text-sm"
                />
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">Assigned Owner</p>
                  <p className="text-sm font-semibold text-gray-900">{displayedOwnerName}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Changes require Call Center Manager or higher.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!canOverrideOwner) return;
                    setShowOwnerDropdown((prev) => !prev);
                  }}
                  disabled={!canOverrideOwner}
                  className="px-3 py-2 text-xs bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  Change Owner
                </button>
              </div>

              {showOwnerDropdown && canOverrideOwner && (
                <div className="mt-3">
                  <input
                    type="text"
                    value={ownerSearchQuery}
                    onChange={(e) => {
                      setOwnerSearchQuery(e.target.value);
                      setShowOwnerDropdown(true);
                    }}
                    placeholder="Search users..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  />
                  <div className="mt-2 max-h-40 overflow-y-auto border border-gray-200 rounded-lg bg-white">
                    {(ownerUsersData?.data || ownerUsersData || []).length === 0 ? (
                      <p className="px-3 py-2 text-xs text-gray-500">No matching users</p>
                    ) : (
                      (ownerUsersData?.data || ownerUsersData || []).map((owner) => (
                        <button
                          type="button"
                          key={owner.id}
                          onClick={() => handleOwnerOverrideSelect(owner)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                        >
                          {(owner.firstName || '')} {(owner.lastName || '')}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => requestAppointmentSuggestion({
                  allowFallback: true,
                  applySuggestion: false,
                  infoMessage: 'Suggested slot is ready. Click Use suggested time to apply it.',
                })}
                disabled={isSuggestingAppointment || !hasManualAppointmentChange}
                className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-60"
              >
                {isSuggestingAppointment ? 'Finding...' : 'Suggest Best Time'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const preferredDateTime = buildPreferredDateTime();
                  if (!preferredDateTime) {
                    setAppointmentPromptError('Select a valid date and time to check availability.');
                    return;
                  }
                  requestAppointmentSuggestion({
                    preferredDateTime,
                    allowFallback: false,
                    applySuggestion: false,
                    infoMessage: 'Requested time is available. Click Confirm Appointment to lock it in.',
                  });
                }}
                disabled={isSuggestingAppointment}
                className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-60"
              >
                Check Requested Time
              </button>
            </div>

            {pendingSuggestedSlot?.appointmentDate && pendingSuggestedSlot?.appointmentTime && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex flex-wrap items-center justify-between gap-2">
                <span>
                  Suggested slot: {pendingSuggestedSlot.appointmentDate} at {pendingSuggestedSlot.appointmentTime}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    const preferredDateTime = buildPreferredDateTimeFromSlot(pendingSuggestedSlot);
                    if (!preferredDateTime) {
                      setAppointmentPromptError('Suggested slot is invalid. Please request again.');
                      return;
                    }
                    const result = await requestAppointmentSuggestion({
                      preferredDateTime,
                      allowFallback: false,
                      applySuggestion: true,
                    });
                    if (result?.ready) {
                      setPendingSuggestedSlot(null);
                      setAppointmentPromptInfo('Suggested time applied.');
                    }
                  }}
                  className="px-3 py-2 text-xs bg-white border border-amber-300 rounded-lg hover:bg-amber-100"
                >
                  Use suggested time
                </button>
              </div>
            )}

            {appointmentPromptInfo && (
              <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
                {appointmentPromptInfo}
              </div>
            )}

            {appointmentPromptError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {appointmentPromptError}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAppointmentPrompt(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const preferredDateTime = buildPreferredDateTime();
                  if (!preferredDateTime) {
                    setAppointmentPromptError('Select a valid date and time before confirming.');
                    return;
                  }
                  const result = await requestAppointmentSuggestion({ preferredDateTime, allowFallback: false });
                  if (result?.ready) {
                    setShowAppointmentPrompt(false);
                    if (!formData.leadSource) {
                      setShowLeadSourcePrompt(true);
                    }
                  }
                }}
                disabled={isSuggestingAppointment}
                className="px-4 py-2 text-sm bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 disabled:opacity-60"
              >
                Confirm Appointment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inspection conversion gate */}
      {showInspectionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="text-center mb-5">
              <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Target className="w-7 h-7 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">
                {wasInspected ? 'Select Sales Path' : 'Was this Inspected?'}
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {wasInspected
                  ? 'Choose Insurance or Retail before conversion.'
                  : 'No Inspection moves the lead to the reschedule path.'}
              </p>
            </div>

            {wasInspected ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleSalesPathSelection('INSURANCE')}
                  disabled={isConverting}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  <Check className="w-4 h-4" />
                  <span>Insurance</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSalesPathSelection('RETAIL')}
                  disabled={isConverting}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  <Check className="w-4 h-4" />
                  <span>Retail</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleInspectionDecision(true)}
                  disabled={isConverting}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  <Check className="w-4 h-4" />
                  <span>Yes, Inspected</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleInspectionDecision(false)}
                  disabled={isConverting}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  <X className="w-4 h-4" />
                  <span>No Inspection</span>
                </button>
              </div>
            )}

            {selectedOpportunityType && (
              <p className="mt-3 text-xs text-center text-gray-500">
                Selected opportunity type: {selectedOpportunityType}
              </p>
            )}
            {wasInspected !== null && !wasInspected && (
              <p className="mt-1 text-xs text-center text-gray-500">
                Inspection status: No Inspection
              </p>
            )}

            {wasInspected && (
              <button
                type="button"
                onClick={() => {
                  setWasInspected(null);
                  setSelectedOpportunityType(null);
                }}
                disabled={isConverting}
                className="w-full mt-3 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Back
              </button>
            )}

            <button
              type="button"
              onClick={handleInspectionModalClose}
              disabled={isConverting}
              className="w-full mt-4 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Quick Actions Bar - Fixed at bottom of page */}
      {!conversionResult && (
        <>
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
                    {smsTemplates.map(template => (
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
                    {emailTemplates.map(template => (
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
      <div className="h-16" />
    </div>
  );
}
