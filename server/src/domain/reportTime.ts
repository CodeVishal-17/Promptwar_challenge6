import type { AirReport, AirWindow } from '../../../shared/types.js';

/**
 * Reading times and days off an air report. Report times are local wall-clock ISO strings
 * (`YYYY-MM-DDTHH:00`), so they are parsed as UTC to keep the browser's or server's zone out.
 */
export const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export const windowOf = (report: AirReport, kind: AirWindow['kind']): AirWindow | undefined =>
  report.windows.find((w) => w.kind === kind);

/** Local `HH:MM` of a local ISO `YYYY-MM-DDTHH:00` time. */
export const clockTime = (iso: string): string => iso.slice(11, 16);

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

export const indexOfTime = (report: AirReport, iso: string): number =>
  report.hourly.findIndex((r) => r?.time === iso);

/** Index of the next hour (counting the current one) whose local clock hour is `hour`. */
export const indexOfLocalHour = (report: AirReport, hour: number): number =>
  report.hourly.findIndex((r) => r !== null && Number(r.time.slice(11, 13)) === hour);

export const windowHours = (w: AirWindow): number =>
  Math.round((Date.parse(`${w.end}:00Z`) - Date.parse(`${w.start}:00Z`)) / HOUR_MS);

/** The local ISO time one hour after `iso`. */
export const nextHour = (iso: string): string =>
  new Date(Date.parse(`${iso}:00Z`) + HOUR_MS).toISOString().slice(0, 16);
