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
