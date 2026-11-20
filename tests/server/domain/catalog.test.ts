import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  dayLabel,
  type Action,
  type PlanContext,
} from '../../../server/src/domain/catalog.js';
import { commuteSwitchImpact } from '../../../server/src/domain/impact/commute.js';
import {
  INHALATION_M3_PER_MIN,
  exposureChangeImpact,
} from '../../../server/src/domain/impact/exposure.js';
import {
  keepWindowsClosedImpact,
  purifierImpact,
} from '../../../server/src/domain/impact/indoor.js';
import { DEFAULT_PROFILE } from '../../../shared/profile.js';
import type { Profile } from '../../../shared/types.js';
import { makeReport, profileWith, smoggyReport } from './fixtures.js';

const byId = (id: string): Action => {
  const a = ACTIONS.find((x) => x.id === id);
  if (!a) throw new Error(`no action ${id}`);
  return a;
};
const ctx = (profile: Profile = DEFAULT_PROFILE, report = smoggyReport()): PlanContext => ({
  report,
  profile,
  countryCode: 'IN',
});
const clean = makeReport({ aqiAt: () => 20, pm25At: () => 6 });
const moderate = makeReport({ aqiAt: () => 120, pm25At: () => 40 });
const runner = profileWith({ exercise: { type: 'run', hour: 6, minutes: 45 } });

describe('ACTIONS catalogue', () => {
  it('has unique ids', () => {
    const ids = ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(['routine', 'indoor', 'sustainable'] as const)('has at least 6 %s actions', (s) => {
    expect(ACTIONS.filter((a) => a.section === s).length).toBeGreaterThanOrEqual(6);
  });

  it('gives every action at least one source with an https url', () => {
    for (const a of ACTIONS) {
      expect(a.sources.length, a.id).toBeGreaterThanOrEqual(1);
      for (const s of a.sources) expect(s.url, a.id).toMatch(/^https:\/\//);
    }
  });

  it('writes plain copy: no numbers in titles or defaultWhy (mask names aside)', () => {
    for (const a of ACTIONS) {
      const text = `${a.title} ${a.defaultWhy}`.replace(/(N95|FFP2)/g, '');
      expect(text, a.id).not.toMatch(/\d/);
      expect(a.defaultWhy.length, a.id).toBeGreaterThan(20);
    }
  });

  it('uses integer priorities from 1 to 100', () => {
    for (const a of ACTIONS) {
      expect(Number.isInteger(a.priority), a.id).toBe(true);
      expect(a.priority).toBeGreaterThanOrEqual(1);
      expect(a.priority).toBeLessThanOrEqual(100);
    }
  });
});

describe('dayLabel', () => {
  it('is undefined for today, "Tomorrow" for the next day and the weekday beyond', () => {
    expect(dayLabel('2026-11-19T15:00', '2026-11-19')).toBeUndefined();
    expect(dayLabel('2026-11-20T06:00', '2026-11-19')).toBe('Tomorrow');
    expect(dayLabel('2026-11-21T06:00', '2026-11-19')).toBe('Saturday');
  });
  it('handles a month end', () => {
    expect(dayLabel('2026-12-01T09:00', '2026-11-30')).toBe('Tomorrow');
  });
});

describe('move-exercise-to-best-window', () => {
  const a = byId('move-exercise-to-best-window');

  it('applies with exercise and a best window', () => {
    expect(a.applies(ctx(runner))).toBe(true);
  });
  it('does not apply without exercise or without a best window', () => {
    expect(a.applies(ctx())).toBe(false);
    expect(a.applies(ctx(runner, { ...smoggyReport(), windows: [] }))).toBe(false);
  });
  it('does not apply when the usual hour is already in the best window', () => {
    const soonBest = makeReport({
      aqiAt: (i) => (i >= 1 && i <= 3 ? 60 : 212),
      pm25At: (i) => (i >= 1 && i <= 3 ? 20 : 150),
    });
    const atBest = profileWith({ exercise: { type: 'run', hour: 15, minutes: 45 } });
    expect(a.applies(ctx(atBest, soonBest))).toBe(false);
    const missed = profileWith({ exercise: { type: 'run', hour: 14, minutes: 45 } });
    expect(a.applies(ctx(missed, soonBest))).toBe(true);
  });
  it('applies only while the best window is below the unhealthy level', () => {
    const withBest = (aqi: number) =>
      makeReport({
        aqiAt: (i) => (i >= 25 && i <= 27 ? aqi : 300),
        pm25At: (i) => (i >= 25 && i <= 27 ? 30 : 150),
      });
    expect(a.applies(ctx(runner, withBest(150)))).toBe(true);
    expect(a.applies(ctx(runner, withBest(151)))).toBe(false);
  });
  it('does not apply when the window is not cleaner than the usual hour', () => {
    const withUsual = (usualPm: number) =>
      makeReport({
        aqiAt: (i) => (i >= 25 && i <= 27 ? 90 : 212),
        pm25At: (i) => (i >= 25 && i <= 27 ? 30 : i === 16 ? usualPm : 150),
      });
    expect(a.applies(ctx(runner, withUsual(29)))).toBe(false);
    expect(a.applies(ctx(runner, withUsual(30)))).toBe(false);
    expect(a.applies(ctx(runner, withUsual(31)))).toBe(true);
  });
  it('compares PM2.5 at the usual hour with the best window at the activity level', () => {
    const rate = INHALATION_M3_PER_MIN.adult.high;
    const expected = exposureChangeImpact(
      'Move your run to the cleanest window',
      { conc: 150, rate, minutes: 45 },
      { conc: 30, rate, minutes: 45 },
    );
    const impact = a.impact?.(ctx(runner));
    expect(impact?.value).toBe(-80);
    expect(impact?.display).toBe(expected.display);
    // Labelled with day and time: the usual hour is its next occurrence, here tomorrow.
    expect(impact?.inputs).toEqual([
      { label: 'Before, tomorrow 06:00', value: expected.inputs[0]?.value },
      { label: 'After, tomorrow 15:00', value: expected.inputs[1]?.value },
    ]);
  });
  it('labels the before and after inputs "today" when both hours are today', () => {
    const soonBest = makeReport({
      aqiAt: (i) => (i >= 1 && i <= 3 ? 60 : 212),
      pm25At: (i) => (i >= 1 && i <= 3 ? 20 : 150),
    });
    const missed = profileWith({ exercise: { type: 'run', hour: 14, minutes: 45 } });
    const labels = a.impact?.(ctx(missed, soonBest))?.inputs.map((x) => x.label);
    expect(labels).toEqual(['Before, today 14:00', 'After, today 15:00']);
  });
  it('uses the lighter walking rate for a walk', () => {
    const walker = profileWith({ exercise: { type: 'walk', hour: 6, minutes: 30 } });
    expect(a.impact?.(ctx(walker))?.inputs[0]?.value).toContain('0.012 m³/min');
  });
  it('gives no impact when a PM2.5 value is missing or the baseline is zero', () => {
    const aqiAt = (i: number): number => (i >= 25 && i <= 27 ? 90 : 212);
    const missing = makeReport({
      aqiAt,
      pm25At: (i) => (i === 16 ? null : i >= 25 && i <= 27 ? 30 : 150),
    });
    expect(a.impact?.(ctx(runner, missing))).toBeNull();
    const zero = makeReport({
      aqiAt,
      pm25At: (i) => (i === 16 ? 0 : i >= 25 && i <= 27 ? 30 : 150),
    });
    expect(a.impact?.(ctx(runner, zero))).toBeNull();
  });
});

describe('exercise and school actions', () => {
  it('exercise-indoors needs AQI of 151 or more and exercise', () => {
    const a = byId('exercise-indoors');
    expect(a.applies(ctx(runner))).toBe(true);
    expect(a.applies(ctx(runner, moderate))).toBe(false);
    expect(a.applies(ctx())).toBe(false);
  });
  it('school-run-timing needs children and a commute', () => {
    const a = byId('school-run-timing');
    const commute = { mode: 'car_petrol' as const, oneWayKm: 5, departHour: 8 };
    expect(a.applies(ctx(profileWith({ household: { children: 1 }, commute })))).toBe(true);
    expect(a.applies(ctx(profileWith({ commute })))).toBe(false);
    expect(a.applies(ctx(profileWith({ household: { children: 1 } })))).toBe(false);
  });
  it('n95-outdoors is words only and needs AQI of 151 or more', () => {
    const a = byId('n95-outdoors');
    expect(a.applies(ctx())).toBe(true);
    expect(a.applies(ctx(DEFAULT_PROFILE, moderate))).toBe(false);
    expect(a.impact).toBeUndefined();
  });
  it('n95-outdoors carries the EPA caveat for heart and lung conditions', () => {
    expect(byId('n95-outdoors').defaultWhy).toContain(
      'If you have a heart or lung condition, check with your doctor before using a respirator.',
    );
  });
});

describe('indoor actions', () => {
  it('keep-windows-closed needs AQI of 101 or more and carries the closed-window impact', () => {
    const a = byId('keep-windows-closed');
    expect(a.applies(ctx(DEFAULT_PROFILE, moderate))).toBe(true);
    expect(a.applies(ctx(DEFAULT_PROFILE, clean))).toBe(false);
    expect(a.impact?.(ctx())).toEqual(keepWindowsClosedImpact(150));
  });
  it('keep-windows-closed has no impact when the current PM2.5 is unknown', () => {
    const unknown = makeReport({ aqiAt: () => 212, pm25At: () => null });
    expect(byId('keep-windows-closed').impact?.(ctx(DEFAULT_PROFILE, unknown))).toBeNull();
  });
  it('air-out-in-best-window needs openable windows and a best window', () => {
    const a = byId('air-out-in-best-window');
    expect(a.applies(ctx())).toBe(true);
    expect(a.applies(ctx(profileWith({ home: { canOpenWindows: false } })))).toBe(false);
    expect(a.applies(ctx(DEFAULT_PROFILE, { ...smoggyReport(), windows: [] }))).toBe(false);
  });
  it('air-out-in-best-window rejects a best window at the unhealthy level', () => {
    const a = byId('air-out-in-best-window');
    const withBest = (aqi: number) =>
      makeReport({
        aqiAt: (i) => (i >= 25 && i <= 27 ? aqi : 300),
        pm25At: () => 100,
      });
    expect(a.applies(ctx(DEFAULT_PROFILE, withBest(150)))).toBe(true);
    expect(a.applies(ctx(DEFAULT_PROFILE, withBest(151)))).toBe(false);
  });
  it('run-purifier applies with a purifier and carries its impact', () => {
    const a = byId('run-purifier');
    const p = profileWith({ home: { purifier: true, purifierCadrM3h: 300, roomM3: 40 } });
    expect(a.applies(ctx(p))).toBe(true);
    expect(a.applies(ctx())).toBe(false);
    expect(a.impact?.(ctx(p))).toEqual(purifierImpact(150, 300, 40));
  });
  it('diy-box-fan-filter applies without a purifier, words only', () => {
    const a = byId('diy-box-fan-filter');
    expect(a.applies(ctx())).toBe(true);
    expect(a.applies(ctx(profileWith({ home: { purifier: true } })))).toBe(false);
    expect(a.impact).toBeUndefined();
  });
  it('ventilate-while-cooking applies for gas or solid fuel only', () => {
    const a = byId('ventilate-while-cooking');
    expect(a.applies(ctx(profileWith({ home: { cooking: 'gas' } })))).toBe(true);
    expect(a.applies(ctx(profileWith({ home: { cooking: 'solid' } })))).toBe(true);
    expect(a.applies(ctx(profileWith({ home: { cooking: 'electric' } })))).toBe(false);
  });
  it('no-indoor-smoking applies when someone smokes indoors, words only', () => {
    const a = byId('no-indoor-smoking');
    expect(a.applies(ctx(profileWith({ home: { indoorSmoking: true } })))).toBe(true);
    expect(a.applies(ctx())).toBe(false);
    expect(a.impact).toBeUndefined();
  });
  it('avoid-wood-coal-heating applies for wood or coal heating, words only', () => {
    const a = byId('avoid-wood-coal-heating');
    expect(a.applies(ctx(profileWith({ home: { heating: 'wood_coal' } })))).toBe(true);
    expect(a.applies(ctx())).toBe(false);
    expect(a.impact).toBeUndefined();
  });
});

describe('sustainable actions', () => {
  const commuteBy = (mode: NonNullable<Profile['commute']>['mode'], km = 6): Profile =>
    profileWith({ commute: { mode, oneWayKm: km, departHour: 8 } });

  it('switch-commute applies to cars and motorbikes, not to other modes', () => {
    const a = byId('switch-commute');
    expect(a.applies(ctx(commuteBy('car_petrol', 12)))).toBe(true);
    expect(a.applies(ctx(commuteBy('car_diesel')))).toBe(true);
    expect(a.applies(ctx(commuteBy('motorbike')))).toBe(true);
    expect(a.applies(ctx(commuteBy('bus')))).toBe(false);
    expect(a.applies(ctx())).toBe(false);
  });
  it('switch-commute prices a switch to rail beyond 8 km and to a bike up to 8 km', () => {
    const a = byId('switch-commute');
    expect(a.impact?.(ctx(commuteBy('car_petrol', 12)))).toEqual(
      commuteSwitchImpact('car_petrol', 'rail', 12, 'IN'),
    );
    expect(a.impact?.(ctx(commuteBy('car_petrol', 8)))).toEqual(
      commuteSwitchImpact('car_petrol', 'bike', 8, 'IN'),
    );
  });
  it('combine-trips applies to car commutes only', () => {
    const a = byId('combine-trips');
    expect(a.applies(ctx(commuteBy('car_petrol', 12)))).toBe(true);
    expect(a.applies(ctx(commuteBy('motorbike')))).toBe(false);
  });
  it('no-waste-burning always applies, words only', () => {
    const a = byId('no-waste-burning');
    expect(a.applies(ctx(DEFAULT_PROFILE, clean))).toBe(true);
    expect(a.impact).toBeUndefined();
  });
  it('words-only copy claims no more than its sources', () => {
    expect(byId('combine-trips').defaultWhy).not.toMatch(/cold start/i);
    expect(byId('no-waste-burning').defaultWhy).not.toMatch(/still|evening/i);
    expect(byId('keep-low-emission-commute').defaultWhy).not.toMatch(/little or no/i);
    expect(byId('keep-low-emission-commute').defaultWhy).toMatch(/far less exhaust per person/);
  });
  it('electrify-heating is offered for wood or coal heating only, not gas', () => {
    const a = byId('electrify-heating');
    expect(a.applies(ctx(profileWith({ home: { heating: 'wood_coal' } })))).toBe(true);
    expect(a.applies(ctx(profileWith({ home: { heating: 'gas' } })))).toBe(false);
    expect(a.applies(ctx(profileWith({ home: { heating: 'electric' } })))).toBe(false);
  });
  it('keep-low-emission-commute celebrates a low-emission commute', () => {
    const a = byId('keep-low-emission-commute');
    expect(a.applies(ctx(commuteBy('bike')))).toBe(true);
    expect(a.applies(ctx(commuteBy('rail')))).toBe(true);
    expect(a.applies(ctx(commuteBy('car_petrol')))).toBe(false);
  });
});
