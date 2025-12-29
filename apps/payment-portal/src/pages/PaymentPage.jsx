import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

const API_BASE = import.meta.env.VITE_API_BASE || 'https://bamboo.pandaadmin.com';

function PaymentPage() {
  const { linkId } = useParams();
  const navigate = useNavigate();
  const stripe = useStripe();
  const elements = useElements();

  const [paymentLink, setPaymentLink] = useState(null);
  const [clientSecret, setClientSecret] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [paymentError, setPaymentError] = useState(null);

  // Fetch payment link details
  useEffect(() => {
    async function fetchPaymentLink() {
      try {
        const response = await fetch(`${API_BASE}/api/payment-links/${linkId}`);
        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error?.message || 'Payment link not found');
        }

        setPaymentLink(data.data);

        // Create payment intent
        const intentResponse = await fetch(`${API_BASE}/api/payment-links/${linkId}/create-intent`, {
          method: 'POST',
        });
        const intentData = await intentResponse.json();

        if (!intentData.success) {
          throw new Error(intentData.error?.message || 'Failed to initialize payment');
        }

        setClientSecret(intentData.data.clientSecret);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchPaymentLink();
  }, [linkId]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setProcessing(true);
    setPaymentError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setPaymentError(submitError.message);
      setProcessing(false);
      return;
    }

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      clientSecret,
      confirmParams: {
        return_url: `${window.location.origin}/success?link=${linkId}`,
      },
    });

    if (confirmError) {
      setPaymentError(confirmError.message);
      setProcessing(false);
    }
    // If successful, Stripe redirects to return_url
  };

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-3/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <svg className="w-12 h-12 text-red-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h2 className="text-xl font-semibold text-red-800 mb-2">Payment Link Invalid</h2>
          <p className="text-red-600">{error}</p>
          <p className="text-sm text-gray-500 mt-4">
            Please contact Panda Exteriors at{' '}
            <a href="tel:+12408016665" className="text-panda-primary hover:underline">
              (240) 801-6665
            </a>{' '}
            for assistance.
          </p>
        </div>
      </div>
    );
  }

  if (paymentLink?.status === 'PAID') {
    return (
      <div className="max-w-lg mx-auto px-4 py-16">
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <svg className="w-12 h-12 text-green-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-xl font-semibold text-green-800 mb-2">Already Paid</h2>
          <p className="text-green-600">This payment has already been completed. Thank you!</p>
        </div>
      </div>
    );
  }

  if (paymentLink?.status === 'EXPIRED') {
    return (
      <div className="max-w-lg mx-auto px-4 py-16">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <svg className="w-12 h-12 text-yellow-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-xl font-semibold text-yellow-800 mb-2">Link Expired</h2>
          <p className="text-yellow-600">This payment link has expired.</p>
          <p className="text-sm text-gray-500 mt-4">
            Please contact your project manager for a new payment link.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      {/* Payment Details Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {paymentLink?.description || 'Payment'}
            </h2>
            {paymentLink?.invoice?.invoiceNumber && (
              <p className="text-sm text-gray-500">
                Invoice #{paymentLink.invoice.invoiceNumber}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-gray-900">
              ${paymentLink?.amount?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-sm text-gray-500">Amount Due</p>
          </div>
        </div>

        {paymentLink?.account && (
          <div className="border-t border-gray-100 pt-4 mt-4">
            <p className="text-sm text-gray-500">Project</p>
            <p className="font-medium text-gray-900">{paymentLink.account.name}</p>
          </div>
        )}
      </div>

      {/* Payment Form */}
      {clientSecret && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Details</h3>

          <PaymentElement
            options={{
              layout: 'tabs',
            }}
          />

          {paymentError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{paymentError}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={!stripe || processing}
            className="mt-6 w-full bg-gradient-to-r from-panda-primary to-panda-secondary text-white font-semibold py-3 px-6 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {processing ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Pay ${paymentLink?.amount?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </>
            )}
          </button>

          <p className="mt-4 text-xs text-center text-gray-500">
            Your payment is processed securely by Stripe. Panda Exteriors never stores your card details.
          </p>
        </form>
      )}
    </div>
  );
}

export default PaymentPage;
