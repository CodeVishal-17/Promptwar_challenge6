import type { Source } from '../shared/types.js';

export interface GridIntensityData {
  source: Source;
  worldAverage: { gPerKwh: number; year: number };
  countries: Record<string, { gPerKwh: number; year: number }>;
}

export function buildGridIntensity(csvText: string): GridIntensityData;
