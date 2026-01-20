import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Mail,
  MessageSquare,
  Users,
  Send,
  Eye,
  Calendar,
  Clock,
  AlertCircle,
  CheckCircle,
  Wand2,
  Type,
  Image as ImageIcon,
  Link as LinkIcon,
  Bold,
  Italic,
  List,
  AlignLeft,
  Sparkles,
  FileText,
} from 'lucide-react';
import { campaignsApi, templatesApi } from '../services/api';

const STEPS = [
  { id: 1, name: 'Type', description: 'Choose campaign type' },
  { id: 2, name: 'Audience', description: 'Select recipients' },
  { id: 3, name: 'Content', description: 'Write your message' },
  { id: 4, name: 'Review', description: 'Preview & schedule' },
];

const AUDIENCE_FILTERS = {
  states: [
    { value: 'MD', label: 'Maryland' },
    { value: 'DE', label: 'Delaware' },
    { value: 'VA', label: 'Virginia' },
    { value: 'NC', label: 'North Carolina' },
    { value: 'NJ', label: 'New Jersey' },
    { value: 'PA', label: 'Pennsylvania' },
    { value: 'FL', label: 'Florida' },
    { value: 'TN', label: 'Tennessee' },
    { value: 'GA', label: 'Georgia' },
    { value: 'SC', label: 'South Carolina' },
  ],
  opportunityStages: [
    { value: 'LEAD_UNASSIGNED', label: 'Lead Unassigned' },
    { value: 'LEAD_ASSIGNED', label: 'Lead Assigned' },
    { value: 'PROSPECT', label: 'Prospect' },
    { value: 'SCHEDULED', label: 'Scheduled' },
    { value: 'INSPECTED', label: 'Inspected' },
    { value: 'CLAIM_FILED', label: 'Claim Filed' },
    { value: 'ADJUSTER_MEETING_COMPLETE', label: 'Adjuster Meeting Complete' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'CONTRACT_SIGNED', label: 'Contract Signed' },
    { value: 'IN_PRODUCTION', label: 'In Production' },
    { value: 'SENT', label: 'Sent' },
    { value: 'CLOSED_WON', label: 'Closed Won' },
    { value: 'CLOSED_LOST', label: 'Closed Lost' },
  ],
  leadSources: [
    { value: 'Self-Gen', label: 'Self-Gen' },
    { value: 'Door Knock', label: 'Door Knock' },
    { value: 'Referral', label: 'Referral' },
    { value: 'Web', label: 'Web Lead' },
    { value: 'Phone', label: 'Phone Inquiry' },
    { value: 'GTR', label: 'GTR (External)' },
    { value: 'Partner', label: 'Partner' },
    { value: 'Insurance', label: 'Insurance' },
  ],
  // Sources that can be excluded
  excludableSources: [
    { value: 'GTR', label: 'GTR (External Leads)' },
    { value: 'Partner', label: 'Partner Leads' },
  ],
  // Special exclusion groups
  specialExclusions: [
    { value: 'CHAMPIONS', label: 'Champions (GTR Advocates)', description: 'Previous customers in our referral program' },
  ],
};

// Quick audience presets - using only stages that exist in the data
const AUDIENCE_PRESETS = [
  {
    id: 'completed-customers',
    label: 'Completed Customers',
    description: 'Customers with closed won jobs',
    icon: '✅',
    rules: {
      opportunityStages: ['CLOSED_WON'],
    },
  },
  {
    id: 'active-pipeline',
    label: 'Active Pipeline',
    description: 'Leads currently in the sales process',
    icon: '🔥',
    rules: {
      opportunityStages: ['LEAD_ASSIGNED', 'APPROVED'],
    },
  },
  {
    id: 'approved-deals',
    label: 'Approved Deals',
    description: 'Jobs that have been approved',
    icon: '📝',
    rules: {
      opportunityStages: ['APPROVED'],
    },
  },
  {
    id: 'new-leads',
    label: 'New Leads',
    description: 'Unassigned leads needing attention',
    icon: '🆕',
    rules: {
      opportunityStages: ['LEAD_UNASSIGNED'],
    },
  },
];

const MERGE_FIELDS = [
  { code: '{{firstName}}', label: 'First Name' },
  { code: '{{lastName}}', label: 'Last Name' },
  { code: '{{fullName}}', label: 'Full Name' },
  { code: '{{accountName}}', label: 'Account/Property Name' },
  { code: '{{city}}', label: 'City' },
  { code: '{{state}}', label: 'State' },
  { code: '{{company}}', label: 'Company Name' },
];

export default function CampaignWizard({ isOpen, onClose, editCampaign = null, initialType = null }) {
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState(1);
  const [campaign, setCampaign] = useState({
    name: '',
    description: '',
    type: initialType || 'SMS',
    subject: '',
    body: '',
    audienceRules: {},
    sendSchedule: 'IMMEDIATE',
    scheduledAt: null,
    templateId: null,
  });
  const [showMergeFields, setShowMergeFields] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen && !editCampaign) {
      setCampaign({
        name: '',
        description: '',
        type: initialType || 'SMS',
        subject: '',
        body: '',
        audienceRules: {},
        sendSchedule: 'IMMEDIATE',
        scheduledAt: null,
        templateId: null,
      });
      setCurrentStep(initialType ? 2 : 1); // Skip to step 2 if type is pre-selected
    }
  }, [isOpen, initialType, editCampaign]);

  // Load edit campaign data
  useEffect(() => {
    if (editCampaign) {
      setCampaign({
        name: editCampaign.name || '',
        description: editCampaign.description || '',
        type: editCampaign.type || 'SMS',
        subject: editCampaign.subject || '',
        body: editCampaign.body || '',
        audienceRules: editCampaign.audienceRules || {},
        sendSchedule: editCampaign.sendSchedule || 'IMMEDIATE',
        scheduledAt: editCampaign.scheduledAt || null,
        templateId: editCampaign.templateId || null,
      });
      setCurrentStep(2); // Start at audience step when editing
    }
  }, [editCampaign]);

  // Fetch templates
  const { data: templatesData } = useQuery({
    queryKey: ['templates', campaign.type],
    queryFn: () => templatesApi.getTemplates({ type: campaign.type }),
    enabled: isOpen,
  });
  const templates = templatesData?.data || [];

  // Fetch opportunity stage counts
  const { data: stageCounts } = useQuery({
    queryKey: ['opportunity-stage-counts'],
    queryFn: () => campaignsApi.getOpportunityStageCounts(),
    enabled: isOpen,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Estimate recipients
  const { data: recipientEstimate, refetch: refetchEstimate } = useQuery({
    queryKey: ['recipient-estimate', campaign.audienceRules],
    queryFn: () => campaignsApi.estimateRecipients(campaign.audienceRules),
    enabled: isOpen && Object.keys(campaign.audienceRules).length > 0,
  });

  // Audience preview
  const { data: audiencePreview, refetch: refetchPreview } = useQuery({
    queryKey: ['audience-preview', campaign.audienceRules],
    queryFn: () => campaignsApi.getAudiencePreview(campaign.audienceRules, 5),
    enabled: isOpen && currentStep >= 2 && Object.keys(campaign.audienceRules).length > 0,
  });

  // Create campaign mutation
  const createMutation = useMutation({
    mutationFn: (data) => campaignsApi.createCampaign(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      onClose();
    },
  });

  // Update campaign mutation
  const updateMutation = useMutation({
    mutationFn: (data) => campaignsApi.updateCampaign(editCampaign.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      onClose();
    },
  });

  // Send campaign mutation
  const sendMutation = useMutation({
    mutationFn: (id) => campaignsApi.sendCampaign(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      onClose();
    },
  });

  const handleNext = () => {
    if (currentStep < 4) setCurrentStep(currentStep + 1);
  };

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleSaveDraft = async () => {
    if (editCampaign) {
      await updateMutation.mutateAsync({ ...campaign, status: 'DRAFT' });
    } else {
      await createMutation.mutateAsync({ ...campaign, status: 'DRAFT' });
    }
  };

  const handleSendNow = async () => {
    let campaignId = editCampaign?.id;

    if (!campaignId) {
      const created = await createMutation.mutateAsync({ ...campaign, status: 'DRAFT' });
      campaignId = created.id;
    } else {
      await updateMutation.mutateAsync(campaign);
    }

    await sendMutation.mutateAsync(campaignId);
  };

  const handleSchedule = async () => {
    const data = { ...campaign, status: 'SCHEDULED' };
    if (editCampaign) {
      await updateMutation.mutateAsync(data);
    } else {
      await createMutation.mutateAsync(data);
    }
  };

  const insertMergeField = (code) => {
    setCampaign(prev => ({
      ...prev,
      body: prev.body + code,
    }));
    setShowMergeFields(false);
  };

  const applyTemplate = (template) => {
    setCampaign(prev => ({
      ...prev,
      subject: template.subject || prev.subject,
      body: template.body,
      templateId: template.id,
    }));
    setShowTemplates(false);
  };

  const updateAudienceRule = (key, value) => {
    setCampaign(prev => ({
      ...prev,
      audienceRules: {
        ...prev.audienceRules,
        [key]: value,
      },
    }));
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return campaign.name && campaign.type;
      case 2:
        return Object.keys(campaign.audienceRules).length > 0 || true; // Allow all contacts
      case 3:
        return campaign.body && (campaign.type !== 'EMAIL' || campaign.subject);
      default:
        return true;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="absolute inset-y-0 right-0 w-full max-w-4xl bg-white shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center space-x-4">
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {editCampaign ? 'Edit Campaign' : 'New Campaign'}
              </h2>
              <p className="text-sm text-gray-500">Step {currentStep} of 4: {STEPS[currentStep - 1].description}</p>
            </div>
          </div>

          {/* Progress */}
          <div className="flex items-center space-x-2">
            {STEPS.map((step, idx) => (
              <div
                key={step.id}
                className={`flex items-center ${idx < STEPS.length - 1 ? 'pr-4' : ''}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    currentStep > step.id
                      ? 'bg-green-500 text-white'
                      : currentStep === step.id
                      ? 'bg-panda-primary text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {currentStep > step.id ? <CheckCircle className="w-5 h-5" /> : step.id}
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={`w-8 h-0.5 ml-2 ${currentStep > step.id ? 'bg-green-500' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Type Selection */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Campaign Name *
                </label>
                <input
                  type="text"
                  value={campaign.name}
                  onChange={(e) => setCampaign({ ...campaign, name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                  placeholder="e.g., Winter Roofing Special"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description (optional)
                </label>
                <textarea
                  value={campaign.description}
                  onChange={(e) => setCampaign({ ...campaign, description: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                  rows={2}
                  placeholder="Brief description of this campaign"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-4">
                  Campaign Type *
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setCampaign({ ...campaign, type: 'SMS' })}
                    className={`p-6 rounded-xl border-2 transition-all ${
                      campaign.type === 'SMS'
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-3 ${
                      campaign.type === 'SMS' ? 'bg-green-500' : 'bg-green-100'
                    }`}>
                      <MessageSquare className={`w-6 h-6 ${campaign.type === 'SMS' ? 'text-white' : 'text-green-600'}`} />
                    </div>
                    <h3 className="font-semibold text-gray-900">SMS Campaign</h3>
                    <p className="text-sm text-gray-500 mt-1">Text message marketing</p>
                    <div className="mt-3 text-xs text-gray-400">
                      ~$0.0166 per message
                    </div>
                  </button>

                  <button
                    onClick={() => setCampaign({ ...campaign, type: 'EMAIL' })}
                    className={`p-6 rounded-xl border-2 transition-all ${
                      campaign.type === 'EMAIL'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-3 ${
                      campaign.type === 'EMAIL' ? 'bg-blue-500' : 'bg-blue-100'
                    }`}>
                      <Mail className={`w-6 h-6 ${campaign.type === 'EMAIL' ? 'text-white' : 'text-blue-600'}`} />
                    </div>
                    <h3 className="font-semibold text-gray-900">Email Campaign</h3>
                    <p className="text-sm text-gray-500 mt-1">Email newsletters & updates</p>
                    <div className="mt-3 text-xs text-gray-400">
                      ~$0.001 per email
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Audience Selection */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">Target Audience</h3>
                <div className="flex items-center space-x-2 text-sm">
                  <Users className="w-4 h-4 text-gray-400" />
                  <span className="font-medium text-panda-primary">
                    {recipientEstimate?.count?.toLocaleString() || '0'} recipients
                  </span>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="bg-gradient-to-r from-panda-primary/5 to-purple-500/5 rounded-xl p-4 border border-panda-primary/10">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  <Sparkles className="w-4 h-4 inline mr-1 text-panda-primary" />
                  Quick Presets
                </label>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {AUDIENCE_PRESETS.map(preset => (
                    <button
                      key={preset.id}
                      onClick={() => {
                        // Apply preset rules
                        setCampaign(prev => ({
                          ...prev,
                          audienceRules: {
                            ...prev.audienceRules,
                            ...preset.rules,
                          },
                        }));
                      }}
                      className="flex flex-col items-center p-3 bg-white rounded-lg border border-gray-200 hover:border-panda-primary hover:shadow-md transition-all text-center group"
                    >
                      <span className="text-2xl mb-1">{preset.icon}</span>
                      <span className="text-sm font-medium text-gray-900 group-hover:text-panda-primary">{preset.label}</span>
                      <span className="text-xs text-gray-500 mt-0.5">{preset.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* States */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    States
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {AUDIENCE_FILTERS.states.map(state => (
                      <button
                        key={state.value}
                        onClick={() => {
                          const current = campaign.audienceRules.states || [];
                          const updated = current.includes(state.value)
                            ? current.filter(s => s !== state.value)
                            : [...current, state.value];
                          updateAudienceRule('states', updated.length > 0 ? updated : undefined);
                        }}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                          (campaign.audienceRules.states || []).includes(state.value)
                            ? 'bg-panda-primary text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {state.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Job Stages - Multi-select chips with counts */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Job Stages
                    {stageCounts && (
                      <span className="text-xs text-gray-400 ml-2">
                        (showing stages with contacts)
                      </span>
                    )}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {AUDIENCE_FILTERS.opportunityStages.map(stage => {
                      const contactCount = stageCounts?.contactCounts?.[stage.value] || 0;
                      const hasData = contactCount > 0;

                      return (
                        <button
                          key={stage.value}
                          onClick={() => {
                            const current = campaign.audienceRules.opportunityStages || [];
                            const updated = current.includes(stage.value)
                              ? current.filter(s => s !== stage.value)
                              : [...current, stage.value];
                            updateAudienceRule('opportunityStages', updated.length > 0 ? updated : undefined);
                          }}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                            (campaign.audienceRules.opportunityStages || []).includes(stage.value)
                              ? 'bg-green-500 text-white'
                              : hasData
                              ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              : 'bg-gray-50 text-gray-400 cursor-not-allowed'
                          }`}
                          disabled={!hasData}
                          title={hasData ? `${contactCount.toLocaleString()} contacts` : 'No contacts in this stage'}
                        >
                          {stage.label}
                          {stageCounts && (
                            <span className={`ml-1 text-xs ${
                              (campaign.audienceRules.opportunityStages || []).includes(stage.value)
                                ? 'text-green-200'
                                : hasData ? 'text-gray-400' : 'text-gray-300'
                            }`}>
                              ({contactCount.toLocaleString()})
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Lead Sources */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Lead Source
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {AUDIENCE_FILTERS.leadSources.map(source => (
                      <button
                        key={source.value}
                        onClick={() => {
                          const current = campaign.audienceRules.leadSources || [];
                          const updated = current.includes(source.value)
                            ? current.filter(s => s !== source.value)
                            : [...current, source.value];
                          updateAudienceRule('leadSources', updated.length > 0 ? updated : undefined);
                        }}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                          (campaign.audienceRules.leadSources || []).includes(source.value)
                            ? 'bg-purple-500 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {source.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date Range */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Contact Created After
                  </label>
                  <input
                    type="date"
                    value={campaign.audienceRules.createdAfter || ''}
                    onChange={(e) => updateAudienceRule('createdAfter', e.target.value || undefined)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                  />
                </div>
              </div>

              {/* Exclusions Section */}
              <div className="bg-red-50 rounded-xl p-4 border border-red-100">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  <X className="w-4 h-4 inline mr-1 text-red-500" />
                  Exclude from Campaign
                </label>
                <div className="space-y-3">
                  {/* Champions (GTR Advocates) exclusion - highlighted */}
                  <label
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                      campaign.audienceRules.excludeChampions
                        ? 'bg-amber-100 border-amber-400 text-amber-800'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-amber-200'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={campaign.audienceRules.excludeChampions === true}
                      onChange={(e) => updateAudienceRule('excludeChampions', e.target.checked || undefined)}
                      className="w-4 h-4 text-amber-500 border-gray-300 rounded focus:ring-amber-500"
                    />
                    <div>
                      <span className="text-sm font-medium">Champions (GTR Advocates)</span>
                      <p className="text-xs text-gray-500 mt-0.5">1,889 previous customers in our referral program</p>
                    </div>
                  </label>

                  {/* Exclude GTR and other external sources */}
                  <div className="flex flex-wrap gap-3">
                    {AUDIENCE_FILTERS.excludableSources.map(source => (
                      <label
                        key={source.value}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors ${
                          (campaign.audienceRules.excludeSources || []).includes(source.value)
                            ? 'bg-red-100 border-red-300 text-red-700'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-red-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={(campaign.audienceRules.excludeSources || []).includes(source.value)}
                          onChange={(e) => {
                            const current = campaign.audienceRules.excludeSources || [];
                            const updated = e.target.checked
                              ? [...current, source.value]
                              : current.filter(s => s !== source.value);
                            updateAudienceRule('excludeSources', updated.length > 0 ? updated : undefined);
                          }}
                          className="w-4 h-4 text-red-500 border-gray-300 rounded focus:ring-red-500"
                        />
                        <span className="text-sm font-medium">{source.label}</span>
                      </label>
                    ))}
                  </div>

                  {/* Opt-out exclusion */}
                  <label className="flex items-center gap-2 px-4 py-2 rounded-lg border bg-white border-gray-200 cursor-pointer hover:border-red-200 transition-colors">
                    <input
                      type="checkbox"
                      checked={campaign.audienceRules.excludeOptedOut !== false}
                      onChange={(e) => updateAudienceRule('excludeOptedOut', e.target.checked)}
                      className="w-4 h-4 text-red-500 border-gray-300 rounded focus:ring-red-500"
                    />
                    <span className="text-sm font-medium text-gray-600">
                      Contacts who have opted out of {campaign.type === 'SMS' ? 'SMS' : 'email'}
                    </span>
                  </label>
                </div>
              </div>

              {/* Preview */}
              {audiencePreview && audiencePreview.contacts?.length > 0 && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Sample Recipients</h4>
                  <div className="space-y-2">
                    {audiencePreview.contacts.map(contact => (
                      <div key={contact.id} className="flex items-center justify-between text-sm">
                        <span className="text-gray-900">
                          {contact.firstName} {contact.lastName}
                        </span>
                        <span className="text-gray-500">
                          {campaign.type === 'EMAIL' ? contact.email : (contact.mobilePhone || contact.phone)}
                        </span>
                      </div>
                    ))}
                  </div>
                  {audiencePreview.total > 5 && (
                    <p className="text-xs text-gray-500 mt-2">
                      and {audiencePreview.total - 5} more...
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Content Creation */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">Compose Message</h3>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setShowTemplates(!showTemplates)}
                    className="flex items-center space-x-2 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Templates</span>
                  </button>
                  <button
                    onClick={() => setShowMergeFields(!showMergeFields)}
                    className="flex items-center space-x-2 px-3 py-2 text-sm bg-purple-100 text-purple-700 hover:bg-purple-200 rounded-lg"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Personalize</span>
                  </button>
                </div>
              </div>

              {/* Templates Dropdown */}
              {showTemplates && templates.length > 0 && (
                <div className="p-4 bg-gray-50 rounded-lg space-y-2">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Select a Template</h4>
                  {templates.map(template => (
                    <button
                      key={template.id}
                      onClick={() => applyTemplate(template)}
                      className="w-full text-left p-3 bg-white border rounded-lg hover:border-panda-primary transition-colors"
                    >
                      <div className="font-medium text-gray-900">{template.name}</div>
                      <div className="text-sm text-gray-500 truncate mt-1">{template.body}</div>
                    </button>
                  ))}
                </div>
              )}

              {/* Merge Fields */}
              {showMergeFields && (
                <div className="p-4 bg-purple-50 rounded-lg">
                  <h4 className="text-sm font-medium text-purple-800 mb-2">Insert Personalization</h4>
                  <div className="flex flex-wrap gap-2">
                    {MERGE_FIELDS.map(field => (
                      <button
                        key={field.code}
                        onClick={() => insertMergeField(field.code)}
                        className="px-3 py-1.5 bg-white text-purple-700 rounded-lg text-sm hover:bg-purple-100"
                      >
                        {field.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Subject (Email only) */}
              {campaign.type === 'EMAIL' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Subject Line *
                  </label>
                  <input
                    type="text"
                    value={campaign.subject}
                    onChange={(e) => setCampaign({ ...campaign, subject: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                    placeholder="e.g., Special Offer Just for You, {{firstName}}!"
                  />
                </div>
              )}

              {/* Message Body */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Message Content *
                </label>
                {campaign.type === 'EMAIL' ? (
                  <div className="border border-gray-300 rounded-lg overflow-hidden">
                    {/* Simple Toolbar */}
                    <div className="flex items-center space-x-1 p-2 bg-gray-50 border-b">
                      <button className="p-2 hover:bg-gray-200 rounded" title="Bold">
                        <Bold className="w-4 h-4" />
                      </button>
                      <button className="p-2 hover:bg-gray-200 rounded" title="Italic">
                        <Italic className="w-4 h-4" />
                      </button>
                      <div className="w-px h-6 bg-gray-300 mx-2" />
                      <button className="p-2 hover:bg-gray-200 rounded" title="List">
                        <List className="w-4 h-4" />
                      </button>
                      <button className="p-2 hover:bg-gray-200 rounded" title="Link">
                        <LinkIcon className="w-4 h-4" />
                      </button>
                    </div>
                    <textarea
                      value={campaign.body}
                      onChange={(e) => setCampaign({ ...campaign, body: e.target.value })}
                      className="w-full px-4 py-3 focus:outline-none resize-none"
                      rows={10}
                      placeholder="Write your email content here..."
                    />
                  </div>
                ) : (
                  <div>
                    <textarea
                      value={campaign.body}
                      onChange={(e) => setCampaign({ ...campaign, body: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary resize-none"
                      rows={6}
                      placeholder="Hi {{firstName}}, this is Panda Exteriors..."
                      maxLength={1600}
                    />
                    <div className="flex items-center justify-between mt-2 text-sm">
                      <span className="text-gray-500">
                        {campaign.body.length} / 1600 characters
                      </span>
                      <span className={`${campaign.body.length > 160 ? 'text-yellow-600' : 'text-gray-500'}`}>
                        {Math.ceil(campaign.body.length / 160)} SMS segment{Math.ceil(campaign.body.length / 160) !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Preview */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Preview</h4>
                <div className={`p-4 rounded-lg ${campaign.type === 'EMAIL' ? 'bg-white border' : 'bg-green-50 border border-green-200'}`}>
                  {campaign.type === 'EMAIL' && campaign.subject && (
                    <div className="font-medium text-gray-900 mb-2">
                      Subject: {campaign.subject.replace(/\{\{firstName\}\}/gi, 'John')}
                    </div>
                  )}
                  <div className={`text-sm ${campaign.type === 'EMAIL' ? 'text-gray-600' : 'text-green-800'}`}>
                    {campaign.body
                      .replace(/\{\{firstName\}\}/gi, 'John')
                      .replace(/\{\{lastName\}\}/gi, 'Smith')
                      .replace(/\{\{fullName\}\}/gi, 'John Smith')
                      .replace(/\{\{accountName\}\}/gi, 'Smith Residence')
                      .replace(/\{\{city\}\}/gi, 'Baltimore')
                      .replace(/\{\{state\}\}/gi, 'MD')
                      .replace(/\{\{company\}\}/gi, 'Panda Exteriors')
                      || 'Your message will appear here...'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Review & Schedule */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="text-center pb-6 border-b">
                <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center ${
                  campaign.type === 'EMAIL' ? 'bg-blue-100' : 'bg-green-100'
                }`}>
                  {campaign.type === 'EMAIL' ? (
                    <Mail className="w-8 h-8 text-blue-600" />
                  ) : (
                    <MessageSquare className="w-8 h-8 text-green-600" />
                  )}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mt-4">{campaign.name}</h3>
                <p className="text-gray-500 mt-1">{campaign.type} Campaign</p>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg text-center">
                  <Users className="w-6 h-6 text-gray-400 mx-auto" />
                  <div className="text-2xl font-bold text-gray-900 mt-2">
                    {recipientEstimate?.count?.toLocaleString() || '0'}
                  </div>
                  <div className="text-sm text-gray-500">Recipients</div>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg text-center">
                  <Type className="w-6 h-6 text-gray-400 mx-auto" />
                  <div className="text-2xl font-bold text-gray-900 mt-2">
                    {campaign.body.length}
                  </div>
                  <div className="text-sm text-gray-500">Characters</div>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg text-center">
                  <Send className="w-6 h-6 text-gray-400 mx-auto" />
                  <div className="text-2xl font-bold text-gray-900 mt-2">
                    ${((recipientEstimate?.count || 0) * (campaign.type === 'SMS' ? 0.0166 : 0.001)).toFixed(2)}
                  </div>
                  <div className="text-sm text-gray-500">Est. Cost</div>
                </div>
              </div>

              {/* Schedule Options */}
              <div className="pt-6 border-t">
                <h4 className="text-sm font-medium text-gray-700 mb-4">When to Send</h4>
                <div className="space-y-3">
                  <label className="flex items-center p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="schedule"
                      checked={campaign.sendSchedule === 'IMMEDIATE'}
                      onChange={() => setCampaign({ ...campaign, sendSchedule: 'IMMEDIATE', scheduledAt: null })}
                      className="w-4 h-4 text-panda-primary"
                    />
                    <div className="ml-3">
                      <div className="font-medium text-gray-900">Send Now</div>
                      <div className="text-sm text-gray-500">Campaign will be sent immediately</div>
                    </div>
                  </label>

                  <label className="flex items-start p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="schedule"
                      checked={campaign.sendSchedule === 'SCHEDULED'}
                      onChange={() => setCampaign({ ...campaign, sendSchedule: 'SCHEDULED' })}
                      className="w-4 h-4 text-panda-primary mt-1"
                    />
                    <div className="ml-3 flex-1">
                      <div className="font-medium text-gray-900">Schedule for Later</div>
                      <div className="text-sm text-gray-500 mb-3">Choose a specific date and time</div>
                      {campaign.sendSchedule === 'SCHEDULED' && (
                        <input
                          type="datetime-local"
                          value={campaign.scheduledAt || ''}
                          onChange={(e) => setCampaign({ ...campaign, scheduledAt: e.target.value })}
                          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary"
                        />
                      )}
                    </div>
                  </label>
                </div>
              </div>

              {/* Content Preview */}
              <div className="pt-6 border-t">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Message Preview</h4>
                <div className={`p-4 rounded-lg ${campaign.type === 'EMAIL' ? 'bg-white border' : 'bg-green-50 border border-green-200'}`}>
                  {campaign.type === 'EMAIL' && campaign.subject && (
                    <div className="font-medium text-gray-900 mb-2 pb-2 border-b">
                      {campaign.subject}
                    </div>
                  )}
                  <div className={`text-sm whitespace-pre-wrap ${campaign.type === 'EMAIL' ? 'text-gray-600' : 'text-green-800'}`}>
                    {campaign.body}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50">
          <div>
            {currentStep > 1 && (
              <button
                onClick={handleBack}
                className="flex items-center space-x-2 px-4 py-2 text-gray-600 hover:text-gray-900"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
            )}
          </div>

          <div className="flex items-center space-x-3">
            {currentStep === 4 ? (
              <>
                <button
                  onClick={handleSaveDraft}
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                >
                  Save as Draft
                </button>
                {campaign.sendSchedule === 'SCHEDULED' ? (
                  <button
                    onClick={handleSchedule}
                    disabled={createMutation.isPending || updateMutation.isPending || !campaign.scheduledAt}
                    className="flex items-center space-x-2 px-6 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    <Calendar className="w-4 h-4" />
                    <span>Schedule Campaign</span>
                  </button>
                ) : (
                  <button
                    onClick={handleSendNow}
                    disabled={createMutation.isPending || updateMutation.isPending || sendMutation.isPending}
                    className="flex items-center space-x-2 px-6 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    <span>{sendMutation.isPending ? 'Sending...' : 'Send Now'}</span>
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={handleNext}
                disabled={!canProceed()}
                className="flex items-center space-x-2 px-6 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
              >
                <span>Continue</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
