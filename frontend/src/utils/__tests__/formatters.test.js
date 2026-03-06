import { describe, expect, it } from 'vitest';
import { normalizePandaEmployeeEmail } from '../formatters';

describe('normalizePandaEmployeeEmail', () => {
  it('removes dots from local-part for pandaexteriors.com domain', () => {
    expect(normalizePandaEmployeeEmail('first.last@pandaexteriors.com'))
      .toBe('firstlast@pandaexteriors.com');
  });

  it('removes dots from local-part for panda-exteriors.com domain', () => {
    expect(normalizePandaEmployeeEmail('first.last@panda-exteriors.com'))
      .toBe('firstlast@panda-exteriors.com');
  });

  it('leaves other domains unchanged', () => {
    expect(normalizePandaEmployeeEmail('first.last@example.com'))
      .toBe('first.last@example.com');
  });

  it('handles trimmed mixed-case input', () => {
    expect(normalizePandaEmployeeEmail('  First.Last@PandaExteriors.com '))
      .toBe('firstlast@pandaexteriors.com');
  });
});
