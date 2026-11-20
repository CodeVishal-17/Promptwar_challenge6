import type { AqiCategory, HealthGuidance } from '../../../shared/types.js';
import { AIRNOW_PM_GUIDE } from './guidanceSources.js';

/** Plain words for each AQI category, lower case so it slots into a sentence. */
export const CATEGORY_LABEL: Record<AqiCategory, string> = {
  good: 'good',
  moderate: 'moderate',
  usg: 'unhealthy for sensitive groups',
  unhealthy: 'unhealthy',
  very_unhealthy: 'very unhealthy',
  hazardous: 'hazardous',
};

interface Copy {
  headline: string;
  /** Extra lines for children, older adults, pregnancy and people with heart or lung conditions. */
  sensitive: string[];
  /** Lines for everyone. */
  everyone: string[];
}

const SYMPTOMS =
  'If you cough, feel your chest tighten or get short of breath, slow down, move indoors and call your doctor if it does not settle.';
const MEDICINE =
  'Keep quick-relief medicine close if you use it, and follow your asthma or heart action plan.';

/**
 * Paraphrased from AirNow's "Air Quality Guide for Particle Pollution": what each
 * level means for sensitive groups and for everyone else.
 */
const COPY: Record<AqiCategory, Copy> = {
  good: {
    headline: 'The air is clean today',
    sensitive: [],
    everyone: ['Enjoy time outdoors. Normal activity is fine for everyone.'],
  },
  moderate: {
    headline: 'The air is acceptable for most people',
    sensitive: [
      'If smog usually bothers you, take it easier outdoors and watch for coughing or a tight chest.',
    ],
    everyone: ['Most people can carry on as usual.'],
  },
  usg: {
    headline: 'The air may bother sensitive people',
    sensitive: ['Cut back on long or hard exercise outdoors and take more breaks.', MEDICINE],
    everyone: ['Healthy adults can stay active, but listen to your body.', SYMPTOMS],
  },
  unhealthy: {
    headline: 'The air is unhealthy, especially for sensitive people',
    sensitive: [
      'Skip long or hard exercise outdoors. Move it indoors or to a cleaner time.',
      MEDICINE,
    ],
    everyone: [
      'Keep outdoor effort light and take more breaks.',
      'Shorten time outside where you can.',
      SYMPTOMS,
    ],
  },
  very_unhealthy: {
    headline: 'The air is very unhealthy for everyone',
    sensitive: ['Stay indoors with windows closed and keep your activity gentle.', MEDICINE],
    everyone: [
      'Avoid long or hard exercise outdoors. Move it indoors or to another day.',
      'Keep outdoor trips short.',
      SYMPTOMS,
    ],
  },
  hazardous: {
    headline: 'The air is hazardous: stay in if you can',
    sensitive: [
      'Stay indoors with windows closed and keep activity low.',
      'Keep quick-relief medicine close if you use it, and call your doctor early if symptoms start.',
    ],
    everyone: [
      'Avoid all physical activity outdoors.',
      'Keep any outdoor trips short and essential.',
      'Do what you can to keep particles low indoors.',
      SYMPTOMS,
    ],
  },
};

/** Health advice for an AQI category, with extra lines first when the household is sensitive. */
export function healthGuidance(category: AqiCategory, sensitive: boolean): HealthGuidance {
  const copy = COPY[category];
  return {
    category,
    sensitive,
    headline: copy.headline,
    advice: sensitive ? [...copy.sensitive, ...copy.everyone] : [...copy.everyone],
    source: AIRNOW_PM_GUIDE,
  };
}
