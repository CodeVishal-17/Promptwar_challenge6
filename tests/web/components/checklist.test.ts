import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Plan } from '../../../shared/types.js';
import { ALL_DONE, renderPlan, type Checklist } from '../../../web/src/components/planView.js';
import { makeItem, makePlan, resetDom } from '../helpers.js';

let el: HTMLElement;
let observer: MutationObserver;

beforeEach(() => {
  resetDom();
  const section = document.createElement('section');
  el = document.createElement('div');
  section.append(el);
  document.body.append(section);
  observer = new MutationObserver(() => {});
  observer.observe(document.getElementById('status') as HTMLElement, { childList: true });
});

/** How many times something was announced since the last call. */
const announcements = (): number => observer.takeRecords().length;
const status = (): string => document.getElementById('status')?.textContent ?? '';

function checklist(done: string[] = []): Checklist & { onChange: ReturnType<typeof vi.fn> } {
  return { done: new Set(done), onChange: vi.fn() };
}

const boxes = (): HTMLInputElement[] => [...el.querySelectorAll<HTMLInputElement>('.done__box')];
const box = (id: string): HTMLInputElement =>
  el.querySelector<HTMLInputElement>(`#done-${id}`) as HTMLInputElement;
const progressText = (): string | null | undefined =>
  el.querySelector('.routine-progress')?.textContent;
const progress = (): HTMLProgressElement | null => el.querySelector('progress');
const celebration = (): HTMLElement | null => el.querySelector('.celebration:not([hidden])');

function tick(id: string, checked = true): void {
  const input = box(id);
  input.checked = checked;
  input.dispatchEvent(new Event('change'));
}

describe('routine checklist', () => {
  it('gives only the routine steps a Done box', () => {
    renderPlan(el, makePlan(), { checklist: checklist() });
    expect(boxes()).toHaveLength(3);
    const routine = document.getElementById('plan-section-routine')?.closest('section');
    for (const b of boxes()) expect(routine?.contains(b)).toBe(true);
  });

  it('labels each box "Done: <title>", with the title for screen readers only', () => {
    const plan = makePlan();
    renderPlan(el, plan, { checklist: checklist() });
    const label = el.querySelector<HTMLLabelElement>('label[for="done-exercise-indoors"]');
    expect(label?.textContent).toBe('Done: Move today’s workout indoors');
    expect(label?.querySelector('.visually-hidden')?.textContent).toBe(
      ': Move today’s workout indoors',
    );
  });

  it('ticks what is already done and counts it', () => {
    renderPlan(el, makePlan(), { checklist: checklist(['exercise-indoors']) });
    expect(box('exercise-indoors').checked).toBe(true);
    expect(box('avoid-worst-window').checked).toBe(false);
    expect(progressText()).toBe('1 of 3 done');
    expect(progress()?.max).toBe(3);
    expect(progress()?.value).toBe(1);
    expect(progress()?.getAttribute('aria-labelledby')).toBe(
      el.querySelector('.routine-progress')?.id,
    );
  });

  it('a tick updates the count, marks the step and reports the new set', () => {
    const list = checklist();
    renderPlan(el, makePlan(), { checklist: list });
    tick('avoid-worst-window');
    expect(progressText()).toBe('1 of 3 done');
    expect(progress()?.value).toBe(1);
    expect(box('avoid-worst-window').closest('.plan-item')?.hasAttribute('data-done')).toBe(true);
    expect([...(list.onChange.mock.calls[0]?.[0] as Set<string>)]).toEqual(['avoid-worst-window']);
  });

  it('celebrates and announces once when the last step is ticked', () => {
    const list = checklist(['exercise-indoors']);
    renderPlan(el, makePlan(), { checklist: list });
    announcements();
    tick('avoid-worst-window');
    expect(celebration()).toBeNull();
    tick('move-exercise-to-best-window');
    expect(celebration()?.textContent).toContain(ALL_DONE);
    expect(celebration()?.querySelector('svg.puff')?.getAttribute('data-mood')).toBe('cheer');
    expect(celebration()?.querySelector('.confetti')?.getAttribute('aria-hidden')).toBe('true');
    expect(status()).toBe(ALL_DONE);
    expect(announcements()).toBe(1);
    expect([...(list.onChange.mock.lastCall?.[0] as Set<string>)].sort()).toEqual([
      'avoid-worst-window',
      'exercise-indoors',
      'move-exercise-to-best-window',
    ]);
  });

  it('unticking a step puts the celebration away', () => {
    renderPlan(el, makePlan(), {
      checklist: checklist([
        'exercise-indoors',
        'avoid-worst-window',
        'move-exercise-to-best-window',
      ]),
    });
    tick('exercise-indoors', false);
    expect(celebration()).toBeNull();
    expect(progressText()).toBe('2 of 3 done');
  });

  it('shows an already-finished day without announcing it again', () => {
    announcements();
    renderPlan(el, makePlan(), {
      checklist: checklist([
        'exercise-indoors',
        'avoid-worst-window',
        'move-exercise-to-best-window',
      ]),
    });
    expect(celebration()).not.toBeNull();
    expect(announcements()).toBe(0);
    expect(status()).toBe('');
  });

  it('a one-step routine celebrates on its single tick', () => {
    const plan: Plan = { ...makePlan(), routine: [makeItem()] };
    renderPlan(el, plan, { checklist: checklist() });
    tick('exercise-indoors');
    expect(celebration()).not.toBeNull();
    expect(status()).toBe(ALL_DONE);
  });

  it('an empty routine has no progress, no boxes and nothing to celebrate', () => {
    renderPlan(el, { ...makePlan(), routine: [] }, { checklist: checklist(['exercise-indoors']) });
    expect(progress()).toBeNull();
    expect(progressText()).toBeUndefined();
    expect(boxes()).toHaveLength(0);
    expect(celebration()).toBeNull();
  });

  it('ignores a ticked id that is not in today’s routine', () => {
    renderPlan(el, makePlan(), { checklist: checklist(['run-purifier', 'gone-tomorrow']) });
    expect(progressText()).toBe('0 of 3 done');
    expect(progress()?.value).toBe(0);
  });

  it('without a checklist, renders no boxes and no progress', () => {
    renderPlan(el, makePlan());
    expect(boxes()).toHaveLength(0);
    expect(progress()).toBeNull();
  });
});
