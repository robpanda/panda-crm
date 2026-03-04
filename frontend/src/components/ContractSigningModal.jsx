import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { documentsApiV2 } from '../services/api';
import { useAuth } from '../context/AuthContext';
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
} from 'lucide-react';

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

  // Group templates by category
  const templatesByCategory = useMemo(() => {
    const list = Array.isArray(templates) ? templates : [];
    return list.reduce((acc, template) => {
      const category = template.category || 'Other';
      if (!acc[category]) acc[category] = [];
      acc[category].push(template);
      return acc;
    }, {});
  }, [templates]);

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
    }
  }, [isOpen]);

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
      if (fields?.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
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

  if (!isOpen) return null;

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
                ) : templates.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No published contract templates available</p>
                    <p className="text-sm text-gray-400 mt-1">Create templates in Admin &gt; PandaSign &gt; WYSIWYG Templates</p>
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
