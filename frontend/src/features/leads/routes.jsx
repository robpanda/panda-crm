import { Route } from 'react-router-dom';
import LeadsDashboard from '../../pages/LeadsDashboard';
import LeadList from '../../pages/LeadList';
import LeadDetail from '../../pages/LeadDetail';
import LeadWizard from '../../pages/LeadWizard';

export function renderLeadRoutes() {
  return (
    <>
      <Route path="leads" element={<LeadsDashboard />} />
      <Route path="leads/list" element={<LeadList />} />
      <Route path="leads/new" element={<LeadWizard />} />
      <Route path="leads/:id" element={<LeadDetail />} />
      <Route path="leads/:id/wizard" element={<LeadWizard />} />
    </>
  );
}
