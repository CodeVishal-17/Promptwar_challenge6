import type { AirReport, AqiReading, Place } from '../../shared/types.js';

export const PLACE: Place = {
  name: 'São Paulo',
  admin1: 'São Paulo',
  country: 'Brazil',
  countryCode: 'BR',
  lat: -23.5475,
  lon: -46.63611,
};

export function reading(
  hour: number,
  aqi: number,
  overrides: Partial<AqiReading> = {},
): AqiReading {
  return {
    time: `2026-11-20T${String(hour % 24).padStart(2, '0')}:00`,
    aqi,
    category: 'unhealthy',
    dominant: 'pm2_5',
    perPollutant: { pm2_5: aqi },
    ...overrides,
  };
}

/** A small, valid report for a place 3 h behind UTC, read at 14:00 local. */
export function makeReport(overrides: Partial<AirReport> = {}): AirReport {
  const now = reading(14, 162, { category: 'unhealthy', dominant: 'pm2_5' });
  return {
    location: { lat: -23.55, lon: -46.64, timezone: 'America/Sao_Paulo' },
    generatedAt: '2026-11-20T17:07:00.000Z',
    source: {
      name: 'Open-Meteo Air Quality API (CAMS)',
      url: 'https://open-meteo.com/en/docs/air-quality-api',
      model: 'CAMS',
      resolution: 'Hourly model output, ≈11 km Europe, ≈40 km global',
    },
    now,
    hourly: [now, reading(15, 120, { category: 'usg' })],
    pm25: [80, 60],
    windows: [],
    outlook: [],
    ...overrides,
  };
}

/** Replaces the document body with an element holding the live status region. */
export function resetDom(): void {
  document.body.replaceChildren();
  const status = document.createElement('div');
  status.id = 'status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  document.body.append(status);
}

export const statusText = (): string => document.getElementById('status')?.textContent ?? '';
