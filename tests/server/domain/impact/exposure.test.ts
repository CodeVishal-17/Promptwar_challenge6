import { describe, expect, it } from 'vitest';
import {
  INHALATION_M3_PER_MIN,
  exposureChangeImpact,
  inhaledDoseUg,
  sameTripExposureImpact,
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

  it('shows small doses with one decimal, so a clean day never reads "0 µg"', () => {
    const dose = (conc: number, r: number, minutes: number) =>
      exposureChangeImpact('x', { conc, rate: r, minutes }, { conc, rate: r, minutes }).inputs[0]
        ?.value;
    expect(dose(150, 0.05, 45)).toMatch(/= 338 µg$/); // 337.5: whole µg from 10 up
    expect(dose(6, 0.012, 10)).toMatch(/= 0\.7 µg$/); // 0.72
    expect(dose(20, 0.011, 30)).toMatch(/= 6\.6 µg$/); // 6.6
    expect(dose(6, 0.0042, 1)).toMatch(/= <0\.1 µg$/); // 0.0252
    expect(dose(6, 0.0042, 1)).not.toMatch(/= 0 µg/);
  });

  it('throws when the baseline dose is zero', () => {
    expect(() =>
      exposureChangeImpact('x', { conc: 0, rate, minutes: 30 }, { conc: 5, rate, minutes: 30 }),
    ).toThrow(RangeError);
  });
});

describe('sameTripExposureImpact', () => {
  const impact = sameTripExposureImpact(
    'Leave an hour earlier',
    { label: 'Usual departure', conc: 150 },
    { label: 'An hour earlier', conc: 40 },
  );

  it('gives the change in PM2.5 breathed in on the same trip as the change in concentration', () => {
    expect(impact.value).toBe(-73);
    expect(impact.unit).toBe('%');
    expect(impact.display).toBe('−73% PM2.5 inhaled');
    expect(impact.inputs).toEqual([
      { label: 'Usual departure', value: '150 µg/m³ PM2.5' },
      { label: 'An hour earlier', value: '40 µg/m³ PM2.5' },
    ]);
  });
  it('states why rate and minutes cancel, and cites the EPA handbook for the dose formula', () => {
    expect(impact.formula).toMatch(/inhalation rate/);
    expect(impact.assumptions.join(' ')).toMatch(/same length and effort/);
    expect(impact.sources).toEqual([EPA_EFH_CH6]);
  });
  it('throws without a positive baseline', () => {
    const at = (conc: number) => ({ label: 'x', conc });
    expect(() => sameTripExposureImpact('x', at(0), at(5))).toThrow(RangeError);
    expect(() => sameTripExposureImpact('x', at(10), at(-1))).toThrow(RangeError);
  });
});
