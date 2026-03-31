# Jobs Issue Matrix: March 31, 2026

This matrix records confirmed Jobs failures and recoveries against the verified `/Volumes/ExternalSSD` release chain. These are evidence-backed items from live production behavior, logs, and verified smoke checks, not guesses from branch drift.

## Latest Verified Source Ref

The default parent for new Jobs repair branches is now:

- `origin/codex/jobs-universal-source-20260331`
- commit `fb9f785f38ecdfb5b4aa7fd45f6cbf2437b3a1c3`
- release ledger entry: [jobs-release-ledger-20260331.md](./jobs-release-ledger-20260331.md)

If a P0 must stay lane-local, start from the current live lane ref recorded in the release ledger and merge that fix back into the universal source branch immediately after verification.

## Resolved On March 31, 2026

| ID | Lane | Resolution | Verified by |
| --- | --- | --- | --- |
| `JOBS-GAF-001` | Integrations / GAF | Fixed on `codex/gaf-stabilization-20260331` at `1ac0f020ff49f4da41f4fc9bfc685faee86a2a3e` | Production deploy `23802501382`; successful live GAF retry confirmed by user |
| `JOBS-DOCS-001` | Documents / repository | Fixed on `codex/documents-repository-fix-20260331` at `215f08ac289c707d36ed41017db43855a2d69d17` | Production deploy `23803924510`; by-job repository endpoints returned 200 for previously failing jobs |
| `JOBS-OPP-001` | Opportunities / internal comments routes | Fixed on `codex/opportunities-notes-replies-fix-20260331` at `9f8111cbfc115c595a8886df55b1f814c0dfe931` | Production comment loading and posting verified in live Jobs |
| `JOBS-OPP-002` | Opportunities / comment departments route order | Fixed on `codex/opportunities-notes-replies-fix-20260331` at `9f8111cbfc115c595a8886df55b1f814c0dfe931` | Production comments UI restored with department choices loading correctly |
| `JOBS-NOTIFY-001` | Notifications / bell, email, SMS mentions | Fixed on `codex/opportunities-notes-replies-fix-20260331` at `9f8111cbfc115c595a8886df55b1f814c0dfe931` | User confirmed bell, email, and SMS mentions all worked in production |
| `JOBS-FE-001` | Frontend / internal notes visibility and threaded replies | Fixed on `codex/frontend-notes-replies-fix-20260331` at `b6469dbbe8d8a8383fb2a6c8540f466fad4a95c2` | User confirmed notes render again and threaded replies are back in production |

## Active Issues

| ID | Severity | Lane | Live route or screen | Example evidence | Current behavior | Likely owner |
| --- | --- | --- | --- | --- | --- | --- |
| `JOBS-INV-001` | P1 | Invoices / Financial | Jobs Financial tab and invoice flows | User-reported invoice regressions on March 31, 2026 after the branch-drift deploys | Financial and invoice behavior still needs a clean repro, isolated patch lane, and production smoke from the current universal baseline | `frontend/src/pages/OpportunityDetail.jsx`, invoice modal components, and `services/invoices` |
| `JOBS-PS-001` | P1 | PandaSign V2 | Jobs Documents -> PandaSign V2 preview, send, sign | User-reported PandaSign regressions on March 31, 2026 after the branch-drift deploys | Frontend direct wiring is back on the verified frontend line, but the end-to-end V2 preview/send/sign flow still needs isolated smoke and any remaining backend cleanup | `frontend/src/services/api.js`, PandaSign V2 components, and `services/documents` |
| `JOBS-OPP-003` | P1 | Opportunities / Activity | `GET /api/opportunities/:id/activity` | Production 500 included `Value 'CHATTER_POST' not found in enum 'ActivityType'` | Job activity feed crashes on enum values the current service line does not recognize | `services/opportunities/src/services/opportunityService.js` |
| `JOBS-OPP-004` | P1 | Opportunities / Save path | `PUT /api/opportunities/:id` | Production 500 included `Unknown field stageName for select statement on model Opportunity` | Saving stage or claim-related updates can fail because the service selects a field the deployed schema does not have | `services/opportunities/src/services/opportunityService.js` |

## Operating Rules For This Matrix

1. Every new Jobs regression must be added here with exact route, exact error, and exact owning lane before a fix branch starts.
2. A deploy slice can close only one lane at a time unless the second change is required for the first lane to function.
3. No issue is considered fixed until the matching smoke item is checked on production after deploy.

## Next Intake Order

- `JOBS-INV-001` invoice and financial repro, repair, and smoke from the universal source branch
- `JOBS-PS-001` PandaSign V2 end-to-end preview/send/sign smoke and repair
- `JOBS-OPP-003` activity enum compatibility
- `JOBS-OPP-004` save-path compatibility

## Next Lane Smoke Minimums

The next lane, `JOBS-INV-001`, is not ready to patch until it has a fresh repro against the current universal source baseline. Its minimum smoke set after repair is:

- [ ] Financial tab loads without runtime or API errors on a known affected Job.
- [ ] Existing invoices list correctly.
- [ ] Invoice detail or preview opens.
- [ ] Pay/send invoice action completes without regression.
- [ ] Shared job header, Messages tabs, Documents, and GAF surfaces still load on the same Job after deploy.
