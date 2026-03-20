import { lazy } from 'react';
import { Route } from 'react-router-dom';
import { renderLazyRoute } from '../../routes/shared';

const Support = lazy(() => import('../../pages/Support'));
const SupportTicketDetail = lazy(() => import('../../pages/SupportTicketDetail'));

export function renderSupportRoutes() {
  return (
    <>
      <Route path="support" element={renderLazyRoute(Support, 'Loading support...')} />
      <Route path="support/:id" element={renderLazyRoute(SupportTicketDetail, 'Loading support ticket...')} />
    </>
  );
}
