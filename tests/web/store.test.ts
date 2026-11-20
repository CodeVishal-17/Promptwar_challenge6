import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE } from '../../shared/profile.js';
import type { Profile } from '../../shared/types.js';
import {
  hasSeenOnboarding,
  loadPlace,
  loadProfile,
  markOnboardingSeen,
  savePlace,
  saveProfile,
} from '../../web/src/store.js';
import { PLACE } from './helpers.js';

const PROFILE: Profile = {
  household: {
    adults: 2,
    children: 1,
    olderAdults: 1,
    pregnant: false,
    respiratory: true,
    heart: false,
  },
  commute: { mode: 'bus', oneWayKm: 12.5, departHour: 8 },
  exercise: { type: 'run', hour: 7, minutes: 30 },
  home: {
    purifier: true,
    purifierCadrM3h: 250,
    roomM3: 40,
    cooking: 'electric',
    heating: 'none',
    canOpenWindows: true,
    indoorSmoking: false,
  },
};

const original = Object.getOwnPropertyDescriptor(window, 'localStorage');

/** Makes every touch of `window.localStorage` throw, as in some private modes. */
function breakStorage(): void {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('denied', 'SecurityError');
    },
  });
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  if (original) Object.defineProperty(window, 'localStorage', original);
  else Reflect.deleteProperty(window, 'localStorage');
});

describe('profile', () => {
  it('starts from the default profile', () => {
    expect(loadProfile()).toEqual(DEFAULT_PROFILE);
  });

  it('round-trips a saved profile', () => {
    saveProfile(PROFILE);
    expect(loadProfile()).toEqual(PROFILE);
  });

  it('falls back to defaults when localStorage throws on access', () => {
    breakStorage();
    expect(loadProfile()).toEqual(DEFAULT_PROFILE);
    expect(() => saveProfile(PROFILE)).not.toThrow();
  });

  it('falls back to defaults on invalid JSON', () => {
    localStorage.setItem('clearday.profile.v1', '{not json');
    expect(loadProfile()).toEqual(DEFAULT_PROFILE);
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a missing section', { ...PROFILE, home: undefined }],
    ['a count out of range', { ...PROFILE, household: { ...PROFILE.household, adults: 21 } }],
    ['a fractional count', { ...PROFILE, household: { ...PROFILE.household, children: 1.5 } }],
    ['an unknown commute mode', { ...PROFILE, commute: { ...PROFILE.commute, mode: 'jetpack' } }],
    ['an hour of 24', { ...PROFILE, exercise: { type: 'run', hour: 24, minutes: 30 } }],
    ['a string flag', { ...PROFILE, household: { ...PROFILE.household, heart: 'yes' } }],
  ])('falls back to defaults for %s', (_name, value) => {
    localStorage.setItem('clearday.profile.v1', JSON.stringify(value));
    expect(loadProfile()).toEqual(DEFAULT_PROFILE);
  });

  it('drops unknown keys so a stale profile still passes the strict server schema', () => {
    const stale = { ...PROFILE, legacy: 1, home: { ...PROFILE.home, petCount: 3 } };
    localStorage.setItem('clearday.profile.v1', JSON.stringify(stale));
    expect(loadProfile()).toEqual(PROFILE);
  });

  it('returns a fresh copy, so callers cannot change the defaults', () => {
    loadProfile().household.adults = 9;
    expect(loadProfile().household.adults).toBe(DEFAULT_PROFILE.household.adults);
    expect(DEFAULT_PROFILE.household.adults).toBe(2);
  });
});

describe('place', () => {
  it('is null until one is saved', () => {
    expect(loadPlace()).toBeNull();
  });

  it('round-trips a saved place, including a geolocated one with no country', () => {
    savePlace(PLACE);
    expect(loadPlace()).toEqual(PLACE);
    const here = { name: 'Current location', country: '', countryCode: '', lat: 28.61, lon: 77.21 };
    savePlace(here);
    expect(loadPlace()).toEqual(here);
  });

  it.each([
    ['invalid JSON', '{'],
    ['a latitude out of range', JSON.stringify({ ...PLACE, lat: 91 })],
    ['a string longitude', JSON.stringify({ ...PLACE, lon: '1' })],
    ['a lowercase country code', JSON.stringify({ ...PLACE, countryCode: 'br' })],
    ['an empty name', JSON.stringify({ ...PLACE, name: '' })],
  ])('is null for %s', (_name, raw) => {
    localStorage.setItem('clearday.place.v1', raw);
    expect(loadPlace()).toBeNull();
  });

  it('is null when localStorage throws', () => {
    breakStorage();
    expect(loadPlace()).toBeNull();
    expect(() => savePlace(PLACE)).not.toThrow();
  });
});

describe('onboarding flag', () => {
  it('is false until marked, then true', () => {
    expect(hasSeenOnboarding()).toBe(false);
    markOnboardingSeen();
    expect(hasSeenOnboarding()).toBe(true);
  });

  it('is false and never throws when localStorage throws', () => {
    breakStorage();
    expect(hasSeenOnboarding()).toBe(false);
    expect(() => markOnboardingSeen()).not.toThrow();
  });
});
