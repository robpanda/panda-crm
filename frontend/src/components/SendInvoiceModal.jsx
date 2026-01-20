import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invoicesApi } from '../services/api';
import {
  X,
  Mail,
  Send,
  CheckCircle,
  AlertCircle,
  Loader2,
  Receipt,
  Building2,
  Link,
  FileText,
  Plus,
  Trash2,
  Shield,
  User,
} from 'lucide-react';

export default function SendInvoiceModal({ isOpen, onClose, invoice, opportunity, contact }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1); // 1: Compose, 2: Sending, 3: Success
  const [error, setError] = useState(null);
  const [sendResult, setSendResult] = useState(null);

  // Form state
  const [recipientType, setRecipientType] = useState('homeowner'); // 'homeowner' or 'insurance'
  const [recipientEmail, setRecipientEmail] = useState('');
  const [ccEmails, setCcEmails] = useState([]);
  const [newCcEmail, setNewCcEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [includePaymentLink, setIncludePaymentLink] = useState(true);

  // Calculate balance
  const balanceDue = parseFloat(invoice?.balanceDue || invoice?.totalAmount || 0);
  const invoiceNumber = invoice?.invoiceNumber || `INV-${invoice?.id?.slice(-6)}`;

  // Check if this is an insurance job
  const isInsuranceJob = opportunity?.type === 'INSURANCE' || opportunity?.isPandaClaims || opportunity?.insuranceCarrier;
  const insuranceCarrier = opportunity?.insuranceCarrier || '';
  const claimNumber = opportunity?.claimNumber || '';

  // Generate message based on recipient type
  const generateMessage = (type) => {
    const customerName = contact?.firstName || opportunity?.contact?.firstName || 'Customer';
    const propertyAddress = opportunity?.address || invoice?.account?.billingAddress || '';

    if (type === 'insurance') {
      return (
        `To Whom It May Concern,\n\n` +
        `Please find attached invoice ${invoiceNumber} for services rendered at the following property:\n\n` +
        `Property Address: ${propertyAddress}\n` +
        `Homeowner: ${customerName}\n` +
        `Claim Number: ${claimNumber || 'N/A'}\n\n` +
        `Invoice Amount: $${balanceDue.toLocaleString()}\n\n` +
        `Please remit payment to:\n` +
        `Panda Exteriors\n` +
        `8825 Stanford Blvd Suite 201\n` +
        `Columbia, MD 21045\n\n` +
        `If you have any questions regarding this invoice, please contact us at (240) 801-6665 or invoices@pandaexteriors.com.\n\n` +
        `Thank you,\nPanda Exteriors`
      );
    } else {
      return (
        `Dear ${customerName},\n\n` +
        `Please find attached invoice ${invoiceNumber} for your project with Panda Exteriors.\n\n` +
        `Invoice Amount: $${balanceDue.toLocaleString()}\n\n` +
        `If you have any questions about this invoice, please don't hesitate to contact us.\n\n` +
        `Thank you for your business!\n\n` +
        `Best regards,\nPanda Exteriors`
      );
    }
  };

  // Generate subject based on recipient type
  const generateSubject = (type) => {
    if (type === 'insurance') {
      return `Invoice ${invoiceNumber} - Claim #${claimNumber || 'N/A'} - Panda Exteriors`;
    }
    return `Invoice ${invoiceNumber} from Panda Exteriors`;
  };

  // Handle recipient type change
  const handleRecipientTypeChange = (type) => {
    setRecipientType(type);

    if (type === 'insurance') {
      // Clear email for manual entry (insurance emails vary by carrier/adjuster)
      setRecipientEmail('');
      setIncludePaymentLink(false); // Insurance companies usually pay by check
    } else {
      // Restore homeowner email
      const email = contact?.email || opportunity?.contact?.email || invoice?.account?.email || '';
      setRecipientEmail(email);
      setIncludePaymentLink(true);
    }

    setSubject(generateSubject(type));
    setMessage(generateMessage(type));
  };

  // Initialize form when modal opens
  useEffect(() => {
    if (isOpen && invoice) {
      // Default to homeowner
      setRecipientType('homeowner');

      // Set recipient email from contact or opportunity
      const email = contact?.email || opportunity?.contact?.email || invoice?.account?.email || '';
      setRecipientEmail(email);

      // Set default subject and message for homeowner
      setSubject(generateSubject('homeowner'));
      setMessage(generateMessage('homeowner'));

      // Reset other state
      setCcEmails([]);
      setNewCcEmail('');
      setIncludePaymentLink(true);
      setStep(1);
      setError(null);
      setSendResult(null);
    }
  }, [isOpen, invoice, contact, opportunity, invoiceNumber, balanceDue, claimNumber]);

  // Send invoice mutation
  const sendInvoiceMutation = useMutation({
    mutationFn: (data) => invoicesApi.sendInvoice(invoice.id, data),
    onSuccess: (data) => {
      setSendResult(data);
      setStep(3);
      // Refresh invoice data
      queryClient.invalidateQueries({ queryKey: ['opportunityInvoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['opportunitySummary'] });
      queryClient.invalidateQueries({ queryKey: ['opportunity'] });
    },
    onError: (err) => {
      setError(err.message || 'Failed to send invoice');
      setStep(1);
    },
  });

  if (!isOpen || !invoice) return null;

  const handleAddCc = () => {
    if (newCcEmail && newCcEmail.includes('@')) {
      setCcEmails([...ccEmails, newCcEmail]);
      setNewCcEmail('');
    }
  };

  const handleRemoveCc = (index) => {
    setCcEmails(ccEmails.filter((_, i) => i !== index));
  };

  const handleSend = () => {
    if (!recipientEmail || !recipientEmail.includes('@')) {
      setError('Please enter a valid recipient email address');
      return;
    }
    setError(null);
    setStep(2);

    sendInvoiceMutation.mutate({
      recipientEmail,
      ccEmails: ccEmails.length > 0 ? ccEmails : undefined,
      subject,
      message,
      includePaymentLink,
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />

        {/* Modal */}
        <div className="relative bg-white rounded-xl shadow-2xl max-w-xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Mail className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Send Invoice</h2>
                <p className="text-sm text-gray-500">{invoiceNumber}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Content */}
          <div className="p-5 overflow-y-auto max-h-[calc(90vh-140px)]">
            {/* Step 1: Compose Email */}
            {step === 1 && (
              <div className="space-y-5">
                {/* Invoice Summary */}
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 text-gray-600 mb-3">
                    <Building2 className="w-4 h-4" />
                    <span className="font-medium">{opportunity?.name || invoice.accountName || 'Customer'}</span>
                  </div>
                  {isInsuranceJob && insuranceCarrier && (
                    <div className="flex items-center gap-2 text-blue-600 text-sm">
                      <Shield className="w-4 h-4" />
                      <span>{insuranceCarrier}</span>
                      {claimNumber && <span className="text-gray-400">• Claim #{claimNumber}</span>}
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Invoice Total</span>
                    <span className="font-medium">${parseFloat(invoice.totalAmount || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                    <span className="text-gray-700 font-medium">Balance Due</span>
                    <span className="font-bold text-panda-primary">${balanceDue.toLocaleString()}</span>
                  </div>
                </div>

                {/* Recipient Type Selector - Only show for insurance jobs */}
                {isInsuranceJob && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Send Invoice To
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => handleRecipientTypeChange('homeowner')}
                        className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-colors ${
                          recipientType === 'homeowner'
                            ? 'border-panda-primary bg-panda-primary/5 text-panda-primary'
                            : 'border-gray-200 hover:border-gray-300 text-gray-600'
                        }`}
                      >
                        <User className="w-5 h-5" />
                        <span className="font-medium">Homeowner</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRecipientTypeChange('insurance')}
                        className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-colors ${
                          recipientType === 'insurance'
                            ? 'border-blue-500 bg-blue-50 text-blue-600'
                            : 'border-gray-200 hover:border-gray-300 text-gray-600'
                        }`}
                      >
                        <Shield className="w-5 h-5" />
                        <span className="font-medium">Insurance</span>
                      </button>
                    </div>
                    {recipientType === 'insurance' && (
                      <p className="text-xs text-gray-500 mt-2">
                        Enter the insurance adjuster or claims department email address below.
                      </p>
                    )}
                  </div>
                )}

                {/* Recipient Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {recipientType === 'insurance' ? 'Insurance Email' : 'To'} <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      placeholder={recipientType === 'insurance' ? 'adjuster@insurance.com' : 'customer@email.com'}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                    />
                  </div>
                </div>

                {/* CC Emails */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    CC (Optional)
                  </label>
                  {ccEmails.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {ccEmails.map((email, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-sm"
                        >
                          {email}
                          <button
                            onClick={() => handleRemoveCc(index)}
                            className="text-gray-400 hover:text-red-500"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={newCcEmail}
                      onChange={(e) => setNewCcEmail(e.target.value)}
                      placeholder="Add CC email..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCc();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleAddCc}
                      className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Subject */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Subject
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  />
                </div>

                {/* Message */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Message
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={8}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent resize-none"
                  />
                </div>

                {/* Options */}
                <div className="space-y-3">
                  {/* Include Payment Link */}
                  <label className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-colors ${includePaymentLink ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={includePaymentLink}
                        onChange={(e) => setIncludePaymentLink(e.target.checked)}
                        className="w-4 h-4 text-green-600 rounded"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <Link className="w-4 h-4 text-green-600" />
                          <span className="font-medium text-gray-900">Include Payment Link</span>
                        </div>
                        <p className="text-sm text-gray-500">Add a Stripe payment link for online payment</p>
                      </div>
                    </div>
                  </label>

                  {/* Attached PDF */}
                  <div className="flex items-center gap-3 p-4 border-2 border-gray-200 rounded-lg bg-gray-50">
                    <FileText className="w-5 h-5 text-gray-400" />
                    <div>
                      <span className="font-medium text-gray-900">Invoice PDF will be attached</span>
                      <p className="text-sm text-gray-500">{invoiceNumber}.pdf</p>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!recipientEmail || sendInvoiceMutation.isPending}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    Send Invoice
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Sending */}
            {step === 2 && (
              <div className="text-center py-12 space-y-4">
                <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto" />
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Sending Invoice...</h3>
                  <p className="text-gray-500 mt-1">
                    Generating PDF and sending email to {recipientEmail}
                  </p>
                </div>
              </div>
            )}

            {/* Step 3: Success */}
            {step === 3 && (
              <div className="text-center py-6 space-y-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">Invoice Sent!</h3>
                  <p className="text-gray-500 mt-1">
                    {invoiceNumber} has been sent to {recipientEmail}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-sm text-left space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Invoice</span>
                    <span className="font-medium">{invoiceNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Amount</span>
                    <span className="font-medium">${balanceDue.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Recipient</span>
                    <span className="font-medium">{recipientEmail}</span>
                  </div>
                  {sendResult?.paymentLinkUrl && (
                    <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                      <span className="text-gray-500">Payment Link</span>
                      <a
                        href={sendResult.paymentLinkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline flex items-center gap-1"
                      >
                        <Link className="w-3 h-3" />
                        View Link
                      </a>
                    </div>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="w-full px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
