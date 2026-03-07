# PandaSign V2 Safe Deploy Checklist (Feature-Flagged)

## Pre-Deploy
- [ ] Feature flag remains disabled by default.
- [ ] Placeholder dedupe key verified: `id + role + type`.
- [ ] CUSTOMER placeholder visibility regression tests pass.
- [ ] Header/footer safe-area checks pass.
- [ ] Page numbering checks pass (`0 of 0` impossible).
- [ ] Signature snap drift tests pass with tolerance constant.

## Test Suite
- [ ] Placeholder detector tests pass.
- [ ] Preview service tests pass.
- [ ] PDF scripted checks pass.
- [ ] PDF burn-in drift tests pass.

## Report Contract Safety
- [ ] No public report fields removed or renamed.
- [ ] New report fields are additive only.
- [ ] Missing token behavior remains empty-string and warning/report based.

## Controlled Enablement
- [ ] Enable feature flag only in test/staging first.
- [ ] Verify role-isolated field rendering with live sample templates.
- [ ] Verify preview report flags for missing anchors.

## Rollback Readiness
- [ ] Rollback command prepared (`git revert` target commit).
- [ ] Runtime feature-flag disable path validated.
