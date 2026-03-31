# Jobs Release Ledger: March 31, 2026

This ledger records the verified Jobs-related release slices promoted from the `/Volumes/ExternalSSD` release chain and the exact refs that make up the current live Jobs baseline.

## Current Live Lane Baselines

| Date (UTC) | Lane | Current live ref | Commit | Deploy proof | Rollback |
| --- | --- | --- | --- | --- | --- |
| 2026-03-31 14:26 | Integrations / GAF | `codex/gaf-stabilization-20260331` | `1ac0f020ff49f4da41f4fc9bfc685faee86a2a3e` | Build and Deploy to ECS run `23802501382`; production `panda-crm-integrations:340` | `/tmp/panda-crm-rollback-20260331-102449.sh` |
| 2026-03-31 15:00 | Documents / repository by-job | `codex/documents-repository-fix-20260331` | `215f08ac289c707d36ed41017db43855a2d69d17` | Build and Deploy to ECS run `23803924510`; production `panda-crm-documents:325` | `/tmp/panda-crm-documents-rollback-20260331-105405.sh` |
| 2026-03-31 18:32 | Opportunities / notes, comments, mentions, SMS, replies | `codex/opportunities-notes-replies-fix-20260331` | `9f8111cbfc115c595a8886df55b1f814c0dfe931` | Build and Deploy to ECS run `23813238259`; production `panda-crm-opportunities:401` | `/tmp/panda-crm-opportunities-rollback-20260331-142837.sh` |
| 2026-03-31 18:33 | Frontend / Jobs shell, header, messages, note visibility, replies | `codex/frontend-notes-replies-fix-20260331` | `b6469dbbe8d8a8383fb2a6c8540f466fad4a95c2` | Frontend workflow run `23813370317`; `https://crm.pandaadmin.com` `last-modified: Tue, 31 Mar 2026 18:33:14 GMT`; `index.html` references `assets/index-DD20HLS4.js` | `/tmp/panda-crm-frontend-rollback-20260331-142837.sh` |

## Universal Source Ref

The default parent for new Jobs work is the non-deploying synthesis branch built from the verified live lane slices above:

- `origin/codex/jobs-universal-source-20260331`
- commit `fb9f785f38ecdfb5b4aa7fd45f6cbf2437b3a1c3`

This branch was synthesized from the currently verified live refs instead of old hotfix ancestry:

- workflow anchor: `origin/codex/deploy-workflow-fix-20260331` at `f70c55747d50cb451da55adf7d76af79320416a1`
- integrations lane: `origin/codex/gaf-stabilization-20260331` at `1ac0f020ff49f4da41f4fc9bfc685faee86a2a3e`
- documents lane: `origin/codex/documents-repository-fix-20260331` at `215f08ac289c707d36ed41017db43855a2d69d17`
- opportunities lane: `origin/codex/opportunities-notes-replies-fix-20260331` at `9f8111cbfc115c595a8886df55b1f814c0dfe931`
- frontend lane: `origin/codex/frontend-notes-replies-fix-20260331` at `b6469dbbe8d8a8383fb2a6c8540f466fad4a95c2`

## Branching Rule

Until a newer universal source ref is validated:

- default parent for any new Jobs fix: `origin/codex/jobs-universal-source-20260331`
- exception for urgent lane-only hotfixes: start from the current live lane ref above if that is safer
- every verified hotfix must merge or be replayed back into `codex/jobs-universal-source-20260331` before the next cross-lane fix starts
