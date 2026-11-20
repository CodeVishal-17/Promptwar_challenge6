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

export type CommuteMode =
  'car_petrol' | 'car_diesel' | 'car_ev' | 'motorbike' | 'bus' | 'rail' | 'bike' | 'walk';

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'high';

export type AgeGroup = 'child' | 'adult' | 'older';

/** A number computed in code from cited constants, with everything needed to explain it. */
export interface Impact {
  label: string;
  /** Signed percentage change for % impacts (negative = less); kg CO₂e/yr saved for commute switches. */
  value: number;
  unit: string;
  /** Human-readable string built from `value`, e.g. "−79% indoor PM2.5". */
  display: string;
  formula: string;
  inputs: { label: string; value: string }[];
  assumptions: string[];
  sources: Source[];
}

/** Who lives in the home and how they get around, exercise and heat/cook. Stays in the browser. */
export interface Profile {
  household: {
    adults: number;
    children: number;
    olderAdults: number;
    pregnant: boolean;
    respiratory: boolean;
    heart: boolean;
  };
  commute: { mode: CommuteMode; oneWayKm: number; departHour: number } | null;
  exercise: { type: 'run' | 'cycle' | 'walk' | 'sport'; hour: number; minutes: number } | null;
  home: {
    purifier: boolean;
    purifierCadrM3h?: number;
    roomM3?: number;
    cooking: 'gas' | 'electric' | 'solid';
    heating: 'gas' | 'electric' | 'wood_coal' | 'none';
    canOpenWindows: boolean;
    indoorSmoking: boolean;
  };
}

export type Section = 'routine' | 'indoor' | 'sustainable';

export interface HealthGuidance {
  category: AqiCategory;
  sensitive: boolean;
  headline: string;
  advice: string[];
  source: Source;
}

export interface PlanItem {
  actionId: string;
  section: Section;
  title: string;
  why: string;
  /** Local `HH:MM` the action is best done at, when there is one. */
  time?: string;
  impact: Impact | null;
  sources: Source[];
}

export interface Plan {
  summary: string;
  health: HealthGuidance;
  routine: PlanItem[];
  indoor: PlanItem[];
  sustainable: PlanItem[];
  aiUsed: boolean;
  generatedAt: string;
}

/** The only profile facts that ever leave the server toward an AI model: flags and categories, no counts per group. */
export interface MinimalProfile {
  sensitiveGroups: ('children' | 'older_adults' | 'pregnancy' | 'respiratory' | 'heart')[];
  householdSize: number;
  commute: { mode: CommuteMode; oneWayKm: number } | null;
  exercise: { type: string; minutes: number } | null;
  home: {
    purifier: boolean;
    cooking: string;
    heating: string;
    canOpenWindows: boolean;
    indoorSmoking: boolean;
  };
}
