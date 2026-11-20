import type { AqiCategory, Place, Pollutant } from '../../shared/types.js';

/** US EPA AQI category names, as shown to people. */
export const CATEGORY_LABEL: Record<AqiCategory, string> = {
  good: 'Good',
  moderate: 'Moderate',
  usg: 'Unhealthy for sensitive groups',
  unhealthy: 'Unhealthy',
  very_unhealthy: 'Very unhealthy',
  hazardous: 'Hazardous',
};

/** Categories in scale order, lowest AQI first. */
export const CATEGORIES: readonly AqiCategory[] = [
  'good',
  'moderate',
  'usg',
  'unhealthy',
  'very_unhealthy',
  'hazardous',
];

export const POLLUTANT_LABEL: Record<Pollutant, string> = {
  pm2_5: 'PM2.5',
  pm10: 'PM10',
  o3: 'Ozone (O3)',
  no2: 'Nitrogen dioxide (NO2)',
};

/** `YYYY-MM-DDTHH:MM` with no zone designator: a wall-clock time at the place itself. */
const WALL_CLOCK = /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;

/**
 * `HH:MM` (24 h). A local wall-clock string (the report's hourly times) is read as written, so
 * the browser's own time zone can never shift it. An instant (with `Z` or an offset, such as
 * `generatedAt`) is shown in `timeZone` — the place's zone — or the browser's if that is unknown.
 */
export function formatLocalTime(iso: string, timeZone?: string): string {
  const wall = WALL_CLOCK.exec(iso);
  if (wall) return `${wall[1]}:${wall[2]}`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const options: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  };
  try {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-GB', options).format(date);
  }
}

/** "Zürich, Zurich, Switzerland"; the region is skipped when it repeats the name. */
export function formatPlace(p: Place): string {
  const parts = [p.name, p.admin1 && p.admin1 !== p.name ? p.admin1 : '', p.country];
  return parts.filter(Boolean).join(', ');
}
