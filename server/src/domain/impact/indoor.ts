import type { Impact, Source } from '../../../../shared/types.js';
import {
  assertNonNegative,
  assertPositive,
  formatNumber,
  formatPercentChange,
  roundPercent,
} from './format.js';
import { EPA_AIR_CLEANER_GUIDE, XIANG_2021, uniqueSources } from './sources.js';

/**
 * Steady-state single-zone mass balance for indoor PM2.5 of outdoor origin
 * (Xiang et al. 2021, Equation 1, at steady state):
 *   C_in = P · a · C_out / (a + k + CADR/V)
 */

const FT_M = 0.3048;
const CFM_TO_M3_PER_H = FT_M ** 3 * 60;

/**
 * EPA "Portable Air Cleaner Sizing for Particle Removal": minimum CADR of 65 cfm per
 * 100 sq ft of floor, for an 8 ft ceiling (195 cfm for 300 sq ft). That is
 * 65 × 60 / (100 × 8) = 4.875 room volumes of clean air per hour.
 */
export const EPA_MIN_CLEAN_AIR_CHANGES_PER_H = (65 * 60) / (100 * 8);

const DEFAULT_ROOM_SQFT = 300;
const DEFAULT_CEILING_FT = 8;

export const INDOOR_DEFAULTS = {
  /**
   * Air changes per hour with windows closed: median of the five residence means in
   * Xiang et al. 2021, Table 4 (0.30, 0.32, 0.53, 1.27, 1.41 h⁻¹).
   */
  achClosed: 0.53,
  /**
   * PM2.5 deposition rate to indoor surfaces: median of the five residence means in
   * Xiang et al. 2021, Table 4 (0.10, 0.15, 0.26, 0.36, 0.49 h⁻¹).
   */
  kDepPm25: 0.26,
  /** PM2.5 penetration factor with windows closed: mean 0.97 used by Xiang et al. 2021, §2.3 (from Fisk and Chan 2017). */
  penetration: 0.97,
  /** EPA chart row: 300 sq ft room → minimum CADR 195 cfm (≈331 m³/h). */
  purifierCadrM3h: 195 * CFM_TO_M3_PER_H,
  /** EPA chart row: 300 sq ft × 8 ft ceiling (≈68 m³). */
  roomM3: DEFAULT_ROOM_SQFT * DEFAULT_CEILING_FT * FT_M ** 3,
} as const;

export const INDOOR_DEFAULT_SOURCES: Record<keyof typeof INDOOR_DEFAULTS, Source> = {
  achClosed: XIANG_2021,
  kDepPm25: XIANG_2021,
  penetration: XIANG_2021,
  purifierCadrM3h: EPA_AIR_CLEANER_GUIDE,
  roomM3: EPA_AIR_CLEANER_GUIDE,
};

export interface IndoorOptions {
  /** Air changes per hour (h⁻¹); defaults to the closed-window value. */
  ach?: number;
  /** Purifier clean air delivery rate (m³/h); omitted means no purifier. */
  cadrM3h?: number;
  /** Room volume (m³); defaults to INDOOR_DEFAULTS.roomM3 when a purifier is given. */
  roomM3?: number;
}

/** Steady-state indoor PM2.5 (µg/m³) of outdoor origin: P·a·C_out / (a + k + CADR/V). */
export function indoorPm25(outdoor: number, o: IndoorOptions = {}): number {
  assertNonNegative('outdoor PM2.5', outdoor);
  const a = o.ach ?? INDOOR_DEFAULTS.achClosed;
  assertPositive('ach', a);
  let purifier = 0;
  if (o.cadrM3h !== undefined) {
    assertNonNegative('cadrM3h', o.cadrM3h);
    const room = o.roomM3 ?? INDOOR_DEFAULTS.roomM3;
    assertPositive('roomM3', room);
    purifier = o.cadrM3h / room;
  }
  return (INDOOR_DEFAULTS.penetration * a * outdoor) / (a + INDOOR_DEFAULTS.kDepPm25 + purifier);
}

/** Fraction of indoor PM2.5 removed by a purifier: (CADR/V) / (a + k + CADR/V). */
export function purifierReduction(
  cadrM3h: number,
  roomM3: number,
  ach: number = INDOOR_DEFAULTS.achClosed,
): number {
  assertNonNegative('cadrM3h', cadrM3h);
  assertPositive('roomM3', roomM3);
  assertPositive('ach', ach);
  const p = cadrM3h / roomM3;
  return p / (ach + INDOOR_DEFAULTS.kDepPm25 + p);
}

const modelAssumptions = (ach: number, achGiven: boolean): string[] => [
  achGiven
    ? `Air exchange with windows closed: ${formatNumber(ach, 2)} per hour.`
    : `Air exchange with windows closed: ${INDOOR_DEFAULTS.achClosed} per hour (median of homes measured by Xiang et al. 2021).`,
  `PM2.5 settles onto indoor surfaces at ${INDOOR_DEFAULTS.kDepPm25} per hour and ${Math.round(INDOOR_DEFAULTS.penetration * 100)}% of incoming PM2.5 gets through the building shell (Xiang et al. 2021).`,
  'Steady state, well-mixed air, and no indoor sources such as cooking, smoking or incense.',
];

const ug = (v: number): string => `${formatNumber(v, 0)} µg/m³`;

/** Indoor PM2.5 change from running a portable purifier in a closed room. */
export function purifierImpact(outdoorPm25: number, cadrM3h?: number, roomM3?: number): Impact {
  assertNonNegative('outdoor PM2.5', outdoorPm25);
  const room = roomM3 ?? INDOOR_DEFAULTS.roomM3;
  assertPositive('roomM3', room);
  const cadr = cadrM3h ?? room * EPA_MIN_CLEAN_AIR_CHANGES_PER_H;
  const reduction = purifierReduction(cadr, room);
  const value = roundPercent(-reduction * 100);
  const without = indoorPm25(outdoorPm25);
  const withPurifier = indoorPm25(outdoorPm25, { cadrM3h: cadr, roomM3: room });

  const defaults: string[] = [];
  if (roomM3 === undefined) {
    defaults.push(
      `Room size not given: assumed ${DEFAULT_ROOM_SQFT} sq ft (${formatNumber(DEFAULT_ROOM_SQFT * FT_M ** 2, 0)} m²) with an ${DEFAULT_CEILING_FT} ft (${formatNumber(DEFAULT_CEILING_FT * FT_M, 1)} m) ceiling, ${formatNumber(room, 0)} m³, a room size from EPA's sizing chart.`,
    );
  }
  if (cadrM3h === undefined) {
    defaults.push(
      `Purifier CADR not given: assumed sized to EPA's minimum for the room (65 cfm per 100 sq ft, about ${formatNumber(EPA_MIN_CLEAN_AIR_CHANGES_PER_H, 1)} room volumes of clean air per hour), ${formatNumber(cadr, 0)} m³/h.`,
    );
  }

  return {
    label: 'Run an air purifier in a closed room',
    value,
    unit: '%',
    display: `${formatPercentChange(value)} indoor PM2.5`,
    formula:
      'reduction = (CADR ÷ V) ÷ (a + k + CADR ÷ V); indoor PM2.5 = P × a × outdoor ÷ (a + k + CADR ÷ V)',
    inputs: [
      { label: 'Outdoor PM2.5', value: ug(outdoorPm25) },
      { label: 'Purifier CADR', value: `${formatNumber(cadr, 0)} m³/h` },
      { label: 'Room volume (V)', value: `${formatNumber(room, 0)} m³` },
      { label: 'Indoor PM2.5 without purifier', value: ug(without) },
      { label: 'Indoor PM2.5 with purifier', value: ug(withPurifier) },
    ],
    assumptions: [
      ...modelAssumptions(INDOOR_DEFAULTS.achClosed, false),
      'The purifier runs continuously at its rated CADR with doors and windows closed.',
      ...defaults,
    ],
    sources: uniqueSources([XIANG_2021, ...(defaults.length > 0 ? [EPA_AIR_CLEANER_GUIDE] : [])]),
  };
}

/** Indoor PM2.5 with windows closed, compared with the outdoor level. */
export function keepWindowsClosedImpact(outdoorPm25: number, ach?: number): Impact {
  assertNonNegative('outdoor PM2.5', outdoorPm25);
  const a = ach ?? INDOOR_DEFAULTS.achClosed;
  assertPositive('ach', a);
  const ratio = (INDOOR_DEFAULTS.penetration * a) / (a + INDOOR_DEFAULTS.kDepPm25);
  const value = roundPercent((ratio - 1) * 100);
  return {
    label: 'Keep windows and doors closed',
    value,
    unit: '%',
    display: `${formatPercentChange(value)} PM2.5 indoors vs outdoors`,
    formula: 'indoor PM2.5 = P × a × outdoor ÷ (a + k); change = indoor ÷ outdoor − 1',
    inputs: [
      { label: 'Outdoor PM2.5', value: ug(outdoorPm25) },
      { label: 'Estimated indoor PM2.5', value: ug(ratio * outdoorPm25) },
    ],
    assumptions: [
      ...modelAssumptions(a, ach !== undefined),
      'Compared with the outdoor PM2.5 level.',
    ],
    sources: [XIANG_2021],
  };
}
