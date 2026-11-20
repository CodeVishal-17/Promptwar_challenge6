// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { AirReport, AqiReading } from '../../../shared/types.js';
import { chartBars, gridLines, renderForecast } from '../../../web/src/components/forecastChart.js';
import { makeReport } from '../helpers.js';

function nth<T>(list: ArrayLike<T>, i: number): T {
  const item = list[i];
  if (item === undefined) throw new Error(`no item ${i}`);
  return item;
}

const START = Date.UTC(2026, 10, 20, 14); // Fri 20 Nov 2026 14:00, read as wall-clock

function wall(i: number, start = START): string {
  return new Date(start + i * 3_600_000).toISOString().slice(0, 16);
}

function hourly(count = 48, nullAt: number[] = []): (AqiReading | null)[] {
  return Array.from({ length: count }, (_, i) =>
    nullAt.includes(i)
      ? null
      : {
          time: wall(i),
          aqi: 20 + i * 3,
          category: i < 10 ? 'good' : i < 30 ? 'moderate' : 'usg',
          dominant: 'pm2_5',
          perPollutant: { pm2_5: 20 + i * 3 },
        },
  );
}

function report(overrides: Partial<AirReport> = {}, nullAt: number[] = []): AirReport {
  return makeReport({
    hourly: hourly(48, nullAt),
    windows: [
      { kind: 'best', start: wall(2), end: wall(4), meanAqi: 27 },
      { kind: 'worst', start: wall(30), end: wall(32), meanAqi: 113 },
    ],
    outlook: [
      { date: '2026-11-20', maxAqi: 60, category: 'moderate' },
      { date: '2026-11-21', maxAqi: 160, category: 'unhealthy' },
    ],
    ...overrides,
  });
}

describe('chartBars', () => {
  it('returns one equal-width bar per hour that fits inside the width', () => {
    const bars = chartBars(hourly(), 480, 100);
    expect(bars).toHaveLength(48);
    expect(new Set(bars.map((b) => b.w)).size).toBe(1);
    const last = nth(bars, 47);
    expect(last.x + last.w).toBeLessThanOrEqual(480);
    expect(nth(bars, 0).x).toBeGreaterThanOrEqual(0);
    expect(nth(bars, 0).time).toBe('2026-11-20T14:00');
  });

  it('gives a null reading no height and no category, and still knows its time', () => {
    const bars = chartBars(hourly(48, [5]), 480, 100);
    expect(nth(bars, 5).h).toBe(0);
    expect(nth(bars, 5).category).toBeNull();
    expect(nth(bars, 5).time).toBe('2026-11-20T19:00');
  });

  it('scales to at least 200, or to the highest AQI when that is larger', () => {
    const low = chartBars(hourly(2), 100, 100);
    expect(nth(low, 1).h).toBeCloseTo((23 / 200) * 100);
    const [first] = hourly(1);
    const high = chartBars([{ ...(first as AqiReading), aqi: 400 }], 100, 100);
    expect(nth(high, 0).h).toBe(100);
    expect(nth(high, 0).y).toBe(0);
  });

  it('puts bar bottoms on the baseline and honours an explicit maxAqi', () => {
    const bar = nth(chartBars(hourly(1), 100, 100, 100), 0);
    expect(bar.y + bar.h).toBeCloseTo(100);
    expect(bar.h).toBeCloseTo(20);
  });

  it('copes with no hours', () => {
    expect(chartBars([], 100, 100)).toEqual([]);
  });
});

describe('gridLines', () => {
  it('labels every category boundary up to 200 on an everyday scale', () => {
    expect(gridLines(200)).toEqual([50, 100, 150, 200]);
    expect(gridLines(238)).toEqual([50, 100, 150, 200]);
  });

  it('drops boundaries that would sit too close to label on a hazardous scale', () => {
    expect(gridLines(500)).toEqual([100, 200, 300, 500]);
    expect(gridLines(1047)).toEqual([150, 300, 500, 1000]);
  });

  it('never puts two lines closer than 12% of the scale', () => {
    for (let top = 200; top <= 2000; top += 37) {
      const lines = gridLines(top);
      lines.forEach((v, i) => expect((v - (lines[i - 1] ?? 0)) / top).toBeGreaterThanOrEqual(0.12));
    }
  });
});

describe('renderForecast', () => {
  let el: HTMLElement;
  beforeEach(() => {
    el = document.createElement('div');
    document.body.replaceChildren(el);
  });

  it('draws a labelled image that names the best and worst windows in words', () => {
    renderForecast(el, report());
    const svg = el.querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('viewBox')).toBeTruthy();
    expect(svg?.getAttribute('aria-label')).toContain(
      'Cleanest air Fri 16:00–18:00, worst Sat 20:00–22:00',
    );
    expect(svg?.hasAttribute('style')).toBe(false);
  });

  it('draws 48 bars coloured through data-category, with a tick label every 6 hours', () => {
    renderForecast(el, report());
    const bars = el.querySelectorAll('svg rect.chart__bar');
    expect(bars).toHaveLength(48);
    expect(nth(bars, 0).getAttribute('data-category')).toBe('good');
    const labels = [...el.querySelectorAll('.chart__tick-label')].map((n) => n.textContent);
    expect(labels).toHaveLength(8);
    expect(labels[0]).toContain('18:00');
    expect(labels.join(' ')).toContain('Sat');
  });

  it('keeps every piece of chart text out of the scaled SVG, as aria-hidden HTML', () => {
    renderForecast(el, report());
    expect(el.querySelector('svg text')).toBeNull();
    for (const sel of ['.chart__axis-label', '.chart__tick-label', '.chart__window-label']) {
      const nodes = el.querySelectorAll(sel);
      expect(nodes.length).toBeGreaterThan(0);
      for (const n of nodes) {
        expect(n.closest('svg')).toBeNull();
        expect(n.closest('[aria-hidden="true"]')).not.toBeNull();
      }
    }
  });

  it('widens the label column when the scale runs past 1000 (the AQI has no cap at 500)', () => {
    const smoggy = hourly().map((r, i) => (r && i === 10 ? { ...r, aqi: 1047 } : r));
    renderForecast(el, report({ hourly: smoggy }));
    const labels = [...el.querySelectorAll('.chart__axis-label')].map((n) => n.textContent);
    expect(labels).toEqual(['150', '300', '500', '1000']);
    expect(el.querySelector('.chart-wrap')?.classList.contains('chart-wrap--wide-axis')).toBe(true);

    renderForecast(el, report());
    expect(el.querySelector('.chart-wrap')?.classList.contains('chart-wrap--wide-axis')).toBe(
      false,
    );
  });

  it('keeps every tick label inside the chart whatever the start hour', () => {
    for (let startHour = 0; startHour < 24; startHour++) {
      const start = Date.UTC(2026, 10, 20, startHour);
      const [first] = hourly(1);
      const hours = Array.from({ length: 48 }, (_, i) => ({
        ...(first as AqiReading),
        time: wall(i, start),
      }));
      renderForecast(el, report({ hourly: hours, windows: [] }));
      const labels = [...el.querySelectorAll<HTMLElement>('.chart__tick-label')];
      expect(labels.length).toBeGreaterThanOrEqual(8);
      for (const label of labels) {
        const left = parseFloat(label.style.left);
        expect(left, `start ${startHour}`).toBeGreaterThanOrEqual(0);
        expect(left, `start ${startHour}`).toBeLessThanOrEqual(100);
        const anchor = left > 88 ? 'end' : left < 12 ? 'start' : 'middle';
        expect(label.getAttribute('data-anchor'), `start ${startHour} at ${left}%`).toBe(anchor);
      }
    }
  });

  it('marks the best and worst windows with text, not colour alone', () => {
    renderForecast(el, report());
    const labels = [...el.querySelectorAll('.chart__window-label')].map((n) => n.textContent);
    expect(labels).toEqual(['Cleanest', 'Worst']);
    const summary = el.querySelector('.forecast__windows')?.textContent ?? '';
    expect(summary).toContain('Cleanest air');
    expect(summary).toContain('Fri 16:00–18:00');
    expect(summary).toContain('Worst');
    expect(summary).toContain('Sat 20:00–22:00');
  });

  it('puts window labels at the window centre, stacking them when they would collide', () => {
    renderForecast(el, report());
    expect(el.querySelector('.chart-wrap--stacked')).toBeNull();
    renderForecast(
      el,
      report({
        windows: [
          { kind: 'best', start: wall(2), end: wall(4), meanAqi: 27 },
          { kind: 'worst', start: wall(6), end: wall(8), meanAqi: 90 },
        ],
      }),
    );
    expect(el.querySelector('.chart-wrap--stacked')).not.toBeNull();
  });

  it('omits window wording that has no data behind it', () => {
    renderForecast(el, report({ windows: [] }));
    expect(el.querySelector('svg')?.getAttribute('aria-label')).not.toMatch(/cleanest|worst/i);
    expect(el.querySelector('.forecast__windows')).toBeNull();
  });

  it('shows a gap marker for a missing hour, and "No data" in the table', () => {
    renderForecast(el, report({}, [7]));
    expect(el.querySelectorAll('svg rect.chart__bar')).toHaveLength(47);
    expect(el.querySelectorAll('svg rect.chart__gap')).toHaveLength(1);
    const rows = el.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(48);
    expect(nth(rows, 7).textContent).toContain('No data');
    expect(nth(rows, 7).textContent).toContain('21:00');
  });

  it('offers the table behind a toggle that reports its state', () => {
    renderForecast(el, report());
    const button = el.querySelector('button') as HTMLButtonElement;
    const table = el.querySelector('table') as HTMLTableElement;
    const panel = document.getElementById(button.getAttribute('aria-controls') ?? '');
    expect(panel?.contains(table)).toBe(true);
    expect(button.textContent).toBe('Show as table');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panel?.hidden).toBe(true);
    button.click();
    expect(button.textContent).toBe('Hide table');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(panel?.hidden).toBe(false);
    button.click();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panel?.hidden).toBe(true);
  });

  it('builds a real table: caption, Time/AQI/Category headers, 48 rows with text categories', () => {
    renderForecast(el, report());
    expect(el.querySelector('caption')?.textContent).toMatch(/48 hours/);
    const heads = [...el.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(heads).toEqual(['Time', 'AQI', 'Category']);
    const rows = el.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(48);
    expect(nth(rows, 0).textContent).toContain('Fri 14:00');
    expect(nth(rows, 0).textContent).toContain('20');
    expect(nth(rows, 0).textContent).toContain('Good');
    expect(nth(rows, 47).textContent).toContain('Unhealthy for sensitive groups');
  });

  it('lists the outlook per day with weekday, category text, a decorative swatch and max AQI', () => {
    renderForecast(el, report());
    const items = el.querySelectorAll('ul.outlook > li');
    expect(items).toHaveLength(2);
    expect(nth(items, 0).textContent).toContain('Friday');
    expect(nth(items, 0).textContent).toContain('Moderate');
    expect(nth(items, 0).textContent).toContain('60');
    expect(nth(items, 1).textContent).toContain('Saturday');
    expect(nth(items, 1).textContent).toContain('Unhealthy');
    const swatch = nth(items, 1).querySelector('.aqi-swatch');
    expect(swatch?.getAttribute('aria-hidden')).toBe('true');
    expect(swatch?.getAttribute('data-category')).toBe('unhealthy');
  });

  it('has no outlook list when there is no outlook', () => {
    renderForecast(el, report({ outlook: [] }));
    expect(el.querySelector('ul.outlook')).toBeNull();
  });

  it('says so instead of drawing an empty chart when there are no hours', () => {
    renderForecast(el, report({ hourly: [], windows: [], pm25: [] }));
    expect(el.querySelector('svg')).toBeNull();
    expect(el.textContent).toContain('No forecast');
  });

  it('replaces what was there before', () => {
    renderForecast(el, report());
    renderForecast(el, report());
    expect(el.querySelectorAll('svg')).toHaveLength(1);
    expect(el.querySelectorAll('button')).toHaveLength(1);
  });
});
