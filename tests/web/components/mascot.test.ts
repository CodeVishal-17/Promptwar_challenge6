import { describe, expect, it } from 'vitest';
import type { AirWindow, AqiCategory } from '../../../shared/types.js';
import {
  WELCOME_LINE,
  moodFor,
  puff,
  puffLine,
  puffSays,
  type Mood,
} from '../../../web/src/components/mascot.js';
import { makeReport, reading } from '../helpers.js';

const MOODS: Mood[] = [
  'good',
  'moderate',
  'usg',
  'unhealthy',
  'very_unhealthy',
  'hazardous',
  'none',
  'wave',
  'cheer',
];

const has = (svg: SVGSVGElement, selector: string): boolean => svg.querySelector(selector) !== null;
const count = (svg: SVGSVGElement, selector: string): number =>
  svg.querySelectorAll(selector).length;

/** A report read at 14:00 local on 2026-11-20 in `category`, with an AQI to match. */
function reportIn(category: AqiCategory, aqi = 162, windows: AirWindow[] = []) {
  return makeReport({ now: reading(14, aqi, { category }), windows });
}

const best = (start: string, meanAqi: number): AirWindow => ({
  kind: 'best',
  start,
  end: start,
  meanAqi,
});

describe('moodFor', () => {
  it('follows the current category', () => {
    expect(moodFor(reportIn('usg'))).toBe('usg');
  });

  it('is sleepy when there is no reading', () => {
    expect(moodFor(makeReport({ now: null }))).toBe('none');
  });
});

describe('puff', () => {
  it.each(MOODS)('%s: a decorative svg with two eyes', (mood) => {
    const svg = puff(mood);
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
    expect(svg.getAttribute('data-mood')).toBe(mood);
    expect(svg.getAttribute('class')).toBe('puff puff--lg');
    expect(count(svg, '.puff__eye')).toBe(2);
    expect(count(svg, '.puff__cheek')).toBe(2);
  });

  it('comes in a small size', () => {
    expect(puff('wave', 'sm').getAttribute('class')).toBe('puff puff--sm');
  });

  it('good: grins with sparkles and no mask', () => {
    const svg = puff('good');
    expect(has(svg, '.puff__sparkle')).toBe(true);
    expect(has(svg, '.puff__mouth[data-shape="grin"]')).toBe(true);
    expect(has(svg, '.puff__mask')).toBe(false);
  });

  it('moderate: smiles', () => {
    expect(has(puff('moderate'), '.puff__mouth[data-shape="smile"]')).toBe(true);
  });

  it('usg: smiles with a mask around the chin', () => {
    const svg = puff('usg');
    expect(has(svg, '.puff__mask[data-pos="chin"]')).toBe(true);
    expect(has(svg, '.puff__mouth')).toBe(true);
  });

  it('unhealthy: mask on, no mouth, no house', () => {
    const svg = puff('unhealthy');
    expect(has(svg, '.puff__mask[data-pos="on"]')).toBe(true);
    expect(has(svg, '.puff__mouth')).toBe(false);
    expect(has(svg, '.puff__house')).toBe(false);
  });

  it('very unhealthy: mask on, with a house beside him', () => {
    const svg = puff('very_unhealthy');
    expect(has(svg, '.puff__mask[data-pos="on"]')).toBe(true);
    expect(has(svg, '.puff__house')).toBe(true);
    expect(has(svg, '.puff__brow')).toBe(false);
  });

  it('hazardous: mask on, house and gentle concerned brows', () => {
    const svg = puff('hazardous');
    expect(has(svg, '.puff__mask[data-pos="on"]')).toBe(true);
    expect(has(svg, '.puff__house')).toBe(true);
    expect(count(svg, '.puff__brow')).toBe(2);
  });

  it('none: sleepy eyes and a z', () => {
    const svg = puff('none');
    expect(count(svg, '.puff__eye--sleepy')).toBe(2);
    expect(has(svg, '.puff__z')).toBe(true);
  });

  it('wave: an arm up', () => {
    expect(has(puff('wave'), '.puff__arm')).toBe(true);
  });

  it('cheer: arms up and sparkles', () => {
    const svg = puff('cheer');
    expect(has(svg, '.puff__arm')).toBe(true);
    expect(has(svg, '.puff__sparkle')).toBe(true);
  });

  it.each(['unhealthy', 'very_unhealthy', 'hazardous'] as const)(
    '%s: never looks happy about the air (no sparkles, no grin)',
    (mood) => {
      const svg = puff(mood);
      expect(has(svg, '.puff__sparkle')).toBe(false);
      expect(has(svg, '.puff__mouth[data-shape="grin"]')).toBe(false);
    },
  );

  it('builds only SVG elements, with no style attributes', () => {
    const svg = puff('hazardous');
    for (const el of [svg, ...svg.querySelectorAll('*')]) {
      expect(el.namespaceURI).toBe('http://www.w3.org/2000/svg');
      expect(el.hasAttribute('style')).toBe(false);
    }
  });
});

describe('puffLine', () => {
  it.each([
    ['good', 'Lovely air today! A great day to walk or cycle.', '🚲'],
    ['moderate', 'Pretty good air today. Most people can enjoy being outside.', '☀️'],
    ['usg', 'Okay for most people, but go easy if anyone at home is sensitive.', '🙂'],
    ['unhealthy', 'Rough air today, so keep outdoor effort light.', '💪'],
    ['very_unhealthy', "Very unhealthy air. It's an indoors day: windows shut, purifier on.", '🏠'],
    ['hazardous', 'Hazardous air. Please stay indoors and keep windows closed.', '🏠'],
  ] as const)('%s, with no cleaner window', (category, text, emoji) => {
    expect(puffLine(reportIn(category))).toEqual({ text, emoji });
  });

  it('no reading', () => {
    expect(puffLine(makeReport({ now: null }))).toEqual({
      text: "I can't get a reading for this hour. Check back soon.",
      emoji: '💤',
    });
  });

  it('points to a cleaner spell later today', () => {
    const report = reportIn('unhealthy', 162, [best('2026-11-20T16:00', 90)]);
    expect(puffLine(report).text).toBe(
      'Rough air today, but I found you a cleaner spell at 16:00.',
    );
  });

  it('says tomorrow when the cleaner spell is on the next day', () => {
    const report = reportIn('unhealthy', 162, [best('2026-11-21T07:00', 90)]);
    expect(puffLine(report).text).toBe(
      'Rough air today, but I found you a cleaner spell tomorrow at 07:00.',
    );
  });

  it('names the weekday when the cleaner spell is two days away', () => {
    const report = reportIn('unhealthy', 162, [best('2026-11-22T06:00', 90)]);
    expect(puffLine(report).text).toBe(
      'Rough air today, but I found you a cleaner spell on Sunday at 06:00.',
    );
  });

  it('ignores a "best" window that is not cleaner than now', () => {
    const report = reportIn('unhealthy', 162, [best('2026-11-20T16:00', 170)]);
    expect(puffLine(report).text).toBe('Rough air today, so keep outdoor effort light.');
  });

  it('ignores a worst window', () => {
    const report = reportIn('unhealthy', 162, [{ ...best('2026-11-20T16:00', 90), kind: 'worst' }]);
    expect(puffLine(report).text).toBe('Rough air today, so keep outdoor effort light.');
  });

  it('moderate and usg mention the cleanest time', () => {
    const window = [best('2026-11-20T16:00', 40)];
    expect(puffLine(reportIn('moderate', 70, window)).text).toBe(
      "Pretty good air today, and it's cleanest at 16:00.",
    );
    expect(puffLine(reportIn('usg', 120, window)).text).toBe(
      'Okay for most people, but go easy if anyone at home is sensitive. Cleanest at 16:00.',
    );
  });

  it.each(['good', 'very_unhealthy', 'hazardous'] as const)(
    '%s keeps its plain line even with a cleaner window',
    (category) => {
      const report = reportIn(category, 350, [best('2026-11-20T16:00', 20)]);
      expect(puffLine(report).text).toBe(puffLine(reportIn(category)).text);
    },
  );

  it('has a welcome line for before a place is chosen', () => {
    expect(WELCOME_LINE).toEqual({
      text: "Hi, I'm Puff! Tell me where you are and I'll check the air for you.",
      emoji: '👋',
    });
  });
});

describe('puffSays', () => {
  it('pairs Puff with a speech bubble of real text and a hidden emoji', () => {
    const el = puffSays('good', { text: 'Lovely air!', emoji: '🚲' });
    expect(el.className).toBe('puff-says');
    expect(el.querySelector('svg.puff')?.getAttribute('data-mood')).toBe('good');
    const bubble = el.querySelector('.puff-says__bubble');
    expect(bubble?.tagName).toBe('P');
    expect(bubble?.firstChild?.textContent).toBe('Lovely air!');
    const emoji = bubble?.querySelector('span');
    expect(emoji?.getAttribute('aria-hidden')).toBe('true');
    expect(emoji?.textContent).toBe('🚲');
  });

  it('passes the size through', () => {
    const el = puffSays('wave', WELCOME_LINE, 'sm');
    expect(el.querySelector('svg')?.getAttribute('class')).toBe('puff puff--sm');
  });
});
