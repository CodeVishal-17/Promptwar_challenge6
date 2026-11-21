import { beforeEach, describe, expect, it } from 'vitest';
import { renderEmptyState, type Stage } from '../../../web/src/components/emptyState.js';

let el: HTMLElement;
beforeEach(() => {
  el = document.createElement('div');
  document.body.replaceChildren(el);
});

const text = (sel: string) => el.querySelector(sel)?.textContent;

describe('renderEmptyState', () => {
  it.each([
    ['no-place', 'Pick a place first', "Choose a city on Today and I'll fill this in.", 'wave'],
    ['loading', 'Checking the air…', 'This only takes a moment.', 'wave'],
    ['failed', "We couldn't load the air", 'Head back to Today to try again.', 'none'],
  ] as const)('%s: says so, with Puff', (stage: Stage, title, body, mood) => {
    renderEmptyState(el, stage);
    expect(text('.screen-empty__title')).toBe(title);
    expect(text('.screen-empty__text')).toBe(body);
    expect(el.querySelector('svg.puff')?.getAttribute('data-mood')).toBe(mood);
    expect(el.querySelector('.screen-empty__title')?.tagName).toBe('P');
  });

  it.each(['no-place', 'failed'] as const)('%s: links back to Today', (stage) => {
    renderEmptyState(el, stage);
    const link = el.querySelector('a');
    expect(link?.getAttribute('href')).toBe('#/today');
    expect(link?.textContent).toBe('Go to Today');
    expect(link?.className).toBe('btn btn--primary');
  });

  it('loading: no link', () => {
    renderEmptyState(el, 'loading');
    expect(el.querySelector('a')).toBeNull();
  });

  it('replaces what was there', () => {
    renderEmptyState(el, 'no-place');
    renderEmptyState(el, 'failed');
    expect(el.querySelectorAll('.screen-empty__title')).toHaveLength(1);
    expect(text('.screen-empty__title')).toBe("We couldn't load the air");
  });
});
