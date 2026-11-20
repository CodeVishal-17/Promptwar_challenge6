import { beforeEach, describe, expect, it } from 'vitest';
import { renderMethod } from '../../../web/src/components/method.js';

let el: HTMLElement;
beforeEach(() => {
  el = document.createElement('div');
  document.body.replaceChildren(el);
  renderMethod(el);
});

describe('renderMethod', () => {
  it('covers data, the AQI method, the numbers rule, sources and limits under headings', () => {
    expect([...el.querySelectorAll('h3')].map((h) => h.textContent)).toEqual([
      'Where the data comes from',
      'How we work out the AQI',
      'Numbers from code, words from AI',
      'Sources',
      'Limits',
    ]);
  });

  it('states the averaging and the scale', () => {
    const text = el.textContent ?? '';
    expect(text).toContain('NowCast');
    expect(text).toContain('last 12 hours');
    expect(text).not.toContain('24-hour average');
    expect(text).toContain('8-hour');
    expect(text).toContain('0 to 500');
    expect(text).toContain('cleanest daytime hours');
  });

  it('lists every source the numbers rely on, each as a safe https link', () => {
    const links = [...el.querySelectorAll('.method__sources a')];
    const text = links.map((a) => a.textContent).join(' | ');
    for (const name of [
      'Open-Meteo',
      'Copernicus',
      'Technical Assistance Document',
      'Conversion Factors 2026',
      'Our World in Data',
      'Exposure Factors Handbook',
      'Xiang et al.',
      'Guide to Air Cleaners',
      'Air Quality Guide for Particle Pollution',
    ]) {
      expect(text, name).toContain(name);
    }
    for (const a of links) {
      expect(a.getAttribute('href')).toMatch(/^https:\/\//);
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    }
  });

  it('is idempotent', () => {
    renderMethod(el);
    expect(el.querySelectorAll('h3')).toHaveLength(5);
  });
});
