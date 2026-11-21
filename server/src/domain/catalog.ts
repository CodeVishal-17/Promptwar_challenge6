import type {
  ActivityLevel,
  AirReport,
  AirWindow,
  CommuteMode,
  Impact,
  Profile,
  Section,
  Source,
} from '../../../shared/types.js';
import {
  AIRNOW_PM_GUIDE,
  EPA_DIY_AIR_CLEANERS,
  EPA_IMPROVING_IAQ,
  EPA_INTRO_IAQ,
  EPA_WILDFIRES_IAQ,
  EPA_WOOD_SMOKE,
  WHO_AMBIENT_AIR,
  WHO_HOUSEHOLD_AIR,
} from './guidanceSources.js';
import { commuteSwitchImpact } from './impact/commute.js';
import {
  INHALATION_M3_PER_MIN,
  exposureChangeImpact,
  sameTripExposureImpact,
} from './impact/exposure.js';
import { keepWindowsClosedImpact, purifierImpact } from './impact/indoor.js';
import { DESNZ_2026, EPA_AIR_CLEANER_GUIDE, EPA_EFH_CH6, XIANG_2021 } from './impact/sources.js';

export interface PlanContext {
  report: AirReport;
  profile: Profile;
  /** ISO 3166-1 alpha-2 country code of the place, used for grid carbon intensity. */
  countryCode?: string;
}

export interface Action {
  id: string;
  section: Section;
  title: string;
  /** Plain-words explanation of the direct impact. The impact chip carries any number. */
  defaultWhy: string;
  /** 1 to 100; higher is more important and is shown first. */
  priority: number;
  applies(ctx: PlanContext): boolean;
  /** A number computed in code, or null when the inputs for it are missing. */
  impact?(ctx: PlanContext): Impact | null;
  sources: Source[];
}

/** US AQI at which the air is unhealthy for sensitive groups. */
const AQI_USG = 101;
/** US AQI at which the air is unhealthy for everyone. */
const AQI_UNHEALTHY = 151;
/** Longest commute, one way, for which a bike is offered as the swap. */
const BIKE_MAX_KM = 8;

// ---- Context helpers (exported for the planner) ------------------------------------------

export const currentAqi = (ctx: PlanContext): number | null => ctx.report.now?.aqi ?? null;

const aqiAtLeast =
  (threshold: number) =>
  (ctx: PlanContext): boolean => {
    const aqi = currentAqi(ctx);
    return aqi !== null && aqi >= threshold;
  };

export const windowOf = (report: AirReport, kind: AirWindow['kind']): AirWindow | undefined =>
  report.windows.find((w) => w.kind === kind);

/** Local `HH:MM` of a local ISO `YYYY-MM-DDTHH:00` time. */
export const clockTime = (iso: string): string => iso.slice(11, 16);

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** Local date `YYYY-MM-DD` of the report's first hour (the current one), when any hour is known. */
export function reportToday(report: AirReport): string | undefined {
  const i = report.hourly.findIndex((r) => r !== null);
  const first = report.hourly[i];
  if (!first) return undefined;
  return new Date(Date.parse(`${first.time}:00Z`) - i * HOUR_MS).toISOString().slice(0, 10);
}

/**
 * "Tomorrow", or the weekday name further ahead, for a local ISO time not on local date
 * `today`; undefined when it is today. Dates are read as wall-clock, so no zone shifts them.
 */
export function dayLabel(iso: string, today: string): string | undefined {
  const days = Math.round(
    (Date.parse(`${iso.slice(0, 10)}T00:00Z`) - Date.parse(`${today}T00:00Z`)) / DAY_MS,
  );
  if (!Number.isFinite(days) || days === 0) return undefined;
  if (days === 1) return 'Tomorrow';
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(`${iso.slice(0, 10)}T00:00:00Z`),
  );
}

/** The day of a local ISO time as a word for running text: "today", "tomorrow" or a weekday. */
export function dayWord(iso: string, report: AirReport): string {
  const today = reportToday(report);
  const label = today ? dayLabel(iso, today) : undefined;
  if (!label) return 'today';
  return label === 'Tomorrow' ? 'tomorrow' : label;
}

const indexOfTime = (report: AirReport, iso: string): number =>
  report.hourly.findIndex((r) => r?.time === iso);

/** Index of the next hour (counting the current one) whose local clock hour is `hour`. */
const indexOfLocalHour = (report: AirReport, hour: number): number =>
  report.hourly.findIndex((r) => r !== null && Number(r.time.slice(11, 13)) === hour);

const windowHours = (w: AirWindow): number =>
  Math.round((Date.parse(`${w.end}:00Z`) - Date.parse(`${w.start}:00Z`)) / HOUR_MS);

// ---- Exercise ---------------------------------------------------------------------------

const EXERCISE_LEVEL: Record<NonNullable<Profile['exercise']>['type'], ActivityLevel> = {
  run: 'high',
  cycle: 'moderate',
  walk: 'light',
  sport: 'high',
};

const EXERCISE_NOUN: Record<NonNullable<Profile['exercise']>['type'], string> = {
  run: 'run',
  cycle: 'ride',
  walk: 'walk',
  sport: 'workout',
};

/** A usual hour and a cleaner window to move it to, as indexes into the 48-hour report. */
interface Slots {
  usual: number;
  best: number;
  bestWindow: AirWindow;
}

/** The usual exercise hour and the cleanest daytime window. */
function exerciseSlots(ctx: PlanContext): Slots | null {
  const { exercise } = ctx.profile;
  const bestWindow = windowOf(ctx.report, 'best');
  if (!exercise || !bestWindow) return null;
  const usual = indexOfLocalHour(ctx.report, exercise.hour);
  const best = indexOfTime(ctx.report, bestWindow.start);
  if (usual < 0 || best < 0) return null;
  return { usual, best, bestWindow };
}

/**
 * The next school-run departure and whichever of the hour before and the hour after it, on the
 * same local day, has less PM2.5. A family can leave an hour earlier or later; it cannot move
 * the school day by several hours. Null without PM2.5 readings to compare.
 */
function schoolRunSlots(ctx: PlanContext): Slots | null {
  const { commute, household } = ctx.profile;
  if (!commute || household.children <= 0) return null;
  const { report } = ctx;
  const usual = indexOfLocalHour(report, commute.departHour);
  const date = report.hourly[usual]?.time.slice(0, 10);
  if (date === undefined || (report.pm25[usual] ?? null) === null) return null;

  let best = -1;
  for (const i of [usual - 1, usual + 1]) {
    const pm = report.pm25[i] ?? null;
    if (report.hourly[i]?.time.slice(0, 10) !== date || pm === null) continue;
    const bestPm = report.pm25[best] ?? null;
    if (bestPm === null || pm < bestPm) best = i;
  }
  const reading = report.hourly[best];
  if (!reading) return null;
  const end = new Date(Date.parse(`${reading.time}:00Z`) + HOUR_MS).toISOString().slice(0, 16);
  return {
    usual,
    best,
    bestWindow: { kind: 'best', start: reading.time, end, meanAqi: reading.aqi },
  };
}

/**
 * Worth moving the usual hour: it is outside the window, the window is below the unhealthy
 * level and, when both readings are known, its PM2.5 is lower.
 */
function worthMoving(ctx: PlanContext, slots: Slots | null): boolean {
  if (!slots) return false;
  const inBestWindow =
    slots.usual >= slots.best && slots.usual < slots.best + windowHours(slots.bestWindow);
  if (inBestWindow || slots.bestWindow.meanAqi >= AQI_UNHEALTHY) return false;
  const before = ctx.report.pm25[slots.usual] ?? null;
  const after = ctx.report.pm25[slots.best] ?? null;
  return before === null || after === null || after < before;
}

/** "tomorrow 07:00": the day and clock time of a report hour, since either may fall tomorrow. */
function whenText(ctx: PlanContext, i: number): string {
  const time = ctx.report.hourly[i]?.time ?? '';
  return `${dayWord(time, ctx.report)} ${clockTime(time)}`;
}

/**
 * Change in inhaled PM2.5 from the usual hour to the first hour of the window, at one
 * inhalation rate. The inputs name each hour's day, since either may fall tomorrow.
 */
function movedExposureImpact(
  ctx: PlanContext,
  slots: Slots | null,
  label: string,
  rate: number,
  minutes: number,
  assumptions: string[],
): Impact | null {
  if (!slots) return null;
  const before = ctx.report.pm25[slots.usual] ?? null;
  const after = ctx.report.pm25[slots.best] ?? null;
  if (before === null || after === null || !(before > 0)) return null;
  const impact = exposureChangeImpact(
    label,
    { conc: before, rate, minutes },
    { conc: after, rate, minutes },
  );
  const [beforeInput, afterInput] = impact.inputs;
  return {
    ...impact,
    inputs: [
      { label: `Before, ${whenText(ctx, slots.usual)}`, value: beforeInput?.value ?? '' },
      { label: `After, ${whenText(ctx, slots.best)}`, value: afterInput?.value ?? '' },
    ],
    assumptions: [...impact.assumptions, ...assumptions],
  };
}

function moveExerciseImpact(ctx: PlanContext): Impact | null {
  const { exercise } = ctx.profile;
  if (!exercise) return null;
  return movedExposureImpact(
    ctx,
    exerciseSlots(ctx),
    `Move your ${EXERCISE_NOUN[exercise.type]} to the cleanest window`,
    INHALATION_M3_PER_MIN.adult[EXERCISE_LEVEL[exercise.type]],
    exercise.minutes,
    [
      'Uses the forecast PM2.5 for the hour you usually exercise and for the first hour of the cleanest window, for an adult.',
    ],
  );
}

function schoolRunImpact(ctx: PlanContext): Impact | null {
  const slots = schoolRunSlots(ctx);
  if (!slots) return null;
  const before = ctx.report.pm25[slots.usual] ?? null;
  const after = ctx.report.pm25[slots.best] ?? null;
  if (before === null || after === null || !(before > 0)) return null;
  const shift = slots.best < slots.usual ? 'earlier' : 'later';
  const impact = sameTripExposureImpact(
    `Leave an hour ${shift} for the school run`,
    { label: `Usual departure (${whenText(ctx, slots.usual)})`, conc: before },
    { label: `An hour ${shift} (${whenText(ctx, slots.best)})`, conc: after },
  );
  return {
    ...impact,
    assumptions: [
      ...impact.assumptions,
      'Uses the forecast PM2.5 for the hour you usually leave and for the hour before or after it on the same day, whichever is lower.',
    ],
  };
}

/** Local ISO time of the cleaner hour next to the usual school-run departure, when worth it. */
export function schoolRunStart(ctx: PlanContext): string | undefined {
  const slots = schoolRunSlots(ctx);
  return worthMoving(ctx, slots) ? slots?.bestWindow.start : undefined;
}

// ---- Commute ----------------------------------------------------------------------------

const POLLUTING_MODES: readonly CommuteMode[] = ['car_petrol', 'car_diesel', 'motorbike'];
const CAR_MODES: readonly CommuteMode[] = ['car_petrol', 'car_diesel'];
const LOW_EMISSION_MODES: readonly CommuteMode[] = ['bus', 'rail', 'bike', 'walk', 'car_ev'];

const commuteIn =
  (modes: readonly CommuteMode[]) =>
  (ctx: PlanContext): boolean => {
    const { commute } = ctx.profile;
    return commute !== null && modes.includes(commute.mode);
  };

function switchCommuteImpact(ctx: PlanContext): Impact | null {
  const { commute } = ctx.profile;
  if (!commute) return null;
  const to: CommuteMode = commute.oneWayKm <= BIKE_MAX_KM ? 'bike' : 'rail';
  return commuteSwitchImpact(commute.mode, to, commute.oneWayKm, ctx.countryCode);
}

// ---- Indoor -----------------------------------------------------------------------------

const pm25Now = (ctx: PlanContext): number | null => ctx.report.pm25[0] ?? null;

/** The best window is only worth airing the home in when the air is not itself unhealthy. */
function canAirOut(ctx: PlanContext): boolean {
  const best = windowOf(ctx.report, 'best');
  return ctx.profile.home.canOpenWindows && best !== undefined && best.meanAqi < AQI_UNHEALTHY;
}

// ---- The catalogue ----------------------------------------------------------------------

export const ACTIONS: readonly Action[] = [
  // Routine: low-emission daily routines and how to move through the day.
  {
    id: 'exercise-indoors',
    section: 'routine',
    title: 'Move today’s workout indoors',
    defaultWhy:
      'Hard exercise makes you breathe far more air, so smog does the most harm while you work out. Indoors you breathe in much less of it.',
    priority: 90,
    applies: (ctx) => ctx.profile.exercise !== null && aqiAtLeast(AQI_UNHEALTHY)(ctx),
    sources: [AIRNOW_PM_GUIDE, EPA_EFH_CH6],
  },
  {
    id: 'n95-outdoors',
    section: 'routine',
    title: 'Wear a snug N95 or FFP2 mask if you must go out',
    defaultWhy:
      'A well-fitted respirator filters out most fine smog particles before you breathe them in. A loose cloth or surgical mask lets them slip in around the edges, and children’s faces are usually too small to seal one, so for them staying in is safer. If you have a heart or lung condition, check with your doctor before using a respirator.',
    priority: 85,
    applies: aqiAtLeast(AQI_UNHEALTHY),
    sources: [AIRNOW_PM_GUIDE, EPA_WILDFIRES_IAQ],
  },
  {
    id: 'move-exercise-to-best-window',
    section: 'routine',
    title: 'Shift your exercise to the cleanest hours',
    defaultWhy:
      'Smog rises and falls through the day. Exercising when it is lowest means every breath carries less pollution.',
    priority: 80,
    applies: (ctx) => worthMoving(ctx, exerciseSlots(ctx)),
    impact: moveExerciseImpact,
    sources: [AIRNOW_PM_GUIDE, EPA_EFH_CH6],
  },
  {
    id: 'school-run-timing',
    section: 'routine',
    title: 'Time the school run for cleaner air',
    defaultWhy:
      'Children are among those most at risk from fine particles. Leaving when the air is cleaner, and keeping them off the busiest roads, lowers what they breathe in.',
    priority: 75,
    applies: (ctx) => worthMoving(ctx, schoolRunSlots(ctx)),
    impact: schoolRunImpact,
    sources: [AIRNOW_PM_GUIDE, EPA_EFH_CH6],
  },
  {
    id: 'keep-medication-handy',
    section: 'routine',
    title: 'Keep your reliever medicine and action plan close',
    defaultWhy:
      'Smog can set off asthma and heart symptoms. With your medicine and plan to hand, you can act at the first sign instead of waiting for it to get worse.',
    priority: 70,
    applies: (ctx) =>
      (ctx.profile.household.respiratory || ctx.profile.household.heart) &&
      aqiAtLeast(AQI_USG)(ctx),
    sources: [AIRNOW_PM_GUIDE],
  },
  {
    id: 'lighter-activity',
    section: 'routine',
    title: 'Keep outdoor effort light and take breaks',
    defaultWhy:
      'The harder you breathe, the more smog reaches deep into your lungs. Easier effort and regular rests cut what you take in.',
    priority: 60,
    applies: aqiAtLeast(AQI_USG),
    sources: [AIRNOW_PM_GUIDE],
  },
  {
    id: 'avoid-worst-window',
    section: 'routine',
    title: 'Keep errands out of the smoggiest hours',
    defaultWhy:
      'Pollution peaks at certain hours. Doing outdoor jobs just before or after the peak keeps you out of the thickest air.',
    priority: 55,
    applies: (ctx) => {
      const worst = windowOf(ctx.report, 'worst');
      return worst !== undefined && worst.meanAqi >= AQI_USG;
    },
    sources: [AIRNOW_PM_GUIDE],
  },
  {
    id: 'check-hourly-outlook',
    section: 'routine',
    title: 'Check the hourly outlook before you head out',
    defaultWhy:
      'Air quality changes through the day, so a quick look at the hours ahead beats guessing from this morning.',
    priority: 30,
    applies: () => true,
    sources: [AIRNOW_PM_GUIDE],
  },

  // Indoor: hacks that keep the air at home as clean as it can be.
  {
    id: 'keep-windows-closed',
    section: 'indoor',
    title: 'Keep windows and doors shut while the air is bad',
    defaultWhy:
      'A shut-up home stays cleaner than the air outside because far less smog leaks in. Every open window lets it flow straight through.',
    priority: 88,
    applies: aqiAtLeast(AQI_USG),
    impact: (ctx) => {
      const pm = pm25Now(ctx);
      return pm === null ? null : keepWindowsClosedImpact(pm);
    },
    sources: [XIANG_2021, EPA_WILDFIRES_IAQ],
  },
  {
    id: 'run-purifier',
    section: 'indoor',
    title: 'Run your air purifier in the room you use most',
    defaultWhy:
      'A purifier keeps pulling fine particles out of the room’s air, so the air you breathe indoors gets cleaner than closing the windows alone.',
    priority: 84,
    applies: (ctx) => ctx.profile.home.purifier,
    impact: (ctx) => {
      const pm = pm25Now(ctx);
      const { purifierCadrM3h, roomM3 } = ctx.profile.home;
      return pm === null ? null : purifierImpact(pm, purifierCadrM3h, roomM3);
    },
    sources: [EPA_AIR_CLEANER_GUIDE, XIANG_2021],
  },
  {
    id: 'no-indoor-smoking',
    section: 'indoor',
    title: 'Take smoking outside',
    defaultWhy:
      'Tobacco smoke fills a closed home with the same fine particles as smog, and they linger. Smoking outside keeps your indoor air as clean as it can be.',
    priority: 80,
    applies: (ctx) => ctx.profile.home.indoorSmoking,
    sources: [EPA_INTRO_IAQ],
  },
  {
    id: 'diy-box-fan-filter',
    section: 'indoor',
    title: 'Build a box-fan air cleaner',
    defaultWhy:
      'When buying a purifier is not an option, a box fan with a furnace filter fixed to it can clear fine particles from a room, as long as it is built carefully.',
    priority: 74,
    applies: (ctx) => !ctx.profile.home.purifier,
    sources: [EPA_DIY_AIR_CLEANERS, EPA_WILDFIRES_IAQ],
  },
  {
    id: 'avoid-wood-coal-heating',
    section: 'indoor',
    title: 'Heat with something cleaner than wood or coal',
    defaultWhy:
      'Burning wood or coal fills the room and the street with fine particles. Cleaner heat keeps both your air and your neighbours’ air better.',
    priority: 72,
    applies: (ctx) => ctx.profile.home.heating === 'wood_coal',
    sources: [EPA_WOOD_SMOKE, WHO_HOUSEHOLD_AIR],
  },
  {
    id: 'clean-room',
    section: 'indoor',
    title: 'Set up one clean room for the family',
    defaultWhy:
      'Keeping one room closed up, with a purifier or box-fan cleaner running, gives everyone, especially sensitive family members, a place to breathe easier.',
    priority: 68,
    applies: aqiAtLeast(AQI_UNHEALTHY),
    sources: [EPA_WILDFIRES_IAQ],
  },
  {
    id: 'air-out-in-best-window',
    section: 'indoor',
    title: 'Open the windows briefly at the cleanest hour',
    defaultWhy:
      'Stale air builds up in a sealed home. A short airing when the outdoor air is at its best refreshes the rooms with the least smog coming in.',
    priority: 66,
    applies: canAirOut,
    sources: [EPA_IMPROVING_IAQ],
  },
  {
    id: 'ventilate-while-cooking',
    section: 'indoor',
    title: 'Use the cooker hood or a window while you cook',
    defaultWhy:
      'Cooking over gas or solid fuel releases fine particles and gases into the room. Venting them outside stops them adding to the smog you are already breathing.',
    priority: 62,
    applies: (ctx) => ctx.profile.home.cooking === 'gas' || ctx.profile.home.cooking === 'solid',
    sources: [EPA_IMPROVING_IAQ, WHO_HOUSEHOLD_AIR],
  },
  {
    id: 'swap-purifier-filter',
    section: 'indoor',
    title: 'Check your purifier’s filter',
    defaultWhy:
      'A clogged filter moves less clean air. Replacing it on schedule keeps the purifier doing its job.',
    priority: 40,
    applies: (ctx) => ctx.profile.home.purifier,
    sources: [EPA_AIR_CLEANER_GUIDE],
  },

  // Sustainable: lower-emission alternatives that cut smog at the source.
  {
    id: 'no-waste-burning',
    section: 'sustainable',
    title: 'Never burn rubbish, leaves or crop waste',
    defaultWhy:
      'Open burning puts thick smoke and fine particles straight into the air around homes. Sending waste for collection stops it at the source.',
    priority: 76,
    applies: () => true,
    sources: [WHO_AMBIENT_AIR],
  },
  {
    id: 'switch-commute',
    section: 'sustainable',
    title: 'Leave the car or motorbike at home when you can',
    defaultWhy:
      'Every trip not made in a petrol or diesel vehicle means less exhaust on your street and less carbon in the atmosphere. The chip shows what a regular switch saves.',
    priority: 78,
    applies: commuteIn(POLLUTING_MODES),
    impact: switchCommuteImpact,
    sources: [DESNZ_2026, WHO_AMBIENT_AIR],
  },
  {
    id: 'cleaner-cooking-fuel',
    section: 'sustainable',
    title: 'Move toward cleaner cooking fuel',
    defaultWhy:
      'Cooking on wood, dung or charcoal is a major source of fine particles in the home. Gas, electric or induction cooking removes most of that smoke at the source.',
    priority: 64,
    applies: (ctx) => ctx.profile.home.cooking === 'solid',
    sources: [WHO_HOUSEHOLD_AIR],
  },
  {
    id: 'combine-trips',
    section: 'sustainable',
    title: 'Combine errands into one trip',
    defaultWhy: 'Fewer, planned trips mean less driving, so less exhaust on your street.',
    priority: 58,
    applies: commuteIn(CAR_MODES),
    sources: [WHO_AMBIENT_AIR],
  },
  {
    id: 'share-the-ride',
    section: 'sustainable',
    title: 'Share the ride with a neighbour or colleague',
    defaultWhy: 'Two people in one car take one vehicle’s exhaust off the road instead of two.',
    priority: 52,
    applies: commuteIn(CAR_MODES),
    sources: [WHO_AMBIENT_AIR],
  },
  {
    id: 'electrify-heating',
    section: 'sustainable',
    title: 'Plan a switch to electric heating',
    defaultWhy:
      'Electric heating puts no smoke or exhaust into your home or street, so the smog you add in winter drops at the source.',
    priority: 50,
    // Wood and coal only: WHO counts gas among the clean household fuels, so its sources do
    // not support this card for gas heating.
    applies: (ctx) => ctx.profile.home.heating === 'wood_coal',
    sources: [WHO_AMBIENT_AIR, WHO_HOUSEHOLD_AIR],
  },
  {
    id: 'keep-low-emission-commute',
    section: 'sustainable',
    title: 'Keep up your low-emission commute',
    defaultWhy:
      'Bikes, walking and electric cars add no tailpipe exhaust to your street, and a bus or train means less exhaust per person than driving alone. Your commute is already helping, so hold on to it.',
    priority: 45,
    applies: commuteIn(LOW_EMISSION_MODES),
    sources: [DESNZ_2026, WHO_AMBIENT_AIR],
  },
  {
    id: 'community-air-action',
    section: 'sustainable',
    title: 'Share what you have learned with your street or school',
    defaultWhy:
      'Much of a city’s air pollution is beyond what one household can control, so agreeing on habits like no burning, or backing local clean-air measures, goes further than going it alone.',
    priority: 35,
    applies: () => true,
    sources: [WHO_AMBIENT_AIR],
  },
];
