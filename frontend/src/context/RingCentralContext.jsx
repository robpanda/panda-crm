import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const RingCentralContext = createContext(null);

// RingCentral Embeddable configuration (fallback for users without App Connect)
const RC_EMBEDDABLE_URL = 'https://apps.ringcentral.com/integration/ringcentral-embeddable/latest/adapter.js';

// App Connect configuration
const APP_CONNECT_APP_ID = 'panda_exteriors.pandaadmin';

export function RingCentralProvider({ children }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentCall, setCurrentCall] = useState(null);
  const [callHistory, setCallHistory] = useState([]);
  const [hasAppConnect, setHasAppConnect] = useState(false);

  // Check if App Connect extension is installed
  useEffect(() => {
    const checkAppConnect = () => {
      // App Connect extension injects a global object or responds to custom events
      // Check for the extension by looking for its injected elements or by sending a test message
      const appConnectDetected =
        document.querySelector('[data-ringcentral-app-connect]') ||
        window.RingCentralAppConnect ||
        document.documentElement.dataset.ringcentralAppConnect === 'true';

      if (appConnectDetected) {
        console.log('RingCentral App Connect extension detected');
        setHasAppConnect(true);
        setIsReady(true);
      }
    };

    // Check immediately and after a short delay (extension may load after page)
    checkAppConnect();
    const timer = setTimeout(checkAppConnect, 1000);

    // Listen for App Connect ready event
    const handleAppConnectReady = () => {
      console.log('RingCentral App Connect ready event received');
      setHasAppConnect(true);
      setIsReady(true);
    };

    window.addEventListener('ringcentral-app-connect-ready', handleAppConnectReady);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('ringcentral-app-connect-ready', handleAppConnectReady);
    };
  }, []);

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
        defaultDirection: 'right',
        enableMinimize: true,
        minimized: false,
        enableClose: true,
        closed: false, // Open immediately when loaded on demand
        enableAnalytics: false,
        enableCall: true,
        enableSMS: true,
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

  // DO NOT auto-load the widget - only load when user clicks to call
  useEffect(() => {
    // Listen for RingCentral events
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

  // Click-to-dial function - uses App Connect if available, otherwise loads widget
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
      // Method 1: Use App Connect if extension is installed
      if (hasAppConnect || window.RingCentralAppConnect) {
        console.log('Using RingCentral App Connect for call...');

        // App Connect uses the tel: protocol which the extension intercepts
        // Create a temporary link and click it to trigger App Connect
        const telLink = document.createElement('a');
        telLink.href = `tel:${formattedNumber}`;
        telLink.dataset.rcAppConnect = APP_CONNECT_APP_ID;
        telLink.style.display = 'none';
        document.body.appendChild(telLink);
        telLink.click();
        document.body.removeChild(telLink);

        // Also dispatch custom event for App Connect
        window.dispatchEvent(new CustomEvent('ringcentral-call-request', {
          detail: {
            phoneNumber: formattedNumber,
            appId: APP_CONNECT_APP_ID,
            action: 'call'
          }
        }));

        return true;
      }

      // Method 2: Fall back to Embeddable widget
      if (!window.RCAdapter) {
        console.log('Loading RingCentral widget for call...');
        await loadWidget();
      }

      window.RCAdapter.clickToCall(formattedNumber, startCall);
      return true;
    } catch (error) {
      console.error('Error initiating call:', error);

      // Ultimate fallback: open in RingCentral web app
      window.open(`https://app.ringcentral.com/phone/dialer?phoneNumber=${encodeURIComponent(formattedNumber)}`, '_blank');
      return true;
    }
  }, [loadWidget, hasAppConnect]);

  // Click-to-SMS function - uses App Connect if available, otherwise loads widget
  const clickToSMS = useCallback(async (phoneNumber, text = '') => {
    // Clean the phone number first
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    if (!cleanNumber) {
      console.warn('Invalid phone number');
      return false;
    }

    // Format with country code if needed
    const formattedNumber = cleanNumber.length === 10 ? `+1${cleanNumber}` : `+${cleanNumber}`;

    try {
      // Method 1: Use App Connect if extension is installed
      if (hasAppConnect || window.RingCentralAppConnect) {
        console.log('Using RingCentral App Connect for SMS...');

        // App Connect can intercept sms: protocol
        const smsLink = document.createElement('a');
        smsLink.href = text ? `sms:${formattedNumber}?body=${encodeURIComponent(text)}` : `sms:${formattedNumber}`;
        smsLink.dataset.rcAppConnect = APP_CONNECT_APP_ID;
        smsLink.style.display = 'none';
        document.body.appendChild(smsLink);
        smsLink.click();
        document.body.removeChild(smsLink);

        // Also dispatch custom event for App Connect
        window.dispatchEvent(new CustomEvent('ringcentral-sms-request', {
          detail: {
            phoneNumber: formattedNumber,
            text: text,
            appId: APP_CONNECT_APP_ID,
            action: 'sms'
          }
        }));

        return true;
      }

      // Method 2: Fall back to Embeddable widget
      if (!window.RCAdapter) {
        console.log('Loading RingCentral widget for SMS...');
        await loadWidget();
      }

      window.RCAdapter.clickToSMS(formattedNumber, text);
      return true;
    } catch (error) {
      console.error('Error opening SMS:', error);

      // Ultimate fallback: open in RingCentral web app
      window.open(`https://app.ringcentral.com/sms?to=${encodeURIComponent(formattedNumber)}`, '_blank');
      return true;
    }
  }, [loadWidget, hasAppConnect]);

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

  const value = {
    // State
    isLoaded,
    isReady,
    isLoggedIn,
    currentCall,
    callHistory,
    hasAppConnect, // Whether App Connect extension is installed
    // Actions
    loadWidget,
    clickToCall,
    clickToSMS,
    setMinimized,
    setVisible,
    openPopup,
    showAlert,
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
