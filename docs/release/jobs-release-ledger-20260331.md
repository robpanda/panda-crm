# Jobs Release Ledger: March 31, 2026

This ledger records the verified Jobs-related release slices promoted from the `/Volumes/ExternalSSD` release chain.

## Verified Release Chain

| Date (UTC) | Lane | Source ref | Deployed branch | Commit | Deploy proof | Rollback |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-03-31 17:08 | Frontend / Jobs shell, Messages, PandaSign V2 direct wiring | `codex/frontend-baseline-restore-20260331` | `codex/messaging-rebaseline-20260331` | `596e0cc8c865aa70664454c0cd74be2b24f4b4f2` | Frontend workflow run `23809881405`; `https://crm.pandaadmin.com` `last-modified: Tue, 31 Mar 2026 17:08:51 GMT`; `index.html` now references `assets/index-mZsaMyK7.js` | `/tmp/panda-crm-frontend-rollback-20260331-130744/rollback.sh` |

## Current Approved Source Ref

Until a newer slice is deployed and verified, new Jobs branches must start from:

- `origin/codex/messaging-rebaseline-20260331`
