import { describe, expect, it } from 'vitest';
import { minimiseProfile } from '../../../server/src/domain/minimalProfile.js';
import { profileWith } from './fixtures.js';

const keysOf = (v: unknown): string[] =>
  v !== null && typeof v === 'object'
    ? Object.entries(v).flatMap(([k, child]) => [k, ...keysOf(child)])
    : [];

describe('minimiseProfile', () => {
  const profile = profileWith({
    household: {
      adults: 2,
      children: 2,
      olderAdults: 1,
      pregnant: true,
      respiratory: true,
      heart: false,
    },
    commute: { mode: 'car_petrol', oneWayKm: 12, departHour: 8 },
    exercise: { type: 'run', hour: 6, minutes: 45 },
    home: {
      purifier: true,
      purifierCadrM3h: 300,
      roomM3: 40,
      cooking: 'solid',
      heating: 'wood_coal',
    },
  });
  const min = minimiseProfile(profile);

  it('keeps no per-group keys, only sensitiveGroups flags', () => {
    const keys = keysOf(JSON.parse(JSON.stringify(min)));
    for (const banned of [
      'adults',
      'children',
      'pregnant',
      'respiratory',
      'heart',
      'olderAdults',
    ]) {
      expect(keys).not.toContain(banned);
    }
    expect(keys).toContain('sensitiveGroups');
  });

  it('lists the sensitive groups present', () => {
    expect(min.sensitiveGroups).toEqual(['children', 'older_adults', 'pregnancy', 'respiratory']);
  });

  it('sums household size', () => {
    expect(min.householdSize).toBe(5);
  });

  it('drops times of day, purifier size and room size', () => {
    expect(min.commute).toEqual({ mode: 'car_petrol', oneWayKm: 12 });
    expect(min.exercise).toEqual({ type: 'run', minutes: 45 });
    expect(min.home).toEqual({
      purifier: true,
      cooking: 'solid',
      heating: 'wood_coal',
      canOpenWindows: true,
      indoorSmoking: false,
    });
  });

  it('keeps null commute and exercise null and has no sensitive groups by default', () => {
    const m = minimiseProfile(profileWith({}));
    expect(m.commute).toBeNull();
    expect(m.exercise).toBeNull();
    expect(m.sensitiveGroups).toEqual([]);
    expect(m.householdSize).toBe(2);
  });
});
