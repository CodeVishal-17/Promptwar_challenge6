// @vitest-environment jsdom
import axe from 'axe-core';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AirReport, AqiReading, Place } from '../../shared/types.js';
import { boot } from '../../web/src/main.js';
import { markOnboardingSeen, savePlace } from '../../web/src/store.js';
import html from '../../web/index.html?raw';
import { PLACE, makePlan, makeReport } from './helpers.js';

/** The WCAG 2.0, 2.1 and 2.2 A/AA rule sets. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

/**
 * Rules that need a real layout engine. jsdom does no layout or painting, so these cannot be
 * judged here; both are checked in a real browser instead (see README, "Accessibility").
 */
const NEEDS_LAYOUT = {
  // Needs computed, painted foreground and background colours.
  'color-contrast': { enabled: false },
  // Needs each control's rendered size and position (getBoundingClientRect is all zeros).
  'target-size': { enabled: false },
};

/** Loads the real page shell into jsdom without parsing HTML through innerHTML. */
function loadShell(): void {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  document.documentElement.lang = doc.documentElement.lang;
  document.body.replaceChildren(
    ...[...doc.body.childNodes].map((n) => document.importNode(n, true)),
  );
}

const START = Date.UTC(2026, 10, 20, 14);
const wall = (i: number): string => new Date(START + i * 3_600_000).toISOString().slice(0, 16);

/** A full 48-hour report with best and worst windows and a three-day outlook. */
function fullReport(): AirReport {
  const hourly: AqiReading[] = Array.from({ length: 48 }, (_, i) => {
    const aqi = 60 + ((i * 37) % 140);
    return {
      time: wall(i),
      aqi,
      category: aqi <= 100 ? 'moderate' : aqi <= 150 ? 'usg' : 'unhealthy',
      dominant: 'pm2_5',
      perPollutant: { pm2_5: aqi },
    };
  });
  return makeReport({
    now: hourly[0] ?? null,
    hourly,
    pm25: hourly.map((r) => r.aqi / 2),
    windows: [
      { kind: 'best', start: wall(4), end: wall(6), meanAqi: 70 },
      { kind: 'worst', start: wall(20), end: wall(22), meanAqi: 190 },
    ],
    outlook: [
      { date: '2026-11-20', maxAqi: 199, category: 'unhealthy' },
      { date: '2026-11-21', maxAqi: 180, category: 'unhealthy' },
      { date: '2026-11-22', maxAqi: 95, category: 'moderate' },
    ],
  });
}

const api = {
  getAir: async () => fullReport(),
  getPlan: async () => makePlan(),
  searchPlaces: async (): Promise<Place[]> => [PLACE],
  ask: async () => ({ answer: 'Go out after 18:00, when the air is cleaner.', aiUsed: false }),
};

async function violations(): Promise<string[]> {
  const result = await axe.run(document, {
    runOnly: { type: 'tag', values: TAGS },
    rules: NEEDS_LAYOUT,
  });
  return result.violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`,
  );
}

const click = (selector: string): void => {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`Missing ${selector}`);
  el.click();
};
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  localStorage.clear();
  document.title = 'Clearday';
  loadShell();
});

// axe walks the whole page several times per test; jsdom makes that slow on modest machines.
describe('accessibility (axe-core, WCAG 2.2 A and AA)', { timeout: 30_000 }, () => {
  it('has no violations on first load, before a place is chosen', async () => {
    markOnboardingSeen();
    await boot({ api });
    expect(await violations()).toEqual([]);
  });

  it('has no violations with the air report, chart, table and plan on screen', async () => {
    markOnboardingSeen();
    savePlace(PLACE);
    await boot({ api });
    expect(document.querySelector('.aqi-number')).not.toBeNull();
    expect(document.querySelector('#plan-body .impact-chip')).not.toBeNull();
    click('#forecast-body button[aria-controls]');
    expect(await violations()).toEqual([]);
  });

  it('has no violations with an impact panel open', async () => {
    markOnboardingSeen();
    savePlace(PLACE);
    await boot({ api });
    click('#plan-body .impact-chip');
    expect(document.querySelector('.impact-panel:not([hidden])')).not.toBeNull();
    expect(await violations()).toEqual([]);
  });

  it('has no violations with the household dialog open, on every step', async () => {
    markOnboardingSeen();
    savePlace(PLACE);
    await boot({ api });
    click('#edit-profile');
    const dialog = document.querySelector('dialog');
    expect(dialog?.hasAttribute('open')).toBe(true);
    for (let step = 0; step < 3; step++) {
      expect(await violations(), `step ${step + 1}`).toEqual([]);
      dialog?.querySelector<HTMLButtonElement>('button[type="submit"]:not([hidden])')?.click();
    }
  });

  it('has no violations in the first-visit setup dialog', async () => {
    savePlace(PLACE);
    await boot({ api });
    expect(document.querySelector('dialog[open]')).not.toBeNull();
    expect(await violations()).toEqual([]);
  });

  it('has no violations with an answer in the Q&A panel', async () => {
    markOnboardingSeen();
    savePlace(PLACE);
    await boot({ api });
    const question = document.querySelector<HTMLTextAreaElement>('#ask-body textarea');
    if (!question) throw new Error('Missing question box');
    question.value = 'When should we go for a walk?';
    question.dispatchEvent(new Event('input'));
    click('#ask-body button[type="submit"]');
    await flush();
    expect(document.querySelector('#ask-body .ask__note')).not.toBeNull();
    expect(await violations()).toEqual([]);
  });
});
