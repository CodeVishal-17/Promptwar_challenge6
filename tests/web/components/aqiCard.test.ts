import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  renderAqiCard,
  renderAqiError,
  renderAqiSkeleton,
  scalePosition,
} from '../../../web/src/components/aqiCard.js';
import { PLACE, makeReport, reading } from '../helpers.js';

let el: HTMLElement;
beforeEach(() => {
  el = document.createElement('div');
  document.body.replaceChildren(el);
});

describe('renderAqiCard', () => {
  it('shows the AQI number, category label, main pollutant, source and modelled update time', () => {
    renderAqiCard(el, makeReport(), PLACE);
    const text = el.textContent ?? '';
    expect(el.querySelector('.aqi-number')?.textContent).toBe('162');
    expect(text).toContain('Unhealthy');
    expect(text).toContain('PM2.5');
    expect(text).toContain('Open-Meteo Air Quality API (CAMS)');
    expect(text).toMatch(/modelled · updated 14:07/);
    expect(text).toContain('São Paulo, Brazil');
    expect(text).toContain('14:00');
  });

  it('marks the colour swatch decorative and names the category in data-category', () => {
    renderAqiCard(el, makeReport(), PLACE);
    const swatch = el.querySelector('.aqi-swatch');
    expect(swatch?.getAttribute('aria-hidden')).toBe('true');
    expect(swatch?.getAttribute('data-category')).toBe('unhealthy');
  });

  it('links the source in a new tab safely and says so', () => {
    renderAqiCard(el, makeReport(), PLACE);
    const link = el.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://open-meteo.com/en/docs/air-quality-api');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.textContent).toContain('(opens in new tab)');
  });

  it('shows the summary as text when there is one', () => {
    renderAqiCard(el, makeReport(), PLACE, '<img src=x onerror=alert(1)> Stay in');
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('<img src=x onerror=alert(1)> Stay in');
  });

  it('says "No data for this hour" when there is no current reading', () => {
    renderAqiCard(el, makeReport({ now: null }), PLACE);
    expect(el.textContent).toContain('No data for this hour');
    expect(el.querySelector('.aqi-number')).toBeNull();
    expect(el.textContent).not.toMatch(/\b0\b/);
  });

  it('replaces whatever was there before', () => {
    renderAqiCard(el, makeReport(), PLACE);
    renderAqiCard(el, makeReport(), PLACE);
    expect(el.querySelectorAll('.aqi-number')).toHaveLength(1);
  });

  it('names the dominant pollutant when it is ozone', () => {
    const now = reading(14, 120, { category: 'usg', dominant: 'o3' });
    renderAqiCard(el, makeReport({ now }), PLACE);
    expect(el.textContent).toContain('Ozone');
    expect(el.textContent).toContain('Unhealthy for sensitive groups');
  });
});

describe('scalePosition', () => {
  it('places each category in its own sixth of the scale', () => {
    expect(scalePosition(0, 'good')).toBe(0);
    expect(scalePosition(50, 'good')).toBeCloseTo(1 / 6);
    expect(scalePosition(100, 'moderate')).toBeCloseTo(2 / 6);
    expect(scalePosition(175, 'unhealthy')).toBeCloseTo(3.5 / 6);
    expect(scalePosition(400, 'hazardous')).toBeCloseTo(5.5 / 6);
  });

  it('stops at the end of the scale beyond 500', () => {
    expect(scalePosition(812, 'hazardous')).toBe(1);
  });
});

describe('loading and error states', () => {
  it('renders a skeleton marked busy', () => {
    renderAqiSkeleton(el);
    expect(el.getAttribute('aria-busy')).toBe('true');
    expect(el.querySelector('.skeleton')).not.toBeNull();
    renderAqiCard(el, makeReport(), PLACE);
    expect(el.hasAttribute('aria-busy')).toBe(false);
  });

  it('renders an error with a Retry button and clears busy', () => {
    const onRetry = vi.fn();
    renderAqiSkeleton(el);
    renderAqiError(el, 'The air-quality service is not responding.', onRetry);
    expect(el.hasAttribute('aria-busy')).toBe(false);
    expect(el.textContent).toContain('The air-quality service is not responding.');
    const button = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Retry');
    button?.click();
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
