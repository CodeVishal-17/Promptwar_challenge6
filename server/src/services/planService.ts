import { Type } from '@google/genai';
import { z } from 'zod';
import type { Plan, PlanItem, Section } from '../../../shared/types.js';
import type { PlanContext } from '../domain/catalog.js';
import { passesNumberGuard } from '../domain/numberGuard.js';
import { type Candidate, buildFallbackPlan, selectCandidates, toItem } from '../domain/planner.js';
import { COMMON_RULES, buildAiContext } from './aiContext.js';
import { type GeminiClient, logGeminiFailure } from './gemini.js';

/** How long to wait for Gemini before using the built-in plan. */
const PLAN_TIMEOUT_MS = 10_000;
const MAX_PER_SECTION = 4;

const SYSTEM = `You write a personalised daily air quality plan for a household.
Pick actions from the given candidates only, by their actionId. Order each section by what matters most for this household.
For each pick, write a "why" of one or two sentences in the second person that explains the direct impact for this household.
Also write a short "summary" of the day.
${COMMON_RULES}`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          actionId: { type: Type.STRING },
          why: { type: Type.STRING },
        },
        required: ['actionId', 'why'],
      },
    },
  },
  required: ['summary', 'items'],
};

const AiPlan = z.object({
  summary: z.string(),
  items: z.array(z.object({ actionId: z.string(), why: z.string() })),
});

type AiPlan = z.infer<typeof AiPlan>;
type Sections = Record<Section, PlanItem[]>;

/** The AI's text when it is non-empty and every number in it is one we supplied; else `fallback`. */
function checkedText(text: string, allowed: Set<number>, fallback: string): string {
  const trimmed = text.trim();
  return trimmed && passesNumberGuard(trimmed, allowed) ? trimmed : fallback;
}

/** Gemini's picks, or null (logged) when it fails, times out or answers out of shape. */
async function askGemini(gemini: GeminiClient, context: string): Promise<AiPlan | null> {
  try {
    const raw = await gemini.generateJson({
      system: SYSTEM,
      user: `<context>${context}</context>\nWrite the plan.`,
      schema: RESPONSE_SCHEMA,
      timeoutMs: PLAN_TIMEOUT_MS,
    });
    return AiPlan.parse(raw);
  } catch (err) {
    logGeminiFailure(err);
    return null;
  }
}

/**
 * The AI's picks as plan items: only known candidates, each once, at most MAX_PER_SECTION per
 * section, with the AI's "why" kept only when it passes the number check.
 */
function pickItems(ai: AiPlan, cands: Candidate[], allowed: Set<number>): Sections {
  const byId = new Map(cands.map((c) => [c.action.id, c]));
  const seen = new Set<string>();
  const picked: Sections = { routine: [], indoor: [], sustainable: [] };
  for (const entry of ai.items) {
    const cand = byId.get(entry.actionId);
    if (!cand || seen.has(entry.actionId)) continue;
    seen.add(entry.actionId);
    const list = picked[cand.action.section];
    if (list.length >= MAX_PER_SECTION) continue;
    const item = toItem(cand);
    list.push({ ...item, why: checkedText(entry.why, allowed, item.why) });
  }
  return picked;
}

/** Each section from the AI, or the fallback's when the AI left it empty. */
const orFallback = (picked: Sections, fallback: Plan): Sections => ({
  routine: picked.routine.length ? picked.routine : fallback.routine,
  indoor: picked.indoor.length ? picked.indoor : fallback.indoor,
  sustainable: picked.sustainable.length ? picked.sustainable : fallback.sustainable,
});

/**
 * Builds today's plan. Gemini chooses and words the actions; every number, title, source and
 * health message comes from code, and any AI text that fails a check is replaced by the
 * catalogue's own text. If Gemini is missing, slow or malformed, the whole plan is the fallback.
 */
export async function makePlan(
  ctx: PlanContext,
  deps: { gemini: GeminiClient | null; now: () => Date },
): Promise<Plan> {
  const cands = selectCandidates(ctx);
  const fallback = buildFallbackPlan(ctx, cands, deps.now());
  if (!deps.gemini) return fallback;

  const { text, allowed } = buildAiContext(ctx, cands);
  const ai = await askGemini(deps.gemini, text);
  if (!ai) return fallback;

  return {
    ...fallback,
    summary: checkedText(ai.summary, allowed, fallback.summary),
    ...orFallback(pickItems(ai, cands, allowed), fallback),
    aiUsed: true,
  };
}
