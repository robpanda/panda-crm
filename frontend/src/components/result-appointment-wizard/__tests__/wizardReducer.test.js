import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  deriveDisposition,
  initialState,
  wizardReducer,
} from '../wizardReducer';
import { DISPOSITION_CATEGORIES, STEPS } from '../wizardConstants';

describe('result appointment wizard reducer', () => {
  it('advances to storm damage when roof inspected is yes', () => {
    const next = wizardReducer(initialState, {
      type: ACTIONS.SELECT_ROOF_INSPECTED,
      value: 'yes',
    });
    expect(next.step).toBe(STEPS.STORM_DAMAGE);
  });

  it('sends inspection not completed to confirm when rescheduled', () => {
    const stepOne = wizardReducer(initialState, {
      type: ACTIONS.SELECT_ROOF_INSPECTED,
      value: 'no',
    });
    const rescheduled = wizardReducer(stepOne, {
      type: ACTIONS.SET_RESCHEDULE_DATE,
      value: '2026-03-10',
    });
    expect(rescheduled.step).toBe(STEPS.CONFIRM);
    const disposition = deriveDisposition(rescheduled);
    expect(disposition.category).toBe(DISPOSITION_CATEGORIES.RESCHEDULED);
  });

  it('sets follow up scheduled when follow up date provided', () => {
    const stepOne = wizardReducer(initialState, {
      type: ACTIONS.SET_FOLLOW_UP_DATE,
      value: '2026-03-12',
    });
    const disposition = deriveDisposition(stepOne);
    expect(disposition.category).toBe(DISPOSITION_CATEGORIES.FOLLOW_UP_SCHEDULED);
  });
});
