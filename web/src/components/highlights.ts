import type { AirReport, Plan } from '../../../shared/types.js';
import { h } from '../dom.js';
import { formatLocalTime } from '../format.js';

/** The plan as Today knows it: loaded, still on its way, or failed. */
export type PlanState = Plan | 'loading' | 'unavailable';

interface Card {
  kind: 'cleanest' | 'plan' | 'indoor';
  href: string;
  emoji: string;
  label: string;
  value: HTMLElement | string;
  note?: string;
  busy?: boolean;
}

function card(c: Card): HTMLElement {
  return h(
    'li',
    {},
    h(
      'a',
      {
        class: `highlight highlight--${c.kind}`,
        href: c.href,
        'aria-busy': c.busy ? 'true' : false,
      },
      h('span', { class: 'highlight__tile', 'aria-hidden': 'true' }, c.emoji),
      h(
        'span',
        { class: 'highlight__text' },
        h('span', { class: 'highlight__label' }, c.label),
        h('span', { class: 'highlight__value' }, c.value),
        c.note ? h('span', { class: 'highlight__note' }, c.note) : null,
      ),
    ),
  );
}

function cleanest(report: AirReport): Card | null {
  const best = report.windows.find((w) => w.kind === 'best');
  if (!best) return null;
  const now = report.now;
  const day = now && best.start.slice(0, 10) !== now.time.slice(0, 10) ? 'Tomorrow ' : '';
  return {
    kind: 'cleanest',
    href: '#/forecast',
    emoji: '🌤️',
    label: 'Cleanest air',
    value: `${day}${formatLocalTime(best.start)}–${formatLocalTime(best.end)}`,
    note: `average AQI ${Math.round(best.meanAqi)}`,
  };
}

function steps(n: number): string {
  if (n === 0) return 'No steps today';
  return n === 1 ? '1 step for today' : `${n} steps for today`;
}

function planCard(plan: PlanState): Card {
  const base = { kind: 'plan', href: '#/plan', emoji: '✅', label: 'Today’s plan' } as const;
  if (plan === 'loading') {
    return { ...base, value: h('span', { class: 'skeleton skeleton--line-short' }), busy: true };
  }
  if (plan === 'unavailable') return { ...base, value: 'Open your plan' };
  // The commute saving is shown exactly as the server worded it; nothing is added up here.
  const commute = plan.sustainable.find((i) => i.actionId === 'switch-commute')?.impact;
  return { ...base, value: steps(plan.routine.length), note: commute?.display };
}

function indoor(plan: PlanState): Card | null {
  const tip = typeof plan === 'object' ? plan.indoor[0] : undefined;
  if (!tip) return null;
  return {
    kind: 'indoor',
    href: '#/plan',
    emoji: '🏠',
    label: 'Indoor tip',
    value: tip.title,
    note: tip.impact?.display,
  };
}

/** Today's three link cards: the cleanest hours, the plan in a line, and one indoor tip. */
export function renderHighlights(el: HTMLElement, report: AirReport, plan: PlanState): void {
  const cards = [cleanest(report), planCard(plan), indoor(plan)].filter(
    (c): c is Card => c !== null,
  );
  el.replaceChildren(
    h('h2', { class: 'visually-hidden' }, 'Today at a glance'),
    h('ul', { class: 'highlights' }, ...cards.map(card)),
  );
}
