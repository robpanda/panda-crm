# Jobs Issue Matrix: March 31, 2026

This matrix records confirmed Jobs failures against the rolled-back production baseline captured in [prod-baseline-20260331.md](./prod-baseline-20260331.md). These are evidence-backed issues from live production behavior and logs, not guesses from branch drift.

## Latest Verified Source Ref

Until a newer slice is deployed and verified, new Jobs repair branches must start from:

- `origin/codex/messaging-rebaseline-20260331`
- release ledger entry: [jobs-release-ledger-20260331.md](./jobs-release-ledger-20260331.md)

## Active Issues

| ID | Severity | Lane | Live route or screen | Example evidence | Current behavior | Likely owner |
| --- | --- | --- | --- | --- | --- | --- |
| `JOBS-GAF-001` | P0 | Integrations / GAF | `POST /api/integrations/measurements/gaf/order` | Job `cmneki1dz005ooujdvug6ax4m`; production 500s on March 31, 2026 | GAF order succeeds upstream, then save fails locally with a Prisma unique constraint on `measurement_reports.external_id`, returning a 500 to the UI | `services/integrations/src/services/measurementService.js` |
| `JOBS-DOCS-001` | P0 | Documents | `GET /api/documents/repository/by-job/:opportunityId` | 500s for jobs including `cmkem4pi424jxho5pou557q72`, `cmkelye0h1vwnho5p3v0841le`, and `cmmuyzzmn00k1xysm92k54yw0` | Job Documents tab fails to load repository data; logs indicate a Prisma include/select mismatch around `agreements` | `services/documents/src/routes/repository.js` and the repository query/service path it calls |
| `JOBS-OPP-001` | P1 | Opportunities / Comments | `GET /api/opportunities/:id/internal-comments` | Production returned 404 for live Jobs comment requests on March 31, 2026 | Jobs internal comments and mentions do not load reliably on the rollback baseline | `services/opportunities/src/routes/opportunities.js` and `services/opportunities/src/services/opportunityService.js` |
| `JOBS-OPP-002` | P1 | Opportunities / Comments | `GET /api/opportunities/comment-departments` | Production routed `comment-departments` through `getOpportunityDetails("comment-departments")` and returned `Opportunity not found: comment-departments` | The department list endpoint is missing or ordered incorrectly in production, so Jobs comments cannot populate department choices | `services/opportunities/src/routes/opportunities.js` |
| `JOBS-OPP-003` | P1 | Opportunities / Activity | `GET /api/opportunities/:id/activity` | Production 500 included `Value 'CHATTER_POST' not found in enum 'ActivityType'` | Job activity feed crashes on enum values the current service line does not recognize | `services/opportunities/src/services/opportunityService.js` |
| `JOBS-OPP-004` | P1 | Opportunities / Save path | `PUT /api/opportunities/:id` | Production 500 included `Unknown field stageName for select statement on model Opportunity` | Saving stage or claim-related updates can fail because the service selects a field the deployed schema does not have | `services/opportunities/src/services/opportunityService.js` |

## Operating Rules For This Matrix

1. Every new Jobs regression must be added here with exact route, exact error, and exact owning lane before a fix branch starts.
2. A deploy slice can close only one lane at a time unless the second change is required for the first lane to function.
3. No issue is considered fixed until the matching smoke item is checked on production after deploy.

## Smoke Checks For The First Slice

The first isolated repair slice is `JOBS-GAF-001`. Its minimum smoke checklist is:

- [ ] `POST /api/integrations/measurements/gaf/order` returns success for a real Job.
- [ ] Ordered GAF report remains visible in the Job after refresh.
- [ ] Polling or webhook delivery can move the report to delivered.
- [ ] Delivered report shows measurement data.
- [ ] Delivered report exposes a PDF link.
- [ ] GAF PDF is saved into Job Documents -> Files.
- [ ] Shared frontend load and Jobs detail page still render without console runtime errors.

## Current Next Lanes

- Notification delivery hardening for Jobs mentions.
- Invoice and financial regression repro plus isolated repair.
- PandaSign V2 end-to-end smoke and backend cleanup.
- Remaining opportunities activity/save-path compatibility items.
