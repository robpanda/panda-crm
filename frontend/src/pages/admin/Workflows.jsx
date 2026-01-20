import { useState, useMemo } from 'react';
import AdminLayout from '../../components/AdminLayout';
import {
  Search,
  Filter,
  Play,
  Pause,
  ChevronDown,
  ChevronRight,
  Zap,
  DollarSign,
  Shield,
  FileText,
  Receipt,
  CreditCard,
  ClipboardCheck,
  FileSignature,
  AlertCircle,
  CheckCircle,
  Clock,
  Users,
  Briefcase,
  Building,
  FileCheck,
  Hammer,
  Calendar,
  MessageSquare,
  RefreshCw,
  Info,
} from 'lucide-react';

// All workflows extracted from the trigger files
const ALL_WORKFLOWS = [
  // ============ COMMISSION WORKFLOWS ============
  {
    id: 'comm-pre',
    name: 'Pre-Commission Creation',
    description: 'Creates pre-commission record when a service contract is created/signed',
    category: 'Commission',
    triggerObject: 'ServiceContract',
    triggerEvent: 'CREATE',
    triggerFile: 'commissionTriggers.js',
    triggerFunction: 'onContractCreated',
    actions: ['Create Commission record with type PRE_COMMISSION', 'Set status to NEW', 'Calculate commission based on contract value'],
    isActive: true,
    isSystem: true,
  },
  {
    id: 'comm-backend',
    name: 'Back-End Commission Creation',
    description: 'Creates back-end commission when job is paid in full (balance due = 0)',
    category: 'Commission',
    triggerObject: 'Invoice',
    triggerEvent: 'FIELD_CHANGE',
    triggerCondition: 'balanceDue = 0',
    triggerFile: 'commissionTriggers.js',
    triggerFunction: 'onJobPaidInFull',
    actions: ['Create Commission record with type BACK_END', 'Link to service contract', 'Calculate back-end commission rate'],
    isActive: true,
    isSystem: true,
  },
  {
    id: 'comm-company-lead',
    name: 'Company Lead Commission',
    description: 'Creates company lead commission for company-generated leads',
    category: 'Commission',
    triggerObject: 'ServiceContract',
    triggerEvent: 'CREATE',
    triggerCondition: 'isSelfGen = false',
    triggerFile: 'commissionTriggers.js',
    triggerFunction: 'onContractCreated',
    actions: ['Create Commission with COMPANY_LEAD type', 'Apply company lead rate'],
    isActive: true,
    isSystem: true,
  },
  {
    id: 'comm-self-gen',
    name: 'Self-Gen Commission',
    description: 'Creates self-gen commission for self-generated leads',
    category: 'Commission',
    triggerObject: 'ServiceContract',
    triggerEvent: 'CREATE',
    triggerCondition: 'isSelfGen = true',
    triggerFile: 'commissionTriggers.js',
    triggerFunction: 'onContractCreated',
    actions: ['Create Commission with SELF_GEN type', 'Apply self-gen rate (higher than company lead)'],
    isActive: true,
    isSystem: true,
  },
  {
    id: 'comm-supplement',
    name: 'Supplement Override Commission',
    description: 'Creates supplement override commission when supplements are approved',
    category: 'Commission',
    triggerObject: 'Opportunity',
    triggerEvent: 'FIELD_CHANGE',
    triggerCondition: 'supplementsApproved = true',
    triggerFile: 'commissionTriggers.js',
    triggerFunction: 'onSupplementApproved',
    actions: ['Create Commission with SUPPLEMENT_OVERRIDE type', 'Calculate based on supplement total'],
    isActive: true,
    isSystem: true,
  },
  {
    id: 'comm-pm',
    name: 'PM Add-On Commission',
    description: 'Creates PM commission for add-on contracts sold by Project Managers',
    category: 'Commission',
    triggerObject: 'ServiceContract',
    triggerEvent: 'CREATE',
    triggerCondition: 'isPMContract = true',
    triggerFile: 'commissionTriggers.js',
    triggerFunction: 'onPMContractCreated',
    actions: ['Create Commission with PM_COMMISSION type', 'Assign to PM who sold the add-on'],
    isActive: true,
    isSystem: true,
  },
  {
    id: 'comm-sales-op',
    name: 'Sales Op Commission (PandaClaims)',
    description: 'Creates Sales Op commission for Jason Wooten on PandaClaims jobs',
    category: 'Commission',
    triggerObject: 'ServiceContract',
    triggerEvent: 'CREATE',
    triggerCondition: 'isPandaClaims = true',
    triggerFile: 'commissionTriggers.js',
    triggerFunction: 'onPandaClaimsOnboarded',
    actions: ['Create Commission with SALES_OP type', 'Assign to Jason Wooten', 'Apply 0.5% rate on Contract Grand Total'],
    isActive: true,
    isSystem: true,
  },
  {
    id: 'comm-manager-override',
    name: 'Manager Override Commission',
    description: 'Creates manager override commission based on team sales',
    category: 'Commission',
    triggerObject: 'ServiceContract',
    triggerEvent: 'CREATE',
    triggerFile: 'commissionTriggers.js',
    triggerFunction: 'onContractCreated',
    actions: ['Create Commission with MANAGER_OVERRIDE type', 'Look up manager from sales rep', 'Apply manager override rate'],
    isActive: true,
    isSystem: true,
  },
  {
    id: 'comm-regional-override',
    name: 'Regional Manager Override',
    description: 'Creates regional manager override commission',
    category: 'Commission',
    triggerObject: 'ServiceContract',
    triggerEvent: 'CREATE',
    triggerFile: 'commissionTriggers.js',
    triggerFunction: 'onContractCreated',
    actions: ['Create Commission with REGIONAL_MANAGER_OVERRIDE type', 'Look up regional manager', 'Apply regional override rate'],
    isActive: true,
    isSystem: true,
  },
  {
    id: 'comm-director-override',
    name: 'Director Override Commission',
    description: 'Creates director override commission',
    category: 'Commission',
    triggerObject: 'ServiceContract',
    triggerEvent: 'CREATE',
    triggerFile: 'commissionTriggers.js',
    triggerFunction: 'onContractCreated',
    actions: ['Create Commission with DIRECTOR_OVERRIDE type', 'Look up director', 'Apply director override rate'],
    isActive: true,
    isSystem: true,
  },
  {
    id: 'comm-executive-override',
    name: 'Executive Override Commission',
    description: 'Creates executive override commission',
    category: 'Commission',
    triggerObject: 'ServiceContract',
    triggerEvent: 'CREATE',
    triggerFile: 'commissionTriggers.js',
    triggerFunction: 'onContractCreated',
    actions: ['Create Commission with EXECUTIVE_OVERRIDE type', 'Look up executive', 'Apply executive override rate'],
    isActive: true,
    isSystem: true,
  },
  {
    id: 'comm-sales-flip',
    name: 'Sales Flip Commission (PandaClaims)',
    description: 'Creates Sales Flip commission for PandaClaims jobs at 30% collected',
    category: 'Commission',
    triggerObject: 'Account',
    triggerEvent: 'FIELD_CHANGE',
    triggerCondition: 'collectedPercent >= 30',
    triggerFile: 'commissionTriggers.js',
    triggerFunction: 'onCollectionUpdated',
    actions: ['Create Commission with SALES_FLIP type', 'Set status to REQUESTED when 30% collected'],
    isActive: true,
    isSystem: true,
  },
  {
    id: 'comm-payroll-adj',
    name: 'Payroll Adjustment Auto-Creation',
    description: 'Auto-creates payroll adjustment when Paid Amount is manually changed',
    category: 'Commission',
    triggerObject: 'Commission',
    triggerEvent: 'FIELD_CHANGE',
    triggerCondition: 'paidAmount changed',
    triggerFile: 'commissionTriggers.js',
    triggerFunction: 'onCommissionPaidAmountChanged',
    actions: ['Create PAYROLL_ADJUSTMENT commission for the difference', 'Link to original commission'],
    isActive: true,
    isSystem: true,
  },

  // ============ INSURANCE WORKFLOWS ============
  {
    id: 'ins-adjuster-complete',
    name: 'Adjuster Meeting Completion',
    description: 'Triggers after adjuster meeting is marked complete',
    category: 'Insurance',
    triggerObject: 'ServiceAppointment',
    triggerEvent: 'FIELD_CHANGE',
    triggerCondition: 'status = COMPLETED AND workType = Adjuster Meeting',
    triggerFile: 'insuranceTriggers.js',
    triggerFunction: 'onAdjusterMeetingComplete',
    actions: ['Update opportunity to Adjuster Meeting Complete', 'Create task for next steps', 'Create internal note', 'Schedule Contract Signing appointment'],
    isActive: true,
    isSystem: true,
  },
  {
    id: 'ins-approved',
    name: 'Insurance Approval Processing',
    description: 'Processes insurance approval and updates opportunity',
    category: 'Insurance',
    triggerObject: 'Opportunity',
    triggerEvent: 'FIELD_CHANGE',
    triggerCondition: 'isApproved = true',
    triggerFile: 'insuranceTriggers.js',
    triggerFunction: 'onInsuranceApproved',
    actions: ['Update opportunity stage to APPROVED', 'Set approved date', 'Calculate RCV amount'],
    isActive: true,
    isSystem: true,
  },
  {
    id: 'ins-supplement-requested',
    name: 'Supplement Request Processing',
    description: 'Creates task when supplement is requested',
    category: 'Insurance',
    triggerObject: 'Opportunity',
    triggerEvent: 'FIELD_CHANGE',
    triggerCondition: 'supplementRequested = true',
    triggerFile: 'insuranceTriggers.js',
    triggerFunction: 'onSupplementRequested',
    actions: ['Create task for supplement review', 'Notify relevant team members'],
    isActive: true,
    isSystem: true,
  },
  {
    id: 'ins-supplement-approved',
    name: 'Supplement Approval Processing',
    description: 'Updates service contract with supplement totals',
    category: 'Insurance',
    triggerObject: 'Opportunity',
    triggerEvent: 'FIELD_CHANGE',
    triggerCondition: 'supplementsApproved = true',
    triggerFile: 'insuranceTriggers.js',
    triggerFunction: 'onSupplementApproved',
    actions: ['Update service contract supplement total', 'Trigger supplement override commission'],
    isActive: true,
    isSystem: true,
  },
  {
    id: 'ins-claim-filed',
    name: 'Claim Filed Processing',
    description: 'Updates opportunity when insurance claim is filed',
    category: 'Insurance',
    triggerObject: 'Opportunity',
    triggerEvent: 'FIELD_CHANGE',
    triggerCondition: 'claimFiled = true',
    triggerFile: 'insuranceTriggers.js',
    triggerFunction: 'onClaimFiled',
    actions: ['Update opportunity stage to CLAIM_FILED', 'Set claim filed date', 'Record claim number'],
    isActive: true,
    isSystem: true,
  },

  // ============ INSPECTION WORKFLOW ============
  {
    id: 'insp-completed',
    name: 'Inspection Completion Processing',
    description: 'Updates opportunity and creates specs task when inspection is completed',
    category: 'Inspection',
    triggerObject: 'ServiceAppointment',
    triggerEvent: 'FIELD_CHANGE',
    triggerCondition: 'status = COMPLETED AND workType contains "Inspection"',
    triggerFile: 'inspectionTriggers.js',
    triggerFunction: 'onInspectionCompleted',
    actions: ['Update opportunity stage to INSPECTED', 'Create task: "Prepare specs for this project"', 'Create activity log entry'],
    isActive: true,
    isSystem: true,
  },

  // ============ SPECS WORKFLOW ============
  {
    id: 'specs-prepped',
    name: 'Specs Preparation Complete',
    description: 'Creates work order and schedules contract signing after specs are prepared',
    category: 'Specs',
    triggerObject: 'Opportunity',
    triggerEvent: 'FIELD_CHANGE',
    triggerCondition: 'specsPrepped = true',
    triggerFile: 'specsTriggers.js',
    triggerFunction: 'onSpecsPrepped',
    actions: ['Create Work Order from specs data', 'Create Work Order Line Items', 'Schedule Contract Signing service appointment'],
    isActive: true,
    isSystem: true,
  },

  // ============ CONTRACT WORKFLOW ============
  {
    id: 'contract-generate',
    name: 'Contract Document Generation',
    description: 'Generates PandaSign agreement from specs data',
    category: 'Contract',
    triggerObject: 'Opportunity',
    triggerEvent: 'MANUAL',
    triggerCondition: 'specsPrepped = true (manual trigger)',
    triggerFile: 'contractTriggers.js',
    triggerFunction: 'generateContractFromSpecs',
    actions: ['Find appropriate template (Insurance vs Retail)', 'Create PandaSign agreement', 'Populate merge fields', 'Update opportunity status'],
    isActive: true,
    isSystem: true,
  },

  // ============ INVOICE WORKFLOWS ============
  {
    id: 'inv-contract-activated',
    name: 'Invoice Creation on Contract Activation',
    description: 'Creates invoice when service contract is activated',
    category: 'Invoice',
    triggerObject: 'ServiceContract',
    triggerEvent: 'FIELD_CHANGE',
    triggerCondition: 'status = ACTIVE',
    triggerFile: 'invoiceTriggers.js',
    triggerFunction: 'onContractActivated',
    actions: ['Create Invoice from service contract', 'Create invoice line items from work order', 'Link invoice to account and opportunity'],
    isActive: true,
    isSystem: true,
  },
  {
    id: 'inv-pm-contract',
    name: 'PM Invoice Creation',
    description: 'Creates separate invoice for PM add-on contracts',
    category: 'Invoice',
    triggerObject: 'ServiceContract',
    triggerEvent: 'CREATE',
    triggerCondition: 'isPMContract = true',
    triggerFile: 'invoiceTriggers.js',
    triggerFunction: 'onPMContractCreated',
    actions: ['Create PM Invoice', 'Link to PM service contract', 'Set up PM-specific line items'],
    isActive: true,
    isSystem: true,
  },
  {
    id: 'inv-account-ready',
    name: 'Account Invoice Ready',
    description: 'Updates all open invoices when account is marked invoice ready',
    category: 'Invoice',
    triggerObject: 'Account',
    triggerEvent: 'FIELD_CHANGE',
    triggerCondition: 'invoiceReady = true',
    triggerFile: 'invoiceTriggers.js',
    triggerFunction: 'onAccountInvoiceReady',
    actions: ['Set invoice date on all open invoices', 'Set payment terms to 30 days', 'Calculate due date'],
    isActive: true,
    isSystem: true,
  },
  {
    id: 'inv-supplement-update',
    name: 'Invoice Supplement Update',
    description: 'Updates invoice with approved supplement amounts',
    category: 'Invoice',
    triggerObject: 'Opportunity',
    triggerEvent: 'FIELD_CHANGE',
    triggerCondition: 'supplementsApproved = true',
    triggerFile: 'invoiceTriggers.js',
    triggerFunction: 'onSupplementApproved',
    actions: ['Add supplement line item to invoice', 'Update invoice total'],
    isActive: true,
    isSystem: true,
  },

  // ============ QUICKBOOKS/PAYMENT WORKFLOWS ============
  {
    id: 'qb-onboarding',
    name: 'QuickBooks Customer Creation',
    description: 'Creates QuickBooks customer and Stripe customer on account onboarding',
    category: 'Payments',
    triggerObject: 'Account',
    triggerEvent: 'FIELD_CHANGE',
    triggerCondition: 'status = Onboarding',
    triggerFile: 'quickbooksTriggers.js',
    triggerFunction: 'onAccountOnboarding',
    actions: ['Create QuickBooks Customer', 'Create Stripe Customer', 'Link customer IDs to account'],
    isActive: true,
    isSystem: true,
  },
  {
    id: 'qb-invoice-sync',
    name: 'Invoice QuickBooks Sync',
    description: 'Syncs invoice to QuickBooks and generates Stripe payment link',
    category: 'Payments',
    triggerObject: 'Invoice',
    triggerEvent: 'CREATE',
    triggerFile: 'quickbooksTriggers.js',
    triggerFunction: 'onInvoiceCreated',
    actions: ['Create QuickBooks Invoice', 'Generate Stripe Payment Link', 'Store payment link on invoice'],
    isActive: true,
    isSystem: true,
  },
  {
    id: 'qb-payment-received',
    name: 'Payment Recording',
    description: 'Records payment in QuickBooks and updates invoice balance',
    category: 'Payments',
    triggerObject: 'Payment',
    triggerEvent: 'CREATE',
    triggerFile: 'quickbooksTriggers.js',
    triggerFunction: 'onPaymentReceived',
    actions: ['Create QuickBooks Payment', 'Update invoice balance due', 'Update account collected amount', 'Check if job is paid in full'],
    isActive: true,
    isSystem: true,
  },

  // ============ PPSQ WORKFLOW ============
  {
    id: 'ppsq-case',
    name: 'PPSQ Case Auto-Creation',
    description: 'Creates Pre-Supplement Required Case when field is toggled on opportunity',
    category: 'Cases',
    triggerObject: 'Opportunity',
    triggerEvent: 'FIELD_CHANGE',
    triggerCondition: 'preSupplementRequired = true',
    triggerFile: 'OpportunityDetail.jsx',
    triggerFunction: 'handleCreatePPSQCase',
    actions: ['Create Case with type "Pre-Supplement Required"', 'Link case to opportunity and account', 'Set priority to MEDIUM'],
    isActive: true,
    isSystem: true,
  },

  // ============ LEAD SCORING WORKFLOW ============
  {
    id: 'lead-scoring',
    name: 'Lead Auto-Scoring',
    description: 'Automatically scores new leads based on configurable rules and Census data',
    category: 'Leads',
    triggerObject: 'Lead',
    triggerEvent: 'CREATE',
    triggerCondition: 'Scheduled Lambda (hourly)',
    triggerFile: 'score-new-leads.js (Lambda)',
    triggerFunction: 'handler',
    actions: ['Evaluate scoring rules', 'Enrich with Census data (income, home value)', 'Calculate score 0-100', 'Assign rank A/B/C/D/F'],
    isActive: true,
    isSystem: true,
  },

  // ============ SMS NOTIFICATION WORKFLOWS ============
  // Replaces Salesforce Riley SMS flows
  {
    id: 'sms-lead-assigned',
    name: 'Lead Assigned SMS',
    description: 'Sends SMS to sales rep when a new Inspection or Retail Demo is scheduled',
    category: 'SMS Notifications',
    triggerObject: 'ServiceAppointment',
    triggerEvent: 'CREATE',
    triggerCondition: 'Subject contains "Inspection" or "Retail Demo"',
    triggerFile: 'smsTriggers.js',
    triggerFunction: 'onLeadAssigned',
    actions: ['Send SMS to opportunity owner', 'Message: "New Lead Assigned: {Opp Name} for {Date} at {Address}"'],
    isActive: true,
    isSystem: true,
  },
  {
    id: 'sms-appointment-canceled',
    name: 'Appointment Canceled SMS',
    description: 'Sends SMS when an appointment is canceled',
    category: 'SMS Notifications',
    triggerObject: 'Opportunity',
    triggerEvent: 'FIELD_CHANGE',
    triggerCondition: 'status: Confirmed → Canceled',
    triggerFile: 'smsTriggers.js',
    triggerFunction: 'onAppointmentCanceled',
    actions: ['Send SMS to prior opportunity owner', 'Message: "CANCELED: {Customer} for {Opp Name}. Please reach out ASAP."'],
    isActive: true,
    isSystem: true,
  },
  {
    id: 'sms-workorder-in-progress',
    name: 'Work Order In Progress SMS',
    description: 'Sends SMS to customer when crew arrives and work begins',
    category: 'SMS Notifications',
    triggerObject: 'WorkOrder',
    triggerEvent: 'FIELD_CHANGE',
    triggerCondition: 'status → In Progress',
    triggerFile: 'smsTriggers.js',
    triggerFunction: 'onWorkOrderInProgress',
    actions: ['Send SMS to primary contact', 'Message includes PM name and crew arrival notification'],
    isActive: true,
    isSystem: true,
  },
  {
    id: 'sms-work-completed',
    name: 'Work Completed SMS',
    description: 'Sends congratulations SMS to customer when work is completed',
    category: 'SMS Notifications',
    triggerObject: 'WorkOrder',
    triggerEvent: 'FIELD_CHANGE',
    triggerCondition: 'workCompleted → Yes',
    triggerFile: 'smsTriggers.js',
    triggerFunction: 'onWorkCompleted',
    actions: ['Send SMS to primary contact', 'Message: "Congratulations! Your roofing project has been completed..."'],
    isActive: true,
    isSystem: true,
  },
  {
    id: 'sms-decking-pass',
    name: 'Decking Inspection Pass SMS',
    description: 'Sends SMS to customer when decking inspection passes',
    category: 'SMS Notifications',
    triggerObject: 'WorkOrder',
    triggerEvent: 'FIELD_CHANGE',
    triggerCondition: 'deckingInspection → Pass',
    triggerFile: 'smsTriggers.js',
    triggerFunction: 'onDeckingInspectionPass',
    actions: ['Send SMS to primary contact', 'Message: "Update: The decking inspection has passed and crew is moving forward..."'],
    isActive: true,
    isSystem: true,
  },
  {
    id: 'sms-decking-fail',
    name: 'Decking Inspection Fail SMS',
    description: 'Sends SMS to customer when decking inspection fails',
    category: 'SMS Notifications',
    triggerObject: 'WorkOrder',
    triggerEvent: 'FIELD_CHANGE',
    triggerCondition: 'deckingInspection → Fail',
    triggerFile: 'smsTriggers.js',
    triggerFunction: 'onDeckingInspectionFail',
    actions: ['Send SMS to primary contact', 'Message: "Update: The decking inspection has failed. We will send a photo report..."'],
    isActive: true,
    isSystem: true,
  },
  {
    id: 'sms-crew-lead-welcome',
    name: 'Crew Lead Welcome SMS (Spanish)',
    description: 'Sends welcome SMS in Spanish to crew lead when assigned to a scheduled work order',
    category: 'SMS Notifications',
    triggerObject: 'WorkOrder',
    triggerEvent: 'FIELD_CHANGE',
    triggerCondition: 'crewLeadId changes AND status = Scheduled',
    triggerFile: 'smsTriggers.js',
    triggerFunction: 'onCrewLeadAssigned',
    actions: ['Send Spanish SMS to crew lead', 'Message: "Buenos Dias Porfavor hay que verificar las instrucciones y el Material..."'],
    isActive: true,
    isSystem: true,
  },
];

// Category configuration with icons and colors
const CATEGORY_CONFIG = {
  Commission: {
    icon: DollarSign,
    color: 'green',
    bgColor: 'bg-green-100',
    textColor: 'text-green-700',
    borderColor: 'border-green-200',
  },
  Insurance: {
    icon: Shield,
    color: 'blue',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
  },
  Inspection: {
    icon: ClipboardCheck,
    color: 'purple',
    bgColor: 'bg-purple-100',
    textColor: 'text-purple-700',
    borderColor: 'border-purple-200',
  },
  Specs: {
    icon: FileText,
    color: 'indigo',
    bgColor: 'bg-indigo-100',
    textColor: 'text-indigo-700',
    borderColor: 'border-indigo-200',
  },
  Contract: {
    icon: FileSignature,
    color: 'pink',
    bgColor: 'bg-pink-100',
    textColor: 'text-pink-700',
    borderColor: 'border-pink-200',
  },
  Invoice: {
    icon: Receipt,
    color: 'orange',
    bgColor: 'bg-orange-100',
    textColor: 'text-orange-700',
    borderColor: 'border-orange-200',
  },
  Payments: {
    icon: CreditCard,
    color: 'cyan',
    bgColor: 'bg-cyan-100',
    textColor: 'text-cyan-700',
    borderColor: 'border-cyan-200',
  },
  Cases: {
    icon: AlertCircle,
    color: 'red',
    bgColor: 'bg-red-100',
    textColor: 'text-red-700',
    borderColor: 'border-red-200',
  },
  Leads: {
    icon: Users,
    color: 'yellow',
    bgColor: 'bg-yellow-100',
    textColor: 'text-yellow-700',
    borderColor: 'border-yellow-200',
  },
  'SMS Notifications': {
    icon: MessageSquare,
    color: 'teal',
    bgColor: 'bg-teal-100',
    textColor: 'text-teal-700',
    borderColor: 'border-teal-200',
  },
};

const triggerEventLabels = {
  CREATE: 'Record Created',
  UPDATE: 'Record Updated',
  FIELD_CHANGE: 'Field Changed',
  SCHEDULED: 'Scheduled',
  MANUAL: 'Manual Trigger',
};

export default function Workflows() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [expandedCategories, setExpandedCategories] = useState(new Set(['Commission', 'Insurance']));
  const [expandedWorkflow, setExpandedWorkflow] = useState(null);
  const [workflows, setWorkflows] = useState(ALL_WORKFLOWS);

  // Group workflows by category
  const workflowsByCategory = useMemo(() => {
    const filtered = workflows.filter(w => {
      const matchesSearch =
        w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        w.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = !filterCategory || w.category === filterCategory;
      const matchesStatus = !filterStatus ||
        (filterStatus === 'active' && w.isActive) ||
        (filterStatus === 'inactive' && !w.isActive);
      return matchesSearch && matchesCategory && matchesStatus;
    });

    return filtered.reduce((acc, workflow) => {
      if (!acc[workflow.category]) {
        acc[workflow.category] = [];
      }
      acc[workflow.category].push(workflow);
      return acc;
    }, {});
  }, [workflows, searchTerm, filterCategory, filterStatus]);

  const toggleCategory = (category) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const toggleWorkflowStatus = (workflowId) => {
    setWorkflows(prev =>
      prev.map(w => w.id === workflowId ? { ...w, isActive: !w.isActive } : w)
    );
  };

  const categories = Object.keys(CATEGORY_CONFIG);
  const totalWorkflows = workflows.length;
  const activeWorkflows = workflows.filter(w => w.isActive).length;

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Workflow Automation</h1>
            <p className="text-sm text-gray-500 mt-1">
              All automated business processes and triggers in the CRM
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Info className="w-4 h-4" />
            <span>These workflows are system-defined and cannot be deleted</span>
          </div>
        </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Zap className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalWorkflows}</p>
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
              <p className="text-2xl font-bold text-gray-900">{activeWorkflows}</p>
              <p className="text-xs text-gray-500">Active</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <RefreshCw className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{categories.length}</p>
              <p className="text-xs text-gray-500">Categories</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <AlertCircle className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {workflows.filter(w => !w.isActive).length}
              </p>
              <p className="text-xs text-gray-500">Inactive</p>
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
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
          >
            <option value="">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
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

      {/* Workflows by Category */}
      <div className="space-y-4">
        {Object.entries(workflowsByCategory).map(([category, categoryWorkflows]) => {
          const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.Cases;
          const CategoryIcon = config.icon;
          const isExpanded = expandedCategories.has(category);

          return (
            <div key={category} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Category Header */}
              <button
                onClick={() => toggleCategory(category)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 ${config.bgColor} rounded-lg`}>
                    <CategoryIcon className={`w-5 h-5 ${config.textColor}`} />
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold text-gray-900">{category} Workflows</h3>
                    <p className="text-sm text-gray-500">{categoryWorkflows.length} workflow{categoryWorkflows.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${config.bgColor} ${config.textColor}`}>
                    {categoryWorkflows.filter(w => w.isActive).length} active
                  </span>
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              </button>

              {/* Workflows List */}
              {isExpanded && (
                <div className="border-t border-gray-100 divide-y divide-gray-100">
                  {categoryWorkflows.map((workflow) => (
                    <div key={workflow.id} className="p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          {/* Workflow Header */}
                          <div className="flex items-center gap-2 mb-1">
                            <button
                              onClick={() => setExpandedWorkflow(expandedWorkflow === workflow.id ? null : workflow.id)}
                              className="flex items-center gap-2 group"
                            >
                              {expandedWorkflow === workflow.id ? (
                                <ChevronDown className="w-4 h-4 text-gray-400" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-gray-400" />
                              )}
                              <h4 className="font-medium text-gray-900 group-hover:text-panda-primary">
                                {workflow.name}
                              </h4>
                            </button>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              workflow.isActive
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {workflow.isActive ? 'Active' : 'Inactive'}
                            </span>
                            {workflow.isSystem && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                System
                              </span>
                            )}
                          </div>

                          {/* Description */}
                          <p className="text-sm text-gray-500 mb-2">{workflow.description}</p>

                          {/* Trigger Info */}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <Briefcase className="w-3.5 h-3.5" />
                              {workflow.triggerObject}
                            </span>
                            <span className="flex items-center gap-1">
                              <Zap className="w-3.5 h-3.5" />
                              {triggerEventLabels[workflow.triggerEvent] || workflow.triggerEvent}
                            </span>
                            {workflow.triggerCondition && (
                              <span className="flex items-center gap-1">
                                <Filter className="w-3.5 h-3.5" />
                                {workflow.triggerCondition}
                              </span>
                            )}
                          </div>

                          {/* Expanded Details */}
                          {expandedWorkflow === workflow.id && (
                            <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-3">
                              {/* Source File */}
                              <div>
                                <h5 className="text-xs font-semibold text-gray-700 uppercase mb-1">Source File</h5>
                                <code className="text-xs bg-gray-200 px-2 py-1 rounded text-gray-700">
                                  {workflow.triggerFile}
                                </code>
                                <span className="text-xs text-gray-500 ml-2">
                                  → {workflow.triggerFunction}()
                                </span>
                              </div>

                              {/* Actions */}
                              <div>
                                <h5 className="text-xs font-semibold text-gray-700 uppercase mb-1">Actions</h5>
                                <ul className="space-y-1">
                                  {workflow.actions.map((action, idx) => (
                                    <li key={idx} className="flex items-start gap-2 text-sm text-gray-600">
                                      <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                                      {action}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleWorkflowStatus(workflow.id)}
                            className={`p-2 rounded-lg transition-colors ${
                              workflow.isActive
                                ? 'text-orange-600 hover:bg-orange-50'
                                : 'text-green-600 hover:bg-green-50'
                            }`}
                            title={workflow.isActive ? 'Deactivate' : 'Activate'}
                          >
                            {workflow.isActive ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

        {/* Empty State */}
        {Object.keys(workflowsByCategory).length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
            <Zap className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No workflows match your search criteria</p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
