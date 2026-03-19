import { lazy } from 'react';
import { Route } from 'react-router-dom';
import { renderLazyRoute } from '../../routes/shared';

const CustomerPortal = lazy(() => import('../../pages/CustomerPortal'));
const PMPortal = lazy(() => import('../../pages/PMPortal'));
const SubcontractorPortal = lazy(() => import('../../pages/SubcontractorPortal'));

export function renderPublicPortalRoutes() {
  return (
    <>
      <Route path="/portal/job/:jobId" element={renderLazyRoute(CustomerPortal, 'Loading customer portal...')} />
      <Route path="/portal/:token" element={renderLazyRoute(CustomerPortal, 'Loading customer portal...')} />
      <Route path="/contractor-portal/:token" element={renderLazyRoute(SubcontractorPortal, 'Loading contractor portal...')} />
    </>
  );
}

export function renderProtectedPortalRoutes() {
  return <Route path="pm-portal" element={renderLazyRoute(PMPortal, 'Loading PM portal...')} />;
}
