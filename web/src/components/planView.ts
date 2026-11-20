import type { Plan, PlanItem, Section } from '../../../shared/types.js';
import { h, sourceNode, srOnly } from '../dom.js';
import { icon, type IconName } from '../icons.js';
import { impactChip } from './impactChip.js';

/** The brief's three parts, in its order. */
const SECTIONS: readonly { key: Section; title: string; lede: string; icon: IconName }[] = [
  {
    key: 'routine',
    title: 'Your low-emission routine',
    lede: 'When to head out, and how to breathe less of today’s pollution.',
    icon: 'routine',
  },
  {
    key: 'indoor',
    title: 'Indoor air',
    lede: 'Simple ways to keep the air inside your home cleaner.',
    icon: 'home',
  },
  {
    key: 'sustainable',
    title: 'Greener swaps',
    lede: 'Changes that cut the emissions behind dirty air.',
    icon: 'leaf',
  },
];

export const AI_UNAVAILABLE = 'AI summary unavailable — showing our standard plan.';
const AI_USED = 'Advice worded with Google Gemini. Every number comes from our own calculations.';

export interface PlanViewOptions {
  /**
   * False when the air report had no current reading: the plan's category is then only a
   * placeholder, so no AQI colour is shown beside the health advice.
   */
  hasReading?: boolean;
}

/** `aria-busy` lives on the plan's section, so assistive tech waits for the whole of it. */
const region = (el: HTMLElement): HTMLElement => el.closest('section') ?? el;

function sources(item: PlanItem): HTMLElement | null {
  if (!item.sources.length) return null;
  return h(
    'details',
    { class: 'plan-item__sources' },
    h('summary', {}, 'Sources'),
    h('ul', {}, ...item.sources.map((s) => h('li', {}, sourceNode(s)))),
  );
}

/** `<time>` for an item's clock time, machine-readable as the full local timestamp when known. */
const timeEl = (item: PlanItem): HTMLElement =>
  h('time', { datetime: item.start ?? item.time ?? '' }, item.time ?? '');

/** "Best at 11:00", "Best tomorrow at 11:00" or "Best on Saturday at 11:00". */
function bestAt(item: PlanItem): HTMLElement {
  const day =
    item.day === undefined ? '' : item.day === 'Tomorrow' ? 'tomorrow ' : `on ${item.day} `;
  return h('p', { class: 'plan-item__when' }, `Best ${day}at `, timeEl(item));
}

/** One action as a card: title, why it matters, its impact chip and sources. */
function itemCard(item: PlanItem, showTime: boolean): HTMLElement {
  return h(
    'article',
    { class: 'card plan-item' },
    h('h4', { class: 'plan-item__title' }, item.title),
    showTime && item.time ? bestAt(item) : null,
    h('p', { class: 'plan-item__why' }, item.why),
    item.impact ? impactChip(item.impact) : null,
    sources(item),
  );
}

/** Sort key for a timed item: its full local timestamp, so tomorrow's 06:00 follows tonight's 22:00. */
const when = (i: PlanItem): string => i.start ?? i.time ?? '';

/** All-day actions first (in the plan's priority order), then timed ones in time order. */
export function timelineOrder(items: readonly PlanItem[]): PlanItem[] {
  const allDay = items.filter((i) => !i.time);
  // ISO and `HH:MM` strings sort as times; sort() is stable, so equal times keep the plan's order.
  const timed = items.filter((i) => i.time).sort((a, b) => when(a).localeCompare(when(b)));
  return [...allDay, ...timed];
}

/** The time column, with the day when it is not today; a repeat of the label above is for screen readers only. */
function timeLabel(item: PlanItem, previous: PlanItem | undefined): HTMLElement {
  const repeats =
    previous !== undefined && previous.time === item.time && when(previous) === when(item);
  const label = item.time
    ? h(
        'span',
        {},
        ...(item.day ? [h('span', { class: 'timeline__day' }, item.day), ' '] : []),
        timeEl(item),
      )
    : 'All day';
  return h(
    'p',
    { class: 'timeline__time' },
    repeats ? h('span', { class: 'visually-hidden' }, label) : label,
  );
}

function timeline(items: readonly PlanItem[]): HTMLElement {
  const ordered = timelineOrder(items);
  return h(
    'ol',
    { class: 'timeline' },
    ...ordered.map((item, i) =>
      h(
        'li',
        { class: 'timeline__item' },
        timeLabel(item, ordered[i - 1]),
        h('span', { class: 'timeline__dot', 'aria-hidden': 'true' }),
        itemCard(item, false),
      ),
    ),
  );
}

function cards(items: readonly PlanItem[]): HTMLElement {
  return h(
    'ul',
    { class: 'plan-cards' },
    ...items.map((item) => h('li', {}, itemCard(item, true))),
  );
}

function planSection(plan: Plan, spec: (typeof SECTIONS)[number]): HTMLElement {
  const items = plan[spec.key];
  const titleId = `plan-section-${spec.key}`;
  let body: HTMLElement;
  if (!items.length) body = h('p', { class: 'plan-section__empty' }, 'Nothing to add here today.');
  else body = spec.key === 'routine' ? timeline(items) : cards(items);
  return h(
    'section',
    { class: 'plan-section', 'aria-labelledby': titleId },
    h(
      'div',
      { class: 'plan-section__head' },
      icon(spec.icon, 'plan-section__icon'),
      h(
        'div',
        {},
        h('h3', { class: 'plan-section__title', id: titleId }, spec.title),
        h('p', { class: 'plan-section__lede' }, spec.lede),
      ),
    ),
    body,
  );
}

function health(plan: Plan, hasReading: boolean): HTMLElement {
  const { health: g } = plan;
  return h(
    'article',
    { class: 'card plan-health', 'aria-labelledby': 'plan-health-title' },
    h(
      'div',
      { class: 'plan-health__head' },
      hasReading
        ? h('span', { class: 'aqi-swatch', 'data-category': g.category, 'aria-hidden': 'true' })
        : null,
      h('h3', { class: 'plan-health__headline', id: 'plan-health-title' }, g.headline),
    ),
    h('p', { class: 'plan-health__summary' }, plan.summary),
    g.advice.length
      ? h('ul', { class: 'plan-health__advice' }, ...g.advice.map((a) => h('li', {}, a)))
      : null,
    h('p', { class: 'plan-health__source' }, 'Guidance: ', sourceNode(g.source)),
  );
}

/** The tailored plan: health advice, then the routine timeline, indoor tips and greener swaps. */
export function renderPlan(el: HTMLElement, plan: Plan, options: PlanViewOptions = {}): void {
  const hasReading = options.hasReading ?? true;
  const view = h(
    'div',
    { class: 'plan' },
    h(
      'p',
      { class: 'plan__note', 'data-ai': String(plan.aiUsed) },
      icon('info', 'plan__note-icon'),
      h('span', {}, plan.aiUsed ? AI_USED : AI_UNAVAILABLE),
    ),
    health(plan, hasReading),
    ...SECTIONS.map((spec) => planSection(plan, spec)),
  );
  region(el).removeAttribute('aria-busy');
  el.replaceChildren(view);
}

/** Skeleton cards in the plan's shape while it is being prepared. */
export function renderPlanSkeleton(el: HTMLElement): void {
  const bar = (modifier: string) => h('span', { class: `skeleton skeleton--${modifier}` });
  const card = (...bars: HTMLElement[]) =>
    h(
      'div',
      { class: 'card plan-skeleton', 'aria-hidden': 'true' },
      h('div', { class: 'skeleton-group' }, ...bars),
    );
  region(el).setAttribute('aria-busy', 'true');
  el.replaceChildren(
    h(
      'div',
      { class: 'plan' },
      srOnly('Preparing your plan…'),
      card(bar('title'), bar('line'), bar('line'), bar('line-short')),
      card(bar('caption'), bar('line'), bar('line-short')),
      card(bar('caption'), bar('line'), bar('line-short')),
    ),
  );
}

/** A calm failure for the plan alone: the AQI card above stays as it is. */
export function renderPlanError(
  el: HTMLElement,
  onRetry: () => void,
  message = 'Something went wrong on our side. Please try again.',
): void {
  region(el).removeAttribute('aria-busy');
  el.replaceChildren(
    h(
      'div',
      { class: 'card notice notice--error' },
      icon('alert', 'notice__icon'),
      h(
        'div',
        { class: 'notice__body' },
        h('h3', { class: 'notice__title' }, "We couldn't load your plan."),
        h('p', {}, message),
        h('button', { type: 'button', class: 'btn btn--secondary', onclick: onRetry }, 'Retry'),
      ),
    ),
  );
}
