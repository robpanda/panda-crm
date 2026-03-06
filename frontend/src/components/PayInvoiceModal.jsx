import { useState, useEffect, useMemo, useRef } from 'react';
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
  CheckCircle,
  AlertCircle,
  Loader2,
  Building2,
} from 'lucide-react';

const stripePromiseCache = new Map();
const getStripePromise = (publishableKey) => {
  if (!publishableKey) return null;
  if (!stripePromiseCache.has(publishableKey)) {
    stripePromiseCache.set(publishableKey, loadStripe(publishableKey));
  }
  return stripePromiseCache.get(publishableKey);
};

// Payment Form Component (uses Stripe hooks)
function PaymentForm({
  invoice,
  paymentAmount,
  onSuccess,
  onCancel,
  paymentContext = 'internal',
  onProcessingChange,
}) {
  const stripe = useStripe();
  const elements = useElements();
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState(null);
  const [isElementReady, setIsElementReady] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);

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

    if (isProcessing) {
      return;
    }

    if (!stripe || !elements) {
      return;
    }

    if (!isMountedRef.current) return;
    setIsProcessing(true);
    onProcessingChange?.(true);
    setPaymentError(null);

    try {
      const paymentElement = elements.getElement(PaymentElement);
      if (!paymentElement) {
        if (isMountedRef.current) {
          setPaymentError('Payment form is still loading. Please wait a moment and try again.');
          setIsProcessing(false);
          onProcessingChange?.(false);
        }
        return;
      }

      // Confirm the payment with Stripe
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.href,
        },
        redirect: 'if_required',
      });

      if (error) {
        if (isMountedRef.current) {
          setPaymentError(error.message);
          setIsProcessing(false);
          onProcessingChange?.(false);
        }
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
      if (isMountedRef.current) {
        setPaymentError(err.message || 'An unexpected error occurred');
      }
    } finally {
      if (isMountedRef.current) {
        setIsProcessing(false);
      }
      onProcessingChange?.(false);
    }
  };

  const paymentElementOptions = paymentContext === 'portal'
    ? {
        layout: 'tabs',
      }
    : {
        layout: 'tabs',
        paymentMethodOrder: ['card', 'us_bank_account'],
        wallets: {
          applePay: 'never',
          googlePay: 'never',
        },
      };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement
        options={paymentElementOptions}
        onReady={() => setIsElementReady(true)}
        onLoaderStart={() => setIsElementReady(false)}
        onLoaderror={(event) => {
          setPaymentError(event?.error?.message || 'Unable to load payment form.');
          setIsElementReady(false);
        }}
      />

      {paymentError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{paymentError}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 pt-4">
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
          disabled={isProcessing || !stripe || !elements || !isElementReady}
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
export default function PayInvoiceModal({
  isOpen,
  onClose,
  invoice,
  opportunity,
  fullAmountOnly = false,
  onSuccess,
}) {
  const [step, setStep] = useState(1); // 1: Amount, 2: Payment, 3: Success
  const [amountType, setAmountType] = useState('full');
  const [customAmount, setCustomAmount] = useState('');
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [clientSecret, setClientSecret] = useState(null);
  const [paymentResult, setPaymentResult] = useState(null);
  const [error, setError] = useState(null);
  const [isPaymentProcessing, setIsPaymentProcessing] = useState(false);
  const paymentContext = fullAmountOnly ? 'portal' : 'internal';

  const balanceDue = Number(invoice?.balanceDue ?? invoice?.total ?? invoice?.totalAmount ?? 0);

  // Fetch Stripe config
  const { data: stripeConfig } = useQuery({
    queryKey: ['stripeConfig'],
    queryFn: () => paymentsApi.getStripeConfig(),
    staleTime: Infinity,
    enabled: isOpen,
  });

  const stripePromise = useMemo(
    () => getStripePromise(stripeConfig?.publishableKey),
    [stripeConfig?.publishableKey]
  );

  // Create payment intent mutation
  const createIntentMutation = useMutation({
    mutationFn: ({ invoiceId, amount }) => paymentsApi.createPaymentIntentForInvoice(invoiceId, amount, {
      context: paymentContext,
    }),
    onSuccess: (data) => {
      setClientSecret(data.clientSecret);
      setStep(2);
    },
    onError: (err) => {
      setError(err.message || 'Failed to create payment intent');
    },
  });

  // Customer portal is full amount only; job modal allows full or partial.
  useEffect(() => {
    if (fullAmountOnly) {
      setPaymentAmount(balanceDue);
      return;
    }

    if (amountType === 'partial') {
      const parsedAmount = Number(customAmount);
      setPaymentAmount(Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : 0);
      return;
    }

    setPaymentAmount(balanceDue);
  }, [amountType, balanceDue, customAmount, fullAmountOnly]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setAmountType('full');
      setCustomAmount('');
      setClientSecret(null);
      setPaymentResult(null);
      setError(null);
      setIsPaymentProcessing(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (step !== 2 && isPaymentProcessing) {
      setIsPaymentProcessing(false);
    }
  }, [step, isPaymentProcessing]);

  const handleRequestClose = () => {
    if (isPaymentProcessing) return;
    onClose?.();
  };

  if (!isOpen || !invoice) return null;

  const handleContinueToPayment = () => {
    if (!fullAmountOnly && amountType === 'partial' && !customAmount) {
      setError('Enter a partial payment amount');
      return;
    }
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
    onSuccess?.(paymentIntent);
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
        <div className="fixed inset-0 bg-black/50" onClick={handleRequestClose} />

        {/* Modal */}
        <div className="relative bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[calc(100vh-2rem)] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-200">
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
              onClick={handleRequestClose}
              disabled={isPaymentProcessing}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 sm:p-5">
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
                    <span className="font-medium">${Number(invoice.total ?? invoice.totalAmount ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Amount Paid</span>
                    <span className="font-medium text-green-600">${Number(invoice.amountPaid ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                    <span className="text-gray-700 font-medium">Balance Due</span>
                    <span className="font-bold text-red-600">${balanceDue.toLocaleString()}</span>
                  </div>
                </div>

                {/* Amount Type Selection */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-gray-700">Payment Amount</label>

                  <button
                    type="button"
                    onClick={() => setAmountType('full')}
                    className={`w-full flex items-center justify-between p-4 border-2 rounded-lg transition-colors ${
                      amountType === 'full' || fullAmountOnly
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 ${amountType === 'full' || fullAmountOnly ? 'border-green-600 bg-green-600' : 'border-gray-300'}`} />
                      <div className="text-left">
                        <span className="font-medium text-gray-900">Full Amount</span>
                        <p className="text-sm text-gray-500">Pay entire balance</p>
                      </div>
                    </div>
                    <span className="text-lg font-bold text-gray-900">${balanceDue.toLocaleString()}</span>
                  </button>

                  {!fullAmountOnly && (
                    <div
                      className={`p-4 border-2 rounded-lg transition-colors ${
                        amountType === 'partial'
                          ? 'border-panda-primary bg-panda-primary/5'
                          : 'border-gray-200 bg-white'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setAmountType('partial')}
                        className="w-full flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded-full border-2 ${amountType === 'partial' ? 'border-panda-primary bg-panda-primary' : 'border-gray-300'}`} />
                          <div className="text-left">
                            <span className="font-medium text-gray-900">Partial Amount</span>
                            <p className="text-sm text-gray-500">Collect a custom amount now</p>
                          </div>
                        </div>
                      </button>
                      {amountType === 'partial' && (
                        <div className="mt-3">
                          <input
                            type="number"
                            min="0.01"
                            max={balanceDue}
                            step="0.01"
                            value={customAmount}
                            onChange={(e) => setCustomAmount(e.target.value)}
                            placeholder="Enter amount"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                          />
                          <p className="mt-1 text-xs text-gray-500">Maximum: ${balanceDue.toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {error && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Continue Button */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleRequestClose}
                    disabled={isPaymentProcessing}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
                key={`${invoice.id}-${clientSecret}`}
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
                    paymentContext={paymentContext}
                    onSuccess={handlePaymentSuccess}
                    onCancel={() => setStep(1)}
                    onProcessingChange={setIsPaymentProcessing}
                  />

                  <p className="text-xs text-gray-500 text-center">
                    {paymentContext === 'portal'
                      ? 'Payments are securely processed by Stripe. Available methods are based on your portal checkout options.'
                      : 'Payments are securely processed by Stripe. Internal checkout only supports Credit Card and manual ACH entry.'}
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
                    ${paymentAmount.toLocaleString()} has been collected successfully.
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
