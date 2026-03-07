# PandaSign V2 Signing Flow Guide

## High-Level Flow
1. Template is selected and preview is generated.
2. Token and placeholder reports are reviewed.
3. Signer-visible fields are isolated by role.
4. Signature placement snaps to placeholder PDF coordinates.
5. Status transitions complete by signer order rules.

## Warning-First Validation
Preview and placeholder checks default to warning/report flags.  
Hard failures are not enabled by default to avoid blocking existing flows.

## Role Isolation
- CUSTOMER fields are visible only to CUSTOMER signing context.
- AGENT fields are visible only to AGENT signing context.

## Regression Guards
The hardening suite checks:

- only-agent-field rendering regressions
- missing customer field regressions
- header/footer content overlap risk
- invalid page numbering (`0 of 0`)
- signature snap drift behavior

## Drift Tolerance
Signature snap drift uses a permissive tolerance constant:

- `SIGNATURE_SNAP_DRIFT_TOLERANCE_PX = 24`

If exceeded, placement is snapped to expected placeholder coordinates and a warning is produced.
