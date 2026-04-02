import { describe, expect, it } from 'vitest';
import {
  applyColumnOrder,
  extractColumnKeys,
  hasCustomColumnOrder,
  moveOrderedValue,
  normalizeOrderedKeys,
} from '../reportColumnOrder';

describe('report column order utilities', () => {
  it('moves a selected field up or down for builder persistence', () => {
    expect(moveOrderedValue(['name', 'stage', 'amount'], 'stage', 'up')).toEqual([
      'stage',
      'name',
      'amount',
    ]);
    expect(moveOrderedValue(['name', 'stage', 'amount'], 'stage', 'down')).toEqual([
      'name',
      'amount',
      'stage',
    ]);
  });

  it('keeps the default column order when no custom order exists', () => {
    expect(normalizeOrderedKeys([], ['name', 'stage', 'amount'])).toEqual([
      'name',
      'stage',
      'amount',
    ]);
    expect(hasCustomColumnOrder([], ['name', 'stage', 'amount'])).toBe(false);
  });

  it('applies runtime column order display-only and appends new columns safely', () => {
    const columns = [
      { key: 'name', label: 'Job Name' },
      { key: 'stage', label: 'Stage' },
      { key: 'amount', label: 'Amount' },
      { key: 'timeline', label: 'Timeline' },
    ];

    expect(extractColumnKeys(columns)).toEqual(['name', 'stage', 'amount', 'timeline']);
    expect(applyColumnOrder(columns, ['timeline', 'amount', 'name'])).toEqual([
      { key: 'timeline', label: 'Timeline' },
      { key: 'amount', label: 'Amount' },
      { key: 'name', label: 'Job Name' },
      { key: 'stage', label: 'Stage' },
    ]);
    expect(hasCustomColumnOrder(['timeline', 'amount', 'name'], ['name', 'stage', 'amount', 'timeline'])).toBe(true);
  });
});
