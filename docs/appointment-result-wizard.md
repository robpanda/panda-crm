# Result Appointment Wizard

## Overview
The Result Appointment wizard records appointment outcomes for jobs (opportunities) and stores an audit trail.

## Data
- `opportunities.current_disposition_category`
- `opportunities.current_disposition_reason`
- `appointment_results` table stores the full wizard payload for history.

## API
`POST /api/opportunities/:id/appointment-result`

Payload fields:
- `dispositionCategory` (required)
- `dispositionReason` (optional)
- `followUpAt` (required for follow-up/reschedule)
- `insuranceCompany`, `claimNumber`, `claimFiledDate`, `dateOfLoss`, `damageLocation`
- `answers` (wizard answers for audit)
- `autoStageUpdate` (default true)
