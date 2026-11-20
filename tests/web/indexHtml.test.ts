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

  it('has header, main and footer landmarks and one h1', () => {
    expect(doc.querySelectorAll('header.site-header')).toHaveLength(1);
    expect(doc.querySelectorAll('main')).toHaveLength(1);
    expect(doc.querySelectorAll('footer')).toHaveLength(1);
    expect(doc.querySelectorAll('h1')).toHaveLength(1);
  });

  it('has the page sections, each labelled by its heading', () => {
    for (const id of ['now', 'forecast', 'plan', 'ask', 'method']) {
      const section = doc.getElementById(id);
      expect(section?.tagName, id).toBe('SECTION');
      const heading = doc.getElementById(section?.getAttribute('aria-labelledby') ?? '');
      expect(heading?.tagName, id).toBe('H2');
    }
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
