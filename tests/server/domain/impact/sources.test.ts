import { describe, expect, it } from 'vitest';
import * as sources from '../../../../server/src/domain/impact/sources.js';
import {
  formatKg,
  formatPercentChange,
  roundPercent,
} from '../../../../server/src/domain/impact/format.js';
import type { Source } from '../../../../shared/types.js';

const isSource = (v: unknown): v is Source =>
  typeof v === 'object' && v !== null && 'url' in v && 'title' in v && 'year' in v;

describe('impact sources', () => {
  const exported = Object.values(sources).filter(isSource);

  it('exports the cited sources', () => {
    expect(exported.length).toBeGreaterThanOrEqual(5);
    expect(sources.IMPACT_SOURCES).toEqual(expect.arrayContaining(exported));
  });

  it('gives every source an https url, a title and a year ≥ 2011', () => {
    for (const s of sources.IMPACT_SOURCES) {
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.title.length).toBeGreaterThan(10);
      expect(s.year).toBeGreaterThanOrEqual(2011);
      expect(Number.isInteger(s.year)).toBe(true);
    }
  });
});

describe('format helpers', () => {
  it('rounds kg to 2 significant figures from 100 up, 1 decimal below', () => {
    expect(formatKg(954.546)).toBe('950');
    expect(formatKg(1180)).toBe('1,200');
    expect(formatKg(12_345)).toBe('12,000');
    expect(formatKg(100)).toBe('100');
    expect(formatKg(99.96)).toBe('100');
    expect(formatKg(47.727)).toBe('47.7');
    expect(formatKg(0.04)).toBe('<0.1');
  });

  it('formats percentage changes with a typographic minus', () => {
    expect(formatPercentChange(-79)).toBe('−79%');
    expect(formatPercentChange(25)).toBe('+25%');
    expect(formatPercentChange(0)).toBe('0%');
  });

  it('rounds percentages half away from zero', () => {
    expect(roundPercent(-62.5)).toBe(-63);
    expect(roundPercent(62.5)).toBe(63);
    expect(roundPercent(-0.4)).toBe(0);
    expect(Object.is(roundPercent(-0.4), -0)).toBe(false);
  });
});
