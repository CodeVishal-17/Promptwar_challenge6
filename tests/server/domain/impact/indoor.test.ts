import { describe, expect, it } from 'vitest';
import {
  EPA_MIN_CLEAN_AIR_CHANGES_PER_H,
  INDOOR_DEFAULTS,
  INDOOR_DEFAULT_SOURCES,
  indoorPm25,
  keepWindowsClosedImpact,
  purifierImpact,
  purifierReduction,
} from '../../../../server/src/domain/impact/indoor.js';

describe('INDOOR_DEFAULTS', () => {
  it('uses the cited values', () => {
    // Xiang et al. 2021, Table 4 medians across residences (windows closed) and p from §2.3
    expect(INDOOR_DEFAULTS.achClosed).toBe(0.53);
    expect(INDOOR_DEFAULTS.kDepPm25).toBe(0.26);
    expect(INDOOR_DEFAULTS.penetration).toBe(0.97);
    // EPA sizing chart: 300 sq ft room, 8 ft ceiling, minimum CADR 195 cfm
    expect(INDOOR_DEFAULTS.roomM3).toBeCloseTo(67.96, 2);
    expect(INDOOR_DEFAULTS.purifierCadrM3h).toBeCloseTo(331.31, 2);
    expect(INDOOR_DEFAULTS.purifierCadrM3h / INDOOR_DEFAULTS.roomM3).toBeCloseTo(
      EPA_MIN_CLEAN_AIR_CHANGES_PER_H,
      10,
    );
    expect(EPA_MIN_CLEAN_AIR_CHANGES_PER_H).toBe(4.875);
  });

  it('gives every default a source', () => {
    for (const key of Object.keys(INDOOR_DEFAULTS) as (keyof typeof INDOOR_DEFAULTS)[]) {
      expect(INDOOR_DEFAULT_SOURCES[key].url).toMatch(/^https:\/\//);
    }
  });
});

describe('purifierReduction', () => {
  it('is (CADR/V) / (a + k + CADR/V)', () => {
    // 2.6667 / (0.53 + 0.26 + 2.6667)
    expect(purifierReduction(200, 75)).toBeCloseTo(0.7715, 3);
    // with the brief's illustrative a = 0.5, k = 0.2 this would be 0.792; k stays the cited 0.26 here
    expect(purifierReduction(200, 75, 0.5)).toBeCloseTo(2.6667 / (0.5 + 0.26 + 2.6667), 3);
  });
  it('rejects non-positive room volumes', () => {
    expect(() => purifierReduction(200, 0)).toThrow(RangeError);
  });
});

describe('indoorPm25', () => {
  it('is P·a·C_out / (a + k + CADR/V)', () => {
    expect(indoorPm25(100)).toBeCloseTo(65.08, 2); // 0.97 × 0.53 × 100 / 0.79
    expect(indoorPm25(100, { ach: 0.5 })).toBeCloseTo((0.97 * 0.5 * 100) / 0.76, 6);
    expect(indoorPm25(100, { cadrM3h: 200, roomM3: 75 })).toBeCloseTo(
      (0.97 * 0.53 * 100) / (0.79 + 200 / 75),
      6,
    );
    expect(indoorPm25(0)).toBe(0);
  });
  it('uses the default room when only CADR is given', () => {
    expect(indoorPm25(100, { cadrM3h: 200 })).toBeCloseTo(
      (0.97 * 0.53 * 100) / (0.79 + 200 / INDOOR_DEFAULTS.roomM3),
      6,
    );
  });
  it('rejects negative concentrations', () => {
    expect(() => indoorPm25(-5)).toThrow(RangeError);
  });
});

describe('purifierImpact', () => {
  it('reports the percentage change in indoor PM2.5', () => {
    const impact = purifierImpact(150, 200, 75);
    expect(impact.value).toBe(-77);
    expect(impact.unit).toBe('%');
    expect(impact.display).toBe('−77% indoor PM2.5');
    expect(impact.sources.length).toBeGreaterThan(0);
    expect(impact.formula).toMatch(/CADR/);
    expect(impact.assumptions.join(' ')).not.toMatch(/not given/);
  });

  it('states the defaults it falls back on', () => {
    const impact = purifierImpact(150);
    // CADR/V = 4.875 → 4.875 / (0.79 + 4.875) = 0.8606
    expect(impact.value).toBe(-86);
    const text = impact.assumptions.join(' ');
    expect(text).toMatch(/Room size not given/);
    expect(text).toMatch(/CADR not given/);
    expect(impact.sources.some((s) => s.url.includes('epa.gov'))).toBe(true);
  });

  it('sizes a default CADR to the given room', () => {
    expect(purifierImpact(150, undefined, 40).value).toBe(-86);
    expect(purifierImpact(150, undefined, 40).assumptions.join(' ')).not.toMatch(
      /Room size not given/,
    );
  });
});

describe('keepWindowsClosedImpact', () => {
  it('compares closed-window indoor PM2.5 with outdoors', () => {
    const impact = keepWindowsClosedImpact(200);
    expect(impact.value).toBe(-35); // 0.97 × 0.53 / 0.79 = 0.651
    expect(impact.display).toBe('−35% PM2.5 indoors vs outdoors');
    expect(impact.inputs.some((i) => i.value.includes('200'))).toBe(true);
    expect(impact.sources.length).toBeGreaterThan(0);
    expect(impact.formula).not.toBe('');
  });

  it('accepts a measured air-change rate', () => {
    expect(keepWindowsClosedImpact(200, 0.3).value).toBe(
      Math.round(((0.97 * 0.3) / 0.56 - 1) * 100),
    );
  });
});
