import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import PaymentPage from './pages/PaymentPage';
import InvoicePage from './pages/InvoicePage';
import SuccessPage from './pages/SuccessPage';
import Header from './components/Header';
import Footer from './components/Footer';

// Initialize Stripe with your publishable key
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_live_REPLACE');

const appearance = {
  theme: 'stripe',
  variables: {
    colorPrimary: '#2563eb',
    colorBackground: '#ffffff',
    colorText: '#1f2937',
    colorDanger: '#ef4444',
    fontFamily: 'Inter, system-ui, sans-serif',
    spacingUnit: '4px',
    borderRadius: '8px',
  },
  rules: {
    '.Input': {
      border: '1px solid #e5e7eb',
      boxShadow: 'none',
    },
    '.Input:focus': {
      border: '1px solid #3b82f6',
      boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.1)',
    },
    '.Label': {
      fontWeight: '500',
      color: '#374151',
    },
  },
};

function App() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />
      <main className="flex-grow">
        <Elements stripe={stripePromise} options={{ appearance }}>
          <Routes>
            <Route path="/pay/:linkId" element={<PaymentPage />} />
            <Route path="/invoice/:invoiceId" element={<InvoicePage />} />
            <Route path="/success" element={<SuccessPage />} />
            <Route path="/" element={<LandingPage />} />
          </Routes>
        </Elements>
      </main>
      <Footer />
    </div>
  );
}

function LandingPage() {
  return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center">
      <div className="mb-8">
        <svg className="w-20 h-20 mx-auto text-panda-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      </div>
      <h1 className="text-3xl font-bold text-gray-900 mb-4">
        Panda Exteriors Payment Portal
      </h1>
      <p className="text-gray-600 mb-8">
        Use the payment link provided by your project manager to make a secure payment.
      </p>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <p className="text-sm text-gray-500">
          Need help? Contact us at{' '}
          <a href="tel:+12408016665" className="text-panda-primary hover:underline">
            (240) 801-6665
          </a>
        </p>
      </div>
    </div>
  );
}

export default App;
