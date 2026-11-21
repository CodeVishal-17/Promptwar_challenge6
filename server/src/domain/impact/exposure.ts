import type { ActivityLevel, AgeGroup, Impact } from '../../../../shared/types.js';
import { assertNonNegative, formatNumber, formatPercentChange, roundPercent } from './format.js';
import { EPA_EFH_CH6 } from './sources.js';

/**
 * Mean short-term inhalation rates in m³/min, males and females combined.
 * US EPA Exposure Factors Handbook (2011), Table 6-2, pp. 6-4 to 6-5, "Mean" column.
 * Rows used: child = 6 to <11 years, adult = 21 to <31 years, older = 61 to <71 years;
 * levels: Sedentary/Passive, Light Intensity, Moderate Intensity, High Intensity.
 */
export const INHALATION_M3_PER_MIN: Record<AgeGroup, Record<ActivityLevel, number>> = {
  child: { sedentary: 4.8e-3, light: 1.1e-2, moderate: 2.2e-2, high: 4.2e-2 },
  adult: { sedentary: 4.2e-3, light: 1.2e-2, moderate: 2.6e-2, high: 5.0e-2 },
  older: { sedentary: 4.9e-3, light: 1.2e-2, moderate: 2.6e-2, high: 4.7e-2 },
};

/** Inhaled mass in µg: concentration (µg/m³) × inhalation rate (m³/min) × minutes. */
export function inhaledDoseUg(concUgM3: number, rateM3PerMin: number, minutes: number): number {
  assertNonNegative('concUgM3', concUgM3);
  assertNonNegative('rateM3PerMin', rateM3PerMin);
  assertNonNegative('minutes', minutes);
  return concUgM3 * rateM3PerMin * minutes;
}

export interface ExposureScenario {
  /** PM2.5 in µg/m³. */
  conc: number;
  /** Inhalation rate in m³/min (see INHALATION_M3_PER_MIN). */
  rate: number;
  minutes: number;
}

/** Whole µg from 10 up; one decimal below, and "<0.1" rather than a misleading "0". */
function formatDose(ug: number): string {
  if (ug >= 10) return formatNumber(ug, 0);
  if (ug > 0 && ug < 0.05) return '<0.1';
  return formatNumber(ug, 1);
}

const describe = (s: ExposureScenario): string =>
  `${formatNumber(s.conc, 1)} µg/m³ × ${formatNumber(s.rate, 4)} m³/min × ${formatNumber(s.minutes, 0)} min = ${formatDose(inhaledDoseUg(s.conc, s.rate, s.minutes))} µg`;

/** The PM2.5 in the air at one moment, with a label saying which. */
export interface LabelledConcentration {
  label: string;
  /** PM2.5 in µg/m³. */
  conc: number;
}

/**
 * Percentage change in inhaled PM2.5 for the same trip made at another hour. With the same
 * length and effort, rate × minutes cancels in (after − before) ÷ before, so the change in
 * the dose equals the change in concentration and no trip length has to be assumed.
 * Throws a RangeError without a positive baseline.
 */
export function sameTripExposureImpact(
  label: string,
  before: LabelledConcentration,
  after: LabelledConcentration,
): Impact {
  assertNonNegative('before.conc', before.conc);
  assertNonNegative('after.conc', after.conc);
  if (before.conc === 0)
    throw new RangeError('The baseline PM2.5 is zero, so a percentage change is undefined');
  const value = roundPercent(((after.conc - before.conc) / before.conc) * 100);
  const conc = (c: LabelledConcentration) => ({
    label: c.label,
    value: `${formatNumber(c.conc, 1)} µg/m³ PM2.5`,
  });
  return {
    label,
    value,
    unit: '%',
    display: `${formatPercentChange(value)} PM2.5 inhaled`,
    formula:
      'inhaled PM2.5 = PM2.5 (µg/m³) × inhalation rate (m³/min) × minutes; for the same trip, rate and minutes cancel, so change = (PM2.5 after − PM2.5 before) ÷ PM2.5 before',
    inputs: [conc(before), conc(after)],
    assumptions: [
      'The trip is the same length and effort at either hour, so the change in PM2.5 breathed in equals the change in PM2.5 in the air.',
      'PM2.5 is the level in the air you breathe during the trip.',
    ],
    sources: [EPA_EFH_CH6],
  };
}

/**
 * Percentage change in inhaled PM2.5 going from scenario `a` to scenario `b`,
 * rounded to an integer; negative means less inhaled.
 * Throws a RangeError when `a` has a zero dose (no baseline to compare with).
 */
export function exposureChangeImpact(
  label: string,
  a: ExposureScenario,
  b: ExposureScenario,
): Impact {
  const doseA = inhaledDoseUg(a.conc, a.rate, a.minutes);
  const doseB = inhaledDoseUg(b.conc, b.rate, b.minutes);
  if (doseA === 0)
    throw new RangeError('The baseline inhaled dose is zero, so a percentage change is undefined');
  const value = roundPercent(((doseB - doseA) / doseA) * 100);
  return {
    label,
    value,
    unit: '%',
    display: `${formatPercentChange(value)} PM2.5 inhaled`,
    formula:
      'inhaled PM2.5 (µg) = PM2.5 (µg/m³) × inhalation rate (m³/min) × minutes; change = (after − before) ÷ before',
    inputs: [
      { label: 'Before', value: describe(a) },
      { label: 'After', value: describe(b) },
    ],
    assumptions: [
      'Inhalation rates are US EPA mean short-term rates for the age group and activity level (males and females combined).',
      'PM2.5 is the level in the air you breathe during the activity.',
    ],
    sources: [EPA_EFH_CH6],
  };
}
