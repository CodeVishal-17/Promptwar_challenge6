import type { CommuteMode, Impact, Source } from '../../../../shared/types.js';
import gridIntensity from '../data/gridIntensity.json' with { type: 'json' };
import { assertNonNegative, formatKg, formatNumber } from './format.js';
import { DESNZ_2026, GRID_INTENSITY_SOURCE, uniqueSources } from './sources.js';

/** Commute pattern behind every per-week and per-year figure. */
export const COMMUTE_ASSUMPTIONS = { tripsPerDay: 2, daysPerWeek: 5, weeksPerYear: 46 } as const;

type FuelMode = 'car_petrol' | 'car_diesel' | 'motorbike' | 'bus';
type ElectricMode = 'car_ev' | 'rail';

interface FuelFactor {
  /** kg CO₂e per km from burning the fuel (DESNZ Scope 1 / Business travel factor). */
  tailpipe: number;
  /** kg CO₂e per km for extracting, refining and transporting the fuel (DESNZ WTT factor). */
  wellToTank: number;
  total: number;
  per: 'vehicle-km' | 'passenger-km';
  description: string;
}

const fuel = (
  tailpipe: number,
  wellToTank: number,
  per: FuelFactor['per'],
  description: string,
): FuelFactor => ({ tailpipe, wellToTank, total: tailpipe + wellToTank, per, description });

/**
 * DESNZ 2026 full-set factors, column "kg CO2e", unit km / passenger.km.
 * Well-to-tank is added so fuel modes are on the same lifecycle basis as the
 * grid intensity used for electric modes (Ember lifecycle g CO₂e/kWh).
 */
export const EMISSION_FACTORS_KG_PER_KM: Record<FuelMode, FuelFactor> = {
  // 'Passenger vehicles'!H54 (Average car, Petrol) + 'WTT- pass vehs & travel- land'!E50
  car_petrol: fuel(0.16152, 0.04599, 'vehicle-km', 'UK average petrol car'),
  // 'Passenger vehicles'!D54 (Average car, Diesel) + 'WTT- pass vehs & travel- land'!D50
  car_diesel: fuel(0.17265, 0.04146, 'vehicle-km', 'UK average diesel car'),
  // 'Passenger vehicles'!D66 (Motorbike, Average) + 'WTT- pass vehs & travel- land'!D62
  motorbike: fuel(0.11367, 0.02956, 'vehicle-km', 'UK average motorbike'),
  // 'Business travel- land'!D81 (Average local bus) + 'WTT- pass vehs & travel- land'!D78
  bus: fuel(0.10151, 0.02649, 'passenger-km', 'UK average local bus'),
};

/**
 * kWh per km for an average battery electric car:
 * DESNZ 2026 'SECR kWh UK electricity for EVs'!E52 (Average car, Battery Electric Vehicle, km).
 */
export const EV_KWH_PER_KM = 0.20358;

/**
 * kWh per passenger-km for electric metro rail, derived from DESNZ 2026 the way DESNZ
 * derives its SECR kWh factors (kg CO₂ per unit ÷ kg CO₂ per kWh of UK electricity):
 * 'Business travel- land'!E90 (London Underground, kg CO₂ per passenger.km, 0.01522)
 * ÷ 'UK electricity'!F25 (Electricity generated 2026, kg CO₂ per kWh, 0.12943).
 * The same division reproduces the BEV SECR factor above (0.02635 ÷ 0.12943 = 0.20358).
 */
const LONDON_UNDERGROUND_KG_CO2_PER_PKM = 0.01522;
const UK_GRID_KG_CO2_PER_KWH = 0.12943;
export const RAIL_KWH_PER_PKM = LONDON_UNDERGROUND_KG_CO2_PER_PKM / UK_GRID_KG_CO2_PER_KWH;

const ELECTRIC_KWH: Record<
  ElectricMode,
  { kwhPerKm: number; per: string; description: string; derivation?: string }
> = {
  car_ev: {
    kwhPerKm: EV_KWH_PER_KM,
    per: 'vehicle-km',
    description: 'UK average battery electric car',
  },
  rail: {
    kwhPerKm: RAIL_KWH_PER_PKM,
    per: 'passenger-km',
    description: 'electric metro rail, London Underground basis',
    derivation: `Derived: DESNZ 2026 London Underground ${LONDON_UNDERGROUND_KG_CO2_PER_PKM} kg CO₂ per passenger-km ÷ DESNZ 2026 UK electricity ${UK_GRID_KG_CO2_PER_KWH} kg CO₂ per kWh = ${formatNumber(RAIL_KWH_PER_PKM, 4)} kWh per passenger-km (the method DESNZ uses for its kWh-per-km factors).`,
  },
};

const MODE_LABEL: Record<CommuteMode, string> = {
  car_petrol: 'petrol car',
  car_diesel: 'diesel car',
  car_ev: 'electric car',
  motorbike: 'motorbike',
  bus: 'bus',
  rail: 'metro or train',
  bike: 'bike',
  walk: 'walking',
};

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const isFuel = (m: CommuteMode): m is FuelMode => m in EMISSION_FACTORS_KG_PER_KM;
const isElectric = (m: CommuteMode): m is ElectricMode => m in ELECTRIC_KWH;

export interface GridIntensity {
  gPerKwh: number;
  year: number;
  isWorldAverage: boolean;
  countryCode?: string;
}

const countries: Record<string, { gPerKwh: number; year: number }> = gridIntensity.countries;

/** Grid lifecycle intensity for an ISO 3166-1 alpha-2 code, or the world average. */
export function gridIntensityFor(countryCode?: string): GridIntensity {
  const code = countryCode?.trim().toUpperCase();
  const hit = code ? countries[code] : undefined;
  if (code && hit) return { ...hit, isWorldAverage: false, countryCode: code };
  return { ...gridIntensity.worldAverage, isWorldAverage: true };
}

export interface CommuteCo2 {
  kgPerDay: number;
  kgPerWeek: number;
  kgPerYear: number;
  /** kg CO₂e per km (per vehicle-km or passenger-km) used for this mode. */
  kgPerKm: number;
  assumptions: string[];
  sources: Source[];
}

interface ModeFactor {
  kgPerKm: number;
  /** Human description of how kgPerKm was obtained. */
  basis: string;
  assumptions: string[];
  sources: Source[];
}

function modeFactor(mode: CommuteMode, countryCode?: string): ModeFactor {
  if (isFuel(mode)) {
    const f = EMISSION_FACTORS_KG_PER_KM[mode];
    return {
      kgPerKm: f.total,
      basis: `${formatNumber(f.total, 5)} kg CO₂e per ${f.per} (${f.description})`,
      assumptions: [
        `${cap(MODE_LABEL[mode])}: ${formatNumber(f.tailpipe, 5)} kg CO₂e per ${f.per} from the fuel burned plus ${formatNumber(f.wellToTank, 5)} kg for producing and delivering the fuel (DESNZ 2026, ${f.description}; UK figures used for every country).`,
        ...(f.per === 'vehicle-km'
          ? [`The ${MODE_LABEL[mode]} carries only you (emissions per vehicle-km).`]
          : []),
      ],
      sources: [DESNZ_2026],
    };
  }
  if (isElectric(mode)) {
    const e = ELECTRIC_KWH[mode];
    const g = gridIntensityFor(countryCode);
    const where = g.isWorldAverage
      ? `the world average grid (${formatNumber(g.gPerKwh, 0)} g CO₂e/kWh, ${g.year}), because there is no grid figure for ${countryCode?.trim() ? countryCode.trim().toUpperCase() : 'your country'}`
      : `the ${g.countryCode} grid (${formatNumber(g.gPerKwh, 0)} g CO₂e/kWh, ${g.year})`;
    const kgPerKm = (e.kwhPerKm * g.gPerKwh) / 1000;
    return {
      kgPerKm,
      basis: `${formatNumber(e.kwhPerKm, 5)} kWh per ${e.per} × ${formatNumber(g.gPerKwh, 0)} g CO₂e/kWh`,
      assumptions: [
        `${cap(MODE_LABEL[mode])}: ${formatNumber(e.kwhPerKm, 5)} kWh per ${e.per}, ${e.description}, DESNZ 2026, on ${where}.`,
        ...(e.derivation ? [e.derivation] : []),
        'Grid intensity is lifecycle emissions per kWh generated; losses in the wires between power station and plug are not included.',
      ],
      sources: [DESNZ_2026, GRID_INTENSITY_SOURCE],
    };
  }
  return {
    kgPerKm: 0,
    basis: '0 kg CO₂e per km',
    assumptions: [`${cap(MODE_LABEL[mode])} is counted as zero direct emissions.`],
    sources: [],
  };
}

const PATTERN = `${COMMUTE_ASSUMPTIONS.tripsPerDay} trips a day (there and back), ${COMMUTE_ASSUMPTIONS.daysPerWeek} days a week, ${COMMUTE_ASSUMPTIONS.weeksPerYear} weeks a year.`;

/** CO₂e from a commute: one-way km × 2 trips × factor, per day, week (5 days) and year (46 weeks). */
export function commuteCo2(mode: CommuteMode, oneWayKm: number, countryCode?: string): CommuteCo2 {
  assertNonNegative('oneWayKm', oneWayKm);
  const m = modeFactor(mode, countryCode);
  const kgPerDay = oneWayKm * COMMUTE_ASSUMPTIONS.tripsPerDay * m.kgPerKm;
  const kgPerWeek = kgPerDay * COMMUTE_ASSUMPTIONS.daysPerWeek;
  return {
    kgPerDay,
    kgPerWeek,
    kgPerYear: kgPerWeek * COMMUTE_ASSUMPTIONS.weeksPerYear,
    kgPerKm: m.kgPerKm,
    assumptions: [PATTERN, ...m.assumptions],
    sources: m.sources,
  };
}

/** Yearly kg CO₂e saved by switching commute mode, or null if the switch saves nothing. */
export function commuteSwitchImpact(
  from: CommuteMode,
  to: CommuteMode,
  oneWayKm: number,
  countryCode?: string,
): Impact | null {
  const a = commuteCo2(from, oneWayKm, countryCode);
  const b = commuteCo2(to, oneWayKm, countryCode);
  const saved = a.kgPerYear - b.kgPerYear;
  if (!(saved > 0)) return null;
  const { tripsPerDay, daysPerWeek, weeksPerYear } = COMMUTE_ASSUMPTIONS;
  const fa = modeFactor(from, countryCode);
  const fb = modeFactor(to, countryCode);
  return {
    label: `Commute by ${MODE_LABEL[to]} instead of ${MODE_LABEL[from]}`,
    value: saved,
    unit: 'kg CO₂e/yr',
    display: `≈${formatKg(saved)} kg CO₂e/yr saved`,
    formula: `saved per year = one-way km × ${tripsPerDay} trips × ${daysPerWeek} days × ${weeksPerYear} weeks × (kg CO₂e per km by ${MODE_LABEL[from]} − kg CO₂e per km by ${MODE_LABEL[to]})`,
    inputs: [
      { label: 'One-way distance', value: `${formatNumber(oneWayKm, 1)} km` },
      { label: `Emissions by ${MODE_LABEL[from]}`, value: fa.basis },
      { label: `Emissions by ${MODE_LABEL[to]}`, value: fb.basis },
      { label: `Yearly total by ${MODE_LABEL[from]}`, value: `${formatKg(a.kgPerYear)} kg CO₂e` },
      { label: `Yearly total by ${MODE_LABEL[to]}`, value: `${formatKg(b.kgPerYear)} kg CO₂e` },
    ],
    assumptions: [...new Set([...a.assumptions, ...b.assumptions])],
    sources: uniqueSources([...a.sources, ...b.sources]),
  };
}
