import type { AirReport, AirWindow } from '../../../shared/types.js';
import { h } from '../dom.js';
import { formatLocalTime, weekday } from '../format.js';
import { MIN_SCALE_TOP, chartBars, gridLines, hourTimes, type Bar } from './chartScale.js';
import { TABLE_ID, buildOutlook, buildTable } from './forecastTable.js';

export { chartBars, gridLines } from './chartScale.js';
export type { Bar } from './chartScale.js';

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

/** Horizontal grid lines at the AQI boundaries, and their HTML labels up the side. */
function yAxis(top: number): { lines: SVGElement[]; labels: HTMLElement[] } {
  const values = gridLines(top);
  const lines = values.map((v) => {
    const y = PLOT_H - (v / top) * PLOT_H;
    return svg('line', { class: 'chart__grid', x1: 0, x2: PLOT_W, y1: y, y2: y });
  });
  const labels = values.map((v) => {
    const el = h('span', { class: 'chart__axis-label' }, String(v));
    el.style.bottom = `${String(Math.round((v / top) * 10000) / 100)}%`;
    return el;
  });
  return { lines, labels };
}

/** A coloured bar per reading; a missing hour is a short grey mark on the baseline. */
const barRect = (b: Bar): SVGElement =>
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
      });

/** A time label every TICK_EVERY_H hours (with the weekday at midnight) and a faint line above it. */
function xAxis(times: string[], slot: number): { lines: SVGElement[]; ticks: HTMLElement[] } {
  const lines: SVGElement[] = [];
  const ticks: HTMLElement[] = [];
  times.forEach((t, i) => {
    if (!t || hourOf(t) % TICK_EVERY_H !== 0) return;
    const centre = i * slot + slot / 2;
    lines.push(svg('line', { class: 'chart__vgrid', x1: centre, x2: centre, y1: 0, y2: PLOT_H }));
    const hour = hourOf(t);
    const day =
      hour === 0 ? [h('span', { class: 'chart__tick-day' }, weekday(t.slice(0, 10), 'short'))] : [];
    const minor = hour % 12 === 0 ? '' : ' chart__tick-label--minor';
    ticks.push(placed(`chart__tick-label${minor}`, (centre * 100) / PLOT_W, hhmm(t), ...day));
  });
  return { lines, ticks };
}

function buildChart(report: AirReport): HTMLElement {
  const { hourly } = report;
  const times = hourTimes(hourly);
  const highest = Math.max(0, ...hourly.map((r) => r?.aqi ?? 0));
  const top = Math.max(MIN_SCALE_TOP, highest);
  const slot = PLOT_W / hourly.length;
  const barEls = chartBars(hourly, PLOT_W, PLOT_H, top).map(barRect);
  const { lines: grid, labels: yLabels } = yAxis(top);
  const { lines: verticals, ticks } = xAxis(times, slot);

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
