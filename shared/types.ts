export type Pollutant = 'pm2_5' | 'pm10' | 'o3' | 'no2';

export type AqiCategory =
  'good' | 'moderate' | 'usg' | 'unhealthy' | 'very_unhealthy' | 'hazardous';

/** Hourly concentrations in µg/m³; `time` is local ISO `YYYY-MM-DDTHH:00`. */
export interface HourlyConcentrations {
  time: string[];
  pm2_5: (number | null)[];
  pm10: (number | null)[];
  o3: (number | null)[];
  no2: (number | null)[];
}

export interface AqiReading {
  time: string;
  aqi: number;
  category: AqiCategory;
  dominant: Pollutant;
  perPollutant: Partial<Record<Pollutant, number>>;
}

export interface Source {
  title: string;
  url: string;
  year: number;
}

export interface AirWindow {
  kind: 'best' | 'worst';
  /** Local ISO `YYYY-MM-DDTHH:00` of the first hour in the window. */
  start: string;
  /** Local ISO `YYYY-MM-DDTHH:00` at which the window ends (exclusive). */
  end: string;
  meanAqi: number;
}

export interface DailyOutlook {
  /** Local date `YYYY-MM-DD`. */
  date: string;
  maxAqi: number;
  category: AqiCategory;
}

export interface AirReport {
  location: { lat: number; lon: number; timezone: string };
  generatedAt: string;
  source: { name: string; url: string; model: string; resolution: string };
  now: AqiReading | null;
  /** The next 48 hours starting at the current hour. */
  hourly: (AqiReading | null)[];
  /** Raw hourly PM2.5 (µg/m³), aligned index-for-index with `hourly`. */
  pm25: (number | null)[];
  windows: AirWindow[];
  outlook: DailyOutlook[];
}

/** A geocoded place a user can pick. */
export interface Place {
  name: string;
  admin1?: string;
  country: string;
  countryCode: string;
  lat: number;
  lon: number;
}
