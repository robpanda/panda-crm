import { describe, expect, it } from 'vitest';
import { resolveReportRowLink } from '../reportRowLinks';

describe('report row links', () => {
  it('links job number cells to the job detail page for job reports', () => {
    const href = resolveReportRowLink(
      'jobs',
      {
        id: 'job-db-123',
        jobId: 'J-1001',
      },
      {
        key: 'jobId',
        label: 'Job Number',
      },
    );

    expect(href).toBe('/jobs/job-db-123');
  });

  it('links last name cells to the job detail page for job reports', () => {
    const href = resolveReportRowLink(
      'jobs',
      {
        id: 'job-db-123',
        lastName: 'Smith',
      },
      {
        key: 'lastName',
        label: 'Last Name',
      },
    );

    expect(href).toBe('/jobs/job-db-123');
  });

  it('links last name cells to the lead detail page for lead reports', () => {
    const href = resolveReportRowLink(
      'leads',
      {
        id: 'lead-db-321',
        lastName: 'Garcia',
      },
      {
        key: 'lastName',
        label: 'Last Name',
      },
    );

    expect(href).toBe('/leads/lead-db-321');
  });

  it('links job reference cells to related jobs for non-job reports when opportunityId exists', () => {
    const href = resolveReportRowLink(
      'commissions',
      {
        id: 'commission-1',
        opportunityId: 'job-db-456',
        jobId: 'J-2002',
      },
      {
        key: 'jobId',
        label: 'Job Number',
      },
    );

    expect(href).toBe('/jobs/job-db-456');
  });

  it('links last name cells only when a safe route target exists for non-job reports', () => {
    const href = resolveReportRowLink(
      'commissions',
      {
        id: 'commission-1',
        opportunityId: 'job-db-456',
        lastName: 'Taylor',
      },
      {
        key: 'lastName',
        label: 'Last Name',
      },
    );

    expect(href).toBe('/jobs/job-db-456');
  });

  it('returns null when there is no safe target id for the row', () => {
    const jobHref = resolveReportRowLink(
      'jobs',
      {
        jobId: 'J-1001',
      },
      {
        key: 'jobId',
        label: 'Job Number',
      },
    );

    const lastNameHref = resolveReportRowLink(
      'commissions',
      {
        lastName: 'Taylor',
      },
      {
        key: 'lastName',
        label: 'Last Name',
      },
    );

    expect(jobHref).toBeNull();
    expect(lastNameHref).toBeNull();
  });
});
