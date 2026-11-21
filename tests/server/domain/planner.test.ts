import { describe, expect, it } from 'vitest';
import { ACTIONS } from '../../../server/src/domain/catalog.js';
import {
  buildFallbackPlan,
  isSensitive,
  selectCandidates,
  type Candidate,
} from '../../../server/src/domain/planner.js';
import { DEFAULT_PROFILE } from '../../../shared/profile.js';
import { makeReport, profileWith, smoggyReport } from './fixtures.js';

const NOW = new Date('2026-11-19T08:30:00Z');
const family = profileWith({
  household: { children: 2 },
  commute: { mode: 'car_petrol', oneWayKm: 12, departHour: 8 },
  exercise: { type: 'run', hour: 6, minutes: 45 },
  home: { purifier: false },
});
const smoggy = { report: smoggyReport(), profile: family, countryCode: 'IN' };

describe('isSensitive', () => {
  it('is false for the default household', () => {
    expect(isSensitive(DEFAULT_PROFILE)).toBe(false);
  });
  it.each([
    ['children', { children: 1 }],
    ['olderAdults', { olderAdults: 1 }],
    ['pregnant', { pregnant: true }],
    ['respiratory', { respiratory: true }],
    ['heart', { heart: true }],
  ])('is true when %s is set', (_name, household) => {
    expect(isSensitive(profileWith({ household }))).toBe(true);
  });
});

describe('selectCandidates', () => {
  const cands = selectCandidates(smoggy);

  it('returns at least one candidate in every section for a smoggy day', () => {
    for (const s of ['routine', 'indoor', 'sustainable']) {
      expect(cands.filter((c) => c.action.section === s).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('only returns actions that apply', () => {
    for (const c of cands) expect(c.action.applies(smoggy), c.action.id).toBe(true);
  });

  it('attaches impacts and the best-window time to the right candidates', () => {
    const move = cands.find((c) => c.action.id === 'move-exercise-to-best-window');
    expect(move?.impact?.unit).toBe('%');
    expect(move?.suggestedTime).toBe('15:00');
    expect(move?.suggestedStart).toBe('2026-11-20T15:00');
    expect(move?.suggestedDay).toBe('Tomorrow');
    const air = cands.find((c) => c.action.id === 'air-out-in-best-window');
    expect(air?.suggestedTime).toBe('15:00');
    expect(air?.suggestedDay).toBe('Tomorrow');
    // 07:00, 08:00 and 09:00 tomorrow are equally smoggy, so there is no school run to re-time.
    expect(cands.find((c) => c.action.id === 'school-run-timing')).toBeUndefined();
    const sw = cands.find((c) => c.action.id === 'switch-commute');
    expect(sw?.impact?.unit).toBe('kg CO₂e/yr');
    const n95 = cands.find((c) => c.action.id === 'n95-outdoors');
    expect(n95?.impact).toBeNull();
    expect(n95?.suggestedTime).toBeUndefined();
  });

  it('times the school run an hour either side of the usual departure, with its day', () => {
    const earlier = makeReport({
      pm25At: (i) => (i === 17 ? 40 : 150),
      aqiAt: (i) => (i === 17 ? 80 : 300),
    });
    const school = selectCandidates({ ...smoggy, report: earlier }).find(
      (c) => c.action.id === 'school-run-timing',
    );
    expect(school?.suggestedTime).toBe('07:00');
    expect(school?.suggestedStart).toBe('2026-11-20T07:00');
    expect(school?.suggestedDay).toBe('Tomorrow');
    expect(school?.impact?.unit).toBe('%');
  });

  it('gives no day label when the best window is later today', () => {
    const today = makeReport({
      aqiAt: (i) => (i >= 2 && i <= 3 ? 60 : 212),
      pm25At: (i) => (i >= 2 && i <= 3 ? 20 : 150),
    });
    const c = selectCandidates({ ...smoggy, report: today });
    const air = c.find((x) => x.action.id === 'air-out-in-best-window');
    expect(air?.suggestedTime).toBe('16:00');
    expect(air?.suggestedStart).toBe('2026-11-19T16:00');
    expect(air?.suggestedDay).toBeUndefined();
  });

  it('labels tomorrow when it is late evening and the cleanest daytime hours are tomorrow', () => {
    const late = makeReport({ startHour: 22 });
    const air = selectCandidates({ ...smoggy, report: late }).find(
      (x) => x.action.id === 'air-out-in-best-window',
    );
    expect(air?.suggestedStart?.slice(0, 10)).toBe('2026-11-20');
    expect(air?.suggestedDay).toBe('Tomorrow');
  });

  it('sorts by priority, highest first', () => {
    const priorities = cands.map((c) => c.action.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => b - a));
  });

  it('still returns words-only actions when there is no current reading', () => {
    const blind = { ...smoggy, report: makeReport({ now: false }) };
    expect(selectCandidates(blind).length).toBeGreaterThan(0);
  });
});

describe('buildFallbackPlan', () => {
  const cands = selectCandidates(smoggy);
  const plan = buildFallbackPlan(smoggy, cands, NOW);

  it('is a non-AI plan stamped with the given time', () => {
    expect(plan.aiUsed).toBe(false);
    expect(plan.generatedAt).toBe(NOW.toISOString());
  });

  it('caps each section at four items ordered by priority', () => {
    const priority = new Map(ACTIONS.map((a) => [a.id, a.priority]));
    for (const items of [plan.routine, plan.indoor, plan.sustainable]) {
      expect(items.length).toBeGreaterThan(0);
      expect(items.length).toBeLessThanOrEqual(4);
      const ps = items.map((i) => priority.get(i.actionId) ?? 0);
      expect(ps).toEqual([...ps].sort((a, b) => b - a));
    }
  });

  it('files every item under its own section', () => {
    expect(plan.routine.every((i) => i.section === 'routine')).toBe(true);
    expect(plan.indoor.every((i) => i.section === 'indoor')).toBe(true);
    expect(plan.sustainable.every((i) => i.section === 'sustainable')).toBe(true);
  });

  it('carries the suggested time onto items and merges impact sources without duplicates', () => {
    const move = plan.routine.find((i) => i.actionId === 'move-exercise-to-best-window');
    expect(move?.time).toBe('15:00');
    expect(move?.start).toBe('2026-11-20T15:00');
    expect(move?.day).toBe('Tomorrow');
    for (const s of move?.impact?.sources ?? []) {
      expect(move?.sources.some((x) => x.url === s.url)).toBe(true);
    }
    const urls = move?.sources.map((s) => s.url) ?? [];
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('writes a summary with the AQI value and no other numbers', () => {
    expect(plan.summary).toContain('AQI 212');
    expect(plan.summary).toContain('very unhealthy');
    expect(plan.summary.replace('AQI 212', '')).not.toMatch(/\d/);
  });

  it('uses health guidance for the current category and the household', () => {
    expect(plan.health.category).toBe('very_unhealthy');
    expect(plan.health.sensitive).toBe(true);
  });

  it('says data is unavailable, yet still fills sections, when there is no current reading', () => {
    const ctx = { ...smoggy, report: makeReport({ now: false }) };
    const p = buildFallbackPlan(ctx, selectCandidates(ctx), NOW);
    expect(p.summary.toLowerCase()).toContain('unavailable');
    expect(p.summary).not.toMatch(/\d/);
    expect(p.routine.length + p.indoor.length + p.sustainable.length).toBeGreaterThan(0);
    expect(p.health.headline.toLowerCase()).toContain('unavailable');
    expect(p.health.advice.length).toBeGreaterThan(0);
  });

  it('builds items from any candidate list', () => {
    const only: Candidate[] = cands.filter((c) => c.action.id === 'no-waste-burning');
    const p = buildFallbackPlan(smoggy, only, NOW);
    expect(p.sustainable.map((i) => i.actionId)).toEqual(['no-waste-burning']);
    expect(p.routine).toEqual([]);
  });
});
