import type { AirReport, AqiReading, Impact, Place, Plan, PlanItem } from '../../shared/types.js';

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

/** A purifier impact shaped like the server's, with a typographic minus in `display`. */
export function makeImpact(overrides: Partial<Impact> = {}): Impact {
  return {
    label: 'Run an air purifier in a closed room',
    value: -79,
    unit: '%',
    display: '−79% indoor PM2.5',
    formula: 'reduction = (CADR ÷ V) ÷ (a + k + CADR ÷ V)',
    inputs: [
      { label: 'Outdoor PM2.5', value: '80 µg/m³' },
      { label: 'Purifier CADR', value: '200 m³/h' },
    ],
    assumptions: [
      'The purifier runs continuously at its rated CADR with doors and windows closed.',
      'Room volume defaults to 40 m³ when unknown.',
    ],
    sources: [
      {
        title: 'US EPA, Guide to Air Cleaners in the Home',
        url: 'https://www.epa.gov/indoor-air-quality-iaq/guide-air-cleaners-home',
        year: 2026,
      },
    ],
    ...overrides,
  };
}

export function makeItem(overrides: Partial<PlanItem> = {}): PlanItem {
  return {
    actionId: 'exercise-indoors',
    section: 'routine',
    title: 'Move today’s workout indoors',
    why: 'Indoors you breathe in far less PM2.5.',
    impact: null,
    sources: [],
    ...overrides,
  };
}

/** A fallback-style plan for an unhealthy day. */
export function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    summary: 'Air quality is unhealthy (AQI 162) right now.',
    health: {
      category: 'unhealthy',
      sensitive: false,
      headline: 'The air is unhealthy, especially for sensitive people',
      advice: ['Keep outdoor effort light and take more breaks.'],
      source: {
        title: 'Air Quality Guide for Particle Pollution',
        url: 'https://www.airnow.gov/publications/air-quality-index/air-quality-guide-for-particle-pollution/',
        year: 2023,
      },
    },
    routine: [
      makeItem({
        actionId: 'avoid-worst-window',
        title: 'Keep errands out of the smoggiest hours',
        time: '18:00',
      }),
      makeItem(),
      makeItem({
        actionId: 'move-exercise-to-best-window',
        title: 'Shift your exercise to the cleanest hours',
        time: '07:00',
        impact: makeImpact({ display: '−42% PM2.5 inhaled', value: -42 }),
      }),
    ],
    indoor: [
      makeItem({
        actionId: 'run-purifier',
        section: 'indoor',
        title: 'Run your air purifier in the room you use most',
        impact: makeImpact(),
      }),
    ],
    sustainable: [
      makeItem({
        actionId: 'combine-trips',
        section: 'sustainable',
        title: 'Combine errands into one trip',
      }),
    ],
    aiUsed: false,
    generatedAt: '2026-11-20T17:07:00.000Z',
    ...overrides,
  };
}
