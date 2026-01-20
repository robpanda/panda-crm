import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  CheckCircle,
  Circle,
  Clock,
  AlertCircle,
  Target,
  Calendar,
  Shield,
  Pen,
  Wrench,
  Camera,
  FileText,
  DollarSign,
  Users,
  Phone,
  Mail,
  CheckSquare,
  ClipboardList,
  Loader2,
  ArrowRight,
  ExternalLink,
  Flag,
  Home,
} from 'lucide-react';
import { opportunitiesApi, companyCamApi } from '../services/api';

// Stage-specific checklists - what needs to be done at each stage
const STAGE_CHECKLISTS = {
  LEAD_UNASSIGNED: {
    title: 'Lead Qualification',
    icon: Target,
    color: 'blue',
    items: [
      { id: 'contact_info', label: 'Contact information verified', field: 'contactVerified' },
      { id: 'address_valid', label: 'Property address confirmed', field: 'addressVerified' },
      { id: 'work_type', label: 'Work type identified', field: 'workType' },
      { id: 'lead_source', label: 'Lead source recorded', field: 'leadSource' },
    ],
  },
  LEAD_ASSIGNED: {
    title: 'Pre-Inspection',
    icon: Calendar,
    color: 'indigo',
    items: [
      { id: 'rep_assigned', label: 'Sales rep assigned', field: 'ownerId' },
      { id: 'first_contact', label: 'Initial contact made', field: 'firstContactDate' },
      { id: 'inspection_scheduled', label: 'Inspection scheduled', field: 'appointmentDate' },
      { id: 'homeowner_notified', label: 'Homeowner notified', field: 'notificationSent' },
    ],
  },
  SCHEDULED: {
    title: 'Inspection Prep',
    icon: Calendar,
    color: 'indigo',
    items: [
      { id: 'confirm_appointment', label: 'Appointment confirmed', field: 'appointmentConfirmed' },
      { id: 'directions_saved', label: 'Directions/parking noted', field: 'directionsNoted' },
      { id: 'equipment_ready', label: 'Inspection equipment ready', field: 'equipmentReady' },
      { id: 'homeowner_reminder', label: 'Reminder sent to homeowner', field: 'reminderSent' },
    ],
  },
  INSPECTED: {
    title: 'Post-Inspection',
    icon: Camera,
    color: 'purple',
    items: [
      { id: 'photos_uploaded', label: 'Inspection photos uploaded', field: 'photosUploaded' },
      { id: 'damage_documented', label: 'Damage documented', field: 'damageDocumented' },
      { id: 'measurements_taken', label: 'Measurements collected', field: 'measurementsTaken' },
      { id: 'claim_eligible', label: 'Claim eligibility assessed', field: 'claimEligibilityAssessed' },
    ],
  },
  CLAIM_FILED: {
    title: 'Insurance Process',
    icon: Shield,
    color: 'purple',
    items: [
      { id: 'claim_submitted', label: 'Claim filed with carrier', field: 'claimFiledDate' },
      { id: 'claim_number', label: 'Claim number received', field: 'claimNumber' },
      { id: 'adjuster_assigned', label: 'Adjuster assigned', field: 'adjusterAssigned' },
      { id: 'meeting_scheduled', label: 'Adjuster meeting scheduled', field: 'adjusterMeetingDate' },
    ],
  },
  ADJUSTER_MEETING_COMPLETE: {
    title: 'Approval Process',
    icon: Shield,
    color: 'purple',
    items: [
      { id: 'meeting_completed', label: 'Adjuster meeting completed', field: 'adjusterMeetingComplete' },
      { id: 'estimate_received', label: 'Insurance estimate received', field: 'estimateReceived' },
      { id: 'specs_prepared', label: 'Specs prepared', field: 'specsPrepped' },
      { id: 'approval_pending', label: 'Awaiting final approval', field: 'approvalPending' },
    ],
  },
  APPROVED: {
    title: 'Contract Preparation',
    icon: Pen,
    color: 'green',
    items: [
      { id: 'approval_received', label: 'Insurance approval received', field: 'isApproved' },
      { id: 'rcv_amount', label: 'RCV amount confirmed', field: 'rcvAmount' },
      { id: 'deductible_set', label: 'Deductible amount set', field: 'deductible' },
      { id: 'contract_prepared', label: 'Contract prepared', field: 'contractPrepared' },
    ],
  },
  CONTRACT_SIGNED: {
    title: 'Onboarding',
    icon: FileText,
    color: 'green',
    items: [
      { id: 'contract_signed', label: 'Contract signed', field: 'contractSigned' },
      { id: 'down_payment', label: 'Down payment received', field: 'downPaymentReceived' },
      { id: 'materials_ordered', label: 'Materials ordered', field: 'materialsOrdered' },
      { id: 'crew_assigned', label: 'Production crew assigned', field: 'crewAssigned' },
    ],
  },
  IN_PRODUCTION: {
    title: 'Production',
    icon: Wrench,
    color: 'amber',
    items: [
      { id: 'production_started', label: 'Production started', field: 'productionStarted' },
      { id: 'materials_delivered', label: 'Materials delivered', field: 'materialsDelivered' },
      { id: 'work_in_progress', label: 'Work in progress', field: 'workInProgress' },
      { id: 'quality_check', label: 'Quality inspection scheduled', field: 'qualityCheckScheduled' },
    ],
  },
  COMPLETED: {
    title: 'Job Close-Out',
    icon: CheckCircle,
    color: 'emerald',
    items: [
      { id: 'work_completed', label: 'Work completed', field: 'workCompleted' },
      { id: 'final_inspection', label: 'Final inspection passed', field: 'finalInspectionPassed' },
      { id: 'final_photos', label: 'Final photos uploaded', field: 'finalPhotosUploaded' },
      { id: 'final_payment', label: 'Final payment collected', field: 'finalPaymentReceived' },
    ],
  },
  CLOSED_WON: {
    title: 'Complete',
    icon: CheckCircle,
    color: 'emerald',
    items: [
      { id: 'customer_satisfied', label: 'Customer satisfaction confirmed', field: 'customerSatisfied' },
      { id: 'review_requested', label: 'Review requested', field: 'reviewRequested' },
      { id: 'warranty_provided', label: 'Warranty documentation provided', field: 'warrantyProvided' },
      { id: 'job_closed', label: 'Job fully closed', field: 'isClosed' },
    ],
  },
};

// Next action recommendations by stage
const NEXT_ACTIONS = {
  LEAD_UNASSIGNED: { action: 'Assign to Sales Rep', description: 'Route this lead to an available sales rep', urgent: true },
  LEAD_ASSIGNED: { action: 'Schedule Inspection', description: 'Contact homeowner to schedule inspection', urgent: false },
  SCHEDULED: { action: 'Complete Inspection', description: 'Perform on-site inspection and document damage', urgent: false },
  INSPECTED: { action: 'File Insurance Claim', description: 'Submit claim to insurance carrier', urgent: false },
  CLAIM_FILED: { action: 'Schedule Adjuster Meeting', description: 'Coordinate meeting with insurance adjuster', urgent: false },
  ADJUSTER_MEETING_COMPLETE: { action: 'Prepare Specs', description: 'Create project specifications and get approval', urgent: false },
  APPROVED: { action: 'Send Contract', description: 'Generate and send contract for signature', urgent: true },
  CONTRACT_SIGNED: { action: 'Start Production', description: 'Begin onboarding and schedule installation', urgent: false },
  IN_PRODUCTION: { action: 'Complete Installation', description: 'Finish all work and quality checks', urgent: false },
  COMPLETED: { action: 'Close Job', description: 'Collect final payment and close', urgent: true },
  CLOSED_WON: { action: 'Job Complete', description: 'This job is fully completed', urgent: false },
};

// Key dates to track
const KEY_DATE_FIELDS = [
  { field: 'createdAt', label: 'Created', icon: Clock },
  { field: 'appointmentDate', label: 'Inspection', icon: Calendar },
  { field: 'claimFiledDate', label: 'Claim Filed', icon: Shield },
  { field: 'adjusterMeetingDate', label: 'Adjuster Meeting', icon: Users },
  { field: 'soldDate', label: 'Sold', icon: Pen },
  { field: 'closeDate', label: 'Close Date', icon: CheckCircle },
];

function CollapsibleSection({ title, icon: Icon, color, children, defaultOpen = true, badge }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    purple: 'bg-purple-50 text-purple-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    gray: 'bg-gray-50 text-gray-600',
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center space-x-2.5">
          <div className={`p-1.5 rounded-lg ${colorClasses[color] || colorClasses.gray}`}>
            <Icon className="w-4 h-4" />
          </div>
          <span className="font-medium text-gray-900 text-sm">{title}</span>
          {badge && (
            <span className="px-1.5 py-0.5 text-xs font-medium rounded-full bg-panda-primary/10 text-panda-primary">
              {badge}
            </span>
          )}
        </div>
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
      </button>
      {isOpen && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

function ChecklistItem({ item, isComplete, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center space-x-2.5 py-1.5 text-left hover:bg-gray-50 rounded transition-colors"
    >
      {isComplete ? (
        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
      ) : (
        <Circle className="w-4 h-4 text-gray-300 flex-shrink-0" />
      )}
      <span className={`text-sm ${isComplete ? 'text-gray-500 line-through' : 'text-gray-700'}`}>
        {item.label}
      </span>
    </button>
  );
}

export default function WorkflowSidebar({
  opportunity,
  onActionClick,
  onEditClick,
  onScheduleClick,
}) {
  const queryClient = useQueryClient();
  const currentStage = opportunity?.stageName || opportunity?.stage || 'LEAD_UNASSIGNED';

  // Get the current stage's checklist
  const stageChecklist = useMemo(() => {
    return STAGE_CHECKLISTS[currentStage] || STAGE_CHECKLISTS.LEAD_UNASSIGNED;
  }, [currentStage]);

  // Calculate checklist completion based on opportunity data
  const checklistStatus = useMemo(() => {
    if (!opportunity) return { completed: 0, total: 0, items: [] };

    // Helper to check if contact info exists (auto-verify based on data presence)
    const hasContactInfo = () => {
      const contact = opportunity.contact;
      const account = opportunity.account;
      // Check if we have a name AND at least one contact method (phone or email)
      const hasName = contact?.fullName || contact?.firstName || contact?.lastName ||
                      account?.name;
      const hasContactMethod = contact?.phone || contact?.mobilePhone || contact?.email ||
                               opportunity.phone || opportunity.email;
      return !!(hasName && hasContactMethod);
    };

    // Helper to check if address exists (auto-verify based on data presence)
    const hasAddressInfo = () => {
      const account = opportunity.account;
      const contact = opportunity.contact;
      // Check for street address from account or contact
      const hasStreet = account?.billingStreet || account?.shippingStreet ||
                        contact?.mailingStreet || opportunity.street;
      const hasCity = account?.billingCity || account?.shippingCity ||
                      contact?.mailingCity || opportunity.city;
      const hasState = account?.billingState || account?.shippingState ||
                       contact?.mailingState || opportunity.state;
      // Consider address verified if we have at least street and city/state
      return !!(hasStreet && (hasCity || hasState));
    };

    const items = stageChecklist.items.map((item) => {
      let isComplete = false;

      // Custom logic for specific checklist items (auto-verification)
      if (item.field === 'contactVerified') {
        // Auto-check if contact information exists
        isComplete = hasContactInfo();
      } else if (item.field === 'addressVerified') {
        // Auto-check if property address exists
        isComplete = hasAddressInfo();
      } else if (item.field) {
        // Default: check if the field has a truthy value
        const value = opportunity[item.field];
        isComplete = value !== null && value !== undefined && value !== '' && value !== false;
      }

      return { ...item, isComplete };
    });

    const completed = items.filter((i) => i.isComplete).length;

    return {
      completed,
      total: items.length,
      items,
      percentage: Math.round((completed / items.length) * 100),
    };
  }, [opportunity, stageChecklist]);

  // Get next action for current stage
  const nextAction = NEXT_ACTIONS[currentStage];

  // Get key dates from opportunity
  const keyDates = useMemo(() => {
    if (!opportunity) return [];

    return KEY_DATE_FIELDS.map((df) => ({
      ...df,
      value: opportunity[df.field],
      formatted: opportunity[df.field]
        ? new Date(opportunity[df.field]).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        : null,
    })).filter((d) => d.value);
  }, [opportunity]);

  // Quick info items (including contact info)
  const quickInfo = useMemo(() => {
    if (!opportunity) return [];

    const items = [];

    if (opportunity.account?.name) {
      items.push({ icon: Home, label: 'Account', value: opportunity.account.name });
    }

    if (opportunity.owner?.firstName || opportunity.owner?.lastName) {
      items.push({
        icon: Users,
        label: 'Owner',
        value: `${opportunity.owner?.firstName || ''} ${opportunity.owner?.lastName || ''}`.trim(),
      });
    }

    if (opportunity.amount) {
      items.push({
        icon: DollarSign,
        label: 'Amount',
        value: `$${opportunity.amount.toLocaleString()}`,
        highlight: true,
      });
    }

    if (opportunity.workType) {
      items.push({ icon: Wrench, label: 'Type', value: opportunity.workType });
    }

    // Contact info merged into Quick Info
    if (opportunity.contact?.fullName) {
      items.push({ icon: Users, label: 'Contact', value: opportunity.contact.fullName });
    }

    if (opportunity.contact?.phone) {
      items.push({
        icon: Phone,
        label: 'Phone',
        value: opportunity.contact.phone,
        link: `tel:${opportunity.contact.phone}`,
        linkColor: 'text-panda-primary',
      });
    }

    if (opportunity.contact?.email) {
      items.push({
        icon: Mail,
        label: 'Email',
        value: opportunity.contact.email,
        link: `mailto:${opportunity.contact.email}`,
        linkColor: 'text-panda-primary',
        truncate: true,
      });
    }

    return items;
  }, [opportunity]);

  if (!opportunity) {
    return (
      <div className="space-y-3">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <Loader2 className="w-5 h-5 text-panda-primary animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* What's Next - Primary Action */}
      {nextAction && currentStage !== 'CLOSED_WON' && (
        <div
          className={`rounded-xl p-3 ${
            nextAction.urgent
              ? 'bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200'
              : 'bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200'
          }`}
        >
          <div className="flex items-start space-x-2.5">
            {nextAction.urgent ? (
              <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            ) : (
              <ArrowRight className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <h4 className={`font-semibold text-sm ${nextAction.urgent ? 'text-amber-800' : 'text-blue-800'}`}>
                {nextAction.action}
              </h4>
              <p className={`text-xs mt-0.5 ${nextAction.urgent ? 'text-amber-600' : 'text-blue-600'}`}>
                {nextAction.description}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Quick Info (includes contact info) */}
      {quickInfo.length > 0 && (
        <CollapsibleSection title="Quick Info" icon={Flag} color="gray" defaultOpen={true}>
          <div className="space-y-2">
            {quickInfo.map((info, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-2 text-gray-500">
                  <info.icon className="w-3.5 h-3.5" />
                  <span>{info.label}</span>
                </div>
                {info.link ? (
                  <a
                    href={info.link}
                    className={`font-medium hover:underline ${info.linkColor || 'text-panda-primary'} ${info.truncate ? 'truncate max-w-[140px]' : ''}`}
                  >
                    {info.value}
                  </a>
                ) : (
                  <span className={`${info.highlight ? 'font-semibold text-green-600' : 'text-gray-900 font-medium'} ${info.truncate ? 'truncate max-w-[140px]' : ''}`}>
                    {info.value}
                  </span>
                )}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Stage Checklist */}
      <CollapsibleSection
        title={stageChecklist.title}
        icon={stageChecklist.icon}
        color={stageChecklist.color}
        defaultOpen={true}
        badge={`${checklistStatus.completed}/${checklistStatus.total}`}
      >
        {/* Progress bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>{checklistStatus.percentage}% complete</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-panda-primary to-panda-secondary transition-all duration-300"
              style={{ width: `${checklistStatus.percentage}%` }}
            />
          </div>
        </div>

        {/* Checklist items */}
        <div className="space-y-0.5">
          {checklistStatus.items.map((item) => (
            <ChecklistItem
              key={item.id}
              item={item}
              isComplete={item.isComplete}
              onClick={() => {
                // Could trigger an action/modal to complete this item
                console.log('Checklist item clicked:', item.id);
              }}
            />
          ))}
        </div>
      </CollapsibleSection>

      {/* Key Dates */}
      {keyDates.length > 0 && (
        <CollapsibleSection title="Key Dates" icon={Calendar} color="indigo" defaultOpen={false}>
          <div className="space-y-2">
            {keyDates.map((date, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-2 text-gray-500">
                  <date.icon className="w-3.5 h-3.5" />
                  <span>{date.label}</span>
                </div>
                <span className="text-gray-900 font-medium">{date.formatted}</span>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Insurance Info - Only for insurance opportunities */}
      {(opportunity.type === 'INSURANCE' || opportunity.workType?.toLowerCase().includes('insurance')) && (
        <CollapsibleSection title="Insurance Details" icon={Shield} color="purple" defaultOpen={false}>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Carrier</span>
              <span className="text-gray-900 font-medium">{opportunity.insuranceCarrier || 'Not set'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Claim #</span>
              <span className="text-gray-900 font-medium">{opportunity.claimNumber || 'Not set'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Deductible</span>
              <span className="text-gray-900 font-medium">
                {opportunity.deductible ? `$${opportunity.deductible.toLocaleString()}` : 'Not set'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">RCV Amount</span>
              <span className="text-green-600 font-semibold">
                {opportunity.rcvAmount ? `$${opportunity.rcvAmount.toLocaleString()}` : 'Not set'}
              </span>
            </div>
          </div>
        </CollapsibleSection>
      )}

    </div>
  );
}

// Export stage checklists for use elsewhere
export { STAGE_CHECKLISTS, NEXT_ACTIONS, KEY_DATE_FIELDS };
