import { categoryFor } from '../../../server/src/domain/aqi.js';
import { findWindows } from '../../../server/src/domain/windows.js';
import type { AirReport, AqiReading, Profile } from '../../../shared/types.js';
import { DEFAULT_PROFILE } from '../../../shared/profile.js';

/** 14:00 local, 19 Nov 2026, unless a report says otherwise. */
const START_HOUR = 14;

const localTime = (i: number, startHour = START_HOUR): string =>
  new Date(Date.UTC(2026, 10, 19, startHour) + i * 3_600_000).toISOString().slice(0, 13) + ':00';

export interface ReportShape {
  /** AQI for each of the 48 hours (index 0 = now). */
  aqiAt?: (i: number) => number;
  /** Raw PM2.5 for each hour. */
  pm25At?: (i: number) => number | null;
  now?: boolean;
  /** Local clock hour of index 0 on 19 Nov 2026 (default 14). */
  startHour?: number;
}

/** A synthetic 48-hour report; PM2.5 defaults to a smooth daily swing, AQI to PM2.5 × 2. */
export function makeReport(shape: ReportShape = {}): AirReport {
  const pm25At = shape.pm25At ?? ((i) => 60 + 40 * Math.cos(((i + 14) / 24) * 2 * Math.PI));
  const aqiAt = shape.aqiAt ?? ((i) => Math.round((pm25At(i) ?? 0) * 2));
  const hourly: (AqiReading | null)[] = Array.from({ length: 48 }, (_, i) => {
    const aqi = aqiAt(i);
    return {
      time: localTime(i, shape.startHour),
      aqi,
      category: categoryFor(aqi),
      dominant: 'pm2_5' as const,
      perPollutant: { pm2_5: aqi },
    };
  });
  const pm25 = Array.from({ length: 48 }, (_, i) => pm25At(i));
  return {
    location: { lat: 28.6, lon: 77.2, timezone: 'Asia/Kolkata' },
    generatedAt: '2026-11-19T08:30:00.000Z',
    source: { name: 'test', url: 'https://example.test', model: 'cams', resolution: '11 km' },
    now: shape.now === false ? null : (hourly[0] ?? null),
    hourly,
    pm25,
    windows: findWindows(hourly),
    outlook: [],
  };
}

/** A smoggy winter afternoon: AQI 212 now, cleanest mid-afternoon tomorrow. */
export function smoggyReport(): AirReport {
  return makeReport({
    aqiAt: (i) => (i >= 24 + 1 && i <= 24 + 3 ? 90 : 212),
    pm25At: (i) => (i >= 24 + 1 && i <= 24 + 3 ? 30 : 150),
  });
}

export function profileWith(patch: {
  household?: Partial<Profile['household']>;
  commute?: Profile['commute'];
  exercise?: Profile['exercise'];
  home?: Partial<Profile['home']>;
}): Profile {
  return {
    household: { ...DEFAULT_PROFILE.household, ...patch.household },
    commute: patch.commute === undefined ? DEFAULT_PROFILE.commute : patch.commute,
    exercise: patch.exercise === undefined ? DEFAULT_PROFILE.exercise : patch.exercise,
    home: { ...DEFAULT_PROFILE.home, ...patch.home },
  };
}
