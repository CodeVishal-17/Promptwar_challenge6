import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../web/src/styles/components.css', import.meta.url), 'utf8');

describe('forecast chart text size', () => {
  it('uses the type scale, never a hard-coded size below 12px', () => {
    expect(css.length).toBeGreaterThan(0);
    expect(css).not.toMatch(/font-size:\s*1[01]px/);
    const rule = /\.chart__axis-label[^{]*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(rule).toMatch(/font-size:\s*var\(--text-(xs|sm|base)\)/);
  });
});

describe('forecast chart bars', () => {
  const tokens = readFileSync(new URL('../../web/src/styles/tokens.css', import.meta.url), 'utf8');
  const lightToken = (name: string): string =>
    new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(tokens)?.[1] ?? '';
  const luminance = (hex: string): number => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string): number => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
  };

  it('outlines every bar with a neutral 1px stroke that stays thin when the SVG stretches', () => {
    const rule = /\.chart__bar\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(rule).toMatch(/stroke:\s*var\(--color-border-strong\)/);
    expect(rule).toMatch(/stroke-width:\s*1(px)?;/);
    expect(rule).toMatch(/vector-effect:\s*non-scaling-stroke/);
  });

  it('outlines in a colour with 3:1 on the light surface, where Good and Moderate fills fall short (WCAG 1.4.11)', () => {
    const surface = lightToken('--color-surface');
    expect(contrast(lightToken('--aqi-good'), surface)).toBeLessThan(3);
    expect(contrast(lightToken('--aqi-moderate'), surface)).toBeLessThan(3);
    expect(contrast(lightToken('--color-border-strong'), surface)).toBeGreaterThanOrEqual(3);
  });
});
