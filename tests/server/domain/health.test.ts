import { describe, expect, it } from 'vitest';
import { healthGuidance } from '../../../server/src/domain/health.js';
import type { AqiCategory } from '../../../shared/types.js';

const CATEGORIES: AqiCategory[] = [
  'good',
  'moderate',
  'usg',
  'unhealthy',
  'very_unhealthy',
  'hazardous',
];

describe('healthGuidance', () => {
  it('gives advice for unhealthy air to sensitive people, sourced from airnow.gov', () => {
    const g = healthGuidance('unhealthy', true);
    expect(g.advice.length).toBeGreaterThan(0);
    expect(new URL(g.source.url).hostname).toBe('www.airnow.gov');
    expect(g.sensitive).toBe(true);
    expect(g.category).toBe('unhealthy');
  });

  it.each(CATEGORIES)('has a headline and advice for %s, sensitive or not', (c) => {
    for (const sensitive of [true, false]) {
      const g = healthGuidance(c, sensitive);
      expect(g.headline.length).toBeGreaterThan(0);
      expect(g.advice.length).toBeGreaterThan(0);
      expect(g.advice.every((a) => a.length > 0)).toBe(true);
    }
  });

  it('tells sensitive people more than everyone else when the air is unhealthy for them', () => {
    const sensitive = healthGuidance('usg', true).advice;
    const everyone = healthGuidance('usg', false).advice;
    expect(sensitive.length).toBeGreaterThan(everyone.length);
  });

  it('tells everyone to avoid outdoor exercise when hazardous', () => {
    const text = healthGuidance('hazardous', false).advice.join(' ').toLowerCase();
    expect(text).toContain('outdoors');
  });

  it('uses digits nowhere in its copy', () => {
    for (const c of CATEGORIES) {
      const g = healthGuidance(c, true);
      expect(`${g.headline} ${g.advice.join(' ')}`).not.toMatch(/\d/);
    }
  });
});
