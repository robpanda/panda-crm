import { Route } from 'react-router-dom';
import Support from '../../pages/Support';
import SupportTicketDetail from '../../pages/SupportTicketDetail';

export function renderSupportRoutes() {
  return (
    <>
      <Route path="support" element={<Support />} />
      <Route path="support/:id" element={<SupportTicketDetail />} />
    </>
  );
}
