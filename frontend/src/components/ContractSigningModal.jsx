import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agreementsApi } from '../services/api';
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
} from 'lucide-react';

/**
 * ContractSigningModal - Modal for sending contracts for signature
 * Based on Salesforce/Adobe Sign workflow from Scribe documentation
 *
 * Flow:
 * 1. Select contract template (based on state/type)
 * 2. Confirm recipient info (auto-filled from contact)
 * 3. Preview (optional)
 * 4. Send for signature
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
  const [step, setStep] = useState(1); // 1: Select Template, 2: Review & Send, 3: Success
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [sendImmediately, setSendImmediately] = useState(true);
  const [error, setError] = useState(null);
  const [createdAgreement, setCreatedAgreement] = useState(null);

  // Fetch available templates
  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ['agreement-templates'],
    queryFn: () => agreementsApi.getTemplates({ isActive: true }),
    enabled: isOpen,
  });

  const templates = templatesData?.data || [];

  // Group templates by category
  const templatesByCategory = templates.reduce((acc, template) => {
    const category = template.category || 'Other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(template);
    return acc;
  }, {});

  // Pre-fill recipient info from contact
  useEffect(() => {
    if (contact) {
      setRecipientEmail(contact.email || '');
      setRecipientName(
        contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim()
      );
    }
  }, [contact]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSelectedTemplate(null);
      setError(null);
      setCreatedAgreement(null);
    }
  }, [isOpen]);

  // Create and send agreement mutation
  const sendContractMutation = useMutation({
    mutationFn: async () => {
      // Create agreement from template
      const agreementResponse = await agreementsApi.createAgreement({
        templateId: selectedTemplate.id,
        opportunityId: opportunity?.id,
        accountId: account?.id || opportunity?.accountId,
        contactId: contact?.id || opportunity?.contactId,
        recipientEmail,
        recipientName,
        mergeData: {
          // Auto-populate merge fields from opportunity data
          projectName: opportunity?.name || '',
          projectAddress: account?.billingAddress || opportunity?.propertyAddress || '',
          customerName: recipientName,
          customerEmail: recipientEmail,
          amount: opportunity?.amount ? `$${opportunity.amount.toLocaleString()}` : '',
          contractDate: new Date().toLocaleDateString(),
          state: account?.billingState || opportunity?.state || '',
          // Add more merge fields as needed
        },
      });

      const agreement = agreementResponse?.data;

      // Send for signature if requested
      if (sendImmediately && agreement?.id) {
        await agreementsApi.sendAgreement(agreement.id);
        agreement.status = 'SENT';
      }

      return agreement;
    },
    onSuccess: (agreement) => {
      setCreatedAgreement(agreement);
      setStep(3);
      // Refresh documents list
      queryClient.invalidateQueries(['opportunityDocuments', opportunity?.id]);
      if (onSuccess) onSuccess(agreement);
    },
    onError: (err) => {
      setError(err.response?.data?.error?.message || err.message || 'Failed to send contract');
    },
  });

  const handleSelectTemplate = (template) => {
    setSelectedTemplate(template);
    setStep(2);
    setError(null);
  };

  const handleSendContract = () => {
    if (!recipientEmail) {
      setError('Recipient email is required');
      return;
    }
    if (!recipientName) {
      setError('Recipient name is required');
      return;
    }
    sendContractMutation.mutate();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl transform transition-all"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-panda-primary to-panda-secondary flex items-center justify-center">
                <FileSignature className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Send Contract for Signature</h2>
                <p className="text-sm text-gray-500">
                  {step === 1 && 'Select a contract template'}
                  {step === 2 && 'Review and send'}
                  {step === 3 && 'Contract sent successfully'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Progress Steps */}
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center justify-between">
              {[
                { num: 1, label: 'Select Template' },
                { num: 2, label: 'Review & Send' },
                { num: 3, label: 'Complete' },
              ].map((s, i) => (
                <div key={s.num} className="flex items-center">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                    step > s.num
                      ? 'bg-green-500 text-white'
                      : step === s.num
                        ? 'bg-panda-primary text-white'
                        : 'bg-gray-200 text-gray-500'
                  }`}>
                    {step > s.num ? <CheckCircle className="w-4 h-4" /> : s.num}
                  </div>
                  <span className={`ml-2 text-sm ${step >= s.num ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                    {s.label}
                  </span>
                  {i < 2 && (
                    <div className={`w-12 h-0.5 mx-3 ${step > s.num ? 'bg-green-500' : 'bg-gray-200'}`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-6">
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
                    <p className="text-gray-500">No contract templates available</p>
                    <p className="text-sm text-gray-400 mt-1">Contact admin to create templates</p>
                  </div>
                ) : (
                  Object.entries(templatesByCategory).map(([category, categoryTemplates]) => (
                    <div key={category}>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wider">
                        {category}
                      </h3>
                      <div className="grid gap-3">
                        {categoryTemplates.map((template) => (
                          <button
                            key={template.id}
                            onClick={() => handleSelectTemplate(template)}
                            className="w-full flex items-center p-4 border border-gray-200 rounded-lg hover:border-panda-primary hover:bg-panda-primary/5 transition-all text-left group"
                          >
                            <div className="w-10 h-10 rounded-lg bg-gray-100 group-hover:bg-panda-primary/10 flex items-center justify-center flex-shrink-0">
                              <FileSignature className="w-5 h-5 text-gray-500 group-hover:text-panda-primary" />
                            </div>
                            <div className="ml-4 flex-1 min-w-0">
                              <p className="font-medium text-gray-900 truncate">{template.name}</p>
                              {template.description && (
                                <p className="text-sm text-gray-500 truncate">{template.description}</p>
                              )}
                            </div>
                            <ChevronDown className="w-5 h-5 text-gray-400 group-hover:text-panda-primary transform -rotate-90" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Step 2: Review & Send */}
            {step === 2 && selectedTemplate && (
              <div className="space-y-6">
                {/* Selected Template */}
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center">
                    <FileSignature className="w-5 h-5 text-panda-primary mr-3" />
                    <div>
                      <p className="font-medium text-gray-900">{selectedTemplate.name}</p>
                      <p className="text-sm text-gray-500">{selectedTemplate.category}</p>
                    </div>
                    <button
                      onClick={() => setStep(1)}
                      className="ml-auto text-sm text-panda-primary hover:underline"
                    >
                      Change
                    </button>
                  </div>
                </div>

                {/* Recipient Info */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Recipient Information</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        <User className="w-4 h-4 inline mr-1" />
                        Recipient Name
                      </label>
                      <input
                        type="text"
                        value={recipientName}
                        onChange={(e) => setRecipientName(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
                        placeholder="Enter recipient name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        <Mail className="w-4 h-4 inline mr-1" />
                        Recipient Email
                      </label>
                      <input
                        type="email"
                        value={recipientEmail}
                        onChange={(e) => setRecipientEmail(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
                        placeholder="Enter recipient email"
                      />
                    </div>
                  </div>
                </div>

                {/* Send Options */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Send Options</h3>
                  <label className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                    <input
                      type="checkbox"
                      checked={sendImmediately}
                      onChange={(e) => setSendImmediately(e.target.checked)}
                      className="w-5 h-5 rounded border-gray-300 text-panda-primary focus:ring-panda-primary"
                    />
                    <div>
                      <p className="font-medium text-gray-900">Send for signature immediately</p>
                      <p className="text-sm text-gray-500">
                        Recipient will receive an email with the signing link
                      </p>
                    </div>
                  </label>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
                    <AlertCircle className="w-5 h-5 text-red-500 mr-3 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Success */}
            {step === 3 && createdAgreement && (
              <div className="text-center py-6">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Contract Sent Successfully!
                </h3>
                <p className="text-gray-500 mb-6">
                  A signing link has been sent to <strong>{recipientEmail}</strong>
                </p>

                {/* Agreement Details */}
                <div className="p-4 bg-gray-50 rounded-lg text-left mb-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Agreement Number</p>
                      <p className="font-medium">{createdAgreement.agreementNumber || createdAgreement.id}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Status</p>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        <Clock className="w-3 h-3 mr-1" />
                        {createdAgreement.status === 'SENT' ? 'Awaiting Signature' : createdAgreement.status}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Template</p>
                      <p className="font-medium">{selectedTemplate?.name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Recipient</p>
                      <p className="font-medium">{recipientName}</p>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-center space-x-3">
                  {createdAgreement.documentUrl && (
                    <a
                      href={createdAgreement.documentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      Preview Document
                    </a>
                  )}
                  <button
                    onClick={onClose}
                    className="inline-flex items-center px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          {step === 2 && (
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-between">
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleSendContract}
                disabled={sendContractMutation.isPending}
                className="inline-flex items-center px-6 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {sendContractMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    {sendImmediately ? 'Send for Signature' : 'Create Draft'}
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
