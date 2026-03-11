import { DISPOSITION_CATEGORIES, STEPS } from './wizardConstants';

export const ACTIONS = {
  RESET: 'RESET',
  SET_FIELD: 'SET_FIELD',
  SET_STEP: 'SET_STEP',
  SELECT_ROOF_INSPECTED: 'SELECT_ROOF_INSPECTED',
  SELECT_STORM_DAMAGE: 'SELECT_STORM_DAMAGE',
  SELECT_INSURANCE_OUTCOME: 'SELECT_INSURANCE_OUTCOME',
  SET_NO_INSPECTION_REASON: 'SET_NO_INSPECTION_REASON',
  SET_NO_CLAIM_REASON: 'SET_NO_CLAIM_REASON',
  SELECT_PITCH_RETAIL: 'SELECT_PITCH_RETAIL',
  SET_NO_PITCH_REASON: 'SET_NO_PITCH_REASON',
  SELECT_RETAIL_OUTCOME: 'SELECT_RETAIL_OUTCOME',
  SET_RETAIL_NO_SALE_REASON: 'SET_RETAIL_NO_SALE_REASON',
  SET_RESCHEDULE_DATE: 'SET_RESCHEDULE_DATE',
  SET_FOLLOW_UP_DATE: 'SET_FOLLOW_UP_DATE',
  SET_RESCHEDULE_MODE: 'SET_RESCHEDULE_MODE',
  SET_FOLLOW_UP_MODE: 'SET_FOLLOW_UP_MODE',
  SET_RESCHEDULE_TIME: 'SET_RESCHEDULE_TIME',
  SET_FOLLOW_UP_TIME: 'SET_FOLLOW_UP_TIME',
  SET_FOLLOW_UP_TASK_TYPE: 'SET_FOLLOW_UP_TASK_TYPE',
  SET_FOLLOW_UP_NOTES: 'SET_FOLLOW_UP_NOTES',
};

export const initialState = {
  step: STEPS.ROOF_INSPECTED,
  roofInspected: null,
  stormDamage: null,
  insuranceOutcome: null,
  retailOutcome: null,
  noInspectionReason: '',
  noClaimReason: '',
  noPitchRetailReason: '',
  retailNoSaleReason: '',
  rescheduleDate: '',
  rescheduleMode: 'IN_PERSON',
  rescheduleTime: '',
  followUpDate: '',
  followUpMode: 'IN_PERSON',
  followUpTime: '',
  followUpTaskType: 'CALL',
  followUpNotes: '',
  notes: '',
  pitchRetail: null,
  insuranceCompany: '',
  claimNumber: '',
  claimFiledDate: '',
  dateOfLoss: '',
  damageLocation: '',
  saPrepared: false,
  saSent: false,
  quoteRoofSqFt: '',
  quoteMaterials: '',
  quoteLabor: '',
};

export function wizardReducer(state, action) {
  switch (action.type) {
    case ACTIONS.RESET:
      return { ...initialState };
    case ACTIONS.SET_FIELD:
      return { ...state, [action.field]: action.value };
    case ACTIONS.SET_STEP:
      return { ...state, step: action.step };
    case ACTIONS.SELECT_ROOF_INSPECTED:
      return {
        ...state,
        roofInspected: action.value,
        step: action.value === 'yes' ? STEPS.STORM_DAMAGE : STEPS.INSPECTION_NOT_COMPLETED,
      };
    case ACTIONS.SELECT_STORM_DAMAGE:
      return {
        ...state,
        stormDamage: action.value,
        step: action.value === 'yes' ? STEPS.INSURANCE_CLAIM : STEPS.RETAIL_OUTCOME,
      };
    case ACTIONS.SELECT_INSURANCE_OUTCOME:
      return {
        ...state,
        insuranceOutcome: action.value,
        step: action.value === 'filed-claim' ? STEPS.CLAIM_INFO : STEPS.NO_CLAIM_REASON,
      };
    case ACTIONS.SET_NO_INSPECTION_REASON:
      return { ...state, noInspectionReason: action.value };
    case ACTIONS.SET_NO_CLAIM_REASON:
      return { ...state, noClaimReason: action.value };
    case ACTIONS.SELECT_PITCH_RETAIL:
      return {
        ...state,
        pitchRetail: action.value,
        step: action.value === 'yes' ? STEPS.RETAIL_QUOTE : STEPS.NO_CLAIM_REASON,
      };
    case ACTIONS.SET_NO_PITCH_REASON:
      return { ...state, noPitchRetailReason: action.value };
    case ACTIONS.SELECT_RETAIL_OUTCOME:
      return {
        ...state,
        retailOutcome: action.value,
        step: action.value === 'yes' ? STEPS.CONFIRM : STEPS.RETAIL_OUTCOME,
      };
    case ACTIONS.SET_RETAIL_NO_SALE_REASON:
      return { ...state, retailNoSaleReason: action.value };
    case ACTIONS.SET_RESCHEDULE_DATE:
      return { ...state, rescheduleDate: action.value, step: STEPS.CONFIRM };
    case ACTIONS.SET_FOLLOW_UP_DATE:
      return { ...state, followUpDate: action.value, step: STEPS.CONFIRM };
    case ACTIONS.SET_RESCHEDULE_MODE:
      return { ...state, rescheduleMode: action.value || 'IN_PERSON' };
    case ACTIONS.SET_FOLLOW_UP_MODE:
      return { ...state, followUpMode: action.value || 'IN_PERSON' };
    case ACTIONS.SET_RESCHEDULE_TIME:
      return { ...state, rescheduleTime: action.value };
    case ACTIONS.SET_FOLLOW_UP_TIME:
      return { ...state, followUpTime: action.value };
    case ACTIONS.SET_FOLLOW_UP_TASK_TYPE:
      return { ...state, followUpTaskType: action.value || 'CALL' };
    case ACTIONS.SET_FOLLOW_UP_NOTES:
      return { ...state, followUpNotes: action.value };
    default:
      return state;
  }
}

export function deriveDisposition(state) {
  if (state.rescheduleDate) {
    return {
      category: DISPOSITION_CATEGORIES.RESCHEDULED,
      reason: state.noInspectionReason || null,
      followUpDate: state.rescheduleDate,
    };
  }

  if (state.followUpDate) {
    return {
      category: DISPOSITION_CATEGORIES.FOLLOW_UP_SCHEDULED,
      reason:
        state.noClaimReason ||
        state.noPitchRetailReason ||
        state.retailNoSaleReason ||
        null,
      followUpDate: state.followUpDate,
    };
  }

  if (state.roofInspected === 'no') {
    return {
      category: DISPOSITION_CATEGORIES.INSPECTION_NOT_COMPLETED,
      reason: state.noInspectionReason || null,
      followUpDate: null,
    };
  }

  if (state.stormDamage === 'yes') {
    if (state.insuranceOutcome === 'filed-claim') {
      return {
        category: DISPOSITION_CATEGORIES.INSURANCE_CLAIM_FILED,
        reason: null,
        followUpDate: null,
      };
    }
    if (state.insuranceOutcome === 'no-claim-filed') {
      return {
        category: DISPOSITION_CATEGORIES.INSURANCE_NO_CLAIM,
        reason: state.noClaimReason || null,
        followUpDate: null,
      };
    }
  }

  if (state.stormDamage === 'no') {
    if (state.retailOutcome === 'yes') {
      return {
        category: DISPOSITION_CATEGORIES.RETAIL_SOLD,
        reason: null,
        followUpDate: null,
      };
    }
    if (state.retailOutcome === 'no') {
      return {
        category: DISPOSITION_CATEGORIES.RETAIL_NOT_SOLD,
        reason: state.retailNoSaleReason || null,
        followUpDate: null,
      };
    }
  }

  return { category: null, reason: null, followUpDate: null };
}

export function computeQuoteTotal(state) {
  const materials = parseFloat(state.quoteMaterials) || 0;
  const labor = parseFloat(state.quoteLabor) || 0;
  return materials + labor;
}
