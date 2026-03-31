# Production Release Guardrails

This repo is high-risk to deploy because multiple customer-facing modules share the same frontend bundle and several backend services depend on the same production data shapes. The goal of this playbook is to make every deploy start from the real production baseline, ship one narrow slice at a time, and always have a working rollback file before anything changes.

## Non-Negotiable Rules

1. Work only from `/Volumes/ExternalSSD/panda-crm` lineage.
2. Create each release slice from the frozen prod baseline or the latest verified release branch, not `origin/main` by default.
3. Keep scope narrow: one module slice at a time.
4. Do not mix unrelated fixes into the same deploy.
5. Capture the production baseline before building or deploying.
6. Back up the frontend before uploading any new bundle.
7. Generate a rollback file before the first deploy command runs.
8. Smoke-test the touched module immediately after each deploy step.

## Branch and Worktree Workflow

1. Choose the source ref:
   - `codex/prod-baseline-20260331` when starting a new repair train from the frozen rollback state.
   - the latest verified release branch when continuing forward after a clean deploy.
2. Create a dedicated branch using the `codex/` prefix.
3. Create a dedicated worktree for that branch.
4. Leave other long-lived branches and worktrees untouched.

Example:

```bash
cd /Volumes/ExternalSSD/panda-crm
git fetch origin
git switch -c codex/example-fix origin/codex/prod-baseline-20260331
git worktree add /Volumes/ExternalSSD/panda-crm-example-fix codex/example-fix
```

## Verified Release Chain Rule

After each successful slice deploy:

1. Record the deployed branch, commit SHA, workflow run, and rollback path.
2. Treat that deployed branch as the new source ref for the next slice.
3. Do not branch the next fix from an older hotfix branch, backup restore, or `origin/main` unless you are intentionally rebuilding the release train.

This is the rule that prevents "fix one thing, reintroduce three old regressions" branch drift.

## Baseline Capture Workflow

Run these scripts before any deploy:

```bash
cd /Volumes/ExternalSSD/panda-crm-example-fix
BASELINE_FILE="$(scripts/release/capture-prod-baseline.sh)"
FRONTEND_BACKUP_DIR="$(scripts/release/backup-frontend.sh)"
ROLLBACK_FILE="$(scripts/release/create-rollback-file.sh "$BASELINE_FILE" "$FRONTEND_BACKUP_DIR")"
```

What this gives us:

- `capture-prod-baseline.sh`
  - captures the live frontend asset hashes
  - captures the current ECS task definitions for all `panda-crm-*` services
  - writes a sourceable baseline file to `/tmp`
- `backup-frontend.sh`
  - copies the live frontend bucket to a local backup directory
  - includes `index.html`, which must be restored explicitly during rollback
- `create-rollback-file.sh`
  - generates a runnable rollback shell file using that captured baseline

## Deploy Order Rules

Choose deploy order based on dependency direction.

### Pure frontend UX fix

- deploy frontend only
- smoke-test immediately

### Backend API addition or response-shape extension used by the frontend

- deploy backend service(s) first
- smoke-test API path
- deploy frontend last

### Multi-service backend slice

- deploy one ECS service at a time
- smoke-test the exact area owned by that service before moving to the next service
- only deploy frontend after backend dependencies are healthy

## Frontend Rollback Rule

Frontend rollback is not complete unless all three happen:

1. Restore the backed-up asset files.
2. Restore `index.html` explicitly.
3. Invalidate CloudFront.

Reason: S3 sync may not overwrite `index.html` if its metadata matches closely enough, even when the asset references inside it changed.

## Service Ownership Map

Use this to keep slices narrow.

| Area | Primary frontend | Primary backend/service |
| --- | --- | --- |
| Leads | `frontend/src/pages/Lead*` | `panda-crm-leads` |
| Jobs | `frontend/src/pages/OpportunityDetail.jsx`, `frontend/src/pages/Opportunities.jsx` | `panda-crm-opportunities` |
| Invoices / Financial | Jobs financial UI + invoice modals | `panda-crm-invoices` |
| GAF / Calendar / external integrations | Jobs measurements and calendar-related flows | `panda-crm-integrations` |
| Notifications / mentions | shared bell + comment flows | `panda-crm-notifications` |
| PhotoCam | jobs photo tab | `panda-crm-photocam` |
| Support admin + my support | support pages | `panda-crm-auth` |
| User settings / accounts | settings, admin users | `panda-crm-auth`, `panda-crm-accounts` |

## Required Pre-Deploy Output

Before deploying, write down:

1. Exact files changed.
2. Exact services being deployed.
3. Exact build/test commands run.
4. Exact smoke tests to run after deploy.
5. Exact rollback file path.
6. Exact source ref the branch was cut from.

If any of those are missing, stop and fill them in first.

## Post-Deploy Discipline

1. Verify the frontend hash or ECS task definition actually changed.
2. Run only the smoke checks for the touched module plus the shared nav/comments checks.
3. If the smoke test fails, stop the rollout and use the rollback file immediately.
4. Do not piggyback another fix onto the same deploy just because the system is already changing.

## Release Cadence Rule

If we are fixing regressions:

- restore the last known good behavior first
- then add hardening/tests second
- do not combine restore + new feature + unrelated cleanup in the same release

## Jobs Lane Rule

For Jobs-related fixes, create and ship separate slices for:

- frontend shell and tab/layout issues
- PandaSign V2 frontend wiring
- documents service/API issues
- opportunities comments/activity/save-path issues
- notification delivery issues
- invoice/financial issues

Even if multiple issues are user-visible on the same Job record, they are not allowed in the same deploy unless one change is strictly required for the other to function.

## Minimum Future Protection

For every repeat offender module, add or keep regression coverage for:

- exact wizard flow shape
- exact tab presence/ordering
- exact modal entry points
- exact date/time formatting expectations
- recent-items/nav behavior
- invoice open/send/resend/download/edit loops

The release process only works if those checks become part of the definition of done.
