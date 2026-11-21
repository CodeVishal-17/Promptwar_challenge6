import { describe, expect, it } from 'vitest';
import html from '../../web/index.html?raw';

const doc = new DOMParser().parseFromString(html, 'text/html');

describe('index.html', () => {
  it('declares the language and a responsive viewport', () => {
    expect(doc.documentElement.getAttribute('lang')).toBe('en');
    expect(doc.querySelector('meta[name="viewport"]')?.getAttribute('content')).toContain(
      'width=device-width',
    );
    expect(doc.title).toContain('Clearday');
  });

  it('starts with a skip link to #main', () => {
    const first = doc.body.querySelector('a');
    expect(first?.getAttribute('href')).toBe('#main');
    expect(doc.getElementById('main')?.tagName).toBe('MAIN');
  });

  it('has header, main navigation, main and footer landmarks', () => {
    expect(doc.querySelectorAll('header.site-header')).toHaveLength(1);
    expect(doc.querySelectorAll('nav[aria-label="Main"]')).toHaveLength(1);
    expect(doc.querySelectorAll('main')).toHaveLength(1);
    expect(doc.querySelectorAll('footer')).toHaveLength(1);
  });

  it('has five screens; only Today shows before the router runs', () => {
    const screens = [...doc.querySelectorAll('main > .screen')];
    expect(screens.map((s) => s.id)).toEqual([
      'screen-today',
      'screen-forecast',
      'screen-plan',
      'screen-ask',
      'screen-about',
    ]);
    expect(screens.filter((s) => !s.hasAttribute('hidden')).map((s) => s.id)).toEqual([
      'screen-today',
    ]);
  });

  it('gives each screen exactly one h1 that can take focus', () => {
    for (const screen of doc.querySelectorAll('.screen')) {
      const headings = screen.querySelectorAll('h1');
      expect(headings, screen.id).toHaveLength(1);
      expect(headings[0]?.getAttribute('tabindex'), screen.id).toBe('-1');
    }
  });

  it('links the main navigation to the four screens, with visible labels', () => {
    const links = [...doc.querySelectorAll('nav[aria-label="Main"] a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '#/today',
      '#/forecast',
      '#/plan',
      '#/ask',
    ]);
    expect(links.map((a) => a.getAttribute('data-route'))).toEqual([
      'today',
      'forecast',
      'plan',
      'ask',
    ]);
    expect(links.map((a) => a.textContent?.trim())).toEqual([
      'Today',
      'Forecast',
      'My plan',
      'Ask',
    ]);
    for (const svg of doc.querySelectorAll('nav svg'))
      expect(svg.getAttribute('aria-hidden')).toBe('true');
  });

  it('links "How it works" from the header and the footer', () => {
    for (const where of ['header', 'footer']) {
      const link = doc.querySelector(`${where} a[href="#/about"]`);
      expect(link?.getAttribute('data-route'), where).toBe('about');
      expect(link?.textContent, where).toContain('How it works');
    }
  });

  it('has the content sections, each labelled by an existing heading', () => {
    for (const id of ['now', 'forecast', 'plan', 'ask', 'method']) {
      const section = doc.getElementById(id);
      expect(section?.tagName, id).toBe('SECTION');
      const heading = doc.getElementById(section?.getAttribute('aria-labelledby') ?? '');
      expect(heading?.tagName, id).toMatch(/^H[12]$/);
    }
  });

  it('has an empty-state slot on each screen that needs a place', () => {
    for (const id of ['forecast-empty', 'plan-empty', 'ask-empty']) {
      expect(doc.getElementById(id)?.classList.contains('screen-empty'), id).toBe(true);
    }
  });

  it('wires the place pill and Change place to the search panel', () => {
    for (const id of ['place-pill', 'change-place']) {
      const button = doc.getElementById(id);
      expect(button?.tagName, id).toBe('BUTTON');
      expect(button?.getAttribute('type'), id).toBe('button');
      expect(button?.getAttribute('aria-controls'), id).toBe('search-panel');
      expect(button?.getAttribute('aria-expanded'), id).toBe('false');
      expect(button?.hasAttribute('hidden'), id).toBe(true);
    }
    expect(doc.querySelector('#search-panel #location-search')).not.toBeNull();
  });

  it('has exactly one polite live status region', () => {
    const regions = doc.querySelectorAll('[aria-live]');
    expect(regions).toHaveLength(1);
    expect(regions[0]?.id).toBe('status');
    expect(regions[0]?.getAttribute('aria-live')).toBe('polite');
  });

  it('explains itself when JavaScript is off', () => {
    expect(doc.querySelector('noscript')?.textContent).toMatch(/JavaScript/);
  });

  it('credits the data source and says it is not medical advice', () => {
    const footer = doc.querySelector('footer')?.textContent ?? '';
    expect(footer).toContain('Open-Meteo');
    expect(footer).toContain('CAMS');
    expect(footer).toContain('Not medical advice');
  });

  it('has nothing the CSP would block: no inline script, style element or style attribute', () => {
    const scripts = [...doc.querySelectorAll('script')];
    expect(scripts.every((s) => s.getAttribute('src') && !s.textContent?.trim())).toBe(true);
    expect(doc.querySelectorAll('style')).toHaveLength(0);
    expect(doc.querySelectorAll('[style]')).toHaveLength(0);
    expect(html).not.toMatch(/\son[a-z]+=/i);
  });
});
