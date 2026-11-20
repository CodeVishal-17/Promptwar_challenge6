import { describe, expect, it } from 'vitest';
import {
  INHALATION_M3_PER_MIN,
  exposureChangeImpact,
  inhaledDoseUg,
} from '../../../../server/src/domain/impact/exposure.js';
import { EPA_EFH_CH6 } from '../../../../server/src/domain/impact/sources.js';

describe('INHALATION_M3_PER_MIN (EPA EFH 2011, Table 6-2 means)', () => {
  it('matches the table for the three age groups', () => {
    expect(INHALATION_M3_PER_MIN.child).toEqual({
      sedentary: 4.8e-3,
      light: 1.1e-2,
      moderate: 2.2e-2,
      high: 4.2e-2,
    });
    expect(INHALATION_M3_PER_MIN.adult).toEqual({
      sedentary: 4.2e-3,
      light: 1.2e-2,
      moderate: 2.6e-2,
      high: 5.0e-2,
    });
    expect(INHALATION_M3_PER_MIN.older).toEqual({
      sedentary: 4.9e-3,
      light: 1.2e-2,
      moderate: 2.6e-2,
      high: 4.7e-2,
    });
  });

  it('keeps the adult high rate in a plausible band', () => {
    expect(INHALATION_M3_PER_MIN.adult.high).toBeGreaterThanOrEqual(0.03);
    expect(INHALATION_M3_PER_MIN.adult.high).toBeLessThanOrEqual(0.07);
  });
});

describe('inhaledDoseUg', () => {
  it('multiplies concentration, rate and minutes', () => {
    expect(inhaledDoseUg(50, 0.05, 60)).toBeCloseTo(150, 5);
    expect(inhaledDoseUg(0, 0.05, 60)).toBe(0);
  });
  it('rejects negative inputs', () => {
    expect(() => inhaledDoseUg(-1, 0.05, 60)).toThrow(RangeError);
    expect(() => inhaledDoseUg(10, 0.05, Number.NaN)).toThrow(RangeError);
  });
});

describe('exposureChangeImpact', () => {
  const rate = INHALATION_M3_PER_MIN.adult.high;

  it('gives the integer percentage change from a to b', () => {
    const impact = exposureChangeImpact(
      'Run at 6 pm instead of 7 am',
      { conc: 80, rate, minutes: 45 },
      { conc: 30, rate, minutes: 45 },
    );
    expect(impact.value).toBe(-63); // (30 − 80) / 80 = −62.5 % → −63
    expect(impact.unit).toBe('%');
    expect(impact.display).toBe('−63% PM2.5 inhaled');
    expect(impact.label).toBe('Run at 6 pm instead of 7 am');
    expect(impact.sources).toContain(EPA_EFH_CH6);
    expect(impact.formula).toMatch(/µg\/m³.*m³\/min.*min/);
    expect(impact.inputs.length).toBeGreaterThanOrEqual(2);
  });

  it('shows increases with a plus sign', () => {
    const impact = exposureChangeImpact(
      'x',
      { conc: 20, rate, minutes: 30 },
      { conc: 25, rate, minutes: 30 },
    );
    expect(impact.value).toBe(25);
    expect(impact.display).toBe('+25% PM2.5 inhaled');
  });

  it('accounts for activity level and duration', () => {
    const sit = INHALATION_M3_PER_MIN.adult.sedentary;
    const impact = exposureChangeImpact(
      'Walk instead of run',
      { conc: 50, rate, minutes: 30 },
      { conc: 50, rate: sit, minutes: 60 },
    );
    // (4.2e-3 × 60) / (5.0e-2 × 30) = 0.168 → −83.2 %
    expect(impact.value).toBe(-83);
  });

  it('throws when the baseline dose is zero', () => {
    expect(() =>
      exposureChangeImpact('x', { conc: 0, rate, minutes: 30 }, { conc: 5, rate, minutes: 30 }),
    ).toThrow(RangeError);
  });
});
