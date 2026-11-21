import type { AirReport, AqiCategory, AqiReading, Place } from '../../../shared/types.js';
import { externalLink, h, srOnly } from '../dom.js';
import {
  CATEGORIES,
  CATEGORY_LABEL,
  POLLUTANT_LABEL,
  formatLocalTime,
  formatPlace,
} from '../format.js';
import { icon } from '../icons.js';

/** EPA AQI band edges per category (2024 TAD); hazardous is drawn up to 500. */
const BAND: Record<AqiCategory, [number, number]> = {
  good: [0, 50],
  moderate: [50, 100],
  usg: [100, 150],
  unhealthy: [150, 200],
  very_unhealthy: [200, 300],
  hazardous: [300, 500],
};

/** The labels under the scale, at each band edge. */
const TICKS = [0, 50, 100, 150, 200, 300, 500];

/**
 * Where an AQI sits on a scale with one equal segment per category (0–1). Equal segments keep
 * every category readable; within its segment the value is placed linearly. Beyond 500, the end.
 */
export function scalePosition(aqi: number, category: AqiCategory): number {
  const [lo, hi] = BAND[category];
  const within = Math.min(1, Math.max(0, (aqi - lo) / (hi - lo)));
  return (CATEGORIES.indexOf(category) + within) / CATEGORIES.length;
}

const TITLE_ID = 'aqi-card-place';

function head(place: Place, when: string): HTMLElement {
  return h(
    'div',
    { class: 'aqi-card__head' },
    h('h3', { class: 'aqi-card__place', id: TITLE_ID }, formatPlace(place)),
    h('p', { class: 'aqi-card__when' }, when),
  );
}

function sourceLine(report: AirReport): HTMLElement {
  const updated = formatLocalTime(report.generatedAt, report.location.timezone);
  return h(
    'p',
    { class: 'aqi-card__source' },
    'Source: ',
    externalLink(report.source.url, report.source.name),
    ` · modelled · updated ${updated}`,
  );
}

/** A decorative six-band scale with a marker; the number and label carry the meaning. */
function scale(now: AqiReading): HTMLElement {
  const marker = h('span', { class: 'aqi-scale__marker' });
  // CSSOM, not a style attribute: allowed under the CSP's style-src 'self'.
  marker.style.left = `${(scalePosition(now.aqi, now.category) * 100).toFixed(2)}%`;
  return h(
    'div',
    { class: 'aqi-scale', 'aria-hidden': 'true' },
    h(
      'div',
      { class: 'aqi-scale__bands' },
      ...CATEGORIES.map((c) => h('span', { class: 'aqi-scale__band', 'data-category': c })),
    ),
    marker,
    h(
      'div',
      { class: 'aqi-scale__ticks' },
      ...TICKS.map((t) => h('span', { class: 'aqi-scale__tick' }, String(t))),
    ),
  );
}

function reading(now: AqiReading): HTMLElement[] {
  return [
    h(
      'div',
      { class: 'aqi-card__reading' },
      h(
        'p',
        { class: 'aqi-card__value' },
        h('span', { class: 'aqi-card__unit' }, 'US AQI'),
        srOnly(' '),
        h('span', { class: 'aqi-number' }, String(now.aqi)),
      ),
      h(
        'p',
        { class: 'aqi-card__category' },
        h('span', { class: 'aqi-swatch', 'data-category': now.category, 'aria-hidden': 'true' }),
        h('span', { class: 'aqi-card__label' }, CATEGORY_LABEL[now.category]),
      ),
    ),
    // Closed by default, so the big number and Today's cards sit together.
    h(
      'details',
      { class: 'aqi-card__more' },
      h('summary', {}, 'More details'),
      scale(now),
      h(
        'dl',
        { class: 'aqi-card__facts' },
        h(
          'div',
          { class: 'aqi-card__fact' },
          h('dt', {}, 'Main pollutant'),
          h('dd', {}, POLLUTANT_LABEL[now.dominant]),
        ),
      ),
    ),
  ];
}

function noData(): HTMLElement[] {
  return [
    h(
      'div',
      { class: 'aqi-card__empty' },
      h('p', { class: 'aqi-card__empty-title' }, 'No data for this hour'),
      h(
        'p',
        { class: 'muted' },
        'The air-quality model has no reading for this place right now. Please check again later.',
      ),
    ),
  ];
}

/**
 * The current-hour card: AQI as number, category text and colour band, the main pollutant, an
 * optional plain-text summary, and where the figure comes from. Replaces `el`'s contents.
 */
export function renderAqiCard(
  el: HTMLElement,
  report: AirReport,
  place: Place,
  summary?: string,
): void {
  const { now } = report;
  const when = now
    ? `Now · ${formatLocalTime(now.time)} local time`
    : `Updated ${formatLocalTime(report.generatedAt, report.location.timezone)}`;
  const card = h(
    'article',
    {
      class: 'card aqi-card',
      'data-category': now?.category ?? 'none',
      'aria-labelledby': TITLE_ID,
    },
    head(place, when),
    ...(now ? reading(now) : noData()),
    summary ? h('p', { class: 'aqi-card__summary' }, summary) : null,
    sourceLine(report),
  );
  el.removeAttribute('aria-busy');
  el.replaceChildren(card);
}

/** Placeholder shapes while the report loads; `aria-busy` tells assistive tech to wait. */
export function renderAqiSkeleton(el: HTMLElement): void {
  const bar = (modifier: string) => h('span', { class: `skeleton skeleton--${modifier}` });
  el.setAttribute('aria-busy', 'true');
  el.replaceChildren(
    h(
      'div',
      { class: 'card aqi-card aqi-card--loading' },
      srOnly('Loading air quality…'),
      h(
        'div',
        { class: 'skeleton-group', 'aria-hidden': 'true' },
        bar('title'),
        bar('caption'),
        bar('display'),
        bar('band'),
        bar('line'),
        bar('line-short'),
      ),
    ),
  );
}

/** A calm, actionable failure: what went wrong in plain words, and a way to try again. */
export function renderAqiError(el: HTMLElement, message: string, onRetry: () => void): void {
  el.removeAttribute('aria-busy');
  el.replaceChildren(
    h(
      'div',
      { class: 'card notice notice--error' },
      icon('alert', 'notice__icon'),
      h(
        'div',
        { class: 'notice__body' },
        h('h3', { class: 'notice__title' }, "We couldn't load the air quality"),
        h('p', {}, message),
        h('button', { type: 'button', class: 'btn btn--secondary', onclick: onRetry }, 'Retry'),
      ),
    ),
  );
}
