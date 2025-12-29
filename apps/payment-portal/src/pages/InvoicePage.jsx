import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

const API_BASE = import.meta.env.VITE_API_BASE || 'https://bamboo.pandaadmin.com';

function InvoicePage() {
  const { invoiceId } = useParams();
  const navigate = useNavigate();
  const stripe = useStripe();
  const elements = useElements();

  const [invoice, setInvoice] = useState(null);
  const [clientSecret, setClientSecret] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [paymentError, setPaymentError] = useState(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');

  // Fetch invoice details
  useEffect(() => {
    async function fetchInvoice() {
      try {
        const response = await fetch(`${API_BASE}/api/payments/invoices/${invoiceId}/public`);
        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error?.message || 'Invoice not found');
        }

        setInvoice(data.data);
        setPaymentAmount(data.data.balanceDue?.toString() || '');
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchInvoice();
  }, [invoiceId]);

  const handlePayNow = async () => {
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      setPaymentError('Please enter a valid amount');
      return;
    }

    if (amount > invoice.balanceDue) {
      setPaymentError(`Amount cannot exceed balance due of $${invoice.balanceDue.toFixed(2)}`);
      return;
    }

    setProcessing(true);
    setPaymentError(null);

    try {
      const response = await fetch(`${API_BASE}/api/payments/invoices/${invoiceId}/create-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      });
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to initialize payment');
      }

      setClientSecret(data.data.clientSecret);
      setShowPaymentForm(true);
    } catch (err) {
      setPaymentError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleSubmitPayment = async (e) => {
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
        return_url: `${window.location.origin}/success?invoice=${invoiceId}`,
      },
    });

    if (confirmError) {
      setPaymentError(confirmError.message);
      setProcessing(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatCurrency = (value) => {
    if (value == null) return '$0.00';
    return '$' + Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
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
          <h2 className="text-xl font-semibold text-red-800 mb-2">Invoice Not Found</h2>
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Invoice Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Invoice #{invoice?.invoiceNumber}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {invoice?.account?.name}
            </p>
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${
            invoice?.status === 'PAID'
              ? 'bg-green-100 text-green-800'
              : invoice?.status === 'OVERDUE'
              ? 'bg-red-100 text-red-800'
              : 'bg-yellow-100 text-yellow-800'
          }`}>
            {invoice?.status}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Invoice Date</p>
            <p className="font-medium">{formatDate(invoice?.invoiceDate)}</p>
          </div>
          <div>
            <p className="text-gray-500">Due Date</p>
            <p className="font-medium">{formatDate(invoice?.dueDate)}</p>
          </div>
          <div>
            <p className="text-gray-500">Total</p>
            <p className="font-medium">${invoice?.total?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          </div>
          <div>
            <p className="text-gray-500">Balance Due</p>
            <p className="font-bold text-lg text-panda-primary">
              ${invoice?.balanceDue?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>

      {/* Line Items */}
      {invoice?.lineItems?.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Line Items</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 text-gray-500 font-medium">Description</th>
                  <th className="text-right py-2 text-gray-500 font-medium">Qty</th>
                  <th className="text-right py-2 text-gray-500 font-medium">Price</th>
                  <th className="text-right py-2 text-gray-500 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems.map((item, index) => (
                  <tr key={index} className="border-b border-gray-100">
                    <td className="py-3">{item.description}</td>
                    <td className="py-3 text-right">{item.quantity}</td>
                    <td className="py-3 text-right">{formatCurrency(item.unitPrice)}</td>
                    <td className="py-3 text-right font-medium">{formatCurrency(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="3" className="py-3 text-right font-medium">Subtotal</td>
                  <td className="py-3 text-right font-medium">{formatCurrency(invoice.subtotal)}</td>
                </tr>
                {invoice.tax > 0 && (
                  <tr>
                    <td colSpan="3" className="py-2 text-right text-gray-500">Tax</td>
                    <td className="py-2 text-right">{formatCurrency(invoice.tax)}</td>
                  </tr>
                )}
                <tr className="border-t border-gray-200">
                  <td colSpan="3" className="py-3 text-right font-bold">Total</td>
                  <td className="py-3 text-right font-bold">{formatCurrency(invoice.total)}</td>
                </tr>
                {invoice.amountPaid > 0 && (
                  <tr>
                    <td colSpan="3" className="py-2 text-right text-green-600">Paid</td>
                    <td className="py-2 text-right text-green-600">-{formatCurrency(invoice.amountPaid)}</td>
                  </tr>
                )}
                <tr className="bg-gray-50">
                  <td colSpan="3" className="py-3 text-right font-bold text-lg">Balance Due</td>
                  <td className="py-3 text-right font-bold text-lg text-panda-primary">
                    {formatCurrency(invoice.balanceDue)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Payment Section */}
      {invoice?.status !== 'PAID' && invoice?.balanceDue > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          {!showPaymentForm ? (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Make a Payment</h2>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Amount
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={invoice.balanceDue}
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
                    placeholder="0.00"
                  />
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentAmount(invoice.balanceDue.toString())}
                    className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700"
                  >
                    Pay Full Balance (${invoice.balanceDue.toFixed(2)})
                  </button>
                  {invoice.balanceDue > 100 && (
                    <button
                      type="button"
                      onClick={() => setPaymentAmount((invoice.balanceDue / 2).toFixed(2))}
                      className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700"
                    >
                      Pay Half (${(invoice.balanceDue / 2).toFixed(2)})
                    </button>
                  )}
                </div>
              </div>

              {paymentError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{paymentError}</p>
                </div>
              )}

              <button
                onClick={handlePayNow}
                disabled={processing}
                className="w-full bg-gradient-to-r from-panda-primary to-panda-secondary text-white font-semibold py-3 px-6 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {processing ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Loading...
                  </>
                ) : (
                  'Continue to Payment'
                )}
              </button>
            </>
          ) : (
            <form onSubmit={handleSubmitPayment}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Payment Details</h2>
                <button
                  type="button"
                  onClick={() => {
                    setShowPaymentForm(false);
                    setClientSecret(null);
                  }}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  ← Change Amount
                </button>
              </div>

              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500">Payment Amount</p>
                <p className="text-xl font-bold text-gray-900">
                  ${parseFloat(paymentAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>

              <PaymentElement options={{ layout: 'tabs' }} />

              {paymentError && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{paymentError}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={!stripe || processing}
                className="mt-6 w-full bg-gradient-to-r from-panda-primary to-panda-secondary text-white font-semibold py-3 px-6 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
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
                    Pay ${parseFloat(paymentAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </>
                )}
              </button>

              <p className="mt-4 text-xs text-center text-gray-500">
                Your payment is processed securely by Stripe.
              </p>
            </form>
          )}
        </div>
      )}

      {/* Already Paid Message */}
      {invoice?.status === 'PAID' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <svg className="w-12 h-12 text-green-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-xl font-semibold text-green-800 mb-2">Invoice Paid</h2>
          <p className="text-green-600">This invoice has been paid in full. Thank you!</p>
        </div>
      )}
    </div>
  );
}

export default InvoicePage;
