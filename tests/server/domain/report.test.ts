import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { categoryFor, computeHourlyAqi } from '../../../server/src/domain/aqi.js';
import {
  buildAirReport,
  currentIndex,
  type OpenMeteoAirResponse,
} from '../../../server/src/domain/report.js';

const fixture = JSON.parse(
  readFileSync(new URL('../../fixtures/openMeteoAir.json', import.meta.url), 'utf8'),
) as OpenMeteoAirResponse;
const NOW = new Date('2026-11-19T08:30:00Z'); // 14:00 local in Asia/Kolkata

describe('currentIndex', () => {
  const times = Array.from({ length: 144 }, (_, i) =>
    new Date(Date.UTC(2026, 10, 18) + i * 3600_000).toISOString().slice(0, 16),
  );

  it('finds the local hour for a positive UTC offset', () => {
    expect(currentIndex(times, 19800, NOW)).toBe(38);
  });
  it('finds the local hour for a negative UTC offset', () => {
    expect(currentIndex(times, -28800, NOW)).toBe(24);
  });
  it('returns -1 before the first time', () => {
    expect(currentIndex(times, 0, new Date('2026-11-17T12:00:00Z'))).toBe(-1);
  });
  it('returns -1 after the last time', () => {
    expect(currentIndex(times, 0, new Date('2026-12-01T00:00:00Z'))).toBe(-1);
  });
});

describe('buildAirReport', () => {
  const report = buildAirReport(fixture, NOW);
  const idx = 38;
  const all = {
    time: fixture.hourly.time,
    pm2_5: fixture.hourly.pm2_5,
    pm10: fixture.hourly.pm10,
    o3: fixture.hourly.ozone,
    no2: fixture.hourly.nitrogen_dioxide,
  };

  it('covers the next 48 hours starting at the current hour', () => {
    expect(report.hourly).toHaveLength(48);
    expect(report.hourly[0]?.time).toBe('2026-11-19T14:00');
    expect(report.now).toEqual(report.hourly[0]);
    expect(report.now).not.toBeNull();
  });

  it('uses past history so the PM NowCast is available at the current hour', () => {
    expect(report.now?.perPollutant.pm2_5).toBeDefined();
    expect(report.now).toEqual(computeHourlyAqi(all, idx));
  });

  it('exposes aligned raw PM2.5 values', () => {
    expect(report.pm25).toHaveLength(48);
    expect(report.pm25[0]).toBe(fixture.hourly.pm2_5[idx]);
    expect(report.pm25[47]).toBe(fixture.hourly.pm2_5[idx + 47]);
  });

  it('maps location, timestamps and source metadata', () => {
    expect(report.location).toEqual({
      lat: fixture.latitude,
      lon: fixture.longitude,
      timezone: 'Asia/Kolkata',
    });
    expect(report.generatedAt).toBe(NOW.toISOString());
    expect(report.source.name).toBe('Open-Meteo Air Quality API (CAMS)');
    expect(report.source.url).toBe('https://open-meteo.com/en/docs/air-quality-api');
    expect(report.source.model).toBe('CAMS');
    expect(report.source.resolution).toContain('≈11 km Europe, ≈40 km global');
  });

  it('returns one outlook entry per local date from today with the max hourly AQI', () => {
    expect(report.outlook.map((d) => d.date)).toEqual([
      '2026-11-19',
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
      '2026-11-23',
    ]);
    for (const day of report.outlook) {
      const aqis: number[] = [];
      fixture.hourly.time.forEach((t, i) => {
        if (!t.startsWith(day.date)) return;
        const r = computeHourlyAqi(all, i);
        if (r) aqis.push(r.aqi);
      });
      expect(day.maxAqi).toBe(Math.max(...aqis));
      expect(day.category).toBe(categoryFor(day.maxAqi));
    }
  });

  it('finds a daytime best window and a worst window', () => {
    const best = report.windows.find((w) => w.kind === 'best');
    const worst = report.windows.find((w) => w.kind === 'worst');
    expect(best).toBeDefined();
    expect(worst).toBeDefined();
    expect(Number(best?.start.slice(11, 13))).toBeGreaterThanOrEqual(6);
    expect(best?.meanAqi).toBeLessThanOrEqual(worst?.meanAqi ?? 0);
  });

  it('follows a daily smog cycle: best and worst windows sit at its trough and peak', () => {
    // Delhi-like winter PM2.5, 90 µg/m³ at 11:00 rising to 250 µg/m³ at 23:00, every day.
    const time = fixture.hourly.time;
    const pm = time.map((t) => {
      const hour = Number(t.slice(11, 13));
      return Math.round((170 + 80 * Math.cos((2 * Math.PI * (hour - 23)) / 24)) * 10) / 10;
    });
    const nulls = time.map(() => null);
    const diurnal: OpenMeteoAirResponse = {
      ...fixture,
      hourly: { time, pm2_5: pm, pm10: nulls, ozone: nulls, nitrogen_dioxide: nulls },
    };
    const r = buildAirReport(diurnal, NOW);
    const aqis = r.hourly.map((h) => h?.aqi ?? 0);
    expect(Math.max(...aqis) - Math.min(...aqis)).toBeGreaterThan(100);

    const best = r.windows.find((w) => w.kind === 'best');
    const worst = r.windows.find((w) => w.kind === 'worst');
    expect(best?.start).not.toBe(worst?.start);
    expect(best?.meanAqi).toBeLessThan(worst?.meanAqi ?? 0);
    // The NowCast lags the raw cycle by an hour or so.
    expect(Number(best?.start.slice(11, 13))).toBeGreaterThanOrEqual(11);
    expect(Number(best?.start.slice(11, 13))).toBeLessThanOrEqual(13);
    expect(['23', '00', '01']).toContain(worst?.start.slice(11, 13));
  });

  it('throws when the current time is outside the returned data', () => {
    expect(() => buildAirReport(fixture, new Date('2027-01-01T00:00:00Z'))).toThrow(
      /current time/i,
    );
  });
});
