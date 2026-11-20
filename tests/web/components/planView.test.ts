import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  renderPlan,
  renderPlanError,
  renderPlanSkeleton,
} from '../../../web/src/components/planView.js';
import { makeImpact, makeItem, makePlan } from '../helpers.js';

let section: HTMLElement;
let el: HTMLElement;
beforeEach(() => {
  section = document.createElement('section');
  el = document.createElement('div');
  section.append(el);
  document.body.replaceChildren(section);
});

const texts = (sel: string) => [...el.querySelectorAll(sel)].map((n) => n.textContent);

describe('renderPlan', () => {
  it('renders the three sections in the brief’s order, each with a heading', () => {
    renderPlan(el, makePlan());
    expect(texts('.plan-section__title')).toEqual([
      'Your low-emission routine',
      'Indoor air',
      'Greener swaps',
    ]);
    for (const s of el.querySelectorAll('.plan-section')) {
      const heading = document.getElementById(s.getAttribute('aria-labelledby') ?? '');
      expect(heading?.tagName).toBe('H3');
    }
  });

  it('shows the health headline, the summary, each line of advice and the guidance source', () => {
    const plan = makePlan();
    renderPlan(el, plan);
    expect(el.querySelector('.plan-health__headline')?.textContent).toBe(plan.health.headline);
    expect(el.textContent).toContain(plan.summary);
    expect(texts('.plan-health__advice li')).toEqual(plan.health.advice);
    expect(el.querySelector('.plan-health a')?.getAttribute('href')).toBe(plan.health.source.url);
  });

  it('marks the health block with the category swatch when there is a reading', () => {
    renderPlan(el, makePlan());
    const swatch = el.querySelector('.plan-health .aqi-swatch');
    expect(swatch?.getAttribute('data-category')).toBe('unhealthy');
    expect(swatch?.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows no AQI swatch when the report had no reading (the category is a placeholder)', () => {
    renderPlan(el, makePlan(), { hasReading: false });
    expect(el.querySelector('.aqi-swatch')).toBeNull();
    expect(el.querySelector('[data-category]')).toBeNull();
    expect(el.querySelector('.plan-health__headline')?.textContent).toBe(
      'The air is unhealthy, especially for sensitive people',
    );
  });

  it('lays out routine items as a timeline: all-day items first, then timed ones in time order', () => {
    renderPlan(el, makePlan());
    expect(texts('.timeline__time')).toEqual(['All day', '07:00', '18:00']);
    expect(texts('.timeline .plan-item__title')).toEqual([
      'Move today’s workout indoors',
      'Shift your exercise to the cleanest hours',
      'Keep errands out of the smoggiest hours',
    ]);
    expect(el.querySelector('.timeline time')?.getAttribute('datetime')).toBe('07:00');
  });

  it('labels a time that falls tomorrow and sorts by full timestamp across midnight', () => {
    const routine = [
      makeItem({
        title: 'Tomorrow morning',
        time: '06:00',
        start: '2026-11-21T06:00',
        day: 'Tomorrow',
      }),
      makeItem({ title: 'Tonight', time: '22:00', start: '2026-11-20T22:00' }),
    ];
    renderPlan(el, makePlan({ routine }));
    expect(texts('.timeline .plan-item__title')).toEqual(['Tonight', 'Tomorrow morning']);
    expect(texts('.timeline__time')).toEqual(['22:00', 'Tomorrow 06:00']);
    expect(texts('.timeline__day')).toEqual(['Tomorrow']);
    const times = [...el.querySelectorAll('.timeline time')].map((t) => t.getAttribute('datetime'));
    expect(times).toEqual(['2026-11-20T22:00', '2026-11-21T06:00']);
  });

  it('shows the same clock time on two days as two labels', () => {
    const routine = [
      makeItem({ title: 'A', time: '15:00', start: '2026-11-20T15:00' }),
      makeItem({ title: 'B', time: '15:00', start: '2026-11-21T15:00', day: 'Tomorrow' }),
    ];
    renderPlan(el, makePlan({ routine }));
    expect(el.querySelectorAll('.timeline__time .visually-hidden')).toHaveLength(0);
  });

  it('shows a repeated time label once, keeping it for screen readers on the rest', () => {
    renderPlan(el, makePlan({ routine: [makeItem(), makeItem({ title: 'Second' })] }));
    const labels = [...el.querySelectorAll('.timeline__time')];
    expect(labels.map((l) => l.textContent)).toEqual(['All day', 'All day']);
    expect(labels[0]?.querySelector('.visually-hidden')).toBeNull();
    expect(labels[1]?.querySelector('.visually-hidden')?.textContent).toBe('All day');
  });

  it('shows an impact chip only on items that have an impact', () => {
    renderPlan(el, makePlan());
    expect(texts('.impact-chip__value')).toEqual(['−42% PM2.5 inhaled', '−79% indoor PM2.5']);
    const routineItems = el.querySelectorAll('.timeline .plan-item');
    expect(routineItems[0]?.querySelector('.impact-chip')).toBeNull();
  });

  it('shows the best time on a non-routine item that has one', () => {
    const plan = makePlan({
      indoor: [makeItem({ section: 'indoor', title: 'Open the windows briefly', time: '06:00' })],
    });
    renderPlan(el, plan);
    expect(el.querySelector('.plan-item__when')?.textContent).toBe('Best at 06:00');
  });

  it('names the day on a best time that is not today', () => {
    const at = (day: string) =>
      makePlan({
        indoor: [makeItem({ section: 'indoor', time: '11:00', start: '2026-11-21T11:00', day })],
      });
    renderPlan(el, at('Tomorrow'));
    expect(el.querySelector('.plan-item__when')?.textContent).toBe('Best tomorrow at 11:00');
    expect(el.querySelector('.plan-item__when time')?.getAttribute('datetime')).toBe(
      '2026-11-21T11:00',
    );
    renderPlan(el, at('Saturday'));
    expect(el.querySelector('.plan-item__when')?.textContent).toBe('Best on Saturday at 11:00');
  });

  it('says when the AI summary was unavailable', () => {
    renderPlan(el, makePlan({ aiUsed: false }));
    expect(el.textContent).toContain('AI summary unavailable — showing our standard plan.');
    renderPlan(el, makePlan({ aiUsed: true }));
    expect(el.textContent).not.toContain('AI summary unavailable');
  });

  it('says so calmly when a section has nothing today', () => {
    renderPlan(el, makePlan({ sustainable: [] }));
    expect(el.querySelectorAll('.plan-section')).toHaveLength(3);
    expect(el.textContent).toContain('Nothing to add here today.');
  });

  it('lists item sources, linking https ones only', () => {
    const plan = makePlan({
      indoor: [
        makeItem({
          section: 'indoor',
          sources: [
            {
              title: 'EPA indoor air',
              url: 'https://www.epa.gov/indoor-air-quality-iaq',
              year: 2026,
            },
            { title: 'Plain http', url: 'http://example.com', year: 2020 },
          ],
        }),
      ],
    });
    renderPlan(el, plan);
    const sources = el.querySelector('.plan-item__sources') as HTMLElement;
    expect(sources.querySelectorAll('a')).toHaveLength(1);
    expect(sources.textContent).toContain('Plain http');
  });

  it('renders model text as text, never markup', () => {
    renderPlan(
      el,
      makePlan({
        summary: '<img src=x onerror=alert(1)>',
        routine: [makeItem({ why: '<b>hi</b>' })],
      }),
    );
    expect(el.querySelector('img, b')).toBeNull();
    expect(el.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('replaces the skeleton and clears aria-busy', () => {
    renderPlanSkeleton(el);
    expect(section.getAttribute('aria-busy')).toBe('true');
    expect(el.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
    renderPlan(el, makePlan());
    expect(section.hasAttribute('aria-busy')).toBe(false);
    expect(el.querySelector('.skeleton')).toBeNull();
  });

  it('keeps impact chips working inside the plan', () => {
    renderPlan(el, makePlan({ routine: [makeItem({ impact: makeImpact() })] }));
    const button = el.querySelector('.impact-chip') as HTMLButtonElement;
    button.click();
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('renderPlanError', () => {
  it('says the plan could not load, offers Retry and clears aria-busy', () => {
    const onRetry = vi.fn();
    renderPlanSkeleton(el);
    renderPlanError(el, onRetry);
    expect(section.hasAttribute('aria-busy')).toBe(false);
    expect(el.textContent).toContain("We couldn't load your plan.");
    const retry = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Retry');
    retry?.click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('shows a specific reason when given one', () => {
    renderPlanError(el, () => {}, 'Too many requests.');
    expect(el.textContent).toContain('Too many requests.');
  });
});
