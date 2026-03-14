import { describe, expect, it } from 'vitest';
import {
  LEAD_WIZARD_STEPS,
  hasLeadWizardContactMethod,
  hasLeadWizardRequiredFields,
} from '../leadWizardUtils';

describe('leadWizardUtils', () => {
  it('keeps the lead wizard at three steps', () => {
    expect(LEAD_WIZARD_STEPS.map((step) => step.name)).toEqual([
      'Info',
      'Address',
      'Qualify',
    ]);
  });

  it('accepts a phone-only submission as a valid contact method', () => {
    expect(hasLeadWizardContactMethod({
      email: '',
      phone: '(410) 555-1234',
      mobilePhone: '',
    })).toBe(true);
  });

  it('accepts an email-only submission as a valid contact method', () => {
    expect(hasLeadWizardContactMethod({
      email: 'lead@example.com',
      phone: '',
      mobilePhone: '',
    })).toBe(true);
  });

  it('allows step-three submission when email is blank but phone is present', () => {
    expect(hasLeadWizardRequiredFields({
      isCallCenter: false,
      formData: {
        firstName: 'Rob',
        lastName: 'Panda',
        leadSource: 'Self-Gen',
        email: '',
        phone: '(410) 555-1234',
        mobilePhone: '',
      },
    })).toBe(true);
  });
});
