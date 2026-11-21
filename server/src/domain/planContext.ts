import type { AirReport, Impact, Profile, Section, Source } from '../../../shared/types.js';

/** Everything an action needs to decide whether it applies today and what it would achieve. */
export interface PlanContext {
  report: AirReport;
  profile: Profile;
  /** ISO 3166-1 alpha-2 country code of the place, used for grid carbon intensity. */
  countryCode?: string;
}

/** One entry in the plan catalogue. */
export interface Action {
  id: string;
  section: Section;
  title: string;
  /** Plain-words explanation of the direct impact. The impact chip carries any number. */
  defaultWhy: string;
  /** 1 to 100; higher is more important and is shown first. */
  priority: number;
  applies(ctx: PlanContext): boolean;
  /** A number computed in code, or null when the inputs for it are missing. */
  impact?(ctx: PlanContext): Impact | null;
  sources: Source[];
}

/** US AQI at which the air is unhealthy for sensitive groups. */
export const AQI_USG = 101;
/** US AQI at which the air is unhealthy for everyone. */
export const AQI_UNHEALTHY = 151;

export const currentAqi = (ctx: PlanContext): number | null => ctx.report.now?.aqi ?? null;

/** A test that the current AQI is at least `threshold`; false when there is no reading. */
export const aqiAtLeast =
  (threshold: number) =>
  (ctx: PlanContext): boolean => {
    const aqi = currentAqi(ctx);
    return aqi !== null && aqi >= threshold;
  };
