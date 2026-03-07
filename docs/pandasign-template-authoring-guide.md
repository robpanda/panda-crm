# PandaSign V2 Template Authoring Guide

## Overview
This guide describes how to author PandaSign V2 templates safely for preview and signing.

## Placeholder Syntax
Signature anchors are HTML elements that include:

- `data-ps-id`: unique anchor id
- `data-ps-role`: `CUSTOMER` or `AGENT`
- `data-ps-field`: `signature` or `initial`

Example:

```html
<div data-ps-id="customer_sig_1" data-ps-role="CUSTOMER" data-ps-field="signature"></div>
<div data-ps-id="customer_init_1" data-ps-role="CUSTOMER" data-ps-field="initial"></div>
```

## Dedupe Rules
Placeholder dedupe key is:

`data-ps-id + data-ps-role + data-ps-field`

This ensures AGENT and CUSTOMER anchors with the same id are not merged incorrectly.

## Required Anchors
Recommended minimum anchors:

- CUSTOMER signature
- CUSTOMER initial
- AGENT signature
- AGENT initial

Missing anchors are reported as validation failures in preview reports.

## Header/Footer Safe Area
Use clear top/bottom spacing so body text never overlaps header/footer.

Recommended minimums:

- top: `64px` minimum (preferred `104px`)
- bottom: `56px` minimum (preferred `88px`)

Do not place header markup inside footer markup.

## Hard Failure Mode
Default behavior is warning-first.  
Strict hard failure is opt-in with `strictRequiredAnchors=true`.

Use strict mode only for release-quality preflight validation when missing signature anchors would produce unsafe signing output.
