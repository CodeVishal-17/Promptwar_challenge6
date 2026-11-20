import type {
  AqiCategory,
  HealthGuidance,
  Impact,
  Plan,
  PlanItem,
  Profile,
  Section,
} from '../../../shared/types.js';
import { ACTIONS, clockTime, type Action, type PlanContext, windowOf } from './catalog.js';
import { CATEGORY_LABEL, healthGuidance } from './health.js';
import { uniqueSources } from './impact/sources.js';

/** An action that applies today, with its computed impact and, when it has one, the best time to do it. */
export interface Candidate {
  action: Action;
  impact: Impact | null;
  /** Local `HH:MM`. */
  suggestedTime?: string;
}

/** Most items shown in each section of the fallback plan. */
const MAX_PER_SECTION = 4;

const bestStart = (ctx: PlanContext): string | undefined => {
  const best = windowOf(ctx.report, 'best');
  return best ? clockTime(best.start) : undefined;
};

/** Actions that are best done at a particular time of day. */
const TIME_RULES: Readonly<Record<string, (ctx: PlanContext) => string | undefined>> = {
  'move-exercise-to-best-window': bestStart,
  'air-out-in-best-window': bestStart,
};

/** True when the household includes someone the AQI guidance singles out. */
export function isSensitive(p: Profile): boolean {
  const h = p.household;
  return h.children > 0 || h.olderAdults > 0 || h.pregnant || h.respiratory || h.heart;
}

/** Every catalogue action that applies, with its impact and time, highest priority first. */
export function selectCandidates(ctx: PlanContext): Candidate[] {
  return ACTIONS.filter((a) => a.applies(ctx))
    .map((action): Candidate => {
      const suggestedTime = TIME_RULES[action.id]?.(ctx);
      return {
        action,
        impact: action.impact?.(ctx) ?? null,
        ...(suggestedTime !== undefined ? { suggestedTime } : {}),
      };
    })
    .sort((a, b) => b.action.priority - a.action.priority);
}

const SUMMARY_TAIL: Record<AqiCategory, string> = {
  good: 'A good day to be outside. These habits help keep it that way.',
  moderate: 'Most people can carry on as usual, and a few habits keep your exposure low.',
  usg: 'Sensitive people should take care today, and these steps help the whole household.',
  unhealthy: 'Everyone should ease off outdoors today. These steps cut what you breathe in.',
  very_unhealthy:
    'Plan to spend most of today indoors. These steps cut what you breathe in and keep your home cleaner.',
  hazardous:
    'Stay in if you can. These steps keep your home as clean as possible and your outdoor trips short.',
};

const UNAVAILABLE_SUMMARY =
  'Air quality data is unavailable for this place right now, so these are steady habits that help whenever the air is poor.';

function summaryFor(ctx: PlanContext): string {
  const now = ctx.report.now;
  if (!now) return UNAVAILABLE_SUMMARY;
  return `Air quality is ${CATEGORY_LABEL[now.category]} (AQI ${now.aqi}) right now. ${SUMMARY_TAIL[now.category]}`;
}

function healthFor(ctx: PlanContext): HealthGuidance {
  const sensitive = isSensitive(ctx.profile);
  const now = ctx.report.now;
  if (now) return healthGuidance(now.category, sensitive);
  // No reading: keep the moderate-level precautions, but say plainly the data is missing.
  return {
    ...healthGuidance('moderate', sensitive),
    headline: 'Air quality data is unavailable right now',
    advice: [
      'Check a local air quality source before you head out.',
      ...healthGuidance('moderate', sensitive).advice,
    ],
  };
}

export function toItem(c: Candidate): PlanItem {
  const { action, impact, suggestedTime } = c;
  return {
    actionId: action.id,
    section: action.section,
    title: action.title,
    why: action.defaultWhy,
    ...(suggestedTime !== undefined ? { time: suggestedTime } : {}),
    impact,
    sources: uniqueSources([...action.sources, ...(impact?.sources ?? [])]),
  };
}

const top = (cands: Candidate[], section: Section): PlanItem[] =>
  cands
    .filter((c) => c.action.section === section)
    .sort((a, b) => b.action.priority - a.action.priority)
    .slice(0, MAX_PER_SECTION)
    .map(toItem);

/** A complete plan built only from the catalogue, used when the AI planner is unavailable. */
export function buildFallbackPlan(ctx: PlanContext, cands: Candidate[], now: Date): Plan {
  return {
    summary: summaryFor(ctx),
    health: healthFor(ctx),
    routine: top(cands, 'routine'),
    indoor: top(cands, 'indoor'),
    sustainable: top(cands, 'sustainable'),
    aiUsed: false,
    generatedAt: now.toISOString(),
  };
}
