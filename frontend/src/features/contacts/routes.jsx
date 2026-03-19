import { Route } from 'react-router-dom';
import ContactsDashboard from '../../pages/ContactsDashboard';
import ContactList from '../../pages/ContactList';
import ContactDetail from '../../pages/ContactDetail';

export function renderContactRoutes() {
  return (
    <>
      <Route path="contacts" element={<ContactsDashboard />} />
      <Route path="contacts/list" element={<ContactList />} />
      <Route path="contacts/new" element={<ContactDetail />} />
      <Route path="contacts/:id" element={<ContactDetail />} />
    </>
  );
}
