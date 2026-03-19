import { lazy } from 'react';
import { Navigate, Route } from 'react-router-dom';
import { renderLazyRoute } from '../../routes/shared';

const JobsDashboard = lazy(() => import('../../pages/JobsDashboard'));
const OpportunityList = lazy(() => import('../../pages/OpportunityList'));
const OpportunityDetail = lazy(() => import('../../pages/OpportunityDetail'));
const OpportunityWizard = lazy(() => import('../../pages/OpportunityWizard'));
const UnapprovedJobs = lazy(() => import('../../pages/UnapprovedJobs'));

export function renderJobsRoutes() {
  return (
    <>
      <Route path="jobs" element={renderLazyRoute(JobsDashboard, 'Loading jobs dashboard...')} />
      <Route path="jobs/list" element={renderLazyRoute(OpportunityList, 'Loading jobs list...')} />
      <Route path="jobs/new" element={renderLazyRoute(OpportunityWizard, 'Loading job wizard...')} />
      <Route path="jobs/unapproved" element={renderLazyRoute(UnapprovedJobs, 'Loading unapproved jobs...')} />
      <Route path="jobs/:id" element={renderLazyRoute(OpportunityDetail, 'Loading job details...')} />
      <Route path="jobs/:id/wizard" element={renderLazyRoute(OpportunityWizard, 'Loading job wizard...')} />

      <Route path="opportunities" element={<Navigate to="/jobs" replace />} />
      <Route path="opportunities/list" element={<Navigate to="/jobs/list" replace />} />
      <Route path="opportunities/new" element={<Navigate to="/jobs/new" replace />} />
      <Route path="opportunities/:id" element={renderLazyRoute(OpportunityDetail, 'Loading job details...')} />
      <Route path="opportunities/:id/wizard" element={renderLazyRoute(OpportunityWizard, 'Loading job wizard...')} />
    </>
  );
}
