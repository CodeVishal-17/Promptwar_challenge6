import type { AirWindow, AqiReading } from '../../../shared/types.js';
import { nextHour } from './reportTime.js';

/** A run of consecutive hours: its span, mean AQI and whether it fits inside the daytime hours. */
interface Run {
  start: string;
  end: string;
  meanAqi: number;
  inDaytime: boolean;
}

const localHour = (time: string): number => Number(time.slice(11, 13));

/** The run of `hours` readings starting at index `i`, or null when any of them is missing. */
function runAt(
  hourly: (AqiReading | null)[],
  i: number,
  hours: number,
  daytime: [number, number],
): Run | null {
  const readings = hourly.slice(i, i + hours);
  if (readings.length < hours || readings.some((r) => r === null)) return null;
  const first = readings[0];
  const last = readings[readings.length - 1];
  if (!first || !last) return null;
  const sameDay = first.time.slice(0, 10) === last.time.slice(0, 10);
  return {
    start: first.time,
    end: nextHour(last.time),
    meanAqi: Math.round(readings.reduce((sum, r) => sum + (r?.aqi ?? 0), 0) / hours),
    inDaytime:
      sameDay && localHour(first.time) >= daytime[0] && localHour(last.time) + 1 <= daytime[1],
  };
}

/**
 * Finds the cleanest and the most polluted runs of `hours` consecutive readings.
 * The best window must lie entirely within local `daytime` hours [from, to]; the worst may
 * fall at any time. Windows containing a null hour are skipped and ties go to the earliest.
 */
export function findWindows(
  hourly: (AqiReading | null)[],
  hours = 2,
  daytime: [number, number] = [6, 21],
): AirWindow[] {
  let best: AirWindow | null = null;
  let worst: AirWindow | null = null;

  for (let i = 0; i + hours <= hourly.length; i++) {
    const run = runAt(hourly, i, hours, daytime);
    if (!run) continue;
    const { inDaytime, ...span } = run;
    if (worst === null || span.meanAqi > worst.meanAqi) worst = { kind: 'worst', ...span };
    if (inDaytime && (best === null || span.meanAqi < best.meanAqi))
      best = { kind: 'best', ...span };
  }

  return [best, worst].filter((w): w is AirWindow => w !== null);
}
