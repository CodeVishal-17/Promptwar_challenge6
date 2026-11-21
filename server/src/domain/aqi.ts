import type {
  AqiCategory,
  AqiReading,
  HourlyConcentrations,
  Pollutant,
  Source,
} from '../../../shared/types.js';
import { ugm3ToPpb } from './units.js';

export type AqiMetric = 'pm2_5_24h' | 'pm10_24h' | 'o3_8h' | 'o3_1h' | 'no2_1h';

export const AQI_SOURCE: Source = {
  title:
    'Technical Assistance Document for the Reporting of Daily Air Quality – the Air Quality Index (AQI)',
  url: 'https://document.airnow.gov/technical-assistance-document-for-the-reporting-of-daily-air-quailty.pdf',
  year: 2024,
};

/** One breakpoint row: concentration low/high and the AQI low/high it maps to. */
type Segment = readonly [cLo: number, cHi: number, iLo: number, iHi: number];

interface MetricSpec {
  /** Decimal places concentrations are truncated to (EPA TAD Table 6 reporting precision). */
  decimals: number;
  segments: readonly Segment[];
  /** Whether values above the last segment extend its line (EPA TAD, footnote 4). */
  extendsAboveTop: boolean;
}

const SPECS: Record<AqiMetric, MetricSpec> = {
  // µg/m³
  pm2_5_24h: {
    decimals: 1,
    extendsAboveTop: true,
    segments: [
      [0, 9.0, 0, 50],
      [9.1, 35.4, 51, 100],
      [35.5, 55.4, 101, 150],
      [55.5, 125.4, 151, 200],
      [125.5, 225.4, 201, 300],
      [225.5, 325.4, 301, 500],
    ],
  },
  // µg/m³
  pm10_24h: {
    decimals: 0,
    extendsAboveTop: true,
    segments: [
      [0, 54, 0, 50],
      [55, 154, 51, 100],
      [155, 254, 101, 150],
      [255, 354, 151, 200],
      [355, 424, 201, 300],
      [425, 604, 301, 500],
    ],
  },
  // ppm; the 8-hour table has no values at 301 and above
  o3_8h: {
    decimals: 3,
    extendsAboveTop: false,
    segments: [
      [0, 0.054, 0, 50],
      [0.055, 0.07, 51, 100],
      [0.071, 0.085, 101, 150],
      [0.086, 0.105, 151, 200],
      [0.106, 0.2, 201, 300],
    ],
  },
  // ppm; the 1-hour table is only defined from 0.125 ppm upward
  o3_1h: {
    decimals: 3,
    extendsAboveTop: true,
    segments: [
      [0.125, 0.164, 101, 150],
      [0.165, 0.204, 151, 200],
      [0.205, 0.404, 201, 300],
      [0.405, 0.604, 301, 500],
    ],
  },
  // ppb
  no2_1h: {
    decimals: 0,
    extendsAboveTop: true,
    segments: [
      [0, 53, 0, 50],
      [54, 100, 51, 100],
      [101, 360, 101, 150],
      [361, 649, 151, 200],
      [650, 1249, 201, 300],
      [1250, 2049, 301, 500],
    ],
  },
};

/** Tolerance that keeps values like 9.1 (stored as 9.0999…) from truncating down a step. */
const TRUNCATION_EPSILON = 1e-6;

/**
 * Sub-index for one metric via EPA Equation 1, I = (Ihi-Ilo)/(BPhi-BPlo) * (C-BPlo) + Ilo.
 * Concentrations are truncated to the metric's reporting precision first, and the arithmetic
 * runs on integers in that precision's unit so rounding matches the EPA worked examples.
 * Returns null when the concentration is invalid or outside the metric's defined range.
 */
export function subIndex(metric: AqiMetric, c: number): number | null {
  if (!Number.isFinite(c) || c < 0) return null;
  const { decimals, segments, extendsAboveTop } = SPECS[metric];
  const scale = 10 ** decimals;
  const x = Math.floor(c * scale + TRUNCATION_EPSILON);

  const first = segments[0];
  const last = segments[segments.length - 1];
  if (!first || !last) return null;
  if (x < Math.round(first[0] * scale)) return null;

  const row = segments.find(([, cHi]) => x <= Math.round(cHi * scale));
  if (!row && !extendsAboveTop) return null;

  const [cLo, cHi, iLo, iHi] = row ?? last;
  const lo = Math.round(cLo * scale);
  const hi = Math.round(cHi * scale);
  return Math.round(((iHi - iLo) * (x - lo)) / (hi - lo) + iLo);
}

/** Maps an AQI value to its EPA category; anything of 301 or more is hazardous. */
export function categoryFor(aqi: number): AqiCategory {
  if (aqi <= 50) return 'good';
  if (aqi <= 100) return 'moderate';
  if (aqi <= 150) return 'usg';
  if (aqi <= 200) return 'unhealthy';
  if (aqi <= 300) return 'very_unhealthy';
  return 'hazardous';
}

/**
 * Mean of the `hours` values ending at index `end` (inclusive).
 * Null when fewer than `hours` of history exist or fewer than `minValid` readings are usable.
 */
export function trailingMean(
  values: (number | null)[],
  end: number,
  hours: number,
  minValid: number,
): number | null {
  const start = end - hours + 1;
  if (start < 0 || end >= values.length) return null;
  let sum = 0;
  let count = 0;
  for (let k = start; k <= end; k++) {
    const v = values[k];
    if (v !== null && v !== undefined && Number.isFinite(v)) {
      sum += v;
      count++;
    }
  }
  return count >= minValid && count > 0 ? sum / count : null;
}

function validAt(values: (number | null)[], i: number): number | null {
  const v = values[i];
  return v !== null && v !== undefined && Number.isFinite(v) ? v : null;
}

/** Hours the NowCast looks back over, the current hour included. */
const NOWCAST_HOURS = 12;
/** Lowest NowCast weight factor; at 0.5 the NowCast approximates a 3-hour average. */
const NOWCAST_MIN_WEIGHT = 0.5;

/**
 * EPA NowCast for PM2.5 and PM10 at index `end` of an hourly series (µg/m³), the method AirNow
 * uses for hourly PM AQI. Source: AQI_SOURCE (EPA TAD 2024, p. 16, "NowCast").
 * Over the last 12 hours: weight factor w = 1 − (max − min) / max, at least 0.5, and
 * NowCast = Σ w^k·c_k / Σ w^k, with k hours ago (0 = the current hour). Missing hours are
 * skipped in both sums. Null unless at least 2 of the 3 most recent hours are valid.
 */
export function nowCast(values: (number | null)[], end: number): number | null {
  if (end < 0 || end >= values.length) return null;
  const recent: { c: number; k: number }[] = [];
  for (let k = 0; k < NOWCAST_HOURS && end - k >= 0; k++) {
    const c = validAt(values, end - k);
    if (c !== null) recent.push({ c, k });
  }
  if (recent.filter(({ k }) => k < 3).length < 2) return null;

  const cs = recent.map(({ c }) => c);
  const max = Math.max(...cs);
  if (max === 0) return 0;
  const min = Math.min(...cs);
  const w = Math.max(NOWCAST_MIN_WEIGHT, 1 - (max - min) / max);

  let weighted = 0;
  let weights = 0;
  for (const { c, k } of recent) {
    weighted += w ** k * c;
    weights += w ** k;
  }
  return weighted / weights;
}

/** Best (highest) of the non-null candidates, or null if there are none. */
function maxOrNull(...candidates: (number | null)[]): number | null {
  const present = candidates.filter((v): v is number => v !== null);
  return present.length > 0 ? Math.max(...present) : null;
}

const POLLUTANT_ORDER: readonly Pollutant[] = ['pm2_5', 'pm10', 'o3', 'no2'];

/** `f(value)`, or null when there is no value. */
const mapOrNull = (value: number | null, f: (n: number) => number | null): number | null =>
  value === null ? null : f(value);

/** µg/m³ of ozone to ppm, the unit of its breakpoints. */
const o3Ppm = (ug: number): number => ugm3ToPpb(ug, 'o3') / 1000;

/** Each pollutant's sub-index for hour `i`, or null where its averaging rule has too little data. */
function subIndices(s: HourlyConcentrations, i: number): Record<Pollutant, number | null> {
  return {
    pm2_5: mapOrNull(nowCast(s.pm2_5, i), (c) => subIndex('pm2_5_24h', c)),
    pm10: mapOrNull(nowCast(s.pm10, i), (c) => subIndex('pm10_24h', c)),
    o3: maxOrNull(
      mapOrNull(trailingMean(s.o3, i, 8, 6), (c) => subIndex('o3_8h', o3Ppm(c))),
      mapOrNull(validAt(s.o3, i), (c) => subIndex('o3_1h', o3Ppm(c))),
    ),
    no2: mapOrNull(validAt(s.no2, i), (c) => subIndex('no2_1h', ugm3ToPpb(c, 'no2'))),
  };
}

/**
 * AQI for hour index `i` of an hourly series (concentrations in µg/m³).
 * PM uses the EPA NowCast on the 24-hour breakpoints (as AirNow does for hourly PM), ozone the
 * higher of its 8-hour (6 valid) and 1-hour sub-indices, NO2 the 1-hour value. Overall AQI is
 * the highest sub-index. Returns null when no pollutant yields a sub-index.
 */
export function computeHourlyAqi(s: HourlyConcentrations, i: number): AqiReading | null {
  const time = s.time[i];
  if (time === undefined) return null;

  const candidates = subIndices(s, i);
  const perPollutant: Partial<Record<Pollutant, number>> = {};
  let dominant: Pollutant | null = null;
  let aqi = -1;
  for (const p of POLLUTANT_ORDER) {
    const v = candidates[p];
    if (v === null) continue;
    perPollutant[p] = v;
    if (v > aqi) {
      aqi = v;
      dominant = p;
    }
  }
  if (dominant === null) return null;

  return { time, aqi, category: categoryFor(aqi), dominant, perPollutant };
}
