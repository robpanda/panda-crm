import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { paymentsApi } from '../services/api';
import {
  X,
  CreditCard,
  DollarSign,
  CheckCircle,
  AlertCircle,
  Loader2,
  Receipt,
  Building2,
} from 'lucide-react';

// Payment Form Component (uses Stripe hooks)
function PaymentForm({ invoice, paymentAmount, onSuccess, onCancel, clientSecret }) {
  const stripe = useStripe();
  const elements = useElements();
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState(null);

  const recordPaymentMutation = useMutation({
    mutationFn: (data) => paymentsApi.createPayment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opportunityInvoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['opportunitySummary'] });
      queryClient.invalidateQueries({ queryKey: ['opportunity'] });
    },
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setPaymentError(null);

    try {
      // Confirm the payment with Stripe
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setPaymentError(submitError.message);
        setIsProcessing(false);
        return;
      }

      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.href,
        },
        redirect: 'if_required',
      });

      if (error) {
        setPaymentError(error.message);
        setIsProcessing(false);
        return;
      }

      // Payment succeeded - record it in our system
      if (paymentIntent && paymentIntent.status === 'succeeded') {
        await recordPaymentMutation.mutateAsync({
          invoiceId: invoice.id,
          amount: paymentAmount,
          paymentMethod: 'CREDIT_CARD',
          stripePaymentIntentId: paymentIntent.id,
          notes: `Payment collected via CRM - ${new Date().toLocaleString()}`,
        });

        onSuccess(paymentIntent);
      }
    } catch (err) {
      setPaymentError(err.message || 'An unexpected error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement
        options={{
          layout: 'tabs',
        }}
      />

      {paymentError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{paymentError}</span>
        </div>
      )}

      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={isProcessing}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isProcessing || !stripe || !elements}
          className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <CreditCard className="w-4 h-4" />
              Pay ${paymentAmount.toLocaleString()}
            </>
          )}
        </button>
      </div>
    </form>
  );
}

// Main Modal Component
export default function PayInvoiceModal({ isOpen, onClose, invoice, opportunity }) {
  const [step, setStep] = useState(1); // 1: Amount, 2: Payment, 3: Success
  const [amountType, setAmountType] = useState('full'); // full, downpayment, partial
  const [customAmount, setCustomAmount] = useState('');
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [clientSecret, setClientSecret] = useState(null);
  const [stripePromise, setStripePromise] = useState(null);
  const [paymentResult, setPaymentResult] = useState(null);
  const [error, setError] = useState(null);

  const balanceDue = parseFloat(invoice?.balanceDue || invoice?.totalAmount || 0);
  const downPaymentPercent = opportunity?.downPaymentPercent || 10;
  const downPaymentAmount = Math.round(balanceDue * (downPaymentPercent / 100) * 100) / 100;

  // Fetch Stripe config
  const { data: stripeConfig } = useQuery({
    queryKey: ['stripeConfig'],
    queryFn: () => paymentsApi.getStripeConfig(),
    staleTime: Infinity,
    enabled: isOpen,
  });

  // Initialize Stripe when config is loaded
  useEffect(() => {
    if (stripeConfig?.publishableKey) {
      setStripePromise(loadStripe(stripeConfig.publishableKey));
    }
  }, [stripeConfig]);

  // Create payment intent mutation
  const createIntentMutation = useMutation({
    mutationFn: ({ invoiceId, amount }) => paymentsApi.createPaymentIntentForInvoice(invoiceId, amount),
    onSuccess: (data) => {
      setClientSecret(data.clientSecret);
      setStep(2);
    },
    onError: (err) => {
      setError(err.message || 'Failed to create payment intent');
    },
  });

  // Update payment amount when type changes
  useEffect(() => {
    if (amountType === 'full') {
      setPaymentAmount(balanceDue);
    } else if (amountType === 'downpayment') {
      setPaymentAmount(downPaymentAmount);
    } else if (amountType === 'partial') {
      setPaymentAmount(parseFloat(customAmount) || 0);
    }
  }, [amountType, balanceDue, downPaymentAmount, customAmount]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setAmountType('full');
      setCustomAmount('');
      setClientSecret(null);
      setPaymentResult(null);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen || !invoice) return null;

  const handleContinueToPayment = () => {
    if (paymentAmount <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    if (paymentAmount > balanceDue) {
      setError('Amount cannot exceed balance due');
      return;
    }
    setError(null);
    createIntentMutation.mutate({ invoiceId: invoice.id, amount: paymentAmount });
  };

  const handlePaymentSuccess = (paymentIntent) => {
    setPaymentResult(paymentIntent);
    setStep(3);
  };

  const appearance = {
    theme: 'stripe',
    variables: {
      colorPrimary: '#667eea',
      colorBackground: '#ffffff',
      colorText: '#1f2937',
      colorDanger: '#dc2626',
      fontFamily: 'Inter, system-ui, sans-serif',
      borderRadius: '8px',
    },
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />

        {/* Modal */}
        <div className="relative bg-white rounded-xl shadow-2xl max-w-lg w-full">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Pay Invoice</h2>
                <p className="text-sm text-gray-500">{invoice.invoiceNumber || `INV-${invoice.id?.slice(-6)}`}</p>
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
          <div className="p-5">
            {/* Step 1: Amount Selection */}
            {step === 1 && (
              <div className="space-y-5">
                {/* Invoice Summary */}
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 text-gray-600 mb-3">
                    <Building2 className="w-4 h-4" />
                    <span className="font-medium">{opportunity?.name || invoice.accountName || 'Customer'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Invoice Total</span>
                    <span className="font-medium">${parseFloat(invoice.totalAmount || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Amount Paid</span>
                    <span className="font-medium text-green-600">${parseFloat(invoice.amountPaid || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                    <span className="text-gray-700 font-medium">Balance Due</span>
                    <span className="font-bold text-red-600">${balanceDue.toLocaleString()}</span>
                  </div>
                </div>

                {/* Amount Type Selection */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-gray-700">Select Payment Amount</label>

                  {/* Full Amount */}
                  <label className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-colors ${amountType === 'full' ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="amountType"
                        value="full"
                        checked={amountType === 'full'}
                        onChange={(e) => setAmountType(e.target.value)}
                        className="w-4 h-4 text-green-600"
                      />
                      <div>
                        <span className="font-medium text-gray-900">Full Amount</span>
                        <p className="text-sm text-gray-500">Pay entire balance</p>
                      </div>
                    </div>
                    <span className="text-lg font-bold text-gray-900">${balanceDue.toLocaleString()}</span>
                  </label>

                  {/* Down Payment */}
                  <label className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-colors ${amountType === 'downpayment' ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="amountType"
                        value="downpayment"
                        checked={amountType === 'downpayment'}
                        onChange={(e) => setAmountType(e.target.value)}
                        className="w-4 h-4 text-green-600"
                      />
                      <div>
                        <span className="font-medium text-gray-900">Down Payment ({downPaymentPercent}%)</span>
                        <p className="text-sm text-gray-500">Initial deposit to start work</p>
                      </div>
                    </div>
                    <span className="text-lg font-bold text-gray-900">${downPaymentAmount.toLocaleString()}</span>
                  </label>

                  {/* Partial/Custom Amount */}
                  <label className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-colors ${amountType === 'partial' ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="amountType"
                        value="partial"
                        checked={amountType === 'partial'}
                        onChange={(e) => setAmountType(e.target.value)}
                        className="w-4 h-4 text-green-600"
                      />
                      <div>
                        <span className="font-medium text-gray-900">Partial Amount</span>
                        <p className="text-sm text-gray-500">Enter custom amount</p>
                      </div>
                    </div>
                    {amountType === 'partial' && (
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="number"
                          value={customAmount}
                          onChange={(e) => setCustomAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-32 pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-right font-medium"
                          min="0"
                          max={balanceDue}
                          step="0.01"
                        />
                      </div>
                    )}
                  </label>
                </div>

                {error && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Continue Button */}
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
                    onClick={handleContinueToPayment}
                    disabled={createIntentMutation.isPending || paymentAmount <= 0}
                    className="flex-1 px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {createIntentMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        Continue
                        <span className="text-white/80">${paymentAmount.toLocaleString()}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Payment Form */}
            {step === 2 && stripePromise && clientSecret && (
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret,
                  appearance,
                }}
              >
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Payment Amount</span>
                      <span className="text-2xl font-bold text-gray-900">${paymentAmount.toLocaleString()}</span>
                    </div>
                  </div>

                  <PaymentForm
                    invoice={invoice}
                    paymentAmount={paymentAmount}
                    onSuccess={handlePaymentSuccess}
                    onCancel={() => setStep(1)}
                    clientSecret={clientSecret}
                  />

                  <p className="text-xs text-gray-500 text-center">
                    Payments are securely processed by Stripe. Your card information is never stored on our servers.
                  </p>
                </div>
              </Elements>
            )}

            {/* Step 3: Success */}
            {step === 3 && (
              <div className="text-center py-6 space-y-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">Payment Successful!</h3>
                  <p className="text-gray-500 mt-1">
                    ${paymentAmount.toLocaleString()} has been charged to the customer's card.
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-sm text-left space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Amount</span>
                    <span className="font-medium">${paymentAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Invoice</span>
                    <span className="font-medium">{invoice.invoiceNumber || `INV-${invoice.id?.slice(-6)}`}</span>
                  </div>
                  {paymentResult?.id && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Transaction ID</span>
                      <span className="font-mono text-xs">{paymentResult.id}</span>
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
