import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { ringCentralApi } from '../services/api';

const RingCentralContext = createContext(null);

// RingCentral Voice App credentials
const RC_CLIENT_ID = '9SphzQfJPE1fyyeZUL0eIr';
const RC_SERVER = 'https://platform.ringcentral.com';

// RingCentral Embeddable configuration - Client ID MUST be in URL for production mode
const RC_EMBEDDABLE_URL = `https://apps.ringcentral.com/integration/ringcentral-embeddable/latest/adapter.js?clientId=${RC_CLIENT_ID}&appServer=${encodeURIComponent(RC_SERVER)}`;

export function RingCentralProvider({ children }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentCall, setCurrentCall] = useState(null);
  const [callHistory, setCallHistory] = useState([]);
  const [linkedRecord, setLinkedRecord] = useState(null); // Track which record the call is linked to

  // Use ref for currentCall in event handler to avoid stale closure
  const currentCallRef = useRef(null);
  const linkedRecordRef = useRef(null);

  useEffect(() => {
    currentCallRef.current = currentCall;
  }, [currentCall]);

  useEffect(() => {
    linkedRecordRef.current = linkedRecord;
  }, [linkedRecord]);

  // Load RingCentral widget on demand (not automatically)
  const loadWidget = useCallback(() => {
    // Check if already loaded
    if (window.RCAdapter) {
      setIsLoaded(true);
      setIsReady(true);
      // Show the widget if it was closed
      window.RCAdapter.setClosed(false);
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      // Create and inject the script
      const script = document.createElement('script');
      script.src = RC_EMBEDDABLE_URL;
      script.async = true;

      // Configure the adapter before loading
      window.RCAdapterConfig = {
        clientId: RC_CLIENT_ID,
        appServer: RC_SERVER,
        appName: 'Panda CRM',
        appVersion: '1.0.0',
        defaultDirection: 'right',
        enableMinimize: true,
        minimized: false,
        enableClose: true,
        closed: false, // Open immediately when loaded on demand
        enableAnalytics: false,
        enableCall: true,
        enableSMS: false,
        enableMeeting: false,
        enableGlip: false,
        disableGlip: true,
        disableMeeting: true,
        disableContacts: false,
        disableCallHistory: false,
        disableDemoMessage: true, // Remove "FOR DEMO PURPOSES" banner
        zIndex: 1000,
        styles: {
          primaryColor: '#667eea',
          secondaryColor: '#764ba2',
        },
      };

      script.onload = () => {
        setIsLoaded(true);
        const checkReady = setInterval(() => {
          if (window.RCAdapter) {
            clearInterval(checkReady);
            setIsReady(true);
            console.log('RingCentral Embeddable loaded successfully');
            resolve();
          }
        }, 100);

        setTimeout(() => {
          clearInterval(checkReady);
          if (!window.RCAdapter) {
            console.warn('RingCentral Embeddable failed to initialize');
            reject(new Error('RingCentral failed to initialize'));
          }
        }, 10000);
      };

      script.onerror = () => {
        console.error('Failed to load RingCentral Embeddable');
        reject(new Error('Failed to load RingCentral'));
      };

      document.head.appendChild(script);
    });
  }, []);

  /**
   * Helper to extract phone number string from RingCentral's phone object format
   * RingCentral Embeddable can return phone numbers as objects like {phoneNumber: '+19175698563'}
   * or as plain strings. This helper handles both cases.
   */
  const extractPhoneNumber = (phone) => {
    if (!phone) return null;
    if (typeof phone === 'string') return phone;
    if (typeof phone === 'object' && phone.phoneNumber) return phone.phoneNumber;
    return null;
  };

  /**
   * Auto-log call to backend when it ends
   * This creates an Activity record linked to the Lead/Contact/Opportunity
   */
  const logCallToBackend = useCallback(async (callData) => {
    try {
      const linked = linkedRecordRef.current;

      // Determine phone number (the other party)
      // RingCentral may return phone as object {phoneNumber: '...'} or string
      const rawPhone = callData.direction === 'inbound'
        ? callData.from
        : callData.to;
      const phoneNumber = extractPhoneNumber(rawPhone);

      // If no linked record, try to find one by phone number
      let contactId = linked?.contactId;
      let contactType = linked?.contactType;
      let opportunityId = linked?.opportunityId;
      let leadId = linked?.leadId;

      if (!contactId && !leadId && phoneNumber) {
        try {
          const matchResult = await ringCentralApi.findContactByPhone(phoneNumber);
          if (matchResult.contacts && matchResult.contacts.length > 0) {
            const match = matchResult.contacts[0];
            if (match.type === 'Lead') {
              leadId = match.id;
              contactType = 'Lead';
            } else if (match.type === 'Contact') {
              contactId = match.id;
              contactType = 'Contact';
            }
          }
        } catch (err) {
          console.warn('Could not find contact for phone:', phoneNumber, err);
        }
      }

      // Create call log entry - extract phone strings from RingCentral object format
      const logData = {
        contactId: contactId || leadId,
        contactType: contactType || (leadId ? 'Lead' : contactId ? 'Contact' : null),
        direction: callData.direction || 'outbound',
        fromNumber: extractPhoneNumber(callData.from),
        toNumber: extractPhoneNumber(callData.to),
        startTime: callData.startTime?.toISOString() || new Date().toISOString(),
        duration: callData.duration || 0,
        result: callData.result || (callData.duration > 0 ? 'completed' : 'no_answer'),
        opportunityId: opportunityId,
        rcCallId: callData.sessionId || callData.id,
      };

      console.log('Logging call to backend:', logData);

      const result = await ringCentralApi.createCallLog(logData);
      console.log('Call logged successfully:', result);

      return result;
    } catch (error) {
      console.error('Failed to auto-log call:', error);
      // Don't throw - we don't want to break the UI if logging fails
      return null;
    }
  }, []);

  // Listen for RingCentral events
  useEffect(() => {
    const handleMessage = async (event) => {
      if (!event.data || !event.data.type) return;

      const { type, ...data } = event.data;

      switch (type) {
        case 'rc-login-status-notify':
          setIsLoggedIn(data.loggedIn);
          break;

        case 'rc-call-ring-notify':
          // Incoming call - try to look up the caller
          // RingCentral may return from as object {phoneNumber: '...'} or string
          const rawIncomingNumber = data.call?.from;
          const incomingNumber = typeof rawIncomingNumber === 'object' && rawIncomingNumber?.phoneNumber
            ? rawIncomingNumber.phoneNumber
            : rawIncomingNumber;
          let matchedContact = null;

          if (incomingNumber) {
            try {
              const matchResult = await ringCentralApi.findContactByPhone(incomingNumber);
              if (matchResult.contacts && matchResult.contacts.length > 0) {
                matchedContact = matchResult.contacts[0];
                console.log('Incoming call matched to:', matchedContact);
              }
            } catch (err) {
              console.warn('Could not look up incoming caller:', err);
            }
          }

          setCurrentCall({
            type: 'inbound',
            direction: 'inbound',
            from: data.call?.from,
            to: data.call?.to,
            status: 'ringing',
            startTime: new Date(),
            sessionId: data.call?.sessionId,
            matchedContact,
          });
          break;

        case 'rc-call-start-notify':
          // Call started (connected)
          setCurrentCall(prev => ({
            ...prev,
            status: 'connected',
            connectedTime: new Date(),
          }));
          break;

        case 'rc-call-end-notify': {
          // Call ended - add to history and AUTO-LOG to backend
          const endedCall = currentCallRef.current;
          if (endedCall) {
            const completedCall = {
              ...endedCall,
              status: 'ended',
              endTime: new Date(),
              duration: data.call?.duration || 0,
              result: data.call?.result || (data.call?.duration > 0 ? 'completed' : 'missed'),
            };

            // Add to local history
            setCallHistory(prev => [completedCall, ...prev].slice(0, 50));

            // AUTO-LOG to backend
            logCallToBackend(completedCall);
          }
          setCurrentCall(null);
          // Clear linked record after call ends
          setLinkedRecord(null);
          break;
        }

        case 'rc-active-call-notify':
          // Active call update
          if (data.call) {
            setCurrentCall(prev => ({
              ...prev,
              type: data.call.direction,
              direction: data.call.direction,
              from: data.call.from,
              to: data.call.to,
              status: data.call.telephonyStatus,
              sessionId: data.call.sessionId,
            }));
          }
          break;

        default:
          // Log other events for debugging if needed
          if (type.startsWith('rc-')) {
            console.debug('RingCentral event:', type, data);
          }
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [logCallToBackend]);

  /**
   * Click-to-dial function - loads widget and initiates call
   * @param {string} phoneNumber - The phone number to call
   * @param {boolean} startCall - Whether to start the call immediately
   * @param {object} recordInfo - Optional record to link the call to
   * @param {string} recordInfo.contactId - Contact ID
   * @param {string} recordInfo.contactType - 'Contact' or 'Lead'
   * @param {string} recordInfo.leadId - Lead ID
   * @param {string} recordInfo.opportunityId - Opportunity ID
   */
  const clickToCall = useCallback(async (phoneNumber, startCall = true, recordInfo = null) => {
    // Clean the phone number first
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    if (!cleanNumber) {
      console.warn('Invalid phone number');
      return false;
    }

    // Format with country code if needed
    const formattedNumber = cleanNumber.length === 10 ? `+1${cleanNumber}` : `+${cleanNumber}`;

    // Store the linked record for auto-logging
    if (recordInfo) {
      setLinkedRecord(recordInfo);
    }

    try {
      // Load widget if not already loaded
      if (!window.RCAdapter) {
        console.log('Loading RingCentral widget for call...');
        await loadWidget();
      }

      window.RCAdapter.clickToCall(formattedNumber, startCall);
      return true;
    } catch (error) {
      console.error('Error initiating call:', error);

      // Fallback: open in RingCentral web app
      window.open(`https://app.ringcentral.com/phone/dialer?phoneNumber=${encodeURIComponent(formattedNumber)}`, '_blank');
      return true;
    }
  }, [loadWidget]);

  // Minimize/maximize the widget
  const setMinimized = useCallback((minimized) => {
    if (!isReady || !window.RCAdapter) return;
    window.RCAdapter.setMinimized(minimized);
  }, [isReady]);

  // Show/hide the widget
  const setVisible = useCallback((visible) => {
    if (!isReady || !window.RCAdapter) return;
    window.RCAdapter.setClosed(!visible);
  }, [isReady]);

  // Open widget in popup window
  const openPopup = useCallback(() => {
    if (!isReady || !window.RCAdapter) return;
    window.RCAdapter.popupWindow();
  }, [isReady]);

  // Show alert message in widget
  const showAlert = useCallback((message, level = 'info', ttl = 5000) => {
    if (!isReady || !window.RCAdapter) return;
    window.RCAdapter.alertMessage({
      message,
      level, // 'info', 'warning', 'danger'
      ttl,
    });
  }, [isReady]);

  // Logout from RingCentral
  const logout = useCallback(() => {
    if (window.RCAdapter) {
      // RingCentral Embeddable uses postMessage for logout, not a direct method
      // Send logout command via postMessage
      const rcFrame = document.querySelector('iframe[src*="ringcentral"]');
      if (rcFrame && rcFrame.contentWindow) {
        rcFrame.contentWindow.postMessage({
          type: 'rc-adapter-logout',
        }, '*');
      }
      // Also try closing and reopening the widget to force logout
      window.RCAdapter.setClosed(true);
      setIsLoggedIn(false);
      console.log('Logged out from RingCentral');
    }
  }, []);

  // Manually set linked record (for when call is initiated from a specific page)
  const setCallLinkedRecord = useCallback((recordInfo) => {
    setLinkedRecord(recordInfo);
  }, []);

  const value = {
    // State
    isLoaded,
    isReady,
    isLoggedIn,
    currentCall,
    callHistory,
    linkedRecord,
    // Actions
    loadWidget,
    clickToCall,
    setMinimized,
    setVisible,
    openPopup,
    showAlert,
    logout,
    setCallLinkedRecord,
  };

  return (
    <RingCentralContext.Provider value={value}>
      {children}
    </RingCentralContext.Provider>
  );
}

export function useRingCentral() {
  const context = useContext(RingCentralContext);
  if (!context) {
    throw new Error('useRingCentral must be used within a RingCentralProvider');
  }
  return context;
}

export default RingCentralContext;
