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
