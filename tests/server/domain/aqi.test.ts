import { describe, expect, it } from 'vitest';
import {
  AQI_SOURCE,
  categoryFor,
  computeHourlyAqi,
  subIndex,
  trailingMean,
} from '../../../server/src/domain/aqi.js';
import type { HourlyConcentrations } from '../../../shared/types.js';

describe('subIndex', () => {
  it('handles PM2.5 breakpoints with truncation to 0.1', () => {
    expect(subIndex('pm2_5_24h', 9.0)).toBe(50);
    expect(subIndex('pm2_5_24h', 9.05)).toBe(50);
    expect(subIndex('pm2_5_24h', 9.1)).toBe(51);
    expect(subIndex('pm2_5_24h', 12.0)).toBe(56);
    expect(subIndex('pm2_5_24h', 35.9)).toBe(102);
    expect(subIndex('pm2_5_24h', 200)).toBe(275);
  });
  it('extends the top segment above 500 (EPA TAD footnote 4)', () => {
    expect(subIndex('pm2_5_24h', 600)).toBe(1047);
  });
  it('handles PM10 with integer truncation', () => {
    expect(subIndex('pm10_24h', 100)).toBe(73);
    expect(subIndex('pm10_24h', 54.9)).toBe(50);
  });
  it('handles ozone 8-h and 1-h tables (ppm)', () => {
    expect(subIndex('o3_8h', 0.06)).toBe(67);
    expect(subIndex('o3_8h', 0.25)).toBeNull();
    expect(subIndex('o3_1h', 0.1)).toBeNull();
    expect(subIndex('o3_8h', 0.07853333)).toBe(126);
    // Equation 1: 49/0.039*(0.162-0.125)+101 = 147.49 -> 147
    expect(subIndex('o3_1h', 0.162)).toBe(147);
    expect(subIndex('o3_1h', 0.104)).toBeNull();
  });
  it('handles NO2 (ppb)', () => {
    expect(subIndex('no2_1h', 75)).toBe(73);
  });
  it('returns null for negative or non-finite input', () => {
    expect(subIndex('pm2_5_24h', -1)).toBeNull();
    expect(subIndex('pm2_5_24h', Number.NaN)).toBeNull();
  });
});

describe('categoryFor', () => {
  it('maps boundaries', () => {
    expect([50, 51, 100, 101, 151, 201, 301].map(categoryFor)).toEqual([
      'good',
      'moderate',
      'moderate',
      'usg',
      'unhealthy',
      'very_unhealthy',
      'hazardous',
    ]);
    expect(categoryFor(1047)).toBe('hazardous');
  });
});

describe('trailingMean', () => {
  it('requires the minimum number of valid hours', () => {
    expect(trailingMean([...Array(18).fill(10), ...Array(6).fill(null)], 23, 24, 18)).toBe(10);
    expect(trailingMean([...Array(17).fill(10), ...Array(7).fill(null)], 23, 24, 18)).toBeNull();
  });
  it('returns null when fewer than `hours` of history exist', () => {
    expect(trailingMean([10, 10, 10], 2, 8, 6)).toBeNull();
  });
});

describe('computeHourlyAqi', () => {
  const n = 24;
  const series = (v: number | null): (number | null)[] => Array(n).fill(v);
  const time = Array.from({ length: n }, (_, h) => `2026-01-01T${String(h).padStart(2, '0')}:00`);

  it('picks PM2.5 as dominant', () => {
    const s: HourlyConcentrations = {
      time,
      pm2_5: series(35.9),
      pm10: series(20),
      o3: series(60),
      no2: series(40),
    };
    const r = computeHourlyAqi(s, 23);
    expect(r).not.toBeNull();
    expect(r?.aqi).toBe(102);
    expect(r?.dominant).toBe('pm2_5');
    expect(r?.category).toBe('usg');
    expect(r?.time).toBe(time[23]);
    expect(r?.perPollutant.pm2_5).toBe(102);
  });
  it('returns null for an all-null series', () => {
    const s: HourlyConcentrations = {
      time,
      pm2_5: series(null),
      pm10: series(null),
      o3: series(null),
      no2: series(null),
    };
    expect(computeHourlyAqi(s, 23)).toBeNull();
  });
  it('returns null for an out-of-range index', () => {
    const s: HourlyConcentrations = {
      time,
      pm2_5: series(10),
      pm10: series(10),
      o3: series(10),
      no2: series(10),
    };
    expect(computeHourlyAqi(s, 99)).toBeNull();
  });
});

describe('AQI_SOURCE', () => {
  it('cites the EPA TAD', () => {
    expect(AQI_SOURCE.year).toBe(2024);
    expect(AQI_SOURCE.url).toContain('document.airnow.gov');
  });
});
