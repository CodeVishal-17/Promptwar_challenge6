import type { AirReport, AqiCategory } from '../../../shared/types.js';
import { h } from '../dom.js';
import { CATEGORY_LABEL, formatLocalTime, weekday } from '../format.js';
import { hourTimes } from './chartScale.js';

/** The chart's text alternatives: the hour-by-hour table and the coming-days outlook. */

function swatch(category: AqiCategory | null): HTMLElement {
  return h('span', {
    class: 'aqi-swatch',
    'data-category': category ?? 'none',
    'aria-hidden': 'true',
  });
}

export const TABLE_ID = 'forecast-table-panel';

export function buildTable(report: AirReport): HTMLElement {
  const times = hourTimes(report.hourly);
  const rows = report.hourly.map((r, i) => {
    const t = times[i];
    const when = t ? `${weekday(t.slice(0, 10), 'short')} ${formatLocalTime(t)}` : '—';
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

export function buildOutlook(report: AirReport): HTMLElement | null {
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
