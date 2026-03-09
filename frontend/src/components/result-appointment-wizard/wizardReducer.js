import { DISPOSITION_CATEGORIES, STEPS } from './wizardConstants';

export const ACTIONS = {
  RESET: 'RESET',
  SET_FIELD: 'SET_FIELD',
  GO_TO_STEP: 'GO_TO_STEP',
  GO_BACK: 'GO_BACK',
  SELECT_ROOF_INSPECTED: 'SELECT_ROOF_INSPECTED',
  SELECT_STORM_DAMAGE: 'SELECT_STORM_DAMAGE',
  SELECT_INSURANCE_OUTCOME: 'SELECT_INSURANCE_OUTCOME',
  SET_NO_INSPECTION_REASON: 'SET_NO_INSPECTION_REASON',
  SET_NO_CLAIM_REASON: 'SET_NO_CLAIM_REASON',
  SELECT_PITCH_RETAIL: 'SELECT_PITCH_RETAIL',
  SET_NO_PITCH_REASON: 'SET_NO_PITCH_REASON',
  SELECT_RETAIL_OUTCOME: 'SELECT_RETAIL_OUTCOME',
  SET_RETAIL_NO_SALE_REASON: 'SET_RETAIL_NO_SALE_REASON',
  START_FOLLOW_UP: 'START_FOLLOW_UP',
  SELECT_FOLLOW_UP_MODE: 'SELECT_FOLLOW_UP_MODE',
  CLEAR_FOLLOW_UP: 'CLEAR_FOLLOW_UP',
};

const clearFollowUpState = {
  followUpContext: '',
  followUpMode: '',
  virtualTaskType: 'CALL',
  virtualDueDate: '',
  virtualDueTime: '',
  virtualNotes: '',
  inPersonDate: '',
  inPersonTime: '',
  inPersonNotes: '',
  inPersonDurationMinutes: 120,
};

const clearInsurancePathState = {
  insuranceOutcome: null,
  noClaimReason: '',
  pitchRetail: null,
  noPitchRetailReason: '',
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

const clearRetailPathState = {
  retailOutcome: null,
  retailNoSaleReason: '',
};

const clearNoInspectionPathState = {
  noInspectionReason: '',
};

const combineDateAndTime = (dateValue, timeValue) => {
  if (!dateValue) return null;
  const time = timeValue || '09:00';
  const date = new Date(`${dateValue}T${time}:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const transitionTo = (state, nextStep, extra = {}) => {
  if (state.step === nextStep) {
    return { ...state, ...extra };
  }
  return {
    ...state,
    ...extra,
    stepHistory: [...state.stepHistory, state.step],
    step: nextStep,
  };
};

export const initialState = {
  step: STEPS.ROOF_INSPECTED,
  stepHistory: [],
  roofInspected: null,
  stormDamage: null,
  insuranceOutcome: null,
  retailOutcome: null,
  noInspectionReason: '',
  noClaimReason: '',
  noPitchRetailReason: '',
  retailNoSaleReason: '',
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
  ...clearFollowUpState,
};

export function wizardReducer(state, action) {
  switch (action.type) {
    case ACTIONS.RESET:
      return { ...initialState };

    case ACTIONS.SET_FIELD:
      return { ...state, [action.field]: action.value };

    case ACTIONS.GO_TO_STEP:
      return transitionTo(state, action.step, action.extra || {});

    case ACTIONS.GO_BACK: {
      if (state.stepHistory.length === 0) return state;
      const nextHistory = [...state.stepHistory];
      const previousStep = nextHistory.pop();
      return {
        ...state,
        step: previousStep,
        stepHistory: nextHistory,
      };
    }

    case ACTIONS.SELECT_ROOF_INSPECTED: {
      const isInspected = action.value;
      return transitionTo(
        {
          ...state,
          roofInspected: isInspected,
          stormDamage: null,
          ...clearFollowUpState,
          ...clearInsurancePathState,
          ...clearRetailPathState,
        },
        isInspected === 'yes' ? STEPS.STORM_DAMAGE : STEPS.INSPECTION_NOT_COMPLETED,
        {
          ...(isInspected === 'yes' ? clearNoInspectionPathState : {}),
        }
      );
    }

    case ACTIONS.SET_NO_INSPECTION_REASON:
      return { ...state, noInspectionReason: action.value };

    case ACTIONS.SELECT_STORM_DAMAGE: {
      const stormDamage = action.value;
      if (stormDamage === 'yes') {
        return transitionTo(
          {
            ...state,
            stormDamage,
            ...clearRetailPathState,
            ...clearFollowUpState,
          },
          STEPS.INSURANCE_CLAIM
        );
      }
      return transitionTo(
        {
          ...state,
          stormDamage,
          ...clearInsurancePathState,
          ...clearFollowUpState,
        },
        STEPS.RETAIL_OUTCOME
      );
    }

    case ACTIONS.SELECT_INSURANCE_OUTCOME: {
      const insuranceOutcome = action.value;
      return transitionTo(
        {
          ...state,
          insuranceOutcome,
          noClaimReason: '',
          pitchRetail: null,
          noPitchRetailReason: '',
          ...clearFollowUpState,
        },
        insuranceOutcome === 'filed-claim' ? STEPS.CLAIM_INFO : STEPS.NO_CLAIM_REASON
      );
    }

    case ACTIONS.SET_NO_CLAIM_REASON:
      return { ...state, noClaimReason: action.value };

    case ACTIONS.SELECT_PITCH_RETAIL:
      return transitionTo(
        {
          ...state,
          pitchRetail: action.value,
          noPitchRetailReason: '',
        },
        action.value === 'yes' ? STEPS.RETAIL_QUOTE : STEPS.NO_PITCH_REASON
      );

    case ACTIONS.SET_NO_PITCH_REASON:
      return { ...state, noPitchRetailReason: action.value };

    case ACTIONS.SELECT_RETAIL_OUTCOME:
      return transitionTo(
        {
          ...state,
          retailOutcome: action.value,
          retailNoSaleReason: '',
          ...clearFollowUpState,
        },
        action.value === 'yes' ? STEPS.CONFIRM : STEPS.RETAIL_NOT_SOLD_REASON
      );

    case ACTIONS.SET_RETAIL_NO_SALE_REASON:
      return { ...state, retailNoSaleReason: action.value };

    case ACTIONS.START_FOLLOW_UP:
      return transitionTo(
        {
          ...state,
          followUpContext: action.context || '',
          ...clearFollowUpState,
        },
        STEPS.FOLLOW_UP_MODE
      );

    case ACTIONS.SELECT_FOLLOW_UP_MODE:
      return transitionTo(
        {
          ...state,
          followUpMode: action.value,
        },
        action.value === 'VIRTUAL' ? STEPS.VIRTUAL_FOLLOW_UP : STEPS.IN_PERSON_FOLLOW_UP
      );

    case ACTIONS.CLEAR_FOLLOW_UP:
      return {
        ...state,
        ...clearFollowUpState,
      };

    default:
      return state;
  }
}

function deriveFollowUpDate(state) {
  if (state.followUpMode === 'VIRTUAL' && state.virtualDueDate) {
    return combineDateAndTime(state.virtualDueDate, state.virtualDueTime);
  }
  if (state.followUpMode === 'IN_PERSON' && state.inPersonDate) {
    return combineDateAndTime(state.inPersonDate, state.inPersonTime);
  }
  return null;
}

export function deriveDisposition(state) {
  const followUpDate = deriveFollowUpDate(state);
  const isInspectionFlow = state.roofInspected === 'no';

  if (isInspectionFlow) {
    if (followUpDate) {
      return {
        category:
          state.followUpMode === 'IN_PERSON'
            ? DISPOSITION_CATEGORIES.RESCHEDULED
            : DISPOSITION_CATEGORIES.FOLLOW_UP_SCHEDULED,
        reason: state.noInspectionReason || null,
        followUpDate,
        followUpType: state.followUpMode || null,
      };
    }
    return {
      category: DISPOSITION_CATEGORIES.INSPECTION_NOT_COMPLETED,
      reason: state.noInspectionReason || null,
      followUpDate: null,
      followUpType: null,
    };
  }

  if (state.stormDamage === 'yes') {
    if (state.insuranceOutcome === 'filed-claim') {
      return {
        category: DISPOSITION_CATEGORIES.INSURANCE_CLAIM_FILED,
        reason: null,
        followUpDate: null,
        followUpType: null,
      };
    }
    if (state.insuranceOutcome === 'no-claim-filed') {
      if (followUpDate) {
        return {
          category: DISPOSITION_CATEGORIES.FOLLOW_UP_SCHEDULED,
          reason: state.noClaimReason || state.noPitchRetailReason || null,
          followUpDate,
          followUpType: state.followUpMode || null,
        };
      }
      return {
        category: DISPOSITION_CATEGORIES.INSURANCE_NO_CLAIM,
        reason: state.noClaimReason || null,
        followUpDate: null,
        followUpType: null,
      };
    }
  }

  if (state.stormDamage === 'no') {
    if (state.retailOutcome === 'yes') {
      return {
        category: DISPOSITION_CATEGORIES.RETAIL_SOLD,
        reason: null,
        followUpDate: null,
        followUpType: null,
      };
    }

    if (state.retailOutcome === 'no') {
      if (followUpDate) {
        return {
          category: DISPOSITION_CATEGORIES.FOLLOW_UP_SCHEDULED,
          reason: state.retailNoSaleReason || null,
          followUpDate,
          followUpType: state.followUpMode || null,
        };
      }
      return {
        category: DISPOSITION_CATEGORIES.RETAIL_NOT_SOLD,
        reason: state.retailNoSaleReason || null,
        followUpDate: null,
        followUpType: null,
      };
    }
  }

  return {
    category: null,
    reason: null,
    followUpDate: null,
    followUpType: null,
  };
}

export function computeQuoteTotal(state) {
  const materials = parseFloat(state.quoteMaterials) || 0;
  const labor = parseFloat(state.quoteLabor) || 0;
  return materials + labor;
}
