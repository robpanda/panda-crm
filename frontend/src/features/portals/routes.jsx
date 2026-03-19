import { Route } from 'react-router-dom';
import CustomerPortal from '../../pages/CustomerPortal';
import PMPortal from '../../pages/PMPortal';
import SubcontractorPortal from '../../pages/SubcontractorPortal';

export function renderPublicPortalRoutes() {
  return (
    <>
      <Route path="/portal/job/:jobId" element={<CustomerPortal />} />
      <Route path="/portal/:token" element={<CustomerPortal />} />
      <Route path="/contractor-portal/:token" element={<SubcontractorPortal />} />
    </>
  );
}

export function renderProtectedPortalRoutes() {
  return <Route path="pm-portal" element={<PMPortal />} />;
}
