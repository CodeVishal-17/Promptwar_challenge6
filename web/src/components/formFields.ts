import { h } from '../dom.js';

/**
 * Accessible form controls for the household form. Every control gets a `<label for>`, and a
 * hint, when there is one, is tied to it with `aria-describedby`.
 */

/** Allowed ranges; they mirror the server's request schema so a saved profile is always valid. */
export interface Range {
  min: number;
  max: number;
  step: number;
}

export const COUNT: Range = { min: 0, max: 20, step: 1 };
export const HOUR: Range = { min: 0, max: 23, step: 1 };
export const KM: Range = { min: 0, max: 200, step: 0.1 };
export const MINUTES: Range = { min: 5, max: 240, step: 5 };
export const CAPACITY: Range = { min: 1, max: 2000, step: 1 };

/** A typed number clamped into range (whole numbers for whole-number fields), or null if absent. */
export function readNumber(raw: string, range: Range): number | null {
  const text = raw.trim();
  const n = text === '' ? NaN : Number(text);
  if (!Number.isFinite(n)) return null;
  const value = range.step >= 1 ? Math.round(n) : n;
  return Math.min(range.max, Math.max(range.min, value));
}

export interface NumberField {
  wrap: HTMLElement;
  input: HTMLInputElement;
  /** The clamped value typed in, or `fallback` when the field is blank or invalid. */
  read(fallback: number): number;
}
export interface SelectField {
  wrap: HTMLElement;
  select: HTMLSelectElement;
}
export interface CheckField {
  wrap: HTMLElement;
  input: HTMLInputElement;
}
export type Options = readonly (readonly [string, string])[];

export interface Fields {
  number(
    label: string,
    value: number | undefined,
    range: Range,
    extra?: { suffix?: string; hint?: string },
  ): NumberField;
  select(label: string, options: Options, value: string): SelectField;
  check(label: string, checked: boolean): CheckField;
}

const fieldLabel = (id: string, text: string): HTMLElement =>
  h('label', { class: 'field-label', for: id }, text);

/** Control builders whose ids all start with `prefix`, so two open forms never clash. */
export function createFields(prefix: string): Fields {
  let count = 0;
  const nextId = (): string => `${prefix}-f${String(++count)}`;

  return {
    number(label, value, range, extra = {}) {
      const id = nextId();
      const hintId = `${id}-hint`;
      const input = h('input', {
        id,
        class: 'input',
        type: 'number',
        inputmode: range.step >= 1 ? 'numeric' : 'decimal',
        min: String(range.min),
        max: String(range.max),
        step: String(range.step),
        value: value === undefined ? '' : String(value),
        'aria-describedby': extra.hint ? hintId : false,
      });
      const suffix = extra.suffix
        ? h('span', { class: 'field__suffix', 'aria-hidden': 'true' }, extra.suffix)
        : null;
      const hint = extra.hint ? h('p', { class: 'field__hint', id: hintId }, extra.hint) : null;
      const wrap = h(
        'div',
        { class: 'field' },
        fieldLabel(id, label),
        h('div', { class: 'field__control' }, input, suffix),
        hint,
      );
      return { wrap, input, read: (fallback) => readNumber(input.value, range) ?? fallback };
    },

    select(label, options, value) {
      const id = nextId();
      const select = h(
        'select',
        { id, class: 'input select' },
        ...options.map(([v, text]) => h('option', { value: v, selected: v === value }, text)),
      );
      return { wrap: h('div', { class: 'field' }, fieldLabel(id, label), select), select };
    },

    check(label, checked) {
      const id = nextId();
      const input = h('input', { id, class: 'check__input', type: 'checkbox', checked });
      const wrap = h(
        'div',
        { class: 'check' },
        input,
        h('label', { class: 'check__label', for: id }, label),
      );
      return { wrap, input };
    },
  };
}

/** A titled group of related controls. */
export const group = (legend: string, ...children: HTMLElement[]): HTMLElement =>
  h(
    'fieldset',
    { class: 'form-group' },
    h('legend', { class: 'form-group__legend' }, legend),
    ...children,
  );

/** Follow-up controls shown only when the question above them is answered "yes". */
export const reveal = (...children: HTMLElement[]): HTMLElement =>
  h('div', { class: 'form-reveal form-grid' }, ...children);

/** Keeps `details` hidden whenever `isOff()` is true, now and after every change to `control`. */
export function revealWhen(control: HTMLElement, details: HTMLElement, isOff: () => boolean): void {
  const sync = (): void => {
    details.hidden = isOff();
  };
  control.addEventListener('change', sync);
  sync();
}

export interface Step {
  fieldset: HTMLElement;
  heading: HTMLElement;
}

/** One step of the form: a fieldset whose legend is a focusable heading, and a short intro. */
export function formStep(title: string, intro: string, ...body: (HTMLElement | null)[]): Step {
  const heading = h('h3', { class: 'form-step__title', tabindex: '-1' }, title);
  const fieldset = h(
    'fieldset',
    { class: 'form-step' },
    h('legend', {}, heading),
    h('p', { class: 'form-step__intro' }, intro),
    ...body,
  );
  return { fieldset, heading };
}
