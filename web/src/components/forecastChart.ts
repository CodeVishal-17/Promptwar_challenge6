import type { AirReport, AirWindow, AqiCategory, AqiReading } from '../../../shared/types.js';
import { h } from '../dom.js';
import { CATEGORY_LABEL, formatLocalTime } from '../format.js';

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

// Layout in viewBox units; the SVG scales to its container, so these are proportions, not pixels.
const VIEW_W = 720;
const VIEW_H = 250;
const PAD = { top: 22, right: 6, bottom: 28, left: 34 };
const PLOT_W = VIEW_W - PAD.left - PAD.right;
const PLOT_H = VIEW_H - PAD.top - PAD.bottom;
const GRID_LINES = [50, 100, 150, 200];
const GAP_MARK_H = 3;
const TICK_EVERY_H = 6;

const hhmm = (time: string): string => formatLocalTime(time);
const hourOf = (time: string): number => Number(time.slice(11, 13));

/** Weekday name for a local `YYYY-MM-DD` date. UTC keeps the browser's zone from shifting it. */
function weekday(date: string, style: 'long' | 'short'): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return new Intl.DateTimeFormat('en-GB', { weekday: style, timeZone: 'UTC' }).format(d);
}

const windowRange = (w: AirWindow): string => `${hhmm(w.start)}–${hhmm(w.end)}`;
const WINDOW_WORD = { best: 'Cleanest air', worst: 'Worst' } as const;

function describe(report: AirReport): string {
  const parts: string[] = [];
  const best = report.windows.find((w) => w.kind === 'best');
  const worst = report.windows.find((w) => w.kind === 'worst');
  if (best) parts.push(`Cleanest air ${windowRange(best)}`);
  if (worst) parts.push(`${best ? 'worst' : 'Worst'} ${windowRange(worst)}`);
  const hours = report.hourly.length;
  const head = `Bar chart of the US AQI for the next ${hours} hours.`;
  return parts.length > 0 ? `${head} ${parts.join(', ')}.` : head;
}

function windowBands(report: AirReport, times: string[], slot: number): SVGElement[] {
  const out: SVGElement[] = [];
  for (const w of report.windows) {
    const first = times.indexOf(w.start);
    if (first < 0) continue;
    const found = times.indexOf(w.end);
    const last = found < 0 ? times.length : found;
    if (last <= first) continue;
    const x = PAD.left + first * slot;
    const bandW = (last - first) * slot;
    out.push(
      svg('rect', {
        class: `chart__window chart__window--${w.kind}`,
        x,
        y: PAD.top,
        width: bandW,
        height: PLOT_H,
      }),
    );
    // Keep the label inside the plot: anchor to whichever end is nearer an edge.
    const centre = x + bandW / 2;
    const anchor =
      centre < PAD.left + 70 ? 'start' : centre > VIEW_W - PAD.right - 70 ? 'end' : 'middle';
    const labelX = anchor === 'start' ? x : anchor === 'end' ? x + bandW : centre;
    out.push(
      svg(
        'text',
        {
          class: `chart__window-label chart__window-label--${w.kind}`,
          x: labelX,
          y: PAD.top - 7,
          'text-anchor': anchor,
        },
        w.kind === 'best' ? 'Cleanest' : 'Worst',
      ),
    );
  }
  return out;
}

function buildChart(report: AirReport): SVGSVGElement {
  const { hourly } = report;
  const times = hourTimes(hourly);
  const highest = Math.max(0, ...hourly.map((r) => r?.aqi ?? 0));
  const top = Math.max(MIN_SCALE_TOP, highest);
  const bars = chartBars(hourly, PLOT_W, PLOT_H, top);
  const slot = PLOT_W / hourly.length;
  const baseline = PAD.top + PLOT_H;

  const grid = GRID_LINES.filter((v) => v <= top).flatMap((v) => {
    const y = baseline - (v / top) * PLOT_H;
    return [
      svg('line', { class: 'chart__grid', x1: PAD.left, x2: VIEW_W - PAD.right, y1: y, y2: y }),
      svg(
        'text',
        { class: 'chart__axis-label', x: PAD.left - 6, y: y + 4, 'text-anchor': 'end' },
        String(v),
      ),
    ];
  });

  const barEls = bars.map((b) =>
    b.category
      ? svg('rect', {
          class: 'chart__bar',
          'data-category': b.category,
          x: PAD.left + b.x,
          y: PAD.top + b.y,
          width: b.w,
          height: b.h,
          rx: 1.5,
        })
      : svg('rect', {
          class: 'chart__gap',
          'data-category': 'none',
          x: PAD.left + b.x,
          y: baseline - GAP_MARK_H,
          width: b.w,
          height: GAP_MARK_H,
        }),
  );

  const ticks = times.flatMap((t, i) => {
    if (!t || hourOf(t) % TICK_EVERY_H !== 0) return [];
    const x = PAD.left + i * slot + slot / 2;
    const midnight = hourOf(t) === 0;
    const label = midnight ? `${weekday(t.slice(0, 10), 'short')} ${hhmm(t)}` : hhmm(t);
    return [
      svg('line', { class: 'chart__tick', x1: x, x2: x, y1: baseline, y2: baseline + 4 }),
      svg(
        'text',
        {
          class: `chart__tick-label${midnight ? ' chart__tick-label--day' : ''}`,
          x,
          y: baseline + 18,
          'text-anchor': 'middle',
        },
        label,
      ),
    ];
  });

  return svg(
    'svg',
    {
      class: 'chart',
      viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
      role: 'img',
      'aria-label': describe(report),
      preserveAspectRatio: 'xMidYMid meet',
    },
    ...windowBands(report, times, slot),
    ...grid,
    ...barEls,
    svg('line', {
      class: 'chart__baseline',
      x1: PAD.left,
      x2: VIEW_W - PAD.right,
      y1: baseline,
      y2: baseline,
    }),
    ...ticks,
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
    h('div', { class: 'chart-wrap' }, buildChart(report)),
    windowSummary(report.windows),
    h('div', { class: 'forecast__actions' }, toggle),
    table,
  );
  el.replaceChildren(card, ...[buildOutlook(report)].filter((n): n is HTMLElement => n !== null));
}
