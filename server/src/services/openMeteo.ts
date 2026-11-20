import { z } from 'zod';
import type { AirReport, Place } from '../../../shared/types.js';
import { buildAirReport } from '../domain/report.js';
import { TtlCache } from './cache.js';

/** Raised when Open-Meteo is unreachable, errors, or returns unusable data. */
export class UpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpstreamError';
  }
}

export interface AirService {
  getReport(lat: number, lon: number): Promise<AirReport>;
}

export interface GeocodeService {
  search(q: string): Promise<Place[]>;
}

const AIR_BASE = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const GEOCODE_BASE = 'https://geocoding-api.open-meteo.com/v1/search';
const FETCH_TIMEOUT_MS = 8000;
const AIR_TTL_MS = 15 * 60_000;
const GEOCODE_TTL_MS = 24 * 60 * 60_000;
const CACHE_MAX_ENTRIES = 500;

const series = z.array(z.number().nullable());
const airSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string(),
  utc_offset_seconds: z.number(),
  hourly: z.object({
    time: z.array(z.string()),
    pm2_5: series,
    pm10: series,
    ozone: series,
    nitrogen_dioxide: series,
  }),
});

const geocodeSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        admin1: z.string().optional(),
        country: z.string().optional(),
        country_code: z.string().optional(),
      }),
    )
    .optional(),
});

/** Fetches and validates JSON. Error messages never include the URL (it carries user location). */
async function fetchJson<T>(
  fetchFn: typeof fetch,
  url: string,
  schema: z.ZodType<T>,
  what: string,
): Promise<T> {
  let res: Response;
  try {
    res = await fetchFn(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch {
    throw new UpstreamError(`${what} request failed`);
  }
  if (!res.ok) throw new UpstreamError(`${what} responded with status ${res.status}`);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new UpstreamError(`${what} returned invalid JSON`);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new UpstreamError(`${what} returned an unexpected payload`);
  return parsed.data;
}

const round1 = (x: number): number => Math.round(x * 10) / 10;

export function createAirService(fetchFn: typeof fetch, now: () => Date): AirService {
  const cache = new TtlCache<AirReport>(AIR_TTL_MS, CACHE_MAX_ENTRIES, () => now().getTime());
  return {
    getReport(lat, lon) {
      const lat1 = round1(lat).toFixed(1);
      const lon1 = round1(lon).toFixed(1);
      return cache.getOrLoad(`${lat1},${lon1}`, async () => {
        const url =
          `${AIR_BASE}?latitude=${lat1}&longitude=${lon1}` +
          '&hourly=pm2_5,pm10,ozone,nitrogen_dioxide&past_days=1&forecast_days=5&timezone=auto';
        const raw = await fetchJson(fetchFn, url, airSchema, 'Air quality service');
        try {
          return buildAirReport(raw, now());
        } catch {
          throw new UpstreamError('Air quality service returned data outside the current time');
        }
      });
    },
  };
}

export function createGeocodeService(fetchFn: typeof fetch): GeocodeService {
  const cache = new TtlCache<Place[]>(GEOCODE_TTL_MS, CACHE_MAX_ENTRIES);
  return {
    search(q) {
      const key = q.trim().toLowerCase();
      return cache.getOrLoad(key, async () => {
        const url = `${GEOCODE_BASE}?name=${encodeURIComponent(q)}&count=5&language=en&format=json`;
        const data = await fetchJson(fetchFn, url, geocodeSchema, 'Geocoding service');
        const places: Place[] = [];
        for (const r of data.results ?? []) {
          if (!r.country_code) continue;
          places.push({
            name: r.name,
            ...(r.admin1 !== undefined && { admin1: r.admin1 }),
            country: r.country ?? r.country_code.toUpperCase(),
            countryCode: r.country_code.toUpperCase(),
            lat: r.latitude,
            lon: r.longitude,
          });
        }
        return places;
      });
    },
  };
}
