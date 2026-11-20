import { beforeEach, describe, expect, it } from 'vitest';
import { impactChip } from '../../../web/src/components/impactChip.js';
import { makeImpact } from '../helpers.js';

let root: HTMLElement;
beforeEach(() => {
  root = document.createElement('div');
  document.body.replaceChildren(root);
});

function mount(impact = makeImpact()) {
  const chip = impactChip(impact);
  root.append(chip);
  const button = chip.querySelector('button') as HTMLButtonElement;
  const panel = document.getElementById(button.getAttribute('aria-controls') ?? '') as HTMLElement;
  return { chip, button, panel };
}

describe('impactChip', () => {
  it('is a collapsed button whose visible label is exactly impact.display', () => {
    const { button, panel } = mount();
    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panel).not.toBeNull();
    expect(panel.hidden).toBe(true);
    expect(button.querySelector('.impact-chip__value')?.textContent).toBe('−79% indoor PM2.5');
    expect(button.textContent).toContain('how we calculated this');
  });

  it('toggles aria-expanded and the panel on click', () => {
    const { button, panel } = mount();
    button.click();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(panel.hidden).toBe(false);
    button.click();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hidden).toBe(true);
  });

  it('closes on Escape and returns focus to the chip', () => {
    const { button, panel } = mount();
    button.click();
    const link = panel.querySelector('a') as HTMLAnchorElement;
    link.focus();
    link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(panel.hidden).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
  });

  it('ignores Escape while closed', () => {
    const { button, panel } = mount();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(panel.hidden).toBe(true);
  });

  it('shows the formula, every input, every assumption and the sources — verbatim', () => {
    const impact = makeImpact();
    const { panel } = mount(impact);
    const text = panel.textContent ?? '';
    expect(panel.querySelector('.impact-panel__formula')?.textContent).toBe(impact.formula);
    const rows = [...panel.querySelectorAll('.impact-panel__inputs > div')].map((r) => [
      r.querySelector('dt')?.textContent,
      r.querySelector('dd')?.textContent,
    ]);
    expect(rows).toEqual(impact.inputs.map((i) => [i.label, i.value]));
    const assumptions = [...panel.querySelectorAll('.impact-panel__assumptions li')].map(
      (li) => li.textContent,
    );
    expect(assumptions).toEqual(impact.assumptions);
    expect(text).toContain('US EPA, Guide to Air Cleaners in the Home');
  });

  it('links https sources safely in a new tab and says so', () => {
    const { panel } = mount();
    const link = panel.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe(
      'https://www.epa.gov/indoor-air-quality-iaq/guide-air-cleaners-home',
    );
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.textContent).toContain('(opens in new tab)');
  });

  it('shows a non-https source as plain text, never as a link', () => {
    const { panel } = mount(
      makeImpact({ sources: [{ title: 'Sneaky', url: 'javascript:alert(1)', year: 2026 }] }),
    );
    expect(panel.querySelector('a')).toBeNull();
    expect(panel.textContent).toContain('Sneaky');
  });

  it('omits empty parts and renders text, never markup', () => {
    const { panel } = mount(
      makeImpact({ formula: '<b>x</b>', inputs: [], assumptions: [], sources: [] }),
    );
    expect(panel.querySelector('b')).toBeNull();
    expect(panel.textContent).toContain('<b>x</b>');
    expect(panel.querySelector('.impact-panel__inputs')).toBeNull();
    expect(panel.querySelector('.impact-panel__assumptions')).toBeNull();
  });

  it('gives every chip its own panel id', () => {
    const a = mount().button.getAttribute('aria-controls');
    const b = mount().button.getAttribute('aria-controls');
    expect(a).not.toBe(b);
  });
});
