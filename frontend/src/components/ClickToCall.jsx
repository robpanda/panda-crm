import { useState, useCallback } from 'react';
import { Phone, PhoneCall, PhoneOff, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useRingCentral } from '../context/RingCentralContext';
import { ringCentralApi } from '../services/api';

/**
 * ClickToCall Component
 *
 * A reusable button component that initiates calls via RingCentral.
 * Uses the RingCentral Embeddable widget for WebRTC calls or RingOut for desk phones.
 *
 * Props:
 * - phoneNumber: The phone number to call (required)
 * - contactName: Display name for the contact (optional)
 * - recordType: Type of record (contact, lead, account, opportunity) (optional)
 * - recordId: ID of the linked record (optional)
 * - variant: 'icon' | 'button' | 'compact' (default: 'icon')
 * - className: Additional CSS classes (optional)
 * - onCallStart: Callback when call starts (optional)
 * - onCallEnd: Callback when call ends (optional)
 * - useRingOut: Use RingOut (desk phone) instead of WebRTC (default: false)
 */
export default function ClickToCall({
  phoneNumber,
  contactName,
  recordType,
  recordId,
  variant = 'icon',
  className = '',
  onCallStart,
  onCallEnd,
  useRingOut = false,
}) {
  const { clickToCall, isReady, currentCall, hasAppConnect } = useRingCentral();
  const [callStatus, setCallStatus] = useState('idle'); // idle, calling, connected, error
  const [ringOutId, setRingOutId] = useState(null);
  const [error, setError] = useState(null);

  // Format phone number for display
  const formatPhoneDisplay = (phone) => {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }
    return phone;
  };

  // Handle click to call
  const handleCall = useCallback(async () => {
    if (!phoneNumber || callStatus === 'calling') return;

    setError(null);
    setCallStatus('calling');

    try {
      if (useRingOut) {
        // Use RingOut API (desk phone)
        const response = await ringCentralApi.initiateCall({
          to: phoneNumber,
          playPrompt: true,
        });

        if (response.success && response.ringout) {
          setRingOutId(response.ringout.id);
          setCallStatus('connected');

          // Link call to record if provided
          if (recordType && recordId) {
            try {
              await ringCentralApi.linkCallToRecord(response.ringout.id, {
                recordType,
                recordId,
              });
            } catch (linkError) {
              console.warn('Failed to link call to record:', linkError);
            }
          }

          onCallStart?.({
            ringoutId: response.ringout.id,
            phoneNumber,
            contactName,
          });
        } else {
          throw new Error(response.error || 'Failed to initiate call');
        }
      } else {
        // Use RingCentral Embeddable widget (WebRTC)
        const success = await clickToCall(phoneNumber, true);

        if (success) {
          setCallStatus('connected');
          onCallStart?.({
            phoneNumber,
            contactName,
            method: hasAppConnect ? 'appConnect' : 'embeddable',
          });
        } else {
          throw new Error('Failed to initiate call');
        }
      }
    } catch (err) {
      console.error('Click to call error:', err);
      setError(err.message || 'Failed to start call');
      setCallStatus('error');

      // Reset after 3 seconds
      setTimeout(() => {
        setCallStatus('idle');
        setError(null);
      }, 3000);
    }
  }, [phoneNumber, callStatus, useRingOut, clickToCall, hasAppConnect, recordType, recordId, contactName, onCallStart]);

  // Handle cancel RingOut call
  const handleCancelCall = useCallback(async () => {
    if (!ringOutId) return;

    try {
      await ringCentralApi.cancelRingOut(ringOutId);
      setCallStatus('idle');
      setRingOutId(null);
      onCallEnd?.({ cancelled: true });
    } catch (err) {
      console.error('Failed to cancel call:', err);
    }
  }, [ringOutId, onCallEnd]);

  // Determine if we're in an active call
  const isInCall = callStatus === 'connected' || currentCall;

  // Get status icon
  const getStatusIcon = () => {
    switch (callStatus) {
      case 'calling':
        return <Loader2 className="w-4 h-4 animate-spin" />;
      case 'connected':
        return <PhoneCall className="w-4 h-4 text-green-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Phone className="w-4 h-4" />;
    }
  };

  // Get button classes based on variant and status
  const getButtonClasses = () => {
    const baseClasses = 'inline-flex items-center justify-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-panda-primary focus:ring-offset-2';

    const statusClasses = {
      idle: 'text-gray-600 hover:text-panda-primary hover:bg-panda-primary/10',
      calling: 'text-yellow-600 bg-yellow-50',
      connected: 'text-green-600 bg-green-50',
      error: 'text-red-600 bg-red-50',
    };

    const variantClasses = {
      icon: 'p-2 rounded-full',
      button: 'px-4 py-2 rounded-lg gap-2 font-medium',
      compact: 'px-2 py-1 rounded-md gap-1 text-sm',
    };

    return `${baseClasses} ${statusClasses[callStatus]} ${variantClasses[variant]} ${className}`;
  };

  // Render based on variant
  if (variant === 'icon') {
    return (
      <button
        onClick={isInCall ? handleCancelCall : handleCall}
        className={getButtonClasses()}
        title={isInCall ? 'End call' : `Call ${contactName || formatPhoneDisplay(phoneNumber)}`}
        disabled={!phoneNumber || (!isReady && !useRingOut)}
      >
        {isInCall ? (
          <PhoneOff className="w-4 h-4" />
        ) : (
          getStatusIcon()
        )}
      </button>
    );
  }

  if (variant === 'compact') {
    return (
      <button
        onClick={isInCall ? handleCancelCall : handleCall}
        className={getButtonClasses()}
        disabled={!phoneNumber || (!isReady && !useRingOut)}
      >
        {getStatusIcon()}
        <span>{formatPhoneDisplay(phoneNumber)}</span>
      </button>
    );
  }

  // Full button variant
  return (
    <div className="inline-flex flex-col">
      <button
        onClick={isInCall ? handleCancelCall : handleCall}
        className={getButtonClasses()}
        disabled={!phoneNumber || (!isReady && !useRingOut)}
      >
        {isInCall ? (
          <>
            <PhoneOff className="w-4 h-4" />
            <span>End Call</span>
          </>
        ) : (
          <>
            {getStatusIcon()}
            <span>
              {callStatus === 'calling' ? 'Calling...' :
               callStatus === 'error' ? 'Call Failed' :
               `Call ${contactName || formatPhoneDisplay(phoneNumber)}`}
            </span>
          </>
        )}
      </button>
      {error && (
        <span className="mt-1 text-xs text-red-500">{error}</span>
      )}
    </div>
  );
}

/**
 * PhoneLink Component
 *
 * A simple phone number display that can initiate calls on click.
 * More subtle than ClickToCall button - appears as a regular phone number link.
 */
export function PhoneLink({
  phoneNumber,
  contactName,
  recordType,
  recordId,
  className = ''
}) {
  const { clickToCall, isReady } = useRingCentral();
  const [calling, setCalling] = useState(false);

  const formatPhone = (phone) => {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }
    return phone;
  };

  const handleClick = async (e) => {
    e.preventDefault();
    if (!phoneNumber || calling) return;

    setCalling(true);
    try {
      await clickToCall(phoneNumber, true);
    } catch (err) {
      console.error('Call failed:', err);
    } finally {
      setTimeout(() => setCalling(false), 2000);
    }
  };

  if (!phoneNumber) return null;

  return (
    <a
      href={`tel:${phoneNumber}`}
      onClick={handleClick}
      className={`inline-flex items-center gap-1 text-panda-primary hover:text-panda-secondary transition-colors ${className}`}
      title={isReady ? 'Click to call' : 'Phone system not ready'}
    >
      {calling ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <Phone className="w-3 h-3" />
      )}
      <span>{formatPhone(phoneNumber)}</span>
    </a>
  );
}

/**
 * CallButton Component
 *
 * A prominent call button for detail pages.
 * Shows call status and handles RingOut flows.
 */
export function CallButton({
  phoneNumber,
  contactName,
  recordType,
  recordId,
  size = 'md',
  fullWidth = false,
}) {
  const { clickToCall, isReady, currentCall } = useRingCentral();
  const [status, setStatus] = useState('idle');

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg',
  };

  const handleCall = async () => {
    if (!phoneNumber || status === 'calling') return;

    setStatus('calling');
    try {
      const success = await clickToCall(phoneNumber, true);
      if (success) {
        setStatus('connected');
      } else {
        setStatus('error');
        setTimeout(() => setStatus('idle'), 3000);
      }
    } catch (err) {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  const isActive = status === 'connected' || currentCall;

  return (
    <button
      onClick={handleCall}
      disabled={!phoneNumber || !isReady || status === 'calling'}
      className={`
        inline-flex items-center justify-center gap-2 font-medium rounded-lg
        transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2
        ${sizeClasses[size]}
        ${fullWidth ? 'w-full' : ''}
        ${isActive
          ? 'bg-green-500 text-white hover:bg-green-600 focus:ring-green-500'
          : status === 'error'
          ? 'bg-red-500 text-white focus:ring-red-500'
          : 'bg-panda-primary text-white hover:bg-panda-secondary focus:ring-panda-primary'
        }
        disabled:opacity-50 disabled:cursor-not-allowed
      `}
    >
      {status === 'calling' ? (
        <>
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Calling...</span>
        </>
      ) : isActive ? (
        <>
          <PhoneCall className="w-5 h-5" />
          <span>On Call</span>
        </>
      ) : status === 'error' ? (
        <>
          <XCircle className="w-5 h-5" />
          <span>Call Failed</span>
        </>
      ) : (
        <>
          <Phone className="w-5 h-5" />
          <span>Call {contactName || 'Now'}</span>
        </>
      )}
    </button>
  );
}
