import { Route } from 'react-router-dom';
import AccountsDashboard from '../../pages/AccountsDashboard';
import AccountList from '../../pages/AccountList';
import AccountDetail from '../../pages/AccountDetail';
import AccountWizard from '../../pages/AccountWizard';

export function renderAccountRoutes() {
  return (
    <>
      <Route path="accounts" element={<AccountsDashboard />} />
      <Route path="accounts/list" element={<AccountList />} />
      <Route path="accounts/new" element={<AccountWizard />} />
      <Route path="accounts/:id" element={<AccountDetail />} />
      <Route path="accounts/:id/wizard" element={<AccountWizard />} />
    </>
  );
}
