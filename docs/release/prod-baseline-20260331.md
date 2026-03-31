# Production Baseline: March 31, 2026

This manifest records the rolled-back production state that was restored after the failed Jobs release on March 31, 2026. Until a newer slice is intentionally promoted, this is the only approved baseline for Jobs-related fixes and deploys.

## Source Of Truth

- Baseline capture file: `/tmp/panda-crm-baseline-20260331-101256.env`
- Frontend backup directory: `/tmp/frontend-backup-20260331-101256`
- Rollback script: `/tmp/panda-crm-rollback-20260331-101508.sh`
- Capture branch: `codex/prod-baseline-20260331`
- Capture commit: `1a7fe05`
- Capture time: `2026-03-31T14:14:34Z`

## Frontend State

- Production URL: `https://crm.pandaadmin.com`
- Live JavaScript asset: `assets/index-DEGSPcK8.js`
- Live CSS asset: `assets/index-j9mgQgHm.css`
- Frontend rollback rule: restore the backup directory, restore `index.html` explicitly, then invalidate CloudFront.

## Jobs-Related Service Baseline

| Service | Live task definition | Live image |
| --- | --- | --- |
| `panda-crm-documents` | `panda-crm-documents:323` | `679128292059.dkr.ecr.us-east-2.amazonaws.com/panda-crm/documents:legacy-docs-fix-20260331T001528Z-amd64` |
| `panda-crm-integrations` | `panda-crm-integrations:338` | `679128292059.dkr.ecr.us-east-2.amazonaws.com/panda-crm/integrations:nearmap-enum-20260328T1141Z-amd64` |
| `panda-crm-opportunities` | `panda-crm-opportunities:394` | `679128292059.dkr.ecr.us-east-2.amazonaws.com/panda-crm/opportunities:jobs-claim-save-20260331T1001Z-amd64` |
| `panda-crm-notifications` | `panda-crm-notifications:65` | `679128292059.dkr.ecr.us-east-2.amazonaws.com/panda-crm/notifications:21809dcf1cd1092f9029901d97b0a40edd4077ec` |
| `panda-crm-photocam` | `panda-crm-photocam:58` | `679128292059.dkr.ecr.us-east-2.amazonaws.com/panda-crm/photocam:d43dfb4-amd64` |

## Traceability Gap

The current live rollback is operational, but it is not fully traceable to a surviving git ref in this repository.

- `panda-crm/documents:legacy-docs-fix-20260331T001528Z-amd64` does not map cleanly to a current branch or tag in this checkout.
- `panda-crm/integrations:nearmap-enum-20260328T1141Z-amd64` does not map cleanly to a current branch or tag in this checkout.

That means this branch is a documentation and stabilization baseline, not proof that `origin/main` exactly matches production. Any fix branch must be treated as a narrow forward repair from this baseline and must prove itself with module smoke checks before deploy.

## Non-Negotiable Release Rules

1. Deploy only from `/Volumes/ExternalSSD` worktrees.
2. Never deploy from `/Users/Brian 1/Desktop/panda-crm`.
3. Capture a fresh baseline, frontend backup, and rollback file before each release slice.
4. Ship one Jobs lane at a time.
5. Smoke-test only the touched module plus the shared checks immediately after deploy.
6. If a smoke check fails, run the rollback script immediately instead of layering on another hotfix.

## First Planned Repair Order

1. `panda-crm-integrations` for GAF ordering and delivery.
2. `panda-crm-documents` for Jobs repository and PandaSign V2 mismatches.
3. `panda-crm-opportunities` for Jobs comments, activity, and save-path regressions.
4. Frontend-only hardening after backend dependencies are stable.
