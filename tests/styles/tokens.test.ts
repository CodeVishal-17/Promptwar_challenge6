import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/** Vitest stubs CSS imports (even `?raw`), so the stylesheets are read from disk. */
const css = (name: string): string => readFileSync(`web/src/styles/${name}`, 'utf8');
const tokens = css('tokens.css');
const fonts = css('fonts.css');

describe('design tokens', () => {
  it('uses the Sky Pals palette', () => {
    for (const v of [
      '#8fd8ff',
      '#bfeaff',
      '#fff6e3',
      '#1b2a33',
      '#4f5d68',
      '#0e7490',
      '#ffd166',
      '#e0f2fe',
      '#dcfce7',
      '#fef3c7',
      '#ffe4d6',
      '#ede9fe',
    ])
      expect(tokens.toLowerCase()).toContain(v);
    expect(tokens).not.toMatch(/--band-/);
  });

  it('puts Nunito first in the font stack', () => {
    expect(tokens).toMatch(/--font-sans:\s*'Nunito',/);
  });
});

describe('fonts', () => {
  it('self-hosts Nunito with swap and a Latin range', () => {
    expect(fonts).toMatch(/font-family:\s*'Nunito'/);
    expect(fonts).toMatch(/font-display:\s*swap/);
    expect(fonts).toMatch(/url\('\.\.\/assets\/fonts\/nunito-latin-wght-normal\.woff2'\)/);
    expect(fonts).toMatch(/unicode-range:/);
    expect(fonts).not.toMatch(/https?:/);
  });
});

describe('sky tint', () => {
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

  it('keeps body text at least 4.5:1 on every sky colour', () => {
    const shell = css('shell.css');
    const skies = [...`${tokens}\n${shell}`.matchAll(/--sky-(?:top|mid):\s*(#[0-9a-f]{6})/gi)].map(
      (m) => m[1] as string,
    );
    expect(skies.length).toBeGreaterThanOrEqual(14);
    for (const sky of skies) expect(contrast('#1b2a33', sky), sky).toBeGreaterThanOrEqual(4.5);
  });
});

describe('Use my location', () => {
  it('stays a sunny button with dark text, above the secondary button style', () => {
    const rule = /\.search-panel \.locate-button\s*\{[^}]*\}/.exec(css('shell.css'))?.[0] ?? '';
    expect(rule).toMatch(/background:\s*var\(--color-sun\)/);
    expect(rule).toMatch(/color:\s*var\(--color-text\)/);
  });
});
