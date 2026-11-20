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
