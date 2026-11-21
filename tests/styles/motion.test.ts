import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Vitest stubs CSS imports (even `?raw`), so the stylesheets are read from disk. */
const css = (name: string): string =>
  readFileSync(`web/src/styles/${name}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const NO_PREFERENCE = '@media (prefers-reduced-motion: no-preference)';

/** The CSS outside every `prefers-reduced-motion: no-preference` block. */
function outsideNoPreference(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const at = text.indexOf(NO_PREFERENCE, i);
    if (at < 0) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, at);
    let depth = 0;
    let j = text.indexOf('{', at);
    for (; j < text.length; j++) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}' && --depth === 0) break;
    }
    i = j + 1;
  }
  return out;
}

describe('motion', () => {
  it('motion.css is one no-preference block and nothing else', () => {
    const text = css('motion.css').trim();
    expect(text.startsWith(`${NO_PREFERENCE} {`)).toBe(true);
    expect(outsideNoPreference(text).trim()).toBe('');
  });

  it.each(['shell.css', 'components.css'])(
    '%s animates only spinners and skeletons outside a no-preference block',
    (file) => {
      const rest = outsideNoPreference(css(file));
      const animations = [...rest.matchAll(/animation:\s*([\w-]+)/g)].map((m) => m[1]);
      expect(animations.every((name) => name === 'spin' || name === 'shimmer')).toBe(true);
      const keyframes = [...rest.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
      expect(keyframes.every((name) => name === 'spin' || name === 'shimmer')).toBe(true);
    },
  );

  it('base.css still cuts every animation and transition for reduced motion', () => {
    const base = css('base.css');
    const block = base.slice(base.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(block).toMatch(/animation-duration:\s*0\.01ms !important/);
    expect(block).toMatch(/animation-iteration-count:\s*1 !important/);
    expect(block).toMatch(/transition-duration:\s*0\.01ms !important/);
  });

  it('defines the screen, float, blink and pop-in animations', () => {
    const motion = css('motion.css');
    for (const name of ['screen-in', 'puff-float', 'puff-blink', 'pop-in']) {
      expect(motion, name).toMatch(new RegExp(`@keyframes ${name}\\b`));
    }
    expect(motion).toMatch(/\.screen:not\(\[hidden\]\)\s*\{[^}]*animation:\s*screen-in 200ms/);
    expect(motion).toMatch(/\.puff\s*\{[^}]*animation:\s*puff-float 3\.2s/);
    expect(motion).toMatch(/\.puff__eye\s*\{[^}]*animation:\s*puff-blink 4s/);
  });

  it('blinks at most once every 4 s: the eyes close only between 92% and 100%', () => {
    const motion = css('motion.css');
    const blink = /@keyframes puff-blink\s*\{([\s\S]*?\})\s*\}/.exec(motion)?.[1] ?? '';
    const closed = [...blink.matchAll(/([\d.%,\s]+)\{[^}]*scaleY\(0\.1\)/g)].flatMap((m) =>
      (m[1] ?? '').split(',').map((p) => parseFloat(p)),
    );
    expect(closed.length).toBeGreaterThan(0);
    for (const stop of closed) {
      expect(stop).toBeGreaterThanOrEqual(92);
      expect(stop).toBeLessThanOrEqual(100);
    }
  });
});
