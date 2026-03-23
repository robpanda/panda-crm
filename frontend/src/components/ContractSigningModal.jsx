import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient, { documentsApiV2, agreementsApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  extractHostSigningToken,
  extractSigningToken,
  formatAgreementStatusLabel,
  getAgentDisplayName,
  getAgreementDocumentUrl,
  getAgreementId,
  getAgreementStatusClasses,
  getChecklist,
  getCustomerDisplayName,
  getMissingItems,
  getPlaceholderSummaryByRole,
  getPreviewHash,
  getPreviewMissingTokens,
  getPreviewUrl,
  getPreviewWarnings,
  getSignerRequiredFields,
  mergeAgreementState,
  normalizeAgreementStatus,
  normalizePreviewPayload,
  unwrapApiEnvelope,
} from './contractSigningModalUtils';
import {
  X,
  FileSignature,
  Send,
  Loader2,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  User,
  Mail,
  FileText,
  Clock,
  Eye,
  PenTool,
  Users,
  ArrowLeft,
  ExternalLink,
  Copy,
  Check,
  Pencil,
  Type,
  SkipForward,
} from 'lucide-react';

const FEATURE_PANDASIGN_V2 = String(import.meta.env.VITE_FEATURE_PANDASIGN_V2 || '').toLowerCase() === 'true';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PANDASIGN_TEMPLATE_TERRITORIES = new Set(['DE', 'MD', 'NJ', 'PA', 'NC', 'VA', 'FL']);

/**
 * ContractSigningModal - PandaSign V2 contract signing modal
 *
 * 5-Step Flow:
 * 1. Select Template (WYSIWYG V2 templates grouped by category)
 * 2. Preview (generate PDF preview via V2 API, store previewHash)
 * 3. Configure Signers (dynamic from template signerRoles)
 * 4. Choose Action - Send for Signature or Sign Now
 * 5. Complete / Success
 */
export default function ContractSigningModal({
  isOpen,
  onClose,
  opportunity,
  contact,
  account,
  onSuccess,
}) {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();

  // Step management: 1=Template, 2=Preview, 3=Signers, 4=Action, 5=Success
  const [step, setStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewHash, setPreviewHash] = useState(null);
  const [signerFields, setSignerFields] = useState({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [copiedLink, setCopiedLink] = useState(null);
  const [v2TemplateId, setV2TemplateId] = useState('');
  const [v2Mode, setV2Mode] = useState('SIGN_NOW');
  const [v2CustomerEmail, setV2CustomerEmail] = useState('');
  const [v2AgentEmail, setV2AgentEmail] = useState('');
  const [v2Verification, setV2Verification] = useState(null);
  const [v2VerificationError, setV2VerificationError] = useState(null);
  const [v2Step, setV2Step] = useState(1);
  const [v2PreviewData, setV2PreviewData] = useState(null);
  const [v2PreviewUrl, setV2PreviewUrl] = useState(null);
  const [v2PreviewHash, setV2PreviewHash] = useState(null);
  const [v2PreviewError, setV2PreviewError] = useState(null);
  const [v2SignError, setV2SignError] = useState(null);
  const [v2AgreementData, setV2AgreementData] = useState(null);
  const [v2CustomerSigningToken, setV2CustomerSigningToken] = useState(null);
  const [v2HostSigningToken, setV2HostSigningToken] = useState(null);
  const [v2CustomerSignSession, setV2CustomerSignSession] = useState(null);
  const [v2AgentSignSession, setV2AgentSignSession] = useState(null);
  const [v2SendToSignAgentLink, setV2SendToSignAgentLink] = useState(null);
  const [v2CompletionData, setV2CompletionData] = useState(null);
  const [v2SignatureMode, setV2SignatureMode] = useState('DRAW');
  const [v2TypedSignature, setV2TypedSignature] = useState('');
  const [v2SignatureData, setV2SignatureData] = useState(null);
  const [v2IsDrawing, setV2IsDrawing] = useState(false);
  const [v2ActiveRequiredIndex, setV2ActiveRequiredIndex] = useState(0);
  const v2CanvasRef = useRef(null);

  // Fetch WYSIWYG templates from V2 API
  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ['wysiwyg-templates'],
    queryFn: () => documentsApiV2.getTemplates({ status: 'PUBLISHED' }),
    enabled: isOpen,
  });

  const templates =
    (Array.isArray(templatesData?.data) ? templatesData.data : null) ||
    (Array.isArray(templatesData) ? templatesData : []) ||
    [];

  const v2TemplateTerritory = useMemo(() => {
    const candidates = [
      opportunity?.state,
      opportunity?.propertyState,
      account?.billingState,
      account?.shippingState,
      contact?.mailingState,
      contact?.state,
    ];

    const match = candidates
      .map((value) => String(value || '').trim().toUpperCase())
      .find((value) => PANDASIGN_TEMPLATE_TERRITORIES.has(value));

    return match || 'DEFAULT';
  }, [
    opportunity?.state,
    opportunity?.propertyState,
    account?.billingState,
    account?.shippingState,
    contact?.mailingState,
    contact?.state,
  ]);

  const territoryScopedTemplates = useMemo(() => {
    const matchingTemplates = templates.filter((template) => {
      const templateTerritory = String(template?.territory || 'DEFAULT').trim().toUpperCase();
      return templateTerritory === v2TemplateTerritory || templateTerritory === 'DEFAULT';
    });

    return matchingTemplates.length > 0 ? matchingTemplates : templates;
  }, [templates, v2TemplateTerritory]);

  // Group templates by category
  const templatesByCategory = useMemo(() => {
    const list = Array.isArray(territoryScopedTemplates) ? territoryScopedTemplates : [];
    return list.reduce((acc, template) => {
      const category = template.documentType || template.category || 'Other';
      if (!acc[category]) acc[category] = [];
      acc[category].push(template);
      return acc;
    }, {});
  }, [territoryScopedTemplates]);

  const selectedV2Template = useMemo(
    () => territoryScopedTemplates.find((template) => template.id === v2TemplateId)
      || templates.find((template) => template.id === v2TemplateId)
      || null,
    [territoryScopedTemplates, templates, v2TemplateId]
  );

  // Extract signer roles from selected template
  const signerRoles = useMemo(() => {
    if (!selectedTemplate) return [];
    const roles = selectedTemplate.signerRoles;
    if (Array.isArray(roles) && roles.length > 0) return roles;
    // Default: single customer signer
    return [{ role: 'CUSTOMER', label: 'Customer', required: true }];
  }, [selectedTemplate]);

  // Build context for V2 API calls
  const buildContext = () => ({
    opportunityId: opportunity?.id,
    contactId: contact?.id || opportunity?.contactId,
    accountId: account?.id || opportunity?.accountId,
  });

  const resetV2SignerTransientState = () => {
    setV2SignatureMode('DRAW');
    setV2TypedSignature('');
    setV2SignatureData(null);
    setV2IsDrawing(false);
    setV2ActiveRequiredIndex(0);
    setV2SignError(null);
    if (v2CanvasRef.current) {
      const canvas = v2CanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  };

  const resetV2SignFlowState = () => {
    setV2AgreementData(null);
    setV2CustomerSigningToken(null);
    setV2HostSigningToken(null);
    setV2CustomerSignSession(null);
    setV2AgentSignSession(null);
    setV2SendToSignAgentLink(null);
    setV2CompletionData(null);
    resetV2SignerTransientState();
  };

  // Pre-fill signer fields when template or contact changes
  useEffect(() => {
    if (!selectedTemplate || signerRoles.length === 0) return;

    const fields = {};
    for (const signer of signerRoles) {
      const role = signer.role || signer;
      const roleKey = typeof role === 'string' ? role : role.role;
      if (roleKey === 'CUSTOMER' || roleKey === 'CO_SIGNER') {
        fields[roleKey] = {
          name: contact?.name || `${contact?.firstName || ''} ${contact?.lastName || ''}`.trim() || '',
          email: contact?.email || '',
        };
      } else if (roleKey === 'AGENT' || roleKey === 'PM') {
        fields[roleKey] = {
          name: currentUser ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() || currentUser.email : '',
          email: currentUser?.email || '',
        };
      } else {
        fields[roleKey] = { name: '', email: '' };
      }
    }
    setSignerFields(fields);
  }, [selectedTemplate, contact, currentUser, signerRoles]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSelectedTemplate(null);
      setPreviewUrl(null);
      setPreviewHash(null);
      setSignerFields({});
      setMessage('');
      setError(null);
      setResult(null);
      setCopiedLink(null);
      setV2TemplateId('');
      setV2Mode('SIGN_NOW');
      setV2CustomerEmail('');
      setV2AgentEmail('');
      setV2Verification(null);
      setV2VerificationError(null);
      setV2Step(1);
      setV2PreviewData(null);
      setV2PreviewUrl(null);
      setV2PreviewHash(null);
      setV2PreviewError(null);
      resetV2SignFlowState();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!FEATURE_PANDASIGN_V2 || !isOpen) return;
    setV2CustomerEmail(contact?.email || '');
    setV2AgentEmail(currentUser?.email || '');
  }, [isOpen, contact?.email, currentUser?.email]);

  // Preview generation mutation
  const previewMutation = useMutation({
    mutationFn: async () => {
      const response = await documentsApiV2.preview({
        templateId: selectedTemplate.id,
        context: buildContext(),
        returnUrl: true,
      });
      return response?.data || response;
    },
    onSuccess: (data) => {
      setPreviewUrl(data?.previewUrl || data?.documentUrl || data?.url || null);
      setPreviewHash(data?.previewHash || data?.documentHash || null);
      setStep(2);
      setError(null);
    },
    onError: (err) => {
      setError(err.response?.data?.error?.message || err.message || 'Failed to generate preview');
    },
  });

  // Send contract mutation
  const sendMutation = useMutation({
    mutationFn: async ({ instantSign = false }) => {
      // Build recipients object from signer fields
      const recipients = {};
      for (const [role, fields] of Object.entries(signerFields)) {
        if (fields.email && fields.name) {
          recipients[role] = { email: fields.email, name: fields.name };
        }
      }

      const payload = {
        templateId: selectedTemplate.id,
        context: buildContext(),
        recipients,
        message: message || undefined,
        expiresInDays: 30,
        instantSign,
      };

      // Include previewHash if we generated a preview
      if (previewHash) {
        payload.previewHash = previewHash;
      }

      const response = await documentsApiV2.send(payload);
      return response?.data || response;
    },
    onSuccess: (data) => {
      setResult(data);
      setStep(5);
      queryClient.invalidateQueries(['opportunityDocuments', opportunity?.id]);
      queryClient.invalidateQueries(['wysiwyg-templates']);
      if (onSuccess) onSuccess(data);
    },
    onError: (err) => {
      setError(err.response?.data?.error?.message || err.message || 'Failed to send contract');
    },
  });

  const verifyRequiredFieldsMutation = useMutation({
    mutationFn: async (payload) => {
      const response = await documentsApiV2.verifyRequiredFields(payload);
      return response?.data || response;
    },
    onSuccess: (data) => {
      setV2Verification(data || {});
      setV2VerificationError(null);
    },
    onError: (err) => {
      setV2Verification(null);
      setV2VerificationError(err?.response?.data?.error?.message || err?.message || 'Required field verification failed');
    },
  });

  useEffect(() => {
    if (!FEATURE_PANDASIGN_V2) return;
    setV2Verification(null);
    setV2VerificationError(null);
    setV2PreviewData(null);
    setV2PreviewUrl(null);
    setV2PreviewHash(null);
    setV2PreviewError(null);
    setV2Step(1);
    resetV2SignFlowState();
  }, [v2TemplateId, v2Mode, v2CustomerEmail, v2AgentEmail]);

  const v2PreviewMutation = useMutation({
    mutationFn: async (payload) => {
      const response = await documentsApiV2.preview(payload);
      return response?.data || response;
    },
    onSuccess: (rawData) => {
      const data = normalizePreviewPayload(rawData);
      setV2PreviewData(data);
      setV2PreviewUrl(getPreviewUrl(data));
      setV2PreviewHash(getPreviewHash(data));
      setV2PreviewError(null);
      setV2Step(2);
    },
    onError: (err) => {
      setV2PreviewData(null);
      setV2PreviewUrl(null);
      setV2PreviewHash(null);
      setV2PreviewError(err?.response?.data?.error?.message || err?.message || 'Preview is unavailable right now.');
      setV2Step(2);
    },
  });

  const startV2SignNowMutation = useMutation({
    mutationFn: async () => {
      const customerName = getCustomerDisplayName(contact);
      const created = unwrapApiEnvelope(await agreementsApi.createAgreement({
        templateId: v2TemplateId,
        opportunityId: opportunity?.id,
        accountId: account?.id || opportunity?.accountId,
        contactId: contact?.id || opportunity?.contactId,
        recipientEmail: v2CustomerEmail,
        recipientName: customerName,
      }));

      const agreementId = created?.id || created?.agreementId;
      const customerToken = extractSigningToken(created);

      if (!agreementId || !customerToken) {
        throw new Error('Sign Now session is unavailable. Missing agreement or signing token.');
      }

      const customerSessionResp = await apiClient.get(`/api/documents/agreements/sign/${customerToken}`);
      const customerSession = unwrapApiEnvelope(customerSessionResp?.data);

      if (!customerSession || !customerSession.id) {
        throw new Error('Customer signing session could not be loaded.');
      }

      return { created, customerToken, customerSession };
    },
    onSuccess: ({ created, customerToken, customerSession }) => {
      setV2AgreementData(created);
      setV2CustomerSigningToken(customerToken);
      setV2CustomerSignSession(customerSession);
      setV2SignError(null);
      setV2Step(3);
      resetV2SignerTransientState();
    },
    onError: (err) => {
      setV2SignError(err?.response?.data?.error?.message || err?.message || 'Unable to start Sign Now flow.');
    },
  });

  const startV2SendToSignMutation = useMutation({
    mutationFn: async () => {
      const customerName = getCustomerDisplayName(contact);
      const created = unwrapApiEnvelope(await agreementsApi.createAgreement({
        templateId: v2TemplateId,
        opportunityId: opportunity?.id,
        accountId: account?.id || opportunity?.accountId,
        contactId: contact?.id || opportunity?.contactId,
        recipientEmail: v2CustomerEmail,
        recipientName: customerName,
      }));

      const agreementId = getAgreementId(created);
      if (!agreementId) {
        throw new Error('Send To Sign could not create an agreement.');
      }

      const sent = unwrapApiEnvelope(await agreementsApi.sendAgreement(agreementId));
      return {
        created,
        sent,
        agreementId,
      };
    },
    onSuccess: ({ created, sent }) => {
      const nextAgreement = mergeAgreementState(created, sent);
      setV2AgreementData(nextAgreement);
      setV2CompletionData(null);
      setV2HostSigningToken(null);
      setV2SendToSignAgentLink(null);
      setV2SignError(null);
      setV2Step(3);
      queryClient.invalidateQueries(['opportunityDocuments', opportunity?.id]);
    },
    onError: (err) => {
      setV2SignError(err?.response?.data?.error?.message || err?.message || 'Unable to send the customer agreement.');
    },
  });

  const submitV2CustomerSignatureMutation = useMutation({
    mutationFn: async (signatureData) => {
      if (!v2CustomerSigningToken) {
        throw new Error('Customer signing token is missing.');
      }

      await apiClient.post(`/api/documents/agreements/sign/${v2CustomerSigningToken}`, {
        signatureData,
        signerName: getCustomerDisplayName(contact),
        signerEmail: v2CustomerEmail,
      });

      const agreementId = v2AgreementData?.id || v2AgreementData?.agreementId;
      if (!agreementId) {
        throw new Error('Agreement id is missing for agent signing session.');
      }

      const hostName = getAgentDisplayName(currentUser, v2AgentEmail);
      const hostInit = unwrapApiEnvelope(await agreementsApi.initiateHostSigning(agreementId, {
        name: hostName,
        email: v2AgentEmail || currentUser?.email,
      }));
      const hostToken = extractHostSigningToken(hostInit);

      if (!hostToken) {
        throw new Error('Agent signing session token is missing.');
      }

      const agentSession = unwrapApiEnvelope(await agreementsApi.getAgreementForHostSigning(hostToken));
      if (!agentSession || !agentSession.id) {
        throw new Error('Agent signing session could not be loaded.');
      }

      return { hostToken, agentSession };
    },
    onSuccess: ({ hostToken, agentSession }) => {
      setV2HostSigningToken(hostToken);
      setV2AgentSignSession(agentSession);
      setV2Step(4);
      setV2SignError(null);
      resetV2SignerTransientState();
    },
    onError: (err) => {
      setV2SignError(err?.response?.data?.error?.message || err?.message || 'Unable to submit customer signature.');
    },
  });

  const submitV2AgentSignatureMutation = useMutation({
    mutationFn: async (signatureData) => {
      if (!v2HostSigningToken) {
        throw new Error('Agent signing token is missing.');
      }

      const hostName = getAgentDisplayName(currentUser, v2AgentEmail);
      const completion = unwrapApiEnvelope(await agreementsApi.applyHostSignature(
        v2HostSigningToken,
        signatureData,
        {
          name: hostName,
          email: v2AgentEmail || currentUser?.email,
        }
      ));

      return completion;
    },
    onSuccess: (completion) => {
      setV2CompletionData(completion);
      setV2Step(5);
      setV2SignError(null);
      resetV2SignerTransientState();
      if (onSuccess) {
        onSuccess(completion);
      }
    },
    onError: (err) => {
      setV2SignError(err?.response?.data?.error?.message || err?.message || 'Unable to submit agent signature.');
    },
  });

  const initiateV2SendToSignAgentMutation = useMutation({
    mutationFn: async () => {
      const agreementId = getAgreementId(v2AgreementData);
      if (!agreementId) {
        throw new Error('Agreement id is unavailable for the agent signing step.');
      }

      const hostName = getAgentDisplayName(currentUser, v2AgentEmail);
      const hostInit = unwrapApiEnvelope(await agreementsApi.initiateHostSigning(agreementId, {
        name: hostName,
        email: v2AgentEmail || currentUser?.email,
      }));
      const hostToken = extractHostSigningToken(hostInit);

      return {
        ...hostInit,
        agreementId,
        hostToken,
      };
    },
    onSuccess: (hostInit) => {
      setV2HostSigningToken(hostInit.hostToken || null);
      setV2SendToSignAgentLink(hostInit);
      setV2SignError(null);
      setV2Step(4);
    },
    onError: (err) => {
      setV2SignError(err?.response?.data?.error?.message || err?.message || 'Unable to prepare the agent signing step.');
    },
  });

  const resendV2CustomerAgreementMutation = useMutation({
    mutationFn: async () => {
      const agreementId = getAgreementId(v2AgreementData);
      if (!agreementId) {
        throw new Error('Agreement id is unavailable for resend.');
      }
      return agreementsApi.resendAgreement(agreementId);
    },
    onSuccess: () => {
      setV2SignError(null);
    },
    onError: (err) => {
      setV2SignError(err?.response?.data?.error?.message || err?.message || 'Unable to resend the customer agreement.');
    },
  });

  const v2AgreementId = getAgreementId(v2AgreementData);
  const v2AgreementStatusQuery = useQuery({
    queryKey: ['pandasign-v2-agreement-status', v2AgreementId],
    queryFn: async () => unwrapApiEnvelope(await agreementsApi.getAgreement(v2AgreementId)),
    enabled:
      FEATURE_PANDASIGN_V2 &&
      isOpen &&
      v2Mode === 'SEND_TO_SIGN' &&
      Boolean(v2AgreementId) &&
      (v2Step === 3 || v2Step === 4),
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (!FEATURE_PANDASIGN_V2 || v2Mode !== 'SEND_TO_SIGN') return;

    const agreement = v2AgreementStatusQuery.data;
    if (!agreement || typeof agreement !== 'object') return;

    setV2AgreementData((prev) => mergeAgreementState(prev, agreement));

    const normalizedStatus = normalizeAgreementStatus(agreement.status);
    if (normalizedStatus === 'COMPLETED') {
      setV2CompletionData((prev) => prev || agreement);
      if (v2Step !== 5) {
        setV2Step(5);
        setV2SignError(null);
        queryClient.invalidateQueries(['opportunityDocuments', opportunity?.id]);
        if (onSuccess) {
          onSuccess(agreement);
        }
      }
      return;
    }

    if (
      (normalizedStatus === 'SIGNED' || normalizedStatus === 'PARTIALLY_SIGNED') &&
      !v2SendToSignAgentLink &&
      !initiateV2SendToSignAgentMutation.isPending &&
      v2Step === 3
    ) {
      initiateV2SendToSignAgentMutation.mutate();
    }
  }, [
    FEATURE_PANDASIGN_V2,
    v2Mode,
    v2AgreementStatusQuery.data,
    v2SendToSignAgentLink,
    initiateV2SendToSignAgentMutation,
    v2Step,
    queryClient,
    opportunity?.id,
    onSuccess,
  ]);

  useEffect(() => {
    if (!(v2Step === 3 || v2Step === 4) || v2SignatureMode !== 'DRAW' || !v2CanvasRef.current) return;

    const canvas = v2CanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
    ctx.clearRect(0, 0, rect.width, rect.height);
  }, [v2Step, v2SignatureMode]);

  // Handlers
  const handleSelectTemplate = (template) => {
    setSelectedTemplate(template);
    setError(null);
    // Generate preview immediately
    previewMutation.mutate();
  };

  const handleSignerFieldChange = (role, field, value) => {
    setSignerFields(prev => ({
      ...prev,
      [role]: { ...prev[role], [field]: value },
    }));
  };

  const validateSigners = () => {
    for (const signer of signerRoles) {
      const roleKey = typeof signer === 'string' ? signer : (signer.role || signer);
      const isRequired = typeof signer === 'object' ? signer.required !== false : true;
      const fields = signerFields[roleKey];
      if (isRequired && (!fields?.email || !fields?.name)) {
        setError(`Please fill in name and email for ${getRoleLabel(roleKey)}`);
        return false;
      }
      if (fields?.email && !EMAIL_REGEX.test(fields.email)) {
        setError(`Invalid email format for ${getRoleLabel(roleKey)}`);
        return false;
      }
    }
    setError(null);
    return true;
  };

  const handleSendForSignature = () => {
    if (!validateSigners()) return;
    sendMutation.mutate({ instantSign: false });
  };

  const handleSignNow = () => {
    if (!validateSigners()) return;
    sendMutation.mutate({ instantSign: true });
  };

  const handleCopyLink = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(url);
      setTimeout(() => setCopiedLink(null), 2000);
    } catch {
      // Fallback
    }
  };

  const validateV2StepOneInputs = () => {
    if (!v2TemplateId) {
      setV2VerificationError('Please select a template before verification.');
      return false;
    }
    if (!EMAIL_REGEX.test(v2CustomerEmail)) {
      setV2VerificationError('Please enter a valid customer email address.');
      return false;
    }
    if (!EMAIL_REGEX.test(v2AgentEmail)) {
      setV2VerificationError('Please enter a valid agent email address.');
      return false;
    }
    return true;
  };

  const handleVerifyStepOne = () => {
    if (!validateV2StepOneInputs()) return;
    setV2VerificationError(null);
    verifyRequiredFieldsMutation.mutate({
      templateId: v2TemplateId,
      mode: v2Mode,
      emails: {
        customer: v2CustomerEmail,
        agent: v2AgentEmail,
      },
      customerEmail: v2CustomerEmail,
      agentEmail: v2AgentEmail,
      context: buildContext(),
    });
  };

  const handleOpenV2Preview = () => {
    if (!validateV2StepOneInputs()) return;

    setV2VerificationError(null);
    setV2PreviewError(null);
    v2PreviewMutation.mutate({
      templateId: v2TemplateId,
      mode: v2Mode,
      context: buildContext(),
      returnUrl: true,
    });
  };

  const getCanvasCoordinates = (event) => {
    const canvas = v2CanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const source = event.touches?.[0] || event;
    return {
      x: source.clientX - rect.left,
      y: source.clientY - rect.top,
    };
  };

  const startV2Drawing = (event) => {
    if (v2SignatureMode !== 'DRAW') return;
    event.preventDefault();
    const canvas = v2CanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const coords = getCanvasCoordinates(event);
    setV2IsDrawing(true);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  };

  const drawV2Signature = (event) => {
    if (!v2IsDrawing || v2SignatureMode !== 'DRAW') return;
    event.preventDefault();
    const canvas = v2CanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const coords = getCanvasCoordinates(event);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const stopV2Drawing = () => {
    if (!v2IsDrawing) return;
    setV2IsDrawing(false);
    if (!v2CanvasRef.current) return;
    setV2SignatureData(v2CanvasRef.current.toDataURL('image/png'));
  };

  const clearV2SignatureCapture = () => {
    resetV2SignerTransientState();
  };

  const handleStartV2SignNow = () => {
    if (!validateV2StepOneInputs()) return;
    if (v2Mode !== 'SIGN_NOW') {
      setV2SignError('Send To Sign is not available in this phase yet. Use Sign Now.');
      return;
    }
    setV2SignError(null);
    startV2SignNowMutation.mutate();
  };

  const handleStartV2SendToSign = () => {
    if (!validateV2StepOneInputs()) return;
    if (v2Mode !== 'SEND_TO_SIGN') {
      setV2SignError('Switch to Send To Sign to use the remote signing flow.');
      return;
    }
    setV2SignError(null);
    startV2SendToSignMutation.mutate();
  };

  const currentV2SignerRole = v2Step === 4 ? 'AGENT' : 'CUSTOMER';
  const currentV2SignSession = v2Step === 4 ? v2AgentSignSession : v2CustomerSignSession;
  const currentV2RequiredFields = getSignerRequiredFields(currentV2SignSession, currentV2SignerRole);

  const handleV2JumpToNextRequired = () => {
    if (!currentV2RequiredFields.length) return;
    setV2ActiveRequiredIndex((prev) => (prev + 1) % currentV2RequiredFields.length);
  };

  const buildV2TypedSignatureData = () => {
    const text = (v2TypedSignature || '').trim();
    if (!text) return null;

    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 260;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#111827';
    ctx.font = '600 72px "Brush Script MT", cursive';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 24, 130);
    return canvas.toDataURL('image/png');
  };

  const getCurrentV2SignatureData = () => {
    if (v2SignatureMode === 'TYPE') {
      return buildV2TypedSignatureData();
    }
    if (v2SignatureData) {
      return v2SignatureData;
    }
    if (!v2CanvasRef.current) {
      return null;
    }
    return v2CanvasRef.current.toDataURL('image/png');
  };

  const handleSubmitV2CurrentSigner = () => {
    if (!currentV2SignSession) {
      setV2SignError('Signing session data is unavailable. Go back to preview and restart Sign Now.');
      return;
    }
    const signatureData = getCurrentV2SignatureData();
    if (!signatureData) {
      setV2SignError('Please provide a signature before continuing.');
      return;
    }

    setV2SignError(null);
    if (v2Step === 3) {
      submitV2CustomerSignatureMutation.mutate(signatureData);
      return;
    }
    if (v2Step === 4) {
      submitV2AgentSignatureMutation.mutate(signatureData);
    }
  };

  if (!isOpen) return null;

  if (FEATURE_PANDASIGN_V2) {
    const verifyBusy = verifyRequiredFieldsMutation.isPending;
    const previewBusy = v2PreviewMutation.isPending;
    const checklist = getChecklist(v2Verification);
    const missingItems = getMissingItems(v2Verification);
    const hasFailures = missingItems.length > 0;
    const previewMissingTokens = getPreviewMissingTokens(v2PreviewData);
    const previewWarnings = getPreviewWarnings(v2PreviewData);
    const placeholderSummary = getPlaceholderSummaryByRole(v2PreviewData);
    const hasPreviewPayload = Boolean(v2PreviewData);
    const hasPreviewSource = Boolean(v2PreviewUrl);
    const hasAnyPlaceholders =
      (placeholderSummary.CUSTOMER?.total || 0) > 0 ||
      (placeholderSummary.AGENT?.total || 0) > 0 ||
      (placeholderSummary.OTHER?.total || 0) > 0;
    const showPreviewUnavailable = v2Step === 2 && !previewBusy && !hasPreviewSource;
    const signNowBusy = startV2SignNowMutation.isPending;
    const sendToSignBusy = startV2SendToSignMutation.isPending;
    const customerSubmitBusy = submitV2CustomerSignatureMutation.isPending;
    const agentSubmitBusy = submitV2AgentSignatureMutation.isPending;
    const pollErrorMessage = v2AgreementStatusQuery.error?.response?.data?.error?.message || v2AgreementStatusQuery.error?.message || null;
    const v2AgreementStatus = normalizeAgreementStatus(v2AgreementData?.status);
    const v2AgreementDocumentUrl = getAgreementDocumentUrl(v2CompletionData) || getAgreementDocumentUrl(v2AgreementData);
    const customerLink = v2AgreementData?.signingUrl;
    const agentLink = v2SendToSignAgentLink?.hostSigningUrl || v2SendToSignAgentLink?.embeddedSigningUrl || null;
    const customerPolling = v2Mode === 'SEND_TO_SIGN' && v2Step === 3 && v2AgreementStatusQuery.isFetching;
    const agentPolling = v2Mode === 'SEND_TO_SIGN' && v2Step === 4 && v2AgreementStatusQuery.isFetching;
    const customerResendBusy = resendV2CustomerAgreementMutation.isPending;
    const agentLinkBusy = initiateV2SendToSignAgentMutation.isPending;

    return (
      <div className="fixed inset-0 z-50">
        <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />

        <div className="relative flex h-[100dvh] w-full items-stretch justify-center p-0 sm:items-center sm:p-6">
          <div
            className="relative flex w-full max-w-4xl flex-col bg-white shadow-2xl h-[100dvh] sm:h-auto sm:max-h-[92dvh] rounded-none sm:rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-panda-primary to-panda-secondary flex items-center justify-center">
                  <FileSignature className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">PandaSign Wizard</h2>
                  <p className="text-sm text-gray-500">
                    {v2Step === 1 && 'Step 1: Template, mode, and required-field verification'}
                    {v2Step === 2 && 'Step 2: Preview and checklist'}
                    {v2Step === 3 && (v2Mode === 'SEND_TO_SIGN' ? 'Step 3: Customer Sent' : 'Step 3A: Customer Signature')}
                    {v2Step === 4 && (v2Mode === 'SEND_TO_SIGN' ? 'Step 4: Agent Sent' : 'Step 3A: Agent Signature')}
                    {v2Step === 5 && (v2Mode === 'SEND_TO_SIGN' ? 'Step 5: Completed' : 'Step 3A: Completed')}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 sm:px-6 py-4 pb-32 sm:pb-36">
              <div className="space-y-6">
                {(v2VerificationError || v2PreviewError || v2SignError || pollErrorMessage || error) && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start">
                    <AlertCircle className="w-5 h-5 text-red-500 mr-3 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{v2VerificationError || v2PreviewError || v2SignError || pollErrorMessage || error}</p>
                  </div>
                )}

                {v2Step === 1 && (
                  <>
                    <section className="space-y-2">
                      <label htmlFor="pandasign-template" className="block text-sm font-medium text-gray-700">
                        Template
                      </label>
                      <select
                        id="pandasign-template"
                        value={v2TemplateId}
                        onChange={(e) => setV2TemplateId(e.target.value)}
                        className="w-full px-3 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
                      >
                        <option value="">Select a published template...</option>
                        {territoryScopedTemplates.map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.name}
                            {template.documentType || template.category ? ` (${template.documentType || template.category})` : ''}
                            {template.territory ? ` - ${template.territory}` : ''}
                          </option>
                        ))}
                      </select>
                      {templatesLoading && (
                        <p className="text-xs text-gray-500">Loading templates...</p>
                      )}
                      {!templatesLoading && territoryScopedTemplates.length > 0 && (
                        <p className="text-xs text-gray-500">
                          Showing templates for <span className="font-semibold text-gray-700">{v2TemplateTerritory}</span> and <span className="font-semibold text-gray-700">DEFAULT</span>.
                        </p>
                      )}
                    </section>

                    <section className="space-y-3">
                      <p className="text-sm font-medium text-gray-700">Mode</p>
                      <div className="grid grid-cols-1 gap-3">
                        <button
                          type="button"
                          onClick={() => setV2Mode('SIGN_NOW')}
                          className={`w-full rounded-lg border px-4 py-3 text-left transition ${
                            v2Mode === 'SIGN_NOW'
                              ? 'border-panda-primary bg-panda-primary/10 text-panda-primary'
                              : 'border-gray-200 hover:border-panda-primary/50'
                          }`}
                        >
                          <span className="block text-sm font-semibold">Sign Now</span>
                          <span className="block text-xs text-gray-500 mt-0.5">In-person signing on this device.</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setV2Mode('SEND_TO_SIGN')}
                          className={`w-full rounded-lg border px-4 py-3 text-left transition ${
                            v2Mode === 'SEND_TO_SIGN'
                              ? 'border-panda-primary bg-panda-primary/10 text-panda-primary'
                              : 'border-gray-200 hover:border-panda-primary/50'
                          }`}
                        >
                          <span className="block text-sm font-semibold">Send To Sign</span>
                          <span className="block text-xs text-gray-500 mt-0.5">Email signing links to each signer.</span>
                        </button>
                      </div>
                    </section>

                    <section className="space-y-3">
                      <h3 className="text-sm font-medium text-gray-700">Signer Emails</h3>
                      <div>
                        <label htmlFor="pandasign-customer-email" className="block text-xs font-medium text-gray-600 mb-1">
                          Customer Email
                        </label>
                        <input
                          id="pandasign-customer-email"
                          type="email"
                          autoComplete="email"
                          value={v2CustomerEmail}
                          onChange={(e) => setV2CustomerEmail(e.target.value)}
                          className="w-full px-3 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
                          placeholder="customer@example.com"
                        />
                      </div>
                      <div>
                        <label htmlFor="pandasign-agent-email" className="block text-xs font-medium text-gray-600 mb-1">
                          Agent Email
                        </label>
                        <input
                          id="pandasign-agent-email"
                          type="email"
                          autoComplete="email"
                          value={v2AgentEmail}
                          onChange={(e) => setV2AgentEmail(e.target.value)}
                          className="w-full px-3 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
                          placeholder="agent@example.com"
                        />
                      </div>
                    </section>

                    {selectedV2Template && (
                      <section className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <p className="text-xs text-gray-500">Selected template</p>
                        <p className="text-sm font-medium text-gray-900">{selectedV2Template.name}</p>
                        {selectedV2Template.description && (
                          <p className="text-xs text-gray-500 mt-1">{selectedV2Template.description}</p>
                        )}
                      </section>
                    )}

                    {v2Verification && (
                      <section className={`rounded-lg border p-3 ${hasFailures ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`}>
                        <p className={`text-sm font-semibold ${hasFailures ? 'text-amber-700' : 'text-green-700'}`}>
                          {hasFailures ? 'Verification completed with missing items' : 'Verification completed'}
                        </p>

                        {checklist.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs font-medium text-gray-600 mb-1">Checklist</p>
                            <ul className="space-y-1">
                              {checklist.map((item, index) => (
                                <li key={`${item}-${index}`} className="text-xs text-gray-700">
                                  • {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {missingItems.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs font-medium text-amber-700 mb-1">Missing Required Fields</p>
                            <ul className="space-y-1">
                              {missingItems.map((item, index) => (
                                <li key={`${item}-${index}`} className="text-xs text-amber-700">
                                  • {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </section>
                    )}
                  </>
                )}

                {v2Step === 2 && (
                  <>
                    <section className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">Template</p>
                      <p className="text-sm font-medium text-gray-900">{selectedV2Template?.name || 'Not selected'}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Mode: {v2Mode === 'SEND_TO_SIGN' ? 'Send To Sign' : 'Sign Now'}
                      </p>
                      {v2PreviewHash && (
                        <p className="text-xs text-gray-500 mt-1 break-all">Preview hash: {v2PreviewHash}</p>
                      )}
                    </section>

                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold text-gray-700">Preview</h3>
                      {previewBusy && (
                        <div className="border border-gray-200 rounded-lg p-6 text-center bg-gray-50">
                          <Loader2 className="w-6 h-6 text-panda-primary animate-spin mx-auto mb-2" />
                          <p className="text-sm text-gray-600">Generating preview...</p>
                        </div>
                      )}

                      {!previewBusy && hasPreviewSource && (
                        <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-100">
                          <iframe
                            src={v2PreviewUrl}
                            className="w-full h-[48vh] sm:h-[56vh] lg:h-[62vh]"
                            title="PandaSign V2 Preview"
                          />
                        </div>
                      )}

                      {showPreviewUnavailable && (
                        <div className="border border-amber-200 rounded-lg p-4 bg-amber-50">
                          <p className="text-sm font-medium text-amber-700">Preview unavailable</p>
                          <p className="text-xs text-amber-700 mt-1">
                            We could not render a preview URL from the current response. You can go back and adjust inputs.
                          </p>
                        </div>
                      )}
                    </section>

                    <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                      <div className="rounded-lg border border-gray-200 p-3 bg-white">
                        <p className="text-xs font-semibold text-gray-600 mb-2">Missing Tokens</p>
                        {previewMissingTokens.length > 0 ? (
                          <ul className="space-y-1">
                            {previewMissingTokens.map((token, index) => (
                              <li key={`${token}-${index}`} className="text-xs text-amber-700">
                                • {token}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-gray-500">
                            {hasPreviewPayload ? 'No missing tokens reported.' : 'No preview token data available.'}
                          </p>
                        )}
                      </div>

                      <div className="rounded-lg border border-gray-200 p-3 bg-white">
                        <p className="text-xs font-semibold text-gray-600 mb-2">Signature Placeholders by Role</p>
                        {hasAnyPlaceholders ? (
                          <div className="space-y-2 text-xs text-gray-700">
                            <div>
                              <p className="font-medium text-gray-800">CUSTOMER</p>
                              <p>
                                Total: {placeholderSummary.CUSTOMER.total}
                                {' • '}Signatures: {placeholderSummary.CUSTOMER.signature}
                                {' • '}Initials: {placeholderSummary.CUSTOMER.initial}
                              </p>
                            </div>
                            <div>
                              <p className="font-medium text-gray-800">AGENT</p>
                              <p>
                                Total: {placeholderSummary.AGENT.total}
                                {' • '}Signatures: {placeholderSummary.AGENT.signature}
                                {' • '}Initials: {placeholderSummary.AGENT.initial}
                              </p>
                            </div>
                            {placeholderSummary.OTHER.total > 0 && (
                              <div>
                                <p className="font-medium text-gray-800">OTHER</p>
                                <p>Total: {placeholderSummary.OTHER.total}</p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500">
                            {hasPreviewPayload ? 'No placeholder map reported.' : 'No preview placeholder data available.'}
                          </p>
                        )}
                      </div>

                      <div className="rounded-lg border border-gray-200 p-3 bg-white">
                        <p className="text-xs font-semibold text-gray-600 mb-2">Warnings</p>
                        {previewWarnings.length > 0 ? (
                          <ul className="space-y-1">
                            {previewWarnings.map((warning, index) => (
                              <li key={`${warning}-${index}`} className="text-xs text-amber-700">
                                • {warning}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-gray-500">
                            {hasPreviewPayload ? 'No warnings reported.' : 'No preview warnings available.'}
                          </p>
                        )}
                      </div>
                    </section>

                    {v2Mode === 'SEND_TO_SIGN' && (
                      <section className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                        <p className="text-sm text-blue-700 font-medium">Send To Sign sequence</p>
                        <p className="text-xs text-blue-700 mt-1">
                          We will send the customer first. After the customer signs, the wizard will generate the agent signing link and keep polling until the agreement is completed.
                        </p>
                      </section>
                    )}
                  </>
                )}

                {v2Mode === 'SIGN_NOW' && (v2Step === 3 || v2Step === 4) && (
                  <>
                    <section className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">Current signer</p>
                      <p className="text-sm font-medium text-gray-900">
                        {currentV2SignerRole === 'CUSTOMER' ? 'Customer' : 'Agent'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {currentV2SignerRole === 'CUSTOMER' ? v2CustomerEmail : v2AgentEmail}
                      </p>
                      {!currentV2SignSession && (
                        <p className="text-xs text-red-600 mt-2">
                          Signing session data is unavailable. Go back to preview and restart Sign Now.
                        </p>
                      )}
                    </section>

                    <section className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-gray-700">Required Fields ({currentV2SignerRole})</h3>
                        <button
                          type="button"
                          onClick={handleV2JumpToNextRequired}
                          disabled={!currentV2RequiredFields.length}
                          className="inline-flex items-center text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                        >
                          <SkipForward className="w-3.5 h-3.5 mr-1" />
                          Jump Next
                        </button>
                      </div>
                      {currentV2RequiredFields.length > 0 ? (
                        <div className="space-y-2">
                          {currentV2RequiredFields.map((field, index) => (
                            <div
                              key={`${field.id || field.key || field.label || index}`}
                              className={`rounded p-2 text-xs border ${
                                index === v2ActiveRequiredIndex
                                  ? 'bg-panda-primary/10 border-panda-primary text-panda-primary'
                                  : 'bg-white border-gray-200 text-gray-700'
                              }`}
                            >
                              {field.label || field.name || `Required field ${index + 1}`}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500">
                          No role-specific required fields were provided for this signer.
                        </p>
                      )}
                    </section>

                    <section className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-gray-700">Capture Signature</h3>
                        <button
                          type="button"
                          onClick={clearV2SignatureCapture}
                          className="inline-flex items-center text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                        >
                          Clear
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <button
                          type="button"
                          onClick={() => {
                            setV2SignatureMode('DRAW');
                            setV2TypedSignature('');
                            setV2SignatureData(null);
                          }}
                          className={`inline-flex items-center justify-center px-3 py-2 text-sm rounded border ${
                            v2SignatureMode === 'DRAW'
                              ? 'border-panda-primary bg-panda-primary/10 text-panda-primary'
                              : 'border-gray-300 text-gray-700'
                          }`}
                        >
                          <Pencil className="w-4 h-4 mr-1" />
                          Draw
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setV2SignatureMode('TYPE');
                            setV2SignatureData(null);
                          }}
                          className={`inline-flex items-center justify-center px-3 py-2 text-sm rounded border ${
                            v2SignatureMode === 'TYPE'
                              ? 'border-panda-primary bg-panda-primary/10 text-panda-primary'
                              : 'border-gray-300 text-gray-700'
                          }`}
                        >
                          <Type className="w-4 h-4 mr-1" />
                          Type
                        </button>
                      </div>

                      {v2SignatureMode === 'DRAW' && (
                        <div className="border border-dashed border-gray-300 rounded-lg bg-white p-2">
                          <div className="w-full h-44">
                            <canvas
                              ref={v2CanvasRef}
                              className="w-full h-full touch-none rounded"
                              onMouseDown={startV2Drawing}
                              onMouseMove={drawV2Signature}
                              onMouseUp={stopV2Drawing}
                              onMouseLeave={stopV2Drawing}
                              onTouchStart={startV2Drawing}
                              onTouchMove={drawV2Signature}
                              onTouchEnd={stopV2Drawing}
                            />
                          </div>
                          <p className="text-xs text-gray-500 mt-2 text-center">
                            Draw signature with touch or mouse
                          </p>
                        </div>
                      )}

                      {v2SignatureMode === 'TYPE' && (
                        <div>
                          <label htmlFor="v2-typed-signature" className="block text-xs text-gray-600 mb-1">
                            Typed Signature
                          </label>
                          <input
                            id="v2-typed-signature"
                            type="text"
                            value={v2TypedSignature}
                            onChange={(e) => setV2TypedSignature(e.target.value)}
                            className="w-full px-3 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
                            placeholder="Type full name"
                          />
                        </div>
                      )}
                    </section>
                  </>
                )}

                {v2Mode === 'SEND_TO_SIGN' && v2Step === 3 && (
                  <>
                    <section className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs text-gray-500">Agreement</p>
                          <p className="text-sm font-medium text-gray-900">
                            {v2AgreementData?.name || selectedV2Template?.name || 'Customer Agreement'}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">Customer: {v2CustomerEmail}</p>
                        </div>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getAgreementStatusClasses(v2AgreementStatus)}`}>
                          {formatAgreementStatusLabel(v2AgreementStatus)}
                        </span>
                      </div>
                    </section>

                    <section className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-gray-700">Customer Signing Link</h3>
                        {customerPolling && (
                          <span className="inline-flex items-center text-xs text-gray-500">
                            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                            Checking status
                          </span>
                        )}
                      </div>
                      {customerLink ? (
                        <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50 p-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-500">Sent to customer</p>
                            <p className="text-xs text-gray-700 truncate mt-1">{customerLink}</p>
                          </div>
                          <div className="ml-2 flex items-center space-x-1">
                            <button
                              type="button"
                              onClick={() => handleCopyLink(customerLink)}
                              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded"
                              title="Copy customer link"
                            >
                              {copiedLink === customerLink ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                            </button>
                            <a
                              href={customerLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 text-gray-400 hover:text-panda-primary hover:bg-gray-200 rounded"
                              title="Open customer link"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500">The agreement was sent, but no customer signing URL was returned.</p>
                      )}
                      <p className="text-xs text-gray-500 mt-3">
                        The wizard polls agreement status every few seconds. When the customer signs, the agent signing step will begin automatically.
                      </p>
                    </section>

                    <section className="rounded-lg border border-gray-200 p-3 bg-white">
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">Current Status</h3>
                      {v2AgreementStatus === 'SIGNED' || v2AgreementStatus === 'PARTIALLY_SIGNED' ? (
                        <div className="inline-flex items-center text-sm text-green-700">
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Customer signature received. Preparing agent signing step...
                        </div>
                      ) : (
                        <div className="inline-flex items-center text-sm text-amber-700">
                          <Clock className="w-4 h-4 mr-2" />
                          Waiting for the customer to sign.
                        </div>
                      )}
                    </section>
                  </>
                )}

                {v2Mode === 'SEND_TO_SIGN' && v2Step === 4 && (
                  <>
                    <section className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs text-gray-500">Agreement</p>
                          <p className="text-sm font-medium text-gray-900">
                            {v2AgreementData?.name || selectedV2Template?.name || 'Agent Signing'}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">Agent: {v2AgentEmail}</p>
                        </div>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getAgreementStatusClasses(v2AgreementStatus)}`}>
                          {formatAgreementStatusLabel(v2AgreementStatus)}
                        </span>
                      </div>
                    </section>

                    <section className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-gray-700">Agent Signing Link</h3>
                        {(agentPolling || agentLinkBusy) && (
                          <span className="inline-flex items-center text-xs text-gray-500">
                            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                            {agentLinkBusy ? 'Preparing link' : 'Checking status'}
                          </span>
                        )}
                      </div>
                      {agentLink ? (
                        <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50 p-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-500">Ready for the agent to sign</p>
                            <p className="text-xs text-gray-700 truncate mt-1">{agentLink}</p>
                          </div>
                          <div className="ml-2 flex items-center space-x-1">
                            <button
                              type="button"
                              onClick={() => handleCopyLink(agentLink)}
                              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded"
                              title="Copy agent link"
                            >
                              {copiedLink === agentLink ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                            </button>
                            <a
                              href={agentLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 text-gray-400 hover:text-panda-primary hover:bg-gray-200 rounded"
                              title="Open agent link"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500">We are preparing the agent signing step.</p>
                      )}
                      <p className="text-xs text-gray-500 mt-3">
                        The agreement will move to complete as soon as the agent finishes signing from this link.
                      </p>
                    </section>
                  </>
                )}

                {v2Step === 5 && (
                  <section className="text-center py-6">
                    <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                      <CheckCircle className="w-8 h-8 text-green-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      {v2Mode === 'SEND_TO_SIGN' ? 'Send To Sign completed' : 'Sign Now completed'}
                    </h3>
                    <p className="text-sm text-gray-500 mb-4">
                      {v2Mode === 'SEND_TO_SIGN'
                        ? 'Customer and agent signatures were completed successfully.'
                        : 'Customer and agent signatures were submitted successfully.'}
                    </p>
                    {v2AgreementDocumentUrl && (
                      <a
                        href={v2AgreementDocumentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <ExternalLink className="w-4 h-4 mr-1" />
                        View Document
                      </a>
                    )}
                  </section>
                )}
              </div>
            </div>

            <div className="sticky bottom-0 border-t border-gray-200 bg-white/95 backdrop-blur px-4 sm:px-6 py-3">
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                {(v2Step === 1 || v2Step === 2 || v2Step === 3 || v2Step === 4) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (v2Step === 1) {
                        onClose();
                        return;
                      }

                      if (v2Step === 2) {
                        setV2Step(1);
                        setV2PreviewData(null);
                        setV2PreviewUrl(null);
                        setV2PreviewHash(null);
                        setV2PreviewError(null);
                        return;
                      }

                      // Step 3A back-out returns to preview and clears signer transient state.
                      setV2Step(2);
                      resetV2SignFlowState();
                    }}
                    className="w-full sm:w-auto px-5 py-3 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    {v2Step === 1 ? 'Cancel' : 'Back'}
                  </button>
                )}

                {v2Step === 1 && (
                  <>
                    <button
                      type="button"
                      onClick={handleVerifyStepOne}
                      disabled={verifyBusy || previewBusy || templatesLoading}
                      className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-3 rounded-lg border border-panda-primary text-panda-primary hover:bg-panda-primary/5 disabled:opacity-50"
                    >
                      {verifyBusy ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Verifying...
                        </>
                      ) : (
                        'Verify Required Fields'
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleOpenV2Preview}
                      disabled={verifyBusy || previewBusy || templatesLoading}
                      className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-3 rounded-lg bg-gradient-to-r from-panda-primary to-panda-secondary text-white disabled:opacity-50"
                    >
                      {previewBusy ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Loading Preview...
                        </>
                      ) : (
                        'Continue to Preview'
                      )}
                    </button>
                  </>
                )}

                {v2Step === 2 && (
                  <>
                    <button
                      type="button"
                      onClick={handleOpenV2Preview}
                      disabled={previewBusy || signNowBusy || sendToSignBusy}
                      className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-3 rounded-lg border border-panda-primary text-panda-primary hover:bg-panda-primary/5 disabled:opacity-50"
                    >
                      {previewBusy ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Refreshing...
                        </>
                      ) : (
                        'Refresh Preview'
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={v2Mode === 'SEND_TO_SIGN' ? handleStartV2SendToSign : handleStartV2SignNow}
                      disabled={previewBusy || signNowBusy || sendToSignBusy}
                      className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-3 rounded-lg bg-gradient-to-r from-panda-primary to-panda-secondary text-white disabled:opacity-50"
                    >
                      {(signNowBusy || sendToSignBusy) ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          {v2Mode === 'SEND_TO_SIGN' ? 'Sending...' : 'Starting...'}
                        </>
                      ) : (
                        v2Mode === 'SEND_TO_SIGN' ? 'Send Customer Link' : 'Start Sign Now'
                      )}
                    </button>
                  </>
                )}

                {v2Mode === 'SEND_TO_SIGN' && v2Step === 3 && (
                  <>
                    <button
                      type="button"
                      onClick={() => v2AgreementStatusQuery.refetch()}
                      disabled={customerResendBusy || customerPolling}
                      className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-3 rounded-lg border border-panda-primary text-panda-primary hover:bg-panda-primary/5 disabled:opacity-50"
                    >
                      {customerPolling ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Checking...
                        </>
                      ) : (
                        'Refresh Status'
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => resendV2CustomerAgreementMutation.mutate()}
                      disabled={customerResendBusy}
                      className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-3 rounded-lg bg-gradient-to-r from-panda-primary to-panda-secondary text-white disabled:opacity-50"
                    >
                      {customerResendBusy ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Resending...
                        </>
                      ) : (
                        'Resend Customer Email'
                      )}
                    </button>
                  </>
                )}

                {v2Mode === 'SEND_TO_SIGN' && v2Step === 4 && (
                  <>
                    <button
                      type="button"
                      onClick={() => v2AgreementStatusQuery.refetch()}
                      disabled={agentPolling || agentLinkBusy}
                      className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-3 rounded-lg border border-panda-primary text-panda-primary hover:bg-panda-primary/5 disabled:opacity-50"
                    >
                      {(agentPolling || agentLinkBusy) ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Checking...
                        </>
                      ) : (
                        'Refresh Status'
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => initiateV2SendToSignAgentMutation.mutate()}
                      disabled={agentLinkBusy}
                      className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-3 rounded-lg bg-gradient-to-r from-panda-primary to-panda-secondary text-white disabled:opacity-50"
                    >
                      {agentLinkBusy ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Preparing...
                        </>
                      ) : (
                        'Generate New Agent Link'
                      )}
                    </button>
                  </>
                )}

                {v2Mode === 'SIGN_NOW' && v2Step === 3 && (
                  <button
                    type="button"
                    onClick={handleSubmitV2CurrentSigner}
                    disabled={customerSubmitBusy || agentSubmitBusy || signNowBusy || !v2CustomerSignSession}
                    className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-3 rounded-lg bg-gradient-to-r from-panda-primary to-panda-secondary text-white disabled:opacity-50"
                  >
                    {customerSubmitBusy ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      'Submit Customer Signature'
                    )}
                  </button>
                )}

                {v2Mode === 'SIGN_NOW' && v2Step === 4 && (
                  <button
                    type="button"
                    onClick={handleSubmitV2CurrentSigner}
                    disabled={customerSubmitBusy || agentSubmitBusy || signNowBusy || !v2AgentSignSession}
                    className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-3 rounded-lg bg-gradient-to-r from-panda-primary to-panda-secondary text-white disabled:opacity-50"
                  >
                    {agentSubmitBusy ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      'Submit Agent Signature'
                    )}
                  </button>
                )}

                {v2Step === 5 && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-3 rounded-lg bg-gradient-to-r from-panda-primary to-panda-secondary text-white"
                  >
                    Done
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const stepLabels = [
    { num: 1, label: 'Template' },
    { num: 2, label: 'Preview' },
    { num: 3, label: 'Signers' },
    { num: 4, label: 'Send' },
    { num: 5, label: 'Complete' },
  ];

  const isBusy = previewMutation.isPending || sendMutation.isPending;

  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />

      <div className="relative flex h-[100dvh] w-full items-stretch justify-center p-0 lg:items-center lg:p-6">
        <div
          className="relative flex w-full max-w-3xl flex-col bg-white shadow-2xl transform transition-all h-[100dvh] lg:h-[90dvh] rounded-none lg:rounded-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-panda-primary to-panda-secondary flex items-center justify-center">
                <FileSignature className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">PandaSign Contract</h2>
                <p className="text-sm text-gray-500">
                  {step === 1 && 'Select a contract template'}
                  {step === 2 && 'Preview document'}
                  {step === 3 && 'Configure signers'}
                  {step === 4 && 'Choose how to send'}
                  {step === 5 && 'Contract sent successfully'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Progress Steps */}
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center justify-between">
              {stepLabels.map((s, i) => (
                <div key={s.num} className="flex items-center">
                  <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium ${
                    step > s.num
                      ? 'bg-green-500 text-white'
                      : step === s.num
                        ? 'bg-panda-primary text-white'
                        : 'bg-gray-200 text-gray-500'
                  }`}>
                    {step > s.num ? <CheckCircle className="w-3.5 h-3.5" /> : s.num}
                  </div>
                  <span className={`ml-1.5 text-xs ${step >= s.num ? 'text-gray-900 font-medium' : 'text-gray-400'} hidden sm:inline`}>
                    {s.label}
                  </span>
                  {i < stepLabels.length - 1 && (
                    <div className={`w-6 sm:w-10 h-0.5 mx-1.5 ${step > s.num ? 'bg-green-500' : 'bg-gray-200'}`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 px-6 py-6 overflow-y-auto">
            {/* Error Banner */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start">
                <AlertCircle className="w-5 h-5 text-red-500 mr-3 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-red-700">{error}</p>
                  <button onClick={() => setError(null)} className="text-xs text-red-500 hover:underline mt-1">Dismiss</button>
                </div>
              </div>
            )}

            {/* Step 1: Select Template */}
            {step === 1 && (
              <div className="space-y-4">
                {templatesLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 text-panda-primary animate-spin" />
                  </div>
                ) : territoryScopedTemplates.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No published contract templates available</p>
                    <p className="text-sm text-gray-400 mt-1">Publish a contract template before sending for signature</p>
                  </div>
                ) : (
                  Object.entries(templatesByCategory).map(([category, categoryTemplates]) => (
                    <div key={category}>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wider">
                        {category}
                      </h3>
                      <div className="grid gap-2">
                        {categoryTemplates.map((template) => {
                          const roles = template.signerRoles;
                          const roleCount = Array.isArray(roles) ? roles.length : 1;
                          return (
                            <button
                              key={template.id}
                              onClick={() => handleSelectTemplate(template)}
                              disabled={isBusy}
                              className="w-full flex items-center p-4 border border-gray-200 rounded-lg hover:border-panda-primary hover:bg-panda-primary/5 transition-all text-left group disabled:opacity-50"
                            >
                              <div className="w-10 h-10 rounded-lg bg-gray-100 group-hover:bg-panda-primary/10 flex items-center justify-center flex-shrink-0">
                                <FileSignature className="w-5 h-5 text-gray-500 group-hover:text-panda-primary" />
                              </div>
                              <div className="ml-4 flex-1 min-w-0">
                                <p className="font-medium text-gray-900 truncate">{template.name}</p>
                                <div className="flex items-center space-x-3 mt-0.5">
                                  {template.description && (
                                    <p className="text-sm text-gray-500 truncate">{template.description}</p>
                                  )}
                                  <span className="inline-flex items-center text-xs text-gray-400">
                                    {template.territory || 'DEFAULT'}
                                  </span>
                                  <span className="inline-flex items-center text-xs text-gray-400">
                                    <Users className="w-3 h-3 mr-1" />
                                    {roleCount} signer{roleCount !== 1 ? 's' : ''}
                                  </span>
                                </div>
                              </div>
                              <ChevronDown className="w-5 h-5 text-gray-400 group-hover:text-panda-primary transform -rotate-90 flex-shrink-0" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}

                {/* Loading state when generating preview after template selection */}
                {previewMutation.isPending && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-panda-primary animate-spin mr-3" />
                    <span className="text-gray-600">Generating preview...</span>
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Preview */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">{selectedTemplate?.name}</h3>
                    <p className="text-sm text-gray-500">Review the generated document below</p>
                  </div>
                  <button
                    onClick={() => { setStep(1); setSelectedTemplate(null); setPreviewUrl(null); setPreviewHash(null); }}
                    className="text-sm text-panda-primary hover:underline"
                  >
                    Change Template
                  </button>
                </div>

                {/* PDF Preview */}
                {previewUrl ? (
                  <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-100">
                    <iframe
                      src={previewUrl}
                      className="w-full h-[400px]"
                      title="Contract Preview"
                    />
                  </div>
                ) : (
                  <div className="border border-gray-200 rounded-lg p-12 text-center bg-gray-50">
                    <Eye className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">Preview will appear here</p>
                    <p className="text-sm text-gray-400 mt-1">
                      The document is generated with data from this job
                    </p>
                    {previewHash && (
                      <p className="text-xs text-green-600 mt-2">Document hash verified</p>
                    )}
                  </div>
                )}

                {previewHash && (
                  <p className="text-xs text-gray-400 text-center">
                    Document integrity hash: {previewHash.substring(0, 12)}...
                  </p>
                )}
              </div>
            )}

            {/* Step 3: Configure Signers */}
            {step === 3 && (
              <div className="space-y-6">
                <div>
                  <h3 className="font-medium text-gray-900 mb-1">Configure Signers</h3>
                  <p className="text-sm text-gray-500">
                    This template requires {signerRoles.length} signer{signerRoles.length !== 1 ? 's' : ''}.
                    {selectedTemplate?.signingOrder === 'SEQUENTIAL' && ' Signers will sign in order.'}
                  </p>
                </div>

                {signerRoles.map((signer, index) => {
                  const roleKey = typeof signer === 'string' ? signer : (signer.role || signer);
                  const roleLabel = typeof signer === 'object' ? (signer.label || getRoleLabel(roleKey)) : getRoleLabel(roleKey);
                  const isRequired = typeof signer === 'object' ? signer.required !== false : true;
                  const fields = signerFields[roleKey] || { name: '', email: '' };

                  return (
                    <div key={roleKey} className="p-4 border border-gray-200 rounded-lg">
                      <div className="flex items-center mb-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                          getRoleColor(roleKey)
                        }`}>
                          {index + 1}
                        </div>
                        <div className="ml-3">
                          <p className="font-medium text-gray-900">{roleLabel}</p>
                          {selectedTemplate?.signingOrder === 'SEQUENTIAL' && (
                            <p className="text-xs text-gray-400">Signs {index === 0 ? 'first' : `after ${getRoleLabel(signerRoles[index - 1]?.role || signerRoles[index - 1])}`}</p>
                          )}
                        </div>
                        {isRequired && (
                          <span className="ml-auto text-xs text-red-500">Required</span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm text-gray-600 mb-1">
                            <User className="w-3.5 h-3.5 inline mr-1" />
                            Full Name
                          </label>
                          <input
                            type="text"
                            value={fields.name}
                            onChange={(e) => handleSignerFieldChange(roleKey, 'name', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
                            placeholder={`${roleLabel} name`}
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-600 mb-1">
                            <Mail className="w-3.5 h-3.5 inline mr-1" />
                            Email
                          </label>
                          <input
                            type="email"
                            value={fields.email}
                            onChange={(e) => handleSignerFieldChange(roleKey, 'email', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
                            placeholder={`${roleLabel} email`}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Optional message */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Message to Signers (optional)
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
                    placeholder="Add a personal message for the signers..."
                  />
                </div>
              </div>
            )}

            {/* Step 4: Choose Action */}
            {step === 4 && (
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium text-gray-900 mb-1">How would you like to proceed?</h3>
                  <p className="text-sm text-gray-500">Choose how the contract should be signed</p>
                </div>

                {/* Send for Signature */}
                <button
                  onClick={handleSendForSignature}
                  disabled={sendMutation.isPending}
                  className="w-full p-5 border-2 border-gray-200 rounded-xl hover:border-panda-primary hover:bg-panda-primary/5 transition-all text-left group disabled:opacity-50"
                >
                  <div className="flex items-start">
                    <div className="w-12 h-12 rounded-xl bg-blue-100 group-hover:bg-blue-200 flex items-center justify-center flex-shrink-0">
                      <Send className="w-6 h-6 text-blue-600" />
                    </div>
                    <div className="ml-4 flex-1">
                      <p className="font-semibold text-gray-900 text-base">Send for Signature</p>
                      <p className="text-sm text-gray-500 mt-1">
                        Email signing links to each signer. They can sign remotely from any device.
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {Object.entries(signerFields).filter(([, f]) => f.email).map(([role, f]) => (
                          <span key={role} className="inline-flex items-center text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                            <Mail className="w-3 h-3 mr-1" />
                            {f.email}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </button>

                {/* Sign Now */}
                <button
                  onClick={handleSignNow}
                  disabled={sendMutation.isPending}
                  className="w-full p-5 border-2 border-gray-200 rounded-xl hover:border-emerald-500 hover:bg-emerald-50 transition-all text-left group disabled:opacity-50"
                >
                  <div className="flex items-start">
                    <div className="w-12 h-12 rounded-xl bg-emerald-100 group-hover:bg-emerald-200 flex items-center justify-center flex-shrink-0">
                      <PenTool className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div className="ml-4 flex-1">
                      <p className="font-semibold text-gray-900 text-base">Sign Now (In Person)</p>
                      <p className="text-sm text-gray-500 mt-1">
                        Open the signing interface immediately for in-person signing on this device.
                      </p>
                    </div>
                  </div>
                </button>

                {sendMutation.isPending && (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-6 h-6 text-panda-primary animate-spin mr-3" />
                    <span className="text-gray-600">Processing contract...</span>
                  </div>
                )}
              </div>
            )}

            {/* Step 5: Success */}
            {step === 5 && result && (
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Contract {result.instantSign ? 'Ready for Signing' : 'Sent Successfully'}!
                </h3>
                <p className="text-gray-500 mb-6">
                  {result.instantSign
                    ? 'The signing interface is ready. Use the link below to sign.'
                    : 'Signing links have been emailed to all signers.'
                  }
                </p>

                {/* Agreement Details */}
                <div className="p-4 bg-gray-50 rounded-lg text-left mb-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500">Agreement</p>
                      <p className="font-medium text-sm">{result.agreementNumber || result.name || result.id}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Status</p>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        <Clock className="w-3 h-3 mr-1" />
                        {result.status === 'SENT' ? 'Awaiting Signatures' : (result.status || 'Pending')}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Template</p>
                      <p className="font-medium text-sm">{selectedTemplate?.name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Signers</p>
                      <p className="font-medium text-sm">{Object.keys(signerFields).filter(r => signerFields[r]?.email).length}</p>
                    </div>
                  </div>
                </div>

                {/* Signing Links */}
                {result.signingLinks && Object.keys(result.signingLinks).length > 0 && (
                  <div className="text-left mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Signing Links</h4>
                    <div className="space-y-2">
                      {Object.entries(result.signingLinks).map(([role, link]) => (
                        <div key={role} className="flex items-center p-3 bg-gray-50 rounded-lg">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{getRoleLabel(role)}</p>
                            <p className="text-xs text-gray-500 truncate">{link}</p>
                          </div>
                          <div className="flex items-center ml-2 space-x-1">
                            <button
                              onClick={() => handleCopyLink(link)}
                              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded"
                              title="Copy link"
                            >
                              {copiedLink === link ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                            </button>
                            <a
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 text-gray-400 hover:text-panda-primary hover:bg-gray-200 rounded"
                              title="Open signing page"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Single signing URL fallback */}
                {result.signingUrl && !result.signingLinks && (
                  <div className="text-left mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Signing Link</h4>
                    <div className="flex items-center p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-500 truncate">{result.signingUrl}</p>
                      </div>
                      <div className="flex items-center ml-2 space-x-1">
                        <button
                          onClick={() => handleCopyLink(result.signingUrl)}
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded"
                        >
                          {copiedLink === result.signingUrl ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                        </button>
                        <a
                          href={result.signingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-gray-400 hover:text-panda-primary hover:bg-gray-200 rounded"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                {/* Document Preview Link */}
                {(result.documentUrl || previewUrl) && (
                  <a
                    href={result.documentUrl || previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-sm text-panda-primary hover:underline"
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    View Document
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Footer Navigation */}
          {step >= 2 && step <= 4 && (
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-between">
              <button
                onClick={() => {
                  setError(null);
                  if (step === 2) {
                    setStep(1);
                    setSelectedTemplate(null);
                    setPreviewUrl(null);
                    setPreviewHash(null);
                  } else {
                    setStep(step - 1);
                  }
                }}
                disabled={isBusy}
                className="inline-flex items-center px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </button>

              {step < 4 && (
                <button
                  onClick={() => {
                    if (step === 3 && !validateSigners()) return;
                    setStep(step + 1);
                    setError(null);
                  }}
                  disabled={isBusy}
                  className="inline-flex items-center px-6 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                  Continue
                  <ChevronDown className="w-4 h-4 ml-2 transform -rotate-90" />
                </button>
              )}
            </div>
          )}

          {/* Success footer */}
          {step === 5 && (
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end">
              <button
                onClick={onClose}
                className="inline-flex items-center px-6 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper: Get human-readable label for a signer role
function getRoleLabel(role) {
  const labels = {
    CUSTOMER: 'Customer',
    AGENT: 'Sales Agent',
    PM: 'Project Manager',
    WITNESS: 'Witness',
    CO_SIGNER: 'Co-Signer',
  };
  return labels[role] || role;
}

// Helper: Get color classes for role badge
function getRoleColor(role) {
  const colors = {
    CUSTOMER: 'bg-blue-100 text-blue-700',
    AGENT: 'bg-purple-100 text-purple-700',
    PM: 'bg-amber-100 text-amber-700',
    WITNESS: 'bg-gray-100 text-gray-700',
    CO_SIGNER: 'bg-teal-100 text-teal-700',
  };
  return colors[role] || 'bg-gray-100 text-gray-700';
}
