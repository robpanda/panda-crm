import React from 'react';
import ReactDOM from 'react-dom/client';
import PlatformProviders from './platform/PlatformProviders';
import AnalyticsApp from './analytics/AnalyticsApp';
import './index.css';

window.__BUILD_VERSION__ = window.__BUILD_VERSION__ || 'analytics-app-v1';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PlatformProviders>
      <AnalyticsApp />
    </PlatformProviders>
  </React.StrictMode>,
);
