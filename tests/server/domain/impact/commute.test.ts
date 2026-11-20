import { describe, expect, it } from 'vitest';
import {
  COMMUTE_ASSUMPTIONS,
  EMISSION_FACTORS_KG_PER_KM,
  EV_KWH_PER_KM,
  RAIL_KWH_PER_PKM,
  commuteCo2,
  commuteSwitchImpact,
  gridIntensityFor,
} from '../../../../server/src/domain/impact/commute.js';
import grid from '../../../../server/src/domain/data/gridIntensity.json' with { type: 'json' };
import type { CommuteMode } from '../../../../shared/types.js';

const f = EMISSION_FACTORS_KG_PER_KM.car_petrol.total;

describe('cited constants', () => {
  it('uses DESNZ 2026 tailpipe + well-to-tank factors', () => {
    expect(EMISSION_FACTORS_KG_PER_KM.car_petrol).toMatchObject({
      tailpipe: 0.16152,
      wellToTank: 0.04599,
    });
    expect(EMISSION_FACTORS_KG_PER_KM.car_diesel).toMatchObject({
      tailpipe: 0.17265,
      wellToTank: 0.04146,
    });
    expect(EMISSION_FACTORS_KG_PER_KM.motorbike).toMatchObject({
      tailpipe: 0.11367,
      wellToTank: 0.02956,
    });
    expect(EMISSION_FACTORS_KG_PER_KM.bus).toMatchObject({
      tailpipe: 0.10151,
      wellToTank: 0.02649,
    });
    for (const factor of Object.values(EMISSION_FACTORS_KG_PER_KM)) {
      expect(factor.total).toBeCloseTo(factor.tailpipe + factor.wellToTank, 10);
    }
  });

  it('stays inside sanity bands that guard against typos', () => {
    const band = (v: number, lo: number, hi: number) => {
      expect(v).toBeGreaterThanOrEqual(lo);
      expect(v).toBeLessThanOrEqual(hi);
    };
    band(EMISSION_FACTORS_KG_PER_KM.car_petrol.total, 0.12, 0.22);
    band(EMISSION_FACTORS_KG_PER_KM.car_diesel.total, 0.12, 0.22);
    band(EMISSION_FACTORS_KG_PER_KM.motorbike.total, 0.07, 0.15);
    band(EMISSION_FACTORS_KG_PER_KM.bus.total, 0.05, 0.15);
    band(EV_KWH_PER_KM, 0.13, 0.25);
    band(RAIL_KWH_PER_PKM, 0.03, 0.15);
  });

  it('derives rail kWh/pkm the way DESNZ derives its SECR kWh factors', () => {
    // DESNZ SECR kWh = kg CO2 per unit ÷ kg CO2 per kWh. Reproduces the BEV figure:
    expect(0.02635 / 0.12943).toBeCloseTo(EV_KWH_PER_KM, 4);
    expect(RAIL_KWH_PER_PKM).toBeCloseTo(0.01522 / 0.12943, 10);
  });

  it('states the rail derivation in the user-facing assumptions', () => {
    const text = commuteCo2('rail', 10, 'IN').assumptions.join(' ');
    expect(text).toMatch(/London Underground.*÷/);
    expect(text).toMatch(
      /0\.01522 kg CO₂ per passenger-km ÷ .*0\.12943 kg CO₂ per kWh = 0\.1176 kWh/,
    );
    expect(commuteCo2('car_ev', 10, 'IN').assumptions.join(' ')).not.toMatch(/Derived/);
  });

  it('keeps electric-mode descriptions free of nested parentheses', () => {
    for (const mode of ['rail', 'car_ev'] as const) {
      const first = commuteCo2(mode, 10, 'IN').assumptions[1]!;
      expect(first).not.toMatch(/\([^)]*\(/);
    }
  });
});

describe('gridIntensity.json', () => {
  it('has a world average and ISO2-keyed countries', () => {
    expect(grid.worldAverage.gPerKwh).toBeGreaterThan(100);
    expect(grid.worldAverage.year).toBeGreaterThanOrEqual(2020);
    const entries = Object.entries(grid.countries);
    expect(entries.length).toBeGreaterThan(150);
    for (const [code, v] of entries) {
      expect(code).toMatch(/^[A-Z]{2}$/);
      expect(v.gPerKwh).toBeGreaterThanOrEqual(0);
      expect(v.gPerKwh).toBeLessThan(2000);
    }
    expect(grid.source.url).toMatch(/^https:\/\//);
  });

  it('falls back to the world average for unknown or missing countries', () => {
    expect(gridIntensityFor('ZZ')).toMatchObject({
      isWorldAverage: true,
      gPerKwh: grid.worldAverage.gPerKwh,
    });
    expect(gridIntensityFor(undefined).isWorldAverage).toBe(true);
    expect(gridIntensityFor('in')).toMatchObject({
      isWorldAverage: false,
      gPerKwh: grid.countries.IN.gPerKwh,
    });
  });
});

describe('commuteCo2', () => {
  it('scales by 2 trips × 5 days × 46 weeks', () => {
    expect(commuteCo2('car_petrol', 10).kgPerDay).toBeCloseTo(20 * f, 6);
    expect(commuteCo2('car_petrol', 10).kgPerWeek).toBeCloseTo(100 * f, 6);
    expect(commuteCo2('car_petrol', 10).kgPerYear).toBeCloseTo(4600 * f, 6);
    expect(COMMUTE_ASSUMPTIONS).toEqual({ tripsPerDay: 2, daysPerWeek: 5, weeksPerYear: 46 });
    expect(commuteCo2('car_petrol', 10).assumptions.join(' ')).toMatch(/2 trips.*5 days.*46 weeks/);
  });

  it('counts cycling and walking as zero', () => {
    expect(commuteCo2('bike', 10).kgPerWeek).toBe(0);
    expect(commuteCo2('walk', 10).kgPerYear).toBe(0);
  });

  it('uses the country grid for electric modes', () => {
    expect(commuteCo2('car_ev', 10, 'IN').kgPerWeek).toBeGreaterThan(
      commuteCo2('car_ev', 10, 'FR').kgPerWeek,
    );
    expect(commuteCo2('car_ev', 10, 'IN').kgPerDay).toBeCloseTo(
      (20 * EV_KWH_PER_KM * grid.countries.IN.gPerKwh) / 1000,
      9,
    );
    expect(commuteCo2('rail', 10, 'GB').kgPerDay).toBeCloseTo(
      (20 * RAIL_KWH_PER_PKM * grid.countries.GB.gPerKwh) / 1000,
      9,
    );
    expect(commuteCo2('car_ev', 10, 'ZZ').assumptions.join(' ')).toMatch(/world average/i);
    expect(commuteCo2('car_ev', 10, 'FR').sources.map((s) => s.url)).toContain(grid.source.url);
  });

  it('cites DESNZ for fuel modes', () => {
    const r = commuteCo2('bus', 5);
    expect(r.sources.some((s) => s.url.includes('gov.uk'))).toBe(true);
    expect(r.assumptions.join(' ')).toMatch(/passenger-km/);
  });

  it('rejects bad distances', () => {
    expect(() => commuteCo2('car_petrol', -1)).toThrow(RangeError);
    expect(() => commuteCo2('car_petrol', Number.NaN)).toThrow(RangeError);
  });
});

describe('commuteSwitchImpact', () => {
  it('reports yearly kg saved', () => {
    const impact = commuteSwitchImpact('car_petrol', 'bike', 10)!;
    expect(impact.value).toBeCloseTo(4600 * f, 1);
    expect(impact.unit).toBe('kg CO₂e/yr');
    expect(impact.display).toBe('≈950 kg CO₂e/yr saved');
    expect(impact.formula.length).toBeGreaterThan(0);
    expect(impact.sources.length).toBeGreaterThan(0);
    expect(impact.inputs.length).toBeGreaterThan(0);
  });

  it('returns null when nothing is saved', () => {
    expect(commuteSwitchImpact('bike', 'walk', 3)).toBeNull();
    expect(commuteSwitchImpact('bus', 'car_petrol', 3)).toBeNull();
  });

  it('formats small savings with one decimal', () => {
    const impact = commuteSwitchImpact('car_petrol', 'walk', 0.5)!;
    expect(impact.value).toBeCloseTo(230 * f, 6);
    expect(impact.display).toBe(`≈${(230 * f).toFixed(1)} kg CO₂e/yr saved`);
  });

  it('nets out grid emissions when switching to rail', () => {
    const impact = commuteSwitchImpact('car_petrol', 'rail', 12, 'IN')!;
    const expected =
      commuteCo2('car_petrol', 12).kgPerYear - commuteCo2('rail', 12, 'IN').kgPerYear;
    expect(impact.value).toBeCloseTo(expected, 9);
    expect(impact.display).toMatch(/^≈[\d,]+ kg CO₂e\/yr saved$/);
    expect(impact.sources.map((s) => s.url)).toContain(grid.source.url);
  });

  it('gives every mode pair a valid impact or null', () => {
    const modes: CommuteMode[] = [
      'car_petrol',
      'car_diesel',
      'car_ev',
      'motorbike',
      'bus',
      'rail',
      'bike',
      'walk',
    ];
    for (const from of modes) {
      for (const to of modes) {
        const impact = commuteSwitchImpact(from, to, 8, 'DE');
        if (impact === null) continue;
        expect(impact.value).toBeGreaterThan(0);
        expect(impact.sources.length).toBeGreaterThan(0);
        expect(impact.formula).not.toBe('');
      }
    }
  });
});
