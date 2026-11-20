import { describe, expect, it } from 'vitest';
import {
  CATEGORY_LABEL,
  POLLUTANT_LABEL,
  formatLocalTime,
  formatPlace,
} from '../../web/src/format.js';

describe('CATEGORY_LABEL', () => {
  it('uses the EPA category names', () => {
    expect(CATEGORY_LABEL).toEqual({
      good: 'Good',
      moderate: 'Moderate',
      usg: 'Unhealthy for sensitive groups',
      unhealthy: 'Unhealthy',
      very_unhealthy: 'Very unhealthy',
      hazardous: 'Hazardous',
    });
  });
});

describe('POLLUTANT_LABEL', () => {
  it('names each pollutant', () => {
    expect(POLLUTANT_LABEL.pm2_5).toBe('PM2.5');
    expect(POLLUTANT_LABEL.pm10).toBe('PM10');
  });
});

describe('formatLocalTime', () => {
  it('reads a local wall-clock time straight from the string, whatever the browser zone', () => {
    expect(formatLocalTime('2026-11-20T07:00')).toBe('07:00');
    expect(formatLocalTime('2026-11-20T23:30')).toBe('23:30');
  });

  it('converts an instant to the given time zone, including half-hour offsets', () => {
    expect(formatLocalTime('2026-11-20T17:07:00.000Z', 'America/Sao_Paulo')).toBe('14:07');
    expect(formatLocalTime('2026-11-20T08:15:00.000Z', 'Asia/Kolkata')).toBe('13:45');
    expect(formatLocalTime('2026-11-20T00:05:00Z', 'UTC')).toBe('00:05');
  });

  it('falls back to the browser zone when the zone is unknown', () => {
    expect(formatLocalTime('2026-11-20T17:07:00Z', 'Not/AZone')).toMatch(/^\d{2}:\d{2}$/);
  });

  it('shows a dash for an unreadable time', () => {
    expect(formatLocalTime('soon')).toBe('—');
  });
});

describe('formatPlace', () => {
  it('joins name, region and country without repeating the name', () => {
    expect(
      formatPlace({
        name: 'Zürich',
        admin1: 'Zurich',
        country: 'Switzerland',
        countryCode: 'CH',
        lat: 47.37,
        lon: 8.55,
      }),
    ).toBe('Zürich, Zurich, Switzerland');
    expect(
      formatPlace({
        name: 'São Paulo',
        admin1: 'São Paulo',
        country: 'Brazil',
        countryCode: 'BR',
        lat: 0,
        lon: 0,
      }),
    ).toBe('São Paulo, Brazil');
  });

  it('leaves out empty parts', () => {
    expect(
      formatPlace({ name: 'Current location', country: '', countryCode: '', lat: 1, lon: 2 }),
    ).toBe('Current location');
  });
});
