import type { AirReport, AqiReading, DailyOutlook } from '../../../shared/types.js';
import { categoryFor, computeHourlyAqi } from './aqi.js';
import { findWindows } from './windows.js';

/** The subset of an Open-Meteo air-quality response (concentrations in µg/m³) Clearday uses. */
export interface OpenMeteoAirResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  utc_offset_seconds: number;
  hourly: {
    time: string[];
    pm2_5: (number | null)[];
    pm10: (number | null)[];
    ozone: (number | null)[];
    nitrogen_dioxide: (number | null)[];
  };
}

const FORECAST_HOURS = 48;

/**
 * Index of the hour containing `now` in `times` (local ISO `YYYY-MM-DDTHH:00`), given the
 * location's UTC offset. Returns -1 when that hour is not in the series.
 */
export function currentIndex(times: string[], utcOffsetSeconds: number, now: Date): number {
  const local = new Date(now.getTime() + utcOffsetSeconds * 1000).toISOString().slice(0, 13);
  return times.findIndex((t) => t.startsWith(local));
}

/** Highest hourly AQI per local date, for dates that have at least one reading. */
function dailyOutlook(readings: (AqiReading | null)[]): DailyOutlook[] {
  const maxByDate = new Map<string, number>();
  for (const r of readings) {
    if (!r) continue;
    const date = r.time.slice(0, 10);
    const prev = maxByDate.get(date);
    if (prev === undefined || r.aqi > prev) maxByDate.set(date, r.aqi);
  }
  return [...maxByDate].map(([date, maxAqi]) => ({ date, maxAqi, category: categoryFor(maxAqi) }));
}

/**
 * Builds the air report: the current hour, the next 48 hours, best/worst windows and a
 * per-day outlook. AQI is computed over the full series so trailing means see past hours.
 * Throws if the current time is not covered by the data.
 */
export function buildAirReport(raw: OpenMeteoAirResponse, now: Date): AirReport {
  const { hourly: h } = raw;
  const idx = currentIndex(h.time, raw.utc_offset_seconds, now);
  if (idx < 0) throw new Error('Air quality data does not cover the current time');

  const series = {
    time: h.time,
    pm2_5: h.pm2_5,
    pm10: h.pm10,
    o3: h.ozone,
    no2: h.nitrogen_dioxide,
  };

  // The outlook covers whole local days from today, so start at today's first hour.
  const today = h.time[idx]?.slice(0, 10) ?? '';
  const firstOfToday = Math.max(
    0,
    h.time.findIndex((t) => t.startsWith(today)),
  );
  const readings: (AqiReading | null)[] = [];
  for (let i = firstOfToday; i < h.time.length; i++) readings.push(computeHourlyAqi(series, i));

  const offset = idx - firstOfToday;
  const hourly = readings.slice(offset, offset + FORECAST_HOURS);

  return {
    location: { lat: raw.latitude, lon: raw.longitude, timezone: raw.timezone },
    generatedAt: now.toISOString(),
    source: {
      name: 'Open-Meteo Air Quality API (CAMS)',
      url: 'https://open-meteo.com/en/docs/air-quality-api',
      model: 'CAMS',
      resolution: 'Hourly model output, ≈11 km Europe, ≈40 km global',
    },
    now: hourly[0] ?? null,
    hourly,
    pm25: h.pm2_5.slice(idx, idx + FORECAST_HOURS),
    windows: findWindows(hourly),
    outlook: dailyOutlook(readings),
  };
}
