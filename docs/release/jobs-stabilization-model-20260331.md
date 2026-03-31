# Jobs Stabilization Model: March 31, 2026

This playbook is the operating model for getting Jobs back to fully functional without repeating the break-revert-break cycle.

## Goal

Ship narrow, traceable, reversible Jobs fixes from one verified release chain.

## Approved Source Refs

Use only these as the start of new work:

1. `origin/codex/jobs-universal-source-20260331`
2. the current live lane ref from [`jobs-release-ledger-20260331.md`](./jobs-release-ledger-20260331.md) only when an urgent fix must stay lane-local

The universal source branch is a non-deploying coordination baseline synthesized from the currently verified live slices:

- workflow anchor: `origin/codex/deploy-workflow-fix-20260331`
- integrations lane: `origin/codex/gaf-stabilization-20260331`
- documents lane: `origin/codex/documents-repository-fix-20260331`
- opportunities lane: `origin/codex/opportunities-notes-replies-fix-20260331`
- frontend lane: `origin/codex/frontend-notes-replies-fix-20260331`

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

1. Start from `origin/codex/jobs-universal-source-20260331` unless the fix is an urgent lane-only hotfix.
2. Create a dedicated `codex/` branch and `/Volumes/ExternalSSD` worktree.
3. Capture a fresh frontend backup and rollback artifact before deploy.
4. Make only the lane-specific changes.
5. Run lane-specific validation plus shared smoke checks.
6. Deploy only that lane.
7. Verify the live asset hash, task definition, or service image actually changed.
8. Record the release result and rollback path.
9. Merge or replay the verified lane fix back into `codex/jobs-universal-source-20260331`.
10. Cut the next branch from the refreshed universal source ref if the deploy is clean.

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

1. PandaSign V2 end-to-end smoke and isolated repair
2. opportunities activity enum compatibility
3. opportunities save-path compatibility
4. invoice/financial only if a fresh repro is captured against production

## Stop Conditions

Stop and rollback immediately if:

- the deployed hash/task definition did not change
- a shared smoke check fails
- an unrelated Jobs lane regresses
- the branch includes drift outside its declared lane
- the branch was cut from any ref other than the universal source branch or the explicitly approved live lane ref
