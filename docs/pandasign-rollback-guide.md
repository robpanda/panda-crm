# PandaSign V2 Rollback Guide

## Scope
This rollback guide applies to PandaSign V2 hardening changes only.

## Immediate Runtime Safety
Keep PandaSign V2 behind feature flag.

- Set feature flag to disabled (`false`) to stop user exposure quickly.

## Code Rollback (Uncommitted)
Restore changed files:

```bash
git restore --source=HEAD -- <changed-files>
```

## Code Rollback (Committed)
Revert by commit:

```bash
git revert <commit_sha>
```

## Validation After Rollback
Run:

1. Service tests
2. Preview regression checks
3. Placeholder/report checks

Confirm no `0 of 0` page labels and no duplicate role field leakage.
