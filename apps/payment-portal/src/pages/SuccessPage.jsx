import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_BASE || 'https://bamboo.pandaadmin.com';

function SuccessPage() {
  const [searchParams] = useSearchParams();
  const [paymentDetails, setPaymentDetails] = useState(null);
  const [loading, setLoading] = useState(true);

  const linkId = searchParams.get('link');
  const invoiceId = searchParams.get('invoice');
  const paymentIntent = searchParams.get('payment_intent');

  useEffect(() => {
    async function fetchPaymentDetails() {
      try {
        if (paymentIntent) {
          const response = await fetch(`${API_BASE}/api/payments/status/${paymentIntent}`);
          const data = await response.json();
          if (data.success) {
            setPaymentDetails(data.data);
          }
        }
      } catch (err) {
        console.error('Error fetching payment details:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchPaymentDetails();
  }, [paymentIntent]);

  return (
    <div className="max-w-lg mx-auto px-4 py-16">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
        {/* Success Animation */}
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce-slow">
          <svg className="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Successful!</h1>
        <p className="text-gray-600 mb-6">
          Thank you for your payment. A confirmation email has been sent to your email address.
        </p>

        {loading ? (
          <div className="animate-pulse mb-6">
            <div className="h-20 bg-gray-100 rounded-lg"></div>
          </div>
        ) : paymentDetails ? (
          <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Amount Paid</p>
                <p className="font-semibold text-lg text-green-600">
                  ${(paymentDetails.amount / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Payment Method</p>
                <p className="font-medium capitalize">
                  {paymentDetails.paymentMethod?.card?.brand || 'Card'} ****{paymentDetails.paymentMethod?.card?.last4 || '****'}
                </p>
              </div>
              {paymentDetails.receiptUrl && (
                <div className="col-span-2">
                  <a
                    href={paymentDetails.receiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-panda-primary hover:underline text-sm inline-flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    View Receipt
                  </a>
                </div>
              )}
            </div>
          </div>
        ) : null}

        <div className="space-y-3">
          <Link
            to="/"
            className="block w-full bg-gradient-to-r from-panda-primary to-panda-secondary text-white font-semibold py-3 px-6 rounded-lg hover:opacity-90 transition-opacity"
          >
            Back to Home
          </Link>

          {invoiceId && (
            <Link
              to={`/invoice/${invoiceId}`}
              className="block w-full bg-white text-gray-700 font-medium py-3 px-6 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              View Invoice
            </Link>
          )}
        </div>

        <div className="mt-8 pt-6 border-t border-gray-100">
          <p className="text-sm text-gray-500">
            Questions about your payment?
          </p>
          <a
            href="tel:+12408016665"
            className="text-panda-primary hover:underline font-medium"
          >
            Call (240) 801-6665
          </a>
        </div>
      </div>

      {/* Confetti Effect */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {[...Array(50)].map((_, i) => (
          <div
            key={i}
            className="confetti"
            style={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              backgroundColor: ['#667eea', '#764ba2', '#f59e0b', '#10b981', '#ef4444'][Math.floor(Math.random() * 5)],
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default SuccessPage;
