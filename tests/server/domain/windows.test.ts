import { describe, expect, it } from 'vitest';
import { findWindows } from '../../../server/src/domain/windows.js';
import { categoryFor } from '../../../server/src/domain/aqi.js';
import type { AqiReading } from '../../../shared/types.js';

const reading = (time: string, aqi: number): AqiReading => ({
  time,
  aqi,
  category: categoryFor(aqi),
  dominant: 'pm2_5',
  perPollutant: { pm2_5: aqi },
});

/** 48 hourly readings starting at local midnight 2026-11-19; `aqiAt(i)` gives each AQI. */
function series(aqiAt: (i: number) => number | null): (AqiReading | null)[] {
  return Array.from({ length: 48 }, (_, i) => {
    const day = i < 24 ? '19' : '20';
    const time = `2026-11-${day}T${String(i % 24).padStart(2, '0')}:00`;
    const aqi = aqiAt(i);
    return aqi === null ? null : reading(time, aqi);
  });
}

describe('findWindows', () => {
  it('limits the best window to daytime but lets the worst occur at night', () => {
    const hourly = series((i) => {
      if (i === 3 || i === 4) return 10; // lowest overall, but at night
      if (i === 10 || i === 11) return 20; // lowest in daytime
      if (i === 22 || i === 23) return 200; // highest, at night
      return 60;
    });
    const windows = findWindows(hourly);
    expect(windows.find((w) => w.kind === 'best')).toEqual({
      kind: 'best',
      start: '2026-11-19T10:00',
      end: '2026-11-19T12:00',
      meanAqi: 20,
    });
    expect(windows.find((w) => w.kind === 'worst')).toEqual({
      kind: 'worst',
      start: '2026-11-19T22:00',
      end: '2026-11-20T00:00',
      meanAqi: 200,
    });
  });

  it('breaks ties toward the earliest window', () => {
    const windows = findWindows(series(() => 40));
    expect(windows.find((w) => w.kind === 'best')?.start).toBe('2026-11-19T06:00');
    expect(windows.find((w) => w.kind === 'worst')?.start).toBe('2026-11-19T00:00');
  });

  it('skips windows that contain a null hour', () => {
    const hourly = series((i) => (i === 10 ? null : i === 11 ? 5 : 50));
    const best = findWindows(hourly).find((w) => w.kind === 'best');
    // 09:00-11:00 and 10:00-12:00 contain the null hour, so 11:00-13:00 (5 and 50) wins
    expect(best).toMatchObject({ start: '2026-11-19T11:00', meanAqi: 28 });
  });

  it('keeps the whole best window inside the daytime bounds', () => {
    const hourly = series((i) => (i === 5 || i === 21 ? 1 : 50));
    const best = findWindows(hourly).find((w) => w.kind === 'best');
    // 05:00-07:00 starts before 06:00 and 21:00-23:00 ends after 21:00
    expect(best?.start).toBe('2026-11-19T06:00');
  });

  it('honours a custom window length', () => {
    const hourly = series((i) => (i >= 12 && i <= 14 ? 10 : 80));
    const best = findWindows(hourly, 3).find((w) => w.kind === 'best');
    expect(best).toMatchObject({ start: '2026-11-19T12:00', end: '2026-11-19T15:00', meanAqi: 10 });
  });

  it('returns nothing when no complete window exists', () => {
    expect(findWindows([])).toEqual([]);
    expect(findWindows(series(() => null))).toEqual([]);
  });

  it('omits the best window when no daytime window is complete', () => {
    const hourly = series((i) => (i % 24 >= 6 && i % 24 <= 21 ? null : 30));
    expect(findWindows(hourly).map((w) => w.kind)).toEqual(['worst']);
  });
});
