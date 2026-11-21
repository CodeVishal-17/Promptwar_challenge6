import type { AqiCategory, AqiReading } from '../../../shared/types.js';

/** The chart's numbers: one bar per hour, the times under them, and the AQI grid lines. */

export interface Bar {
  x: number;
  y: number;
  w: number;
  h: number;
  category: AqiCategory | null;
  /** Local wall-clock `YYYY-MM-DDTHH:MM`, derived from neighbours when the reading is missing. */
  time: string;
}

/** The y scale always reaches at least this AQI, so a clean day does not look dramatic. */
export const MIN_SCALE_TOP = 200;
/** Share of each hour's slot the bar fills; the rest is the gap between bars. */
const BAR_FILL = 0.76;
const HOUR_MS = 3_600_000;

/** Reads `YYYY-MM-DDTHH:MM` as a wall-clock moment on a zoneless (UTC) axis. */
function wallMs(time: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(time);
  return m
    ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
    : Number.NaN;
}

const wallString = (ms: number): string => new Date(ms).toISOString().slice(0, 16);

/** One time per hour: the reading's own, else counted from the nearest reading that has one. */
export function hourTimes(hourly: (AqiReading | null)[]): string[] {
  const anchors = hourly.flatMap((r, i) => (r && !Number.isNaN(wallMs(r.time)) ? [i] : []));
  return hourly.map((r, i) => {
    if (r) return r.time;
    let nearest = -1;
    for (const a of anchors)
      if (nearest < 0 || Math.abs(a - i) < Math.abs(nearest - i)) nearest = a;
    if (nearest < 0) return '';
    const anchor = hourly[nearest];
    if (!anchor) return '';
    return wallString(wallMs(anchor.time) + (i - nearest) * HOUR_MS);
  });
}

/**
 * One bar per hour in a `width` × `height` box, equal widths, bottoms on the baseline (y + h =
 * height). The scale tops out at `maxAqi`, by default the larger of 200 and the highest AQI.
 * A missing reading is a zero-height bar with no category.
 */
export function chartBars(
  hourly: (AqiReading | null)[],
  width: number,
  height: number,
  maxAqi?: number,
): Bar[] {
  if (hourly.length === 0) return [];
  const highest = Math.max(0, ...hourly.map((r) => r?.aqi ?? 0));
  const top = maxAqi ?? Math.max(MIN_SCALE_TOP, highest);
  const slot = width / hourly.length;
  const w = slot * BAR_FILL;
  const times = hourTimes(hourly);
  return hourly.map((r, i) => {
    const barH = r ? Math.min(height, (r.aqi / top) * height) : 0;
    return {
      x: i * slot + (slot - w) / 2,
      y: height - barH,
      w,
      h: barH,
      category: r ? r.category : null,
      time: times[i] ?? '',
    };
  });
}

/** Grid lines sit on the EPA category boundaries, plus 1000 because the AQI runs on past 500. */
const GRID_LINES = [50, 100, 150, 200, 300, 500, 1000];
/** Nearest two grid lines may sit, as a share of the scale, so their labels never overlap. */
const MIN_GRID_GAP = 0.12;

/** The grid lines for a scale that tops out at `top`: the boundaries that fit, spaced to be labelled. */
export function gridLines(top: number): number[] {
  const lines: number[] = [];
  for (const v of GRID_LINES) {
    if (v > top) break;
    if ((v - (lines.at(-1) ?? 0)) / top >= MIN_GRID_GAP) lines.push(v);
  }
  return lines;
}
