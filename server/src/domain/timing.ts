import type {
  ActivityLevel,
  AirReport,
  AirWindow,
  Impact,
  Profile,
} from '../../../shared/types.js';
import {
  INHALATION_M3_PER_MIN,
  exposureChangeImpact,
  sameTripExposureImpact,
} from './impact/exposure.js';
import { AQI_UNHEALTHY, type PlanContext } from './planContext.js';
import {
  clockTime,
  dayWord,
  indexOfLocalHour,
  indexOfTime,
  nextHour,
  windowHours,
  windowOf,
} from './reportTime.js';

/**
 * Timing advice: when moving a usual outing (a workout, the school run) to a cleaner hour is
 * worth it, and how much PM2.5 that saves.
 */

type ExerciseType = NonNullable<Profile['exercise']>['type'];

const EXERCISE_LEVEL: Record<ExerciseType, ActivityLevel> = {
  run: 'high',
  cycle: 'moderate',
  walk: 'light',
  sport: 'high',
};

const EXERCISE_NOUN: Record<ExerciseType, string> = {
  run: 'run',
  cycle: 'ride',
  walk: 'walk',
  sport: 'workout',
};

/** A usual hour and a cleaner window to move it to, as indexes into the 48-hour report. */
export interface Slots {
  usual: number;
  best: number;
  bestWindow: AirWindow;
}

const pmAt = (report: AirReport, i: number): number | null => report.pm25[i] ?? null;

/** PM2.5 at the usual and the cleaner hour, when both are known and the usual one is above zero. */
function pmPair(ctx: PlanContext, slots: Slots): { before: number; after: number } | null {
  const before = pmAt(ctx.report, slots.usual);
  const after = pmAt(ctx.report, slots.best);
  if (before === null || after === null || !(before > 0)) return null;
  return { before, after };
}

/** The usual exercise hour and the cleanest daytime window. */
export function exerciseSlots(ctx: PlanContext): Slots | null {
  const { exercise } = ctx.profile;
  const bestWindow = windowOf(ctx.report, 'best');
  if (!exercise || !bestWindow) return null;
  const usual = indexOfLocalHour(ctx.report, exercise.hour);
  const best = indexOfTime(ctx.report, bestWindow.start);
  if (usual < 0 || best < 0) return null;
  return { usual, best, bestWindow };
}

/** The next school-run departure and its local date, when it has a PM2.5 reading. */
function schoolDeparture(ctx: PlanContext): { usual: number; date: string } | null {
  const { commute, household } = ctx.profile;
  if (!commute || household.children <= 0) return null;
  const usual = indexOfLocalHour(ctx.report, commute.departHour);
  const date = ctx.report.hourly[usual]?.time.slice(0, 10);
  if (date === undefined || pmAt(ctx.report, usual) === null) return null;
  return { usual, date };
}

/** Of the hours either side of `usual` on local date `date`, the one with less PM2.5; -1 if neither. */
function cleanerNeighbour(report: AirReport, usual: number, date: string): number {
  let best = -1;
  for (const i of [usual - 1, usual + 1]) {
    const pm = pmAt(report, i);
    if (report.hourly[i]?.time.slice(0, 10) !== date || pm === null) continue;
    const bestPm = pmAt(report, best);
    if (bestPm === null || pm < bestPm) best = i;
  }
  return best;
}

/**
 * The next school-run departure and whichever of the hour before and the hour after it, on the
 * same local day, has less PM2.5. A family can leave an hour earlier or later; it cannot move
 * the school day by several hours. Null without PM2.5 readings to compare.
 */
export function schoolRunSlots(ctx: PlanContext): Slots | null {
  const departure = schoolDeparture(ctx);
  if (!departure) return null;
  const best = cleanerNeighbour(ctx.report, departure.usual, departure.date);
  const reading = ctx.report.hourly[best];
  if (!reading) return null;
  const bestWindow: AirWindow = {
    kind: 'best',
    start: reading.time,
    end: nextHour(reading.time),
    meanAqi: reading.aqi,
  };
  return { usual: departure.usual, best, bestWindow };
}

/**
 * Worth moving the usual hour: it is outside the window, the window is below the unhealthy
 * level and, when both readings are known, its PM2.5 is lower.
 */
export function worthMoving(ctx: PlanContext, slots: Slots | null): boolean {
  if (!slots) return false;
  const inBestWindow =
    slots.usual >= slots.best && slots.usual < slots.best + windowHours(slots.bestWindow);
  if (inBestWindow || slots.bestWindow.meanAqi >= AQI_UNHEALTHY) return false;
  const before = pmAt(ctx.report, slots.usual);
  const after = pmAt(ctx.report, slots.best);
  return before === null || after === null || after < before;
}

/** "tomorrow 07:00": the day and clock time of a report hour, since either may fall tomorrow. */
function whenText(ctx: PlanContext, i: number): string {
  const time = ctx.report.hourly[i]?.time ?? '';
  return `${dayWord(time, ctx.report)} ${clockTime(time)}`;
}

/** The outing being moved: what to call it, how hard and how long, and what the figure assumes. */
interface Outing {
  label: string;
  /** Inhalation rate in m³ per minute. */
  rate: number;
  minutes: number;
  assumptions: string[];
}

/**
 * Change in inhaled PM2.5 from the usual hour to the first hour of the window, at one
 * inhalation rate. The inputs name each hour's day, since either may fall tomorrow.
 */
function movedExposureImpact(ctx: PlanContext, slots: Slots | null, outing: Outing): Impact | null {
  const pm = slots && pmPair(ctx, slots);
  if (!slots || !pm) return null;
  const { rate, minutes } = outing;
  const impact = exposureChangeImpact(
    outing.label,
    { conc: pm.before, rate, minutes },
    { conc: pm.after, rate, minutes },
  );
  const [beforeInput, afterInput] = impact.inputs;
  return {
    ...impact,
    inputs: [
      { label: `Before, ${whenText(ctx, slots.usual)}`, value: beforeInput?.value ?? '' },
      { label: `After, ${whenText(ctx, slots.best)}`, value: afterInput?.value ?? '' },
    ],
    assumptions: [...impact.assumptions, ...outing.assumptions],
  };
}

export function moveExerciseImpact(ctx: PlanContext): Impact | null {
  const { exercise } = ctx.profile;
  if (!exercise) return null;
  return movedExposureImpact(ctx, exerciseSlots(ctx), {
    label: `Move your ${EXERCISE_NOUN[exercise.type]} to the cleanest window`,
    rate: INHALATION_M3_PER_MIN.adult[EXERCISE_LEVEL[exercise.type]],
    minutes: exercise.minutes,
    assumptions: [
      'Uses the forecast PM2.5 for the hour you usually exercise and for the first hour of the cleanest window, for an adult.',
    ],
  });
}

export function schoolRunImpact(ctx: PlanContext): Impact | null {
  const slots = schoolRunSlots(ctx);
  const pm = slots && pmPair(ctx, slots);
  if (!slots || !pm) return null;
  const shift = slots.best < slots.usual ? 'earlier' : 'later';
  const impact = sameTripExposureImpact(
    `Leave an hour ${shift} for the school run`,
    { label: `Usual departure (${whenText(ctx, slots.usual)})`, conc: pm.before },
    { label: `An hour ${shift} (${whenText(ctx, slots.best)})`, conc: pm.after },
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
