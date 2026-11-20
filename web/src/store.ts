import { DEFAULT_PROFILE } from '../../shared/profile.js';
import type { CommuteMode, Place, Profile } from '../../shared/types.js';

/**
 * Everything the app remembers lives in this browser's localStorage. Storage can be missing,
 * blocked (private mode) or hold stale data from an older version, so every read is
 * shape-checked and rebuilt, every call is guarded, and nothing here ever throws.
 */
const KEYS = {
  profile: 'clearday.profile.v1',
  place: 'clearday.place.v1',
  onboarded: 'clearday.onboarded.v1',
} as const;

function storage(): Storage | null {
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function read(key: string): unknown {
  try {
    const raw = storage()?.getItem(key);
    return raw == null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage blocked: the app keeps working for this visit.
  }
}

type Obj = Record<string, unknown>;

/** Thrown inside parsing only; caught at the boundary and turned into the default. */
class Invalid extends Error {}

const obj = (v: unknown): Obj => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Invalid();
  return v as Obj;
};
const bool = (v: unknown): boolean => {
  if (typeof v !== 'boolean') throw new Invalid();
  return v;
};
const num = (v: unknown, min: number, max: number, int = false): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Invalid();
  if (int && !Number.isInteger(v)) throw new Invalid();
  return v;
};
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T => {
  if (!allowed.includes(v as T)) throw new Invalid();
  return v as T;
};
const optional = <T>(v: unknown, parse: (v: unknown) => T): T | undefined =>
  v === undefined ? undefined : parse(v);

const COMMUTE_MODES: readonly CommuteMode[] = [
  'car_petrol',
  'car_diesel',
  'car_ev',
  'motorbike',
  'bus',
  'rail',
  'bike',
  'walk',
];
const EXERCISE_TYPES = ['run', 'cycle', 'walk', 'sport'] as const;

// Ranges mirror the server's request schema, so a stored profile is always one the API accepts.
const count = (v: unknown) => num(v, 0, 20, true);
const hour = (v: unknown) => num(v, 0, 23, true);
const capacity = (v: unknown) => num(v, 1, 2000);

/** Rebuilds a Profile from known fields only; unknown keys are dropped. */
function parseProfile(value: unknown): Profile {
  const p = obj(value);
  const household = obj(p.household);
  const home = obj(p.home);
  const commute = p.commute === null ? null : obj(p.commute);
  const exercise = p.exercise === null ? null : obj(p.exercise);
  const profile: Profile = {
    household: {
      adults: count(household.adults),
      children: count(household.children),
      olderAdults: count(household.olderAdults),
      pregnant: bool(household.pregnant),
      respiratory: bool(household.respiratory),
      heart: bool(household.heart),
    },
    commute: commute && {
      mode: oneOf(commute.mode, COMMUTE_MODES),
      oneWayKm: num(commute.oneWayKm, 0, 200),
      departHour: hour(commute.departHour),
    },
    exercise: exercise && {
      type: oneOf(exercise.type, EXERCISE_TYPES),
      hour: hour(exercise.hour),
      minutes: num(exercise.minutes, 5, 240),
    },
    home: {
      purifier: bool(home.purifier),
      cooking: oneOf(home.cooking, ['gas', 'electric', 'solid'] as const),
      heating: oneOf(home.heating, ['gas', 'electric', 'wood_coal', 'none'] as const),
      canOpenWindows: bool(home.canOpenWindows),
      indoorSmoking: bool(home.indoorSmoking),
    },
  };
  const cadr = optional(home.purifierCadrM3h, capacity);
  const room = optional(home.roomM3, capacity);
  if (cadr !== undefined) profile.home.purifierCadrM3h = cadr;
  if (room !== undefined) profile.home.roomM3 = room;
  return profile;
}

function parsePlace(value: unknown): Place {
  const p = obj(value);
  const text = (v: unknown, min = 0): string => {
    if (typeof v !== 'string' || v.length < min || v.length > 200) throw new Invalid();
    return v;
  };
  const countryCode = text(p.countryCode);
  if (countryCode !== '' && !/^[A-Z]{2}$/.test(countryCode)) throw new Invalid();
  const place: Place = {
    name: text(p.name, 1),
    country: text(p.country),
    countryCode,
    lat: num(p.lat, -90, 90),
    lon: num(p.lon, -180, 180),
  };
  const admin1 = optional(p.admin1, (v) => text(v));
  if (admin1 !== undefined) place.admin1 = admin1;
  return place;
}

function parseOr<T>(value: unknown, parse: (v: unknown) => T, fallback: () => T): T {
  try {
    return parse(value);
  } catch {
    return fallback();
  }
}

/** The saved profile, or a fresh copy of DEFAULT_PROFILE. */
export function loadProfile(): Profile {
  return parseOr(read(KEYS.profile), parseProfile, () => structuredClone(DEFAULT_PROFILE));
}

export function saveProfile(p: Profile): void {
  write(KEYS.profile, p);
}

export function loadPlace(): Place | null {
  return parseOr<Place | null>(read(KEYS.place), parsePlace, () => null);
}

export function savePlace(p: Place): void {
  write(KEYS.place, p);
}

export function hasSeenOnboarding(): boolean {
  return read(KEYS.onboarded) === true;
}

export function markOnboardingSeen(): void {
  write(KEYS.onboarded, true);
}
