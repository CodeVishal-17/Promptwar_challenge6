import { h } from '../dom.js';
import { puff, type Mood } from './mascot.js';

/** Why a screen has nothing to show yet. */
export type Stage = 'no-place' | 'loading' | 'failed';

const COPY: Record<Stage, { title: string; text: string; mood: Mood; link: boolean }> = {
  'no-place': {
    title: 'Pick a place first',
    text: "Choose a city on Today and I'll fill this in.",
    mood: 'wave',
    link: true,
  },
  loading: {
    title: 'Checking the air…',
    text: 'This only takes a moment.',
    mood: 'wave',
    link: false,
  },
  failed: {
    title: "We couldn't load the air",
    text: 'Head back to Today to try again.',
    mood: 'none',
    link: true,
  },
};

/**
 * A friendly stand-in for a screen without data: Puff, a line on why, and a way back to Today.
 * The screen's own `h1` is the heading, so the title here is a paragraph.
 */
export function renderEmptyState(el: HTMLElement, stage: Stage): void {
  const copy = COPY[stage];
  const parts: Node[] = [
    puff(copy.mood, 'sm'),
    h('p', { class: 'screen-empty__title' }, copy.title),
    h('p', { class: 'screen-empty__text' }, copy.text),
  ];
  if (copy.link) parts.push(h('a', { class: 'btn btn--primary', href: '#/today' }, 'Go to Today'));
  el.replaceChildren(...parts);
}
