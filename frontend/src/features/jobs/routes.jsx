import { Navigate, Route } from 'react-router-dom';
import JobsDashboard from '../../pages/JobsDashboard';
import OpportunityList from '../../pages/OpportunityList';
import OpportunityDetail from '../../pages/OpportunityDetail';
import OpportunityWizard from '../../pages/OpportunityWizard';
import UnapprovedJobs from '../../pages/UnapprovedJobs';

export function renderJobsRoutes() {
  return (
    <>
      <Route path="jobs" element={<JobsDashboard />} />
      <Route path="jobs/list" element={<OpportunityList />} />
      <Route path="jobs/new" element={<OpportunityWizard />} />
      <Route path="jobs/unapproved" element={<UnapprovedJobs />} />
      <Route path="jobs/:id" element={<OpportunityDetail />} />
      <Route path="jobs/:id/wizard" element={<OpportunityWizard />} />

      <Route path="opportunities" element={<Navigate to="/jobs" replace />} />
      <Route path="opportunities/list" element={<Navigate to="/jobs/list" replace />} />
      <Route path="opportunities/new" element={<Navigate to="/jobs/new" replace />} />
      <Route path="opportunities/:id" element={<OpportunityDetail />} />
      <Route path="opportunities/:id/wizard" element={<OpportunityWizard />} />
    </>
  );
}
