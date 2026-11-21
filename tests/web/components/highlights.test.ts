import { beforeEach, describe, expect, it } from 'vitest';
import type { AirReport, AirWindow, Plan } from '../../../shared/types.js';
import { renderHighlights } from '../../../web/src/components/highlights.js';
import { makeImpact, makeItem, makePlan, makeReport } from '../helpers.js';

let el: HTMLElement;
beforeEach(() => {
  el = document.createElement('div');
  document.body.replaceChildren(el);
});

const BEST: AirWindow = {
  kind: 'best',
  start: '2026-11-20T16:00',
  end: '2026-11-20T18:00',
  meanAqi: 88.4,
};
const withBest = (w: AirWindow = BEST) => makeReport({ windows: [w] });
const card = (kind: string) => el.querySelector<HTMLAnchorElement>(`.highlight--${kind}`);
const value = (kind: string) => card(kind)?.querySelector('.highlight__value')?.textContent;
const note = (kind: string) => card(kind)?.querySelector('.highlight__note')?.textContent;

const COMMUTE = makeItem({
  actionId: 'switch-commute',
  section: 'sustainable',
  title: 'Leave the car at home',
  impact: makeImpact({ display: '≈480 kg CO₂e/yr saved', unit: 'kg CO₂e/yr', value: 480 }),
});

describe('renderHighlights', () => {
  it('has a hidden heading and three links to their screens', () => {
    renderHighlights(el, withBest(), makePlan());
    const heading = el.querySelector('h2');
    expect(heading?.textContent).toBe('Today at a glance');
    expect(heading?.className).toBe('visually-hidden');
    expect(
      [...el.querySelectorAll('ul.highlights > li > a')].map((a) => a.getAttribute('href')),
    ).toEqual(['#/forecast', '#/plan', '#/plan']);
  });

  it('cleanest hours come from the best window', () => {
    renderHighlights(el, withBest(), makePlan());
    expect(card('cleanest')?.querySelector('.highlight__label')?.textContent).toBe('Cleanest air');
    expect(value('cleanest')).toBe('16:00–18:00');
    expect(note('cleanest')).toBe('average AQI 88');
  });

  it('says tomorrow when the cleanest window is on the next day', () => {
    renderHighlights(
      el,
      withBest({ ...BEST, start: '2026-11-21T07:00', end: '2026-11-21T09:00' }),
      makePlan(),
    );
    expect(value('cleanest')).toBe('Tomorrow 07:00–09:00');
  });

  it('leaves out cleanest hours when there is no best window', () => {
    renderHighlights(el, makeReport({ windows: [{ ...BEST, kind: 'worst' }] }), makePlan());
    expect(card('cleanest')).toBeNull();
  });

  it('counts the routine steps', () => {
    renderHighlights(el, withBest(), makePlan());
    expect(card('plan')?.querySelector('.highlight__label')?.textContent).toBe('Today’s plan');
    expect(value('plan')).toBe('3 steps for today');
  });

  it.each([
    [1, '1 step for today'],
    [0, 'No steps today'],
  ])('%i routine steps → %s', (n, text) => {
    const plan = makePlan();
    renderHighlights(el, withBest(), { ...plan, routine: plan.routine.slice(0, n) });
    expect(value('plan')).toBe(text);
  });

  it('shows the commute saving exactly as the server states it', () => {
    const plan = makePlan();
    renderHighlights(el, withBest(), { ...plan, sustainable: [...plan.sustainable, COMMUTE] });
    expect(note('plan')).toBe('≈480 kg CO₂e/yr saved');
  });

  it('shows no CO₂ figure without a commute switch', () => {
    renderHighlights(el, withBest(), makePlan());
    expect(note('plan')).toBeUndefined();
    expect(el.textContent).not.toMatch(/kg/);
  });

  it('shows the first indoor tip and its figure', () => {
    const plan = makePlan();
    renderHighlights(el, withBest(), plan);
    expect(value('indoor')).toBe(plan.indoor[0]?.title);
    expect(note('indoor')).toBe('−79% indoor PM2.5');
  });

  it('leaves out the indoor tip when the plan has none', () => {
    renderHighlights(el, withBest(), { ...makePlan(), indoor: [] });
    expect(card('indoor')).toBeNull();
  });

  it('marks the plan card busy while the plan loads, with no indoor tip yet', () => {
    renderHighlights(el, withBest(), 'loading');
    expect(card('plan')?.getAttribute('aria-busy')).toBe('true');
    expect(card('plan')?.querySelector('.skeleton')).not.toBeNull();
    expect(card('indoor')).toBeNull();
  });

  it('still links to the plan when it could not load', () => {
    renderHighlights(el, withBest(), 'unavailable');
    expect(value('plan')).toBe('Open your plan');
    expect(card('plan')?.hasAttribute('aria-busy')).toBe(false);
  });

  it('hides each tile emoji from assistive tech', () => {
    renderHighlights(el, withBest(), makePlan());
    for (const tile of el.querySelectorAll('.highlight__tile')) {
      expect(tile.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('replaces what was there', () => {
    renderHighlights(el, withBest(), 'loading');
    renderHighlights(el, withBest(), makePlan());
    expect(el.querySelectorAll('ul.highlights')).toHaveLength(1);
  });

  it('shows only numbers that come from the report and plan', () => {
    const report: AirReport = withBest();
    const plan: Plan = { ...makePlan(), sustainable: [COMMUTE] };
    renderHighlights(el, report, plan);
    const source = JSON.stringify({
      report,
      plan,
      round: Math.round(BEST.meanAqi),
      n: plan.routine.length,
    });
    for (const n of el.textContent?.match(/\d+/g) ?? []) expect(source).toContain(n);
  });
});
