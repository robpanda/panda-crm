import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const RingCentralContext = createContext(null);

// RingCentral Embeddable configuration
const RC_EMBEDDABLE_URL = 'https://apps.ringcentral.com/integration/ringcentral-embeddable/latest/adapter.js';

// RingCentral Voice App credentials
const RC_CLIENT_ID = '9SphzQfJPE1fyyeZUL0eIr';
const RC_SERVER = 'https://platform.ringcentral.com';

export function RingCentralProvider({ children }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentCall, setCurrentCall] = useState(null);
  const [callHistory, setCallHistory] = useState([]);

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

  // Listen for RingCentral events
  useEffect(() => {
    const handleMessage = (event) => {
      if (!event.data || !event.data.type) return;

      const { type, ...data } = event.data;

      switch (type) {
        case 'rc-login-status-notify':
          setIsLoggedIn(data.loggedIn);
          break;

        case 'rc-call-ring-notify':
          // Incoming call
          setCurrentCall({
            type: 'inbound',
            direction: 'inbound',
            from: data.call?.from,
            to: data.call?.to,
            status: 'ringing',
            startTime: new Date(),
          });
          break;

        case 'rc-call-start-notify':
          // Call started
          setCurrentCall(prev => ({
            ...prev,
            status: 'connected',
            startTime: new Date(),
          }));
          break;

        case 'rc-call-end-notify':
          // Call ended - add to history
          if (currentCall) {
            setCallHistory(prev => [
              {
                ...currentCall,
                status: 'ended',
                endTime: new Date(),
                duration: data.call?.duration,
              },
              ...prev,
            ].slice(0, 50)); // Keep last 50 calls
          }
          setCurrentCall(null);
          break;

        case 'rc-active-call-notify':
          // Active call update
          if (data.call) {
            setCurrentCall({
              type: data.call.direction,
              direction: data.call.direction,
              from: data.call.from,
              to: data.call.to,
              status: data.call.telephonyStatus,
              startTime: currentCall?.startTime || new Date(),
            });
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
  }, [currentCall]);

  // Click-to-dial function - loads widget and initiates call
  const clickToCall = useCallback(async (phoneNumber, startCall = true) => {
    // Clean the phone number first
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    if (!cleanNumber) {
      console.warn('Invalid phone number');
      return false;
    }

    // Format with country code if needed
    const formattedNumber = cleanNumber.length === 10 ? `+1${cleanNumber}` : `+${cleanNumber}`;

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
      window.RCAdapter.logout();
      setIsLoggedIn(false);
      console.log('Logged out from RingCentral');
    }
  }, []);

  const value = {
    // State
    isLoaded,
    isReady,
    isLoggedIn,
    currentCall,
    callHistory,
    // Actions
    loadWidget,
    clickToCall,
    setMinimized,
    setVisible,
    openPopup,
    showAlert,
    logout,
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
