import { lazy } from 'react';
import { Route } from 'react-router-dom';
import { renderLazyRoute } from '../../routes/shared';

const LeadsDashboard = lazy(() => import('../../pages/LeadsDashboard'));
const LeadList = lazy(() => import('../../pages/LeadList'));
const LeadDetail = lazy(() => import('../../pages/LeadDetail'));
const LeadWizard = lazy(() => import('../../pages/LeadWizard'));

export function renderLeadRoutes() {
  return (
    <>
      <Route path="leads" element={renderLazyRoute(LeadsDashboard, 'Loading leads dashboard...')} />
      <Route path="leads/list" element={renderLazyRoute(LeadList, 'Loading leads list...')} />
      <Route path="leads/new" element={renderLazyRoute(LeadWizard, 'Loading lead wizard...')} />
      <Route path="leads/:id" element={renderLazyRoute(LeadDetail, 'Loading lead details...')} />
      <Route path="leads/:id/wizard" element={renderLazyRoute(LeadWizard, 'Loading lead wizard...')} />
    </>
  );
}
