import { describe, expect, it } from 'vitest';
import { buildFallbackPlan, selectCandidates } from '../../../server/src/domain/planner.js';
import type { GeminiClient } from '../../../server/src/services/gemini.js';
import { makePlan } from '../../../server/src/services/planService.js';
import { makeReport, profileWith, smoggyReport } from '../domain/fixtures.js';

const NOW = new Date('2026-11-19T08:30:00Z');
const clock = () => NOW;
const ctx = {
  report: smoggyReport(),
  profile: profileWith({
    household: { children: 2, respiratory: true },
    commute: { mode: 'car_petrol', oneWayKm: 12, departHour: 8 },
    exercise: { type: 'run', hour: 6, minutes: 45 },
    home: { purifier: false },
  }),
  countryCode: 'IN',
};
const cands = selectCandidates(ctx);
const idsIn = (section: string) =>
  cands.filter((c) => c.action.section === section).map((c) => c.action.id);
const fallback = buildFallbackPlan(ctx, cands, NOW);

const fake = (response: unknown): GeminiClient & { calls: { system: string; user: string }[] } => {
  const calls: { system: string; user: string }[] = [];
  return {
    calls,
    generateJson: async (req) => {
      calls.push({ system: req.system, user: req.user });
      return response;
    },
  };
};
const failing = (err: unknown): GeminiClient => ({ generateJson: () => Promise.reject(err) });

const aiResponse = (over: Record<string, unknown> = {}) => ({
  summary: 'Air is poor today, so keep trips short.',
  items: [
    ...[...idsIn('routine')].reverse().map((actionId) => ({ actionId, why: 'Because it helps you.' })),
    ...idsIn('indoor').map((actionId) => ({ actionId, why: 'Cleaner air at home.' })),
    ...idsIn('sustainable').map((actionId) => ({ actionId, why: 'Better for everyone.' })),
  ],
  ...over,
});

describe('makePlan', () => {
  it('uses the AI plan and follows its order', async () => {
    const plan = await makePlan(ctx, { gemini: fake(aiResponse()), now: clock });
    expect(plan.aiUsed).toBe(true);
    expect(plan.summary).toBe('Air is poor today, so keep trips short.');
    const expected = [...idsIn('routine')].reverse().slice(0, 4);
    expect(plan.routine.map((i) => i.actionId)).toEqual(expected);
    expect(plan.routine[0]?.why).toBe('Because it helps you.');
    expect(plan.generatedAt).toBe(NOW.toISOString());
  });

  it('takes title, impact, sources and health from code', async () => {
    const plan = await makePlan(ctx, { gemini: fake(aiResponse()), now: clock });
    const first = plan.routine[0]!;
    const cand = cands.find((c) => c.action.id === first.actionId)!;
    expect(first.title).toBe(cand.action.title);
    expect(first.impact).toEqual(cand.impact);
    expect(plan.health).toEqual(fallback.health);
  });

  it('drops unknown and duplicate action ids and caps each section at four', async () => {
    const ids = idsIn('routine');
    const plan = await makePlan(ctx, {
      gemini: fake(
        aiResponse({
          items: [
            { actionId: 'made-up', why: 'x' },
            { actionId: ids[0], why: 'first' },
            { actionId: ids[0], why: 'again' },
            ...ids.slice(1).map((actionId) => ({ actionId, why: 'more' })),
          ],
        }),
      ),
      now: clock,
    });
    const got = plan.routine.map((i) => i.actionId);
    expect(got).not.toContain('made-up');
    expect(new Set(got).size).toBe(got.length);
    expect(got.length).toBeLessThanOrEqual(4);
    expect(plan.routine[0]?.why).toBe('first');
  });

  it('replaces a why that fails the number guard with the default why', async () => {
    const id = idsIn('indoor')[0]!;
    const plan = await makePlan(ctx, {
      gemini: fake(aiResponse({ items: [{ actionId: id, why: 'This cuts exposure by 83717%.' }] })),
      now: clock,
    });
    const item = plan.indoor.find((i) => i.actionId === id)!;
    expect(item.why).toBe(cands.find((c) => c.action.id === id)!.action.defaultWhy);
  });

  it('uses the fallback summary when the summary fails the guard', async () => {
    const plan = await makePlan(ctx, {
      gemini: fake(aiResponse({ summary: 'AQI will drop to 77123 soon.' })),
      now: clock,
    });
    expect(plan.summary).toBe(fallback.summary);
    expect(plan.aiUsed).toBe(true);
  });

  it('fills a section the AI left empty from the fallback', async () => {
    const plan = await makePlan(ctx, {
      gemini: fake(
        aiResponse({ items: idsIn('routine').map((actionId) => ({ actionId, why: 'ok' })) }),
      ),
      now: clock,
    });
    expect(plan.indoor).toEqual(fallback.indoor);
    expect(plan.sustainable).toEqual(fallback.sustainable);
  });

  it('uses the suggested time when the AI time is malformed, and keeps a valid one', async () => {
    const timed = cands.find((c) => c.suggestedTime !== undefined)!;
    const find = (p: Awaited<ReturnType<typeof makePlan>>) =>
      [...p.routine, ...p.indoor, ...p.sustainable].find((i) => i.actionId === timed.action.id)!;
    const bad = await makePlan(ctx, {
      gemini: fake(aiResponse({ items: [{ actionId: timed.action.id, why: 'ok', time: '25:99' }] })),
      now: clock,
    });
    expect(find(bad).time).toBe(timed.suggestedTime);
    const good = await makePlan(ctx, {
      gemini: fake(
        aiResponse({
          items: [{ actionId: timed.action.id, why: 'ok', time: timed.suggestedTime }],
        }),
      ),
      now: clock,
    });
    expect(find(good).time).toBe(timed.suggestedTime);
  });

  it('ignores an AI time on a candidate that has no suggested time', async () => {
    const untimed = cands.find((c) => c.suggestedTime === undefined)!;
    const plan = await makePlan(ctx, {
      gemini: fake(aiResponse({ items: [{ actionId: untimed.action.id, why: 'ok', time: '12:00' }] })),
      now: clock,
    });
    const item = [...plan.routine, ...plan.indoor, ...plan.sustainable].find(
      (i) => i.actionId === untimed.action.id,
    )!;
    expect(item.time).toBeUndefined();
  });

  it('ignores an AI time that is valid and passes the guard but differs from the suggested time', async () => {
    const timed = cands.find((c) => c.suggestedTime !== undefined)!;
    // 12 comes from the commute distance in the context, so 12:00 passes the guard.
    const other = timed.suggestedTime === '12:00' ? '13:00' : '12:00';
    const plan = await makePlan(ctx, {
      gemini: fake(aiResponse({ items: [{ actionId: timed.action.id, why: 'ok', time: other }] })),
      now: clock,
    });
    const item = [...plan.routine, ...plan.indoor, ...plan.sustainable].find(
      (i) => i.actionId === timed.action.id,
    )!;
    expect(item.time).toBe(timed.suggestedTime);
  });

  it.each([
    ['the client throws', failing(new Error('boom'))],
    ['the client rejects with a timeout', failing(new Error('Gemini request timed out'))],
    ['the JSON shape is wrong', fake({ summary: 5, items: 'nope' })],
    ['an item lacks an action id', fake({ summary: 's', items: [{ why: 'x' }] })],
    ['there is no client', null],
  ])('returns the fallback plan when %s', async (_name, gemini) => {
    const plan = await makePlan(ctx, { gemini, now: clock });
    expect(plan).toEqual(fallback);
    expect(plan.aiUsed).toBe(false);
  });

  it('sends only minimal profile data and no place or raw series', async () => {
    const client = fake(aiResponse());
    await makePlan(ctx, { gemini: client, now: clock });
    const { user, system } = client.calls[0]!;
    expect(user).toContain('sensitiveGroups');
    for (const raw of ['"respiratory":', '"pregnant":', '"children":', '"lat"', '"lon"', 'pm25', 'timezone']) {
      expect(user).not.toContain(raw);
    }
    expect(user).toMatch(/<context>[\s\S]*<\/context>/);
    expect(system).toContain('Never write a number');
  });

  it('works without an air reading', async () => {
    const empty = { ...ctx, report: makeReport({}) };
    const plan = await makePlan(empty, { gemini: fake(aiResponse()), now: clock });
    expect(plan.routine.length + plan.indoor.length + plan.sustainable.length).toBeGreaterThan(0);
  });
});
