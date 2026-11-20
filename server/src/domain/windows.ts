import type { AirWindow, AqiReading } from '../../../shared/types.js';

const HOUR_MS = 3_600_000;

/** Local ISO `YYYY-MM-DDTHH:00` one hour after `time`. Pure wall-clock arithmetic, no zone. */
function plusOneHour(time: string): string {
  return new Date(Date.parse(`${time}:00Z`) + HOUR_MS).toISOString().slice(0, 16);
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
    const run = hourly.slice(i, i + hours);
    if (run.some((r) => r === null)) continue;
    const readings = run as AqiReading[];
    const first = readings[0];
    const last = readings[readings.length - 1];
    if (!first || !last) continue;

    const meanAqi = Math.round(readings.reduce((sum, r) => sum + r.aqi, 0) / hours);
    const end = plusOneHour(last.time);
    const window = (kind: AirWindow['kind']): AirWindow => ({
      kind,
      start: first.time,
      end,
      meanAqi,
    });

    if (worst === null || meanAqi > worst.meanAqi) worst = window('worst');

    const startHour = Number(first.time.slice(11, 13));
    const lastHour = Number(last.time.slice(11, 13));
    const sameDay = first.time.slice(0, 10) === last.time.slice(0, 10);
    const inDaytime = sameDay && startHour >= daytime[0] && lastHour + 1 <= daytime[1];
    if (inDaytime && (best === null || meanAqi < best.meanAqi)) best = window('best');
  }

  return [best, worst].filter((w): w is AirWindow => w !== null);
}
