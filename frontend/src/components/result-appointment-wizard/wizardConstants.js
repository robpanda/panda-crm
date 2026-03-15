export const STEPS = {
  ROOF_INSPECTED: 'roof_inspected',
  INSPECTION_NOT_COMPLETED: 'inspection_not_completed',
  STORM_DAMAGE: 'storm_damage',
  INSURANCE_CLAIM: 'insurance_claim',
  NO_CLAIM_REASON: 'no_claim_reason',
  PITCH_RETAIL: 'pitch_retail',
  NO_PITCH_REASON: 'no_pitch_reason',
  RETAIL_QUOTE: 'retail_quote',
  CLAIM_INFO: 'claim_info',
  RETAIL_OUTCOME: 'retail_outcome',
  RETAIL_NOT_SOLD_REASON: 'retail_not_sold_reason',
  FOLLOW_UP_MODE: 'follow_up_mode',
  VIRTUAL_FOLLOW_UP: 'virtual_follow_up',
  IN_PERSON_FOLLOW_UP: 'in_person_follow_up',
  CONFIRM: 'confirm',
};

export const STORM_DAMAGE_BADGE =
  'Storm damage found -> Insurance path. No storm damage -> Retail path';

export const DISPOSITION_CATEGORIES = {
  INSPECTION_NOT_COMPLETED: 'INSPECTION_NOT_COMPLETED',
  RESCHEDULED: 'RESCHEDULED',
  FOLLOW_UP_SCHEDULED: 'FOLLOW_UP_SCHEDULED',
  INSURANCE_CLAIM_FILED: 'INSURANCE_CLAIM_FILED',
  INSURANCE_NO_CLAIM: 'INSURANCE_NO_CLAIM',
  RETAIL_SOLD: 'RETAIL_SOLD',
  RETAIL_NOT_SOLD: 'RETAIL_NOT_SOLD',
};

export const INSPECTION_NOT_COMPLETED_REASONS = [
  { value: 'NO_ANSWER', label: 'No answer' },
  { value: 'CANCELLED_AT_DOOR', label: 'Cancelled at door' },
  { value: 'NO_SHOW', label: 'No show' },
  { value: 'OTHER', label: 'Other' },
];

export const NO_CLAIM_REASONS = [
  { value: 'SPEAK_TO_SIGNIFICANT_OTHER', label: 'Speak to significant other' },
  { value: 'FOLLOW_UP_SCHEDULED', label: 'Follow up scheduled' },
  { value: 'NO_INTEREST', label: 'No interest' },
  { value: 'NO_POLICY', label: 'No policy' },
];

export const NO_PITCH_RETAIL_REASONS = [
  { value: 'CUSTOMER_NOT_INTERESTED', label: 'Customer not interested in any roof work' },
  { value: 'ALREADY_HAS_ROOFER', label: 'Customer already has a roofer' },
  { value: 'NOT_A_RETAIL_FIT', label: 'Property not a good fit for retail' },
  { value: 'FOLLOW_UP_SCHEDULED', label: 'Follow up scheduled' },
];

export const RETAIL_NOT_SOLD_REASONS = [
  { value: 'PRICE_TOO_HIGH', label: 'Price too high' },
  { value: 'SPOUSE', label: 'Needs to consult spouse' },
  { value: 'NOT_INTERESTED', label: 'Not interested' },
  { value: 'TIMING', label: 'Timing not right' },
  { value: 'ALREADY_HAS_CONTRACTOR', label: 'Already has contractor' },
  { value: 'OTHER', label: 'Other' },
];

export const FOLLOW_UP_MODES = [
  { value: 'VIRTUAL', label: 'Virtual', description: 'Creates a task follow-up without booking a calendar visit.' },
  { value: 'IN_PERSON', label: 'In Person', description: 'Books another appointment with a date and time.' },
];

export const VIRTUAL_TASK_TYPES = [
  { value: 'CALL', label: 'Call' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'OTHER', label: 'Other' },
];

export const DEFAULT_FOLLOW_UP_DURATION_MINUTES = 120;

export const STEP_TITLES = {
  [STEPS.ROOF_INSPECTED]: 'Was the roof inspected?',
  [STEPS.INSPECTION_NOT_COMPLETED]: 'Inspection did not occur',
  [STEPS.STORM_DAMAGE]: 'Storm damage present?',
  [STEPS.INSURANCE_CLAIM]: 'Claim filed?',
  [STEPS.NO_CLAIM_REASON]: 'Why was no claim filed?',
  [STEPS.PITCH_RETAIL]: 'Would you like to pitch retail?',
  [STEPS.NO_PITCH_REASON]: 'Why not pitching retail?',
  [STEPS.RETAIL_QUOTE]: 'Quote builder',
  [STEPS.CLAIM_INFO]: 'Enter claim information',
  [STEPS.RETAIL_OUTCOME]: 'Is customer moving forward?',
  [STEPS.RETAIL_NOT_SOLD_REASON]: 'Why did it not sell?',
  [STEPS.FOLLOW_UP_MODE]: 'Follow-up type',
  [STEPS.VIRTUAL_FOLLOW_UP]: 'Virtual follow-up task',
  [STEPS.IN_PERSON_FOLLOW_UP]: 'In-person follow-up appointment',
  [STEPS.CONFIRM]: 'Confirm result',
};
