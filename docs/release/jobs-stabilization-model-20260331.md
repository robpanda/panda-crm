# Jobs Stabilization Model: March 31, 2026

This playbook is the operating model for getting Jobs back to fully functional without repeating the break-revert-break cycle.

## Goal

Ship narrow, traceable, reversible Jobs fixes from one verified release chain.

## Approved Source Refs

Use only these as the start of new work:

1. `codex/prod-baseline-20260331`
2. the latest verified release branch that was actually deployed successfully

Do not start from:

- `/Users/Brian 1/Desktop/panda-crm`
- old hotfix branches that were never promoted cleanly
- backup restores
- `origin/main` by habit

## One-Issue Intake Rule

Before a fix branch starts, the issue must be recorded in [`jobs-issue-matrix-20260331.md`](./jobs-issue-matrix-20260331.md) with:

- exact screen or API route
- one concrete example job or record
- current behavior
- expected behavior
- likely owner lane

If the issue is not in the matrix, it does not start a branch.

## One-Lane Branch Rule

Each fix branch may own only one lane:

- `frontend/jobs-shell`
- `frontend/messages`
- `frontend/pandasign-v2`
- `documents`
- `opportunities/comments`
- `opportunities/activity`
- `opportunities/save-path`
- `notifications`
- `invoices`
- `integrations/gaf`

If a fix needs a second lane, stop and open a second branch unless the dependency is mandatory.

## Release Chain Workflow

1. Start from the frozen prod baseline or the latest verified release branch.
2. Create a dedicated `codex/` branch and `/Volumes/ExternalSSD` worktree.
3. Capture a fresh frontend backup and rollback artifact before deploy.
4. Make only the lane-specific changes.
5. Run lane-specific validation plus shared smoke checks.
6. Deploy only that lane.
7. Verify the live asset hash, task definition, or service image actually changed.
8. Record the release result and rollback path.
9. Cut the next branch from this verified branch if the deploy is clean.

## Required Release Ledger

Every slice must record:

- source ref
- branch name
- commit SHA
- changed files
- deployed services or frontend workflow run
- rollback artifact path
- smoke results

Record each deployed slice in [`jobs-release-ledger-20260331.md`](./jobs-release-ledger-20260331.md).

## Current Stabilization Order

1. frontend shell/messages/PandaSign V2 direct wiring
2. notification delivery hardening
3. invoice/financial regressions
4. remaining documents and opportunities Jobs issues from the matrix

## Stop Conditions

Stop and rollback immediately if:

- the deployed hash/task definition did not change
- a shared smoke check fails
- an unrelated Jobs lane regresses
- the branch includes drift outside its declared lane
