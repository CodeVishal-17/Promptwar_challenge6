import type { AirReport, AirWindow, AqiCategory, AqiReading } from '../../../shared/types.js';
import { h } from '../dom.js';
import { CATEGORY_LABEL, formatLocalTime, weekday } from '../format.js';

export interface Bar {
  x: number;
  y: number;
  w: number;
  h: number;
  category: AqiCategory | null;
  /** Local wall-clock `YYYY-MM-DDTHH:MM`, derived from neighbours when the reading is missing. */
  time: string;
}

/** The y scale always reaches at least this AQI, so a clean day does not look dramatic. */
const MIN_SCALE_TOP = 200;
/** Share of each hour's slot the bar fills; the rest is the gap between bars. */
const BAR_FILL = 0.76;
const HOUR_MS = 3_600_000;

/** Reads `YYYY-MM-DDTHH:MM` as a wall-clock moment on a zoneless (UTC) axis. */
function wallMs(time: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(time);
  return m
    ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
    : Number.NaN;
}

const wallString = (ms: number): string => new Date(ms).toISOString().slice(0, 16);

/** One time per hour: the reading's own, else counted from the nearest reading that has one. */
function hourTimes(hourly: (AqiReading | null)[]): string[] {
  const anchors = hourly.flatMap((r, i) => (r && !Number.isNaN(wallMs(r.time)) ? [i] : []));
  return hourly.map((r, i) => {
    if (r) return r.time;
    let nearest = -1;
    for (const a of anchors)
      if (nearest < 0 || Math.abs(a - i) < Math.abs(nearest - i)) nearest = a;
    if (nearest < 0) return '';
    const anchor = hourly[nearest] as AqiReading;
    return wallString(wallMs(anchor.time) + (i - nearest) * HOUR_MS);
  });
}

/**
 * One bar per hour in a `width` × `height` box, equal widths, bottoms on the baseline (y + h =
 * height). The scale tops out at `maxAqi`, by default the larger of 200 and the highest AQI.
 * A missing reading is a zero-height bar with no category.
 */
export function chartBars(
  hourly: (AqiReading | null)[],
  width: number,
  height: number,
  maxAqi?: number,
): Bar[] {
  if (hourly.length === 0) return [];
  const highest = Math.max(0, ...hourly.map((r) => r?.aqi ?? 0));
  const top = maxAqi ?? Math.max(MIN_SCALE_TOP, highest);
  const slot = width / hourly.length;
  const w = slot * BAR_FILL;
  const times = hourTimes(hourly);
  return hourly.map((r, i) => {
    const barH = r ? Math.min(height, (r.aqi / top) * height) : 0;
    return {
      x: i * slot + (slot - w) / 2,
      y: height - barH,
      w,
      h: barH,
      category: r ? r.category : null,
      time: times[i] ?? '',
    };
  });
}

// ---------- SVG plumbing ----------

const SVG_NS = 'http://www.w3.org/2000/svg';

type SvgAttrs = Record<string, string | number>;

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: SvgAttrs = {},
  ...children: (Node | string)[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(
      name,
      typeof value === 'number' ? String(Math.round(value * 100) / 100) : value,
    );
  }
  el.append(...children);
  return el;
}

// The SVG draws only bars, bands and lines, stretched to its box (preserveAspectRatio none), so it
// carries no text: every label is HTML, positioned by percentage, and stays at a readable size.
const PLOT_W = 480;
const PLOT_H = 100;
/** Grid lines sit on the EPA category boundaries, plus 1000 because the AQI runs on past 500. */
const GRID_LINES = [50, 100, 150, 200, 300, 500, 1000];
/** Nearest two grid lines may sit, as a share of the scale, so their labels never overlap. */
const MIN_GRID_GAP = 0.12;
/** Scale tops from which an axis label has four digits and needs a wider label column. */
const WIDE_AXIS_FROM = 1000;
const GAP_MARK_H = 2.5;
const TICK_EVERY_H = 6;
/** Labels centred closer than this to an edge (percent of the plot width) anchor to that edge. */
const EDGE_ZONE = 12;
/** Window labels centred closer than this (percent) would overlap, so the second goes on a new row. */
const LABEL_CLASH = 22;

const hhmm = (time: string): string => formatLocalTime(time);
const hourOf = (time: string): number => Number(time.slice(11, 13));

/** The window with its weekday: in a 48-hour view, "19:00" alone could be today or tomorrow. */
const windowRange = (w: AirWindow): string =>
  `${weekday(w.start.slice(0, 10), 'short')} ${hhmm(w.start)}–${hhmm(w.end)}`;
/** The best window only counts 06:00–21:00 (server windows.ts), so it is the cleanest daytime hours. */
const WINDOW_WORD = { best: 'Cleanest daytime hours', worst: 'Worst' } as const;

function describe(report: AirReport): string {
  const parts: string[] = [];
  const best = report.windows.find((w) => w.kind === 'best');
  const worst = report.windows.find((w) => w.kind === 'worst');
  if (best) parts.push(`${WINDOW_WORD.best} ${windowRange(best)}`);
  if (worst) parts.push(`${best ? 'worst' : 'Worst'} ${windowRange(worst)}`);
  const hours = report.hourly.length;
  const head = `Bar chart of the US AQI for the next ${hours} hours.`;
  return parts.length > 0 ? `${head} ${parts.join(', ')}.` : head;
}

/** An HTML label at `pct` % of the plot width, anchored to the edge it is near so it never clips. */
function placed(
  className: string,
  pct: number,
  text: string,
  ...extra: (Node | string)[]
): HTMLElement {
  const anchor = pct > 100 - EDGE_ZONE ? 'end' : pct < EDGE_ZONE ? 'start' : 'middle';
  const el = h('span', { class: className, 'data-anchor': anchor }, text, ...extra);
  el.style.left = `${Math.round(pct * 100) / 100}%`;
  return el;
}

interface Placed {
  bands: SVGElement[];
  labels: HTMLElement[];
  stacked: boolean;
}

function windowMarks(report: AirReport, times: string[], slot: number): Placed {
  const out: Placed = { bands: [], labels: [], stacked: false };
  const centres: number[] = [];
  for (const w of report.windows) {
    const first = times.indexOf(w.start);
    if (first < 0) continue;
    const found = times.indexOf(w.end);
    const last = found < 0 ? times.length : found;
    if (last <= first) continue;
    out.bands.push(
      svg('rect', {
        class: `chart__window chart__window--${w.kind}`,
        x: first * slot,
        y: 0,
        width: (last - first) * slot,
        height: PLOT_H,
      }),
    );
    out.bands.push(
      svg('line', {
        class: `chart__bracket chart__bracket--${w.kind}`,
        x1: first * slot,
        x2: last * slot,
        y1: 1.5,
        y2: 1.5,
      }),
    );
    const pct = (((first + last) / 2) * slot * 100) / PLOT_W;
    const label = placed(
      `chart__window-label chart__window-label--${w.kind}`,
      pct,
      w.kind === 'best' ? 'Cleanest' : 'Worst',
    );
    if (centres.some((c) => Math.abs(c - pct) < LABEL_CLASH)) {
      label.classList.add('chart__window-label--low');
      out.stacked = true;
    }
    centres.push(pct);
    out.labels.push(label);
  }
  return out;
}

/** The grid lines for a scale that tops out at `top`: the boundaries that fit, spaced to be labelled. */
export function gridLines(top: number): number[] {
  const lines: number[] = [];
  for (const v of GRID_LINES) {
    if (v > top) break;
    if ((v - (lines.at(-1) ?? 0)) / top >= MIN_GRID_GAP) lines.push(v);
  }
  return lines;
}

function buildChart(report: AirReport): HTMLElement {
  const { hourly } = report;
  const times = hourTimes(hourly);
  const highest = Math.max(0, ...hourly.map((r) => r?.aqi ?? 0));
  const top = Math.max(MIN_SCALE_TOP, highest);
  const bars = chartBars(hourly, PLOT_W, PLOT_H, top);
  const slot = PLOT_W / hourly.length;

  const gridValues = gridLines(top);
  const grid = gridValues.map((v) => {
    const y = PLOT_H - (v / top) * PLOT_H;
    return svg('line', { class: 'chart__grid', x1: 0, x2: PLOT_W, y1: y, y2: y });
  });
  const yLabels = gridValues.map((v) => {
    const el = h('span', { class: 'chart__axis-label' }, String(v));
    el.style.bottom = `${Math.round((v / top) * 10000) / 100}%`;
    return el;
  });

  const barEls = bars.map((b) =>
    b.category
      ? svg('rect', {
          class: 'chart__bar',
          'data-category': b.category,
          x: b.x,
          y: b.y,
          width: b.w,
          height: b.h,
        })
      : svg('rect', {
          class: 'chart__gap',
          'data-category': 'none',
          x: b.x,
          y: PLOT_H - GAP_MARK_H,
          width: b.w,
          height: GAP_MARK_H,
        }),
  );

  const verticals: SVGElement[] = [];
  const ticks: HTMLElement[] = [];
  times.forEach((t, i) => {
    if (!t || hourOf(t) % TICK_EVERY_H !== 0) return;
    const centre = i * slot + slot / 2;
    verticals.push(
      svg('line', { class: 'chart__vgrid', x1: centre, x2: centre, y1: 0, y2: PLOT_H }),
    );
    const hour = hourOf(t);
    const day =
      hour === 0 ? h('span', { class: 'chart__tick-day' }, weekday(t.slice(0, 10), 'short')) : null;
    const tick = placed(
      `chart__tick-label${hour % 12 === 0 ? '' : ' chart__tick-label--minor'}`,
      (centre * 100) / PLOT_W,
      hhmm(t),
      ...(day ? [day] : []),
    );
    ticks.push(tick);
  });

  const stack = windowMarks(report, times, slot);
  const plot = svg(
    'svg',
    {
      class: 'chart',
      viewBox: `0 0 ${PLOT_W} ${PLOT_H}`,
      preserveAspectRatio: 'none',
      role: 'img',
      'aria-label': describe(report),
    },
    ...stack.bands,
    ...grid,
    ...verticals,
    ...barEls,
    svg('line', { class: 'chart__baseline', x1: 0, x2: PLOT_W, y1: PLOT_H, y2: PLOT_H }),
  );

  return h(
    'div',
    {
      class: [
        'chart-wrap',
        stack.stacked ? 'chart-wrap--stacked' : '',
        top >= WIDE_AXIS_FROM ? 'chart-wrap--wide-axis' : '',
      ]
        .filter(Boolean)
        .join(' '),
    },
    h('div', { class: 'chart__plot' }, plot),
    h('div', { class: 'chart__y', 'aria-hidden': 'true' }, ...yLabels),
    h('div', { class: 'chart__x', 'aria-hidden': 'true' }, ...ticks),
    h('div', { class: 'chart__marks', 'aria-hidden': 'true' }, ...stack.labels),
  );
}

// ---------- The rest of the component ----------

function windowSummary(windows: AirWindow[]): HTMLElement | null {
  const items = (['best', 'worst'] as const).flatMap((kind) => {
    const w = windows.find((x) => x.kind === kind);
    if (!w) return [];
    return [
      h(
        'li',
        { class: `forecast__window forecast__window--${kind}` },
        h('strong', {}, WINDOW_WORD[kind]),
        ` ${windowRange(w)}`,
        h('span', { class: 'forecast__muted' }, ` · average AQI ${Math.round(w.meanAqi)}`),
      ),
    ];
  });
  return items.length > 0 ? h('ul', { class: 'forecast__windows' }, ...items) : null;
}

function swatch(category: AqiCategory | null): HTMLElement {
  return h('span', {
    class: 'aqi-swatch',
    'data-category': category ?? 'none',
    'aria-hidden': 'true',
  });
}

const TABLE_ID = 'forecast-table-panel';

function buildTable(report: AirReport): HTMLElement {
  const times = hourTimes(report.hourly);
  const rows = report.hourly.map((r, i) => {
    const t = times[i];
    const when = t ? `${weekday(t.slice(0, 10), 'short')} ${hhmm(t)}` : '—';
    return h(
      'tr',
      {},
      h('th', { scope: 'row' }, when),
      h('td', { class: 'num' }, r ? String(r.aqi) : '—'),
      r
        ? h('td', {}, swatch(r.category), CATEGORY_LABEL[r.category])
        : h('td', { class: 'forecast__muted' }, 'No data'),
    );
  });
  return h(
    'div',
    {
      id: TABLE_ID,
      class: 'forecast__table-wrap',
      hidden: true,
      role: 'region',
      'aria-label': 'Hourly AQI table',
      tabindex: '0',
    },
    h(
      'table',
      { class: 'data-table' },
      h('caption', {}, `Hourly US AQI for the next ${report.hourly.length} hours`),
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          h('th', { scope: 'col' }, 'Time'),
          h('th', { scope: 'col', class: 'num' }, 'AQI'),
          h('th', { scope: 'col' }, 'Category'),
        ),
      ),
      h('tbody', {}, ...rows),
    ),
  );
}

function buildOutlook(report: AirReport): HTMLElement | null {
  if (report.outlook.length === 0) return null;
  const items = report.outlook.map((d) =>
    h(
      'li',
      { class: 'outlook__day' },
      h('span', { class: 'outlook__name' }, weekday(d.date, 'long')),
      h('span', { class: 'outlook__category' }, swatch(d.category), CATEGORY_LABEL[d.category]),
      h('span', { class: 'outlook__aqi' }, `Peak AQI ${d.maxAqi}`),
    ),
  );
  return h(
    'div',
    { class: 'outlook-block' },
    h('h3', { class: 'forecast__subtitle' }, 'Coming days'),
    h('ul', { class: 'outlook' }, ...items),
  );
}

/** Renders the 48-hour chart, its table alternative and the multi-day outlook into `el`. */
export function renderForecast(el: HTMLElement, report: AirReport): void {
  if (report.hourly.length === 0) {
    el.replaceChildren(
      h(
        'p',
        { class: 'card forecast__empty' },
        'No forecast is available for this place right now.',
      ),
    );
    return;
  }

  const toggle = h(
    'button',
    {
      type: 'button',
      class: 'btn btn--secondary',
      'aria-expanded': 'false',
      'aria-controls': TABLE_ID,
    },
    'Show as table',
  );
  const table = buildTable(report);
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Hide table' : 'Show as table';
    table.hidden = !open;
  });

  const card = h(
    'div',
    { class: 'card forecast' },
    buildChart(report),
    windowSummary(report.windows),
    h('div', { class: 'forecast__actions' }, toggle),
    table,
  );
  el.replaceChildren(card, ...[buildOutlook(report)].filter((n): n is HTMLElement => n !== null));
}
