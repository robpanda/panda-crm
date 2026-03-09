import { describe, expect, it } from 'vitest';
import { resolveOpportunityTypeFromWorkType } from '../leadConversion';

describe('lead conversion defaults', () => {
  it('defaults to INSURANCE when work type is missing', () => {
    expect(resolveOpportunityTypeFromWorkType(null)).toBe('INSURANCE');
    expect(resolveOpportunityTypeFromWorkType('')).toBe('INSURANCE');
  });

  it('maps Retail to RETAIL opportunity type', () => {
    expect(resolveOpportunityTypeFromWorkType('Retail')).toBe('RETAIL');
    expect(resolveOpportunityTypeFromWorkType('retail')).toBe('RETAIL');
  });

  it('keeps non-retail work types on insurance path by default', () => {
    expect(resolveOpportunityTypeFromWorkType('Insurance')).toBe('INSURANCE');
    expect(resolveOpportunityTypeFromWorkType('Roofing')).toBe('INSURANCE');
  });
});
