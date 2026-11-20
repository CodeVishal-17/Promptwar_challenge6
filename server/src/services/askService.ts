import { Type } from '@google/genai';
import { z } from 'zod';
import type { PlanContext } from '../domain/catalog.js';
import { passesNumberGuard } from '../domain/numberGuard.js';
import { selectCandidates } from '../domain/planner.js';
import { COMMON_RULES, buildAiContext } from './aiContext.js';
import { type GeminiClient, logGeminiFailure } from './gemini.js';

/** How long to wait for Gemini before telling the user the assistant is unavailable. */
const ASK_TIMEOUT_MS = 8_000;

const OFF_TOPIC =
  'I can only help with air quality and your plan. Try asking about the best time to go outside, or how to keep indoor air cleaner.';
const UNRELIABLE =
  "I couldn't answer that reliably. Your plan above uses checked figures; try rephrasing your question.";
const UNAVAILABLE = 'The assistant is unavailable right now. Your plan above still applies.';

const SYSTEM = `You answer one question about air quality and the household's plan, in two to four short sentences.
Only answer questions about air quality, health effects of air pollution, and the plan in the context. For anything else set "onTopic" to false.
${COMMON_RULES}`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: { answer: { type: Type.STRING }, onTopic: { type: Type.BOOLEAN } },
  required: ['answer', 'onTopic'],
};

const AiAnswer = z.object({ answer: z.string(), onTopic: z.boolean() });

/** Angle brackets are removed so a question cannot close its own `<question>` block. */
const sanitise = (q: string): string => q.replace(/[<>]/g, ' ').trim();

/** Answers a free-text question from the same checked context as the plan; numbers are guarded. */
export async function answerQuestion(
  ctx: PlanContext,
  question: string,
  deps: { gemini: GeminiClient | null; now: () => Date },
): Promise<{ answer: string; aiUsed: boolean }> {
  if (!deps.gemini) return { answer: UNAVAILABLE, aiUsed: false };
  const { text, allowed } = buildAiContext(ctx, selectCandidates(ctx));
  let reply: z.infer<typeof AiAnswer>;
  try {
    reply = AiAnswer.parse(
      await deps.gemini.generateJson({
        system: SYSTEM,
        user: `<context>${text}</context>\n<question>${sanitise(question)}</question>`,
        schema: RESPONSE_SCHEMA,
        timeoutMs: ASK_TIMEOUT_MS,
      }),
    );
  } catch (err) {
    logGeminiFailure(err);
    return { answer: UNAVAILABLE, aiUsed: false };
  }
  if (!reply.onTopic) return { answer: OFF_TOPIC, aiUsed: true };
  const answer = reply.answer.trim();
  if (!answer || !passesNumberGuard(answer, allowed)) return { answer: UNRELIABLE, aiUsed: true };
  return { answer, aiUsed: true };
}
