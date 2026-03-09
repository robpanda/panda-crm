import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  deriveDisposition,
  initialState,
  wizardReducer,
} from '../wizardReducer';
import { DISPOSITION_CATEGORIES, STEPS } from '../wizardConstants';

const transition = (state, action) => wizardReducer(state, action);

describe('result appointment wizard reducer', () => {
  it('inspected yes auto-advances to storm damage', () => {
    const next = transition(initialState, {
      type: ACTIONS.SELECT_ROOF_INSPECTED,
      value: 'yes',
    });
    expect(next.step).toBe(STEPS.STORM_DAMAGE);
  });

  it('storm damage yes routes to insurance claim flow', () => {
    const inspected = transition(initialState, {
      type: ACTIONS.SELECT_ROOF_INSPECTED,
      value: 'yes',
    });
    const next = transition(inspected, {
      type: ACTIONS.SELECT_STORM_DAMAGE,
      value: 'yes',
    });
    expect(next.step).toBe(STEPS.INSURANCE_CLAIM);
  });

  it('storm damage no routes to retail path', () => {
    const inspected = transition(initialState, {
      type: ACTIONS.SELECT_ROOF_INSPECTED,
      value: 'yes',
    });
    const next = transition(inspected, {
      type: ACTIONS.SELECT_STORM_DAMAGE,
      value: 'no',
    });
    expect(next.step).toBe(STEPS.RETAIL_OUTCOME);
  });

  it('no-claim + follow-up yields FOLLOW_UP_SCHEDULED disposition', () => {
    let state = transition(initialState, { type: ACTIONS.SELECT_ROOF_INSPECTED, value: 'yes' });
    state = transition(state, { type: ACTIONS.SELECT_STORM_DAMAGE, value: 'yes' });
    state = transition(state, {
      type: ACTIONS.SELECT_INSURANCE_OUTCOME,
      value: 'no-claim-filed',
    });
    state = transition(state, { type: ACTIONS.SET_NO_CLAIM_REASON, value: 'FOLLOW_UP_SCHEDULED' });
    state = transition(state, { type: ACTIONS.START_FOLLOW_UP, context: 'INSURANCE_NO_CLAIM' });
    state = transition(state, { type: ACTIONS.SELECT_FOLLOW_UP_MODE, value: 'VIRTUAL' });
    state = transition(state, { type: ACTIONS.SET_FIELD, field: 'virtualDueDate', value: '2026-03-10' });

    const disposition = deriveDisposition(state);
    expect(disposition.category).toBe(DISPOSITION_CATEGORIES.FOLLOW_UP_SCHEDULED);
    expect(disposition.followUpType).toBe('VIRTUAL');
  });

  it('retail no-sale + scheduled follow-up early exits as FOLLOW_UP_SCHEDULED', () => {
    let state = transition(initialState, { type: ACTIONS.SELECT_ROOF_INSPECTED, value: 'yes' });
    state = transition(state, { type: ACTIONS.SELECT_STORM_DAMAGE, value: 'no' });
    state = transition(state, { type: ACTIONS.SELECT_RETAIL_OUTCOME, value: 'no' });
    state = transition(state, {
      type: ACTIONS.SET_RETAIL_NO_SALE_REASON,
      value: 'PRICE_TOO_HIGH',
    });
    state = transition(state, { type: ACTIONS.START_FOLLOW_UP, context: 'RETAIL_NOT_SOLD' });
    state = transition(state, { type: ACTIONS.SELECT_FOLLOW_UP_MODE, value: 'IN_PERSON' });
    state = transition(state, { type: ACTIONS.SET_FIELD, field: 'inPersonDate', value: '2026-03-11' });
    state = transition(state, { type: ACTIONS.SET_FIELD, field: 'inPersonTime', value: '13:30' });

    const disposition = deriveDisposition(state);
    expect(disposition.category).toBe(DISPOSITION_CATEGORIES.FOLLOW_UP_SCHEDULED);
    expect(disposition.followUpType).toBe('IN_PERSON');
  });

  it('go back returns prior step', () => {
    let state = transition(initialState, { type: ACTIONS.SELECT_ROOF_INSPECTED, value: 'yes' });
    state = transition(state, { type: ACTIONS.SELECT_STORM_DAMAGE, value: 'yes' });
    expect(state.step).toBe(STEPS.INSURANCE_CLAIM);

    state = transition(state, { type: ACTIONS.GO_BACK });
    expect(state.step).toBe(STEPS.STORM_DAMAGE);
  });

  it('changing storm damage clears insurance-only state', () => {
    let state = transition(initialState, { type: ACTIONS.SELECT_ROOF_INSPECTED, value: 'yes' });
    state = transition(state, { type: ACTIONS.SELECT_STORM_DAMAGE, value: 'yes' });
    state = transition(state, {
      type: ACTIONS.SELECT_INSURANCE_OUTCOME,
      value: 'filed-claim',
    });
    state = transition(state, { type: ACTIONS.SET_FIELD, field: 'claimNumber', value: 'CLM-123' });

    state = transition(state, { type: ACTIONS.SELECT_STORM_DAMAGE, value: 'no' });

    expect(state.step).toBe(STEPS.RETAIL_OUTCOME);
    expect(state.claimNumber).toBe('');
    expect(state.insuranceOutcome).toBe(null);
  });
});
