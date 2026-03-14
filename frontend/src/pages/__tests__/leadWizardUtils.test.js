import { describe, expect, it } from 'vitest';
import {
  canLeadWizardConvert,
  LEAD_WIZARD_STEPS,
  hasLeadWizardContactMethod,
  hasLeadWizardRequiredFields,
  isLeadWizardSalesRole,
  shouldDefaultLeadSourceToSelfGen,
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

  it('defaults new sales leads to Self-Gen only when no source is already set', () => {
    expect(shouldDefaultLeadSourceToSelfGen({
      isNewLead: true,
      isCallCenter: false,
      isSalesRole: true,
      leadSource: '',
    })).toBe(true);

    expect(shouldDefaultLeadSourceToSelfGen({
      isNewLead: true,
      isCallCenter: false,
      isSalesRole: true,
      leadSource: 'Referral',
    })).toBe(false);
  });

  it('detects sales roles without treating call center as sales', () => {
    expect(isLeadWizardSalesRole({
      roleName: 'sales rep',
      roleType: 'sales_rep',
      isCallCenter: false,
    })).toBe(true);

    expect(isLeadWizardSalesRole({
      roleName: 'call center',
      roleType: 'call_center',
      isCallCenter: true,
    })).toBe(false);
  });

  it('allows conversion for new leads once required fields are complete', () => {
    expect(canLeadWizardConvert({
      isNewLead: true,
      lead: null,
      hasRequiredFields: true,
      canForceConvert: false,
    })).toBe(true);
  });
});
