import type { CommuteMode, Profile } from '../../../shared/types.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';

export const PRIVACY_NOTICE =
  'Your household details stay in this browser. To personalise your plan, a short summary (no names or exact details) is sent to Google Gemini, whose free tier may use it to improve Google products.';

/** Starting values for details the household has not given yet. */
const COMMUTE_START = { oneWayKm: 5, departHour: 8 };
const EXERCISE_START = { hour: 7, minutes: 30 };

const COMMUTE_OPTIONS: readonly [CommuteMode | 'none', string][] = [
  ['none', 'I don’t commute'],
  ['car_petrol', 'Car (petrol)'],
  ['car_diesel', 'Car (diesel)'],
  ['car_ev', 'Electric car'],
  ['motorbike', 'Motorbike or scooter'],
  ['bus', 'Bus'],
  ['rail', 'Metro or train'],
  ['bike', 'Bike'],
  ['walk', 'Walking'],
];
const EXERCISE_OPTIONS = [
  ['none', 'None outdoors'],
  ['run', 'Running'],
  ['cycle', 'Cycling'],
  ['walk', 'Walking'],
  ['sport', 'Team sport'],
] as const;
const COOKING_OPTIONS = [
  ['gas', 'Gas'],
  ['electric', 'Electric or induction'],
  ['solid', 'Wood, coal or charcoal'],
] as const;
const HEATING_OPTIONS = [
  ['gas', 'Gas'],
  ['electric', 'Electric or heat pump'],
  ['wood_coal', 'Wood or coal'],
  ['none', 'No heating'],
] as const;

/** Allowed ranges; they mirror the server's request schema so a saved profile is always valid. */
interface Range {
  min: number;
  max: number;
  step: number;
}
const COUNT: Range = { min: 0, max: 20, step: 1 };
const HOUR: Range = { min: 0, max: 23, step: 1 };
const KM: Range = { min: 0, max: 200, step: 0.1 };
const MINUTES: Range = { min: 5, max: 240, step: 5 };
const CAPACITY: Range = { min: 1, max: 2000, step: 1 };

/** A typed number clamped into range (whole numbers for whole-number fields), or null if absent. */
export function readNumber(raw: string, range: Range): number | null {
  const text = raw.trim();
  const n = text === '' ? NaN : Number(text);
  if (!Number.isFinite(n)) return null;
  const value = range.step >= 1 ? Math.round(n) : n;
  return Math.min(range.max, Math.max(range.min, value));
}

let forms = 0;

/**
 * A three-step household form (Household → Getting around → Home) in a modal dialog. Every
 * field is optional; Skip or Escape closes it without saving. Focus moves to each step's
 * heading, and back to whatever was focused before when the dialog closes.
 */
export function openProfileForm(
  initial: Profile,
  onSave: (p: Profile) => void,
  onDismiss?: () => void,
): void {
  const prefix = `profile-${++forms}`;
  let fieldCount = 0;
  const nextId = () => `${prefix}-f${++fieldCount}`;

  // ---- Field builders: every control gets a <label for>, hints via aria-describedby ----

  function numberField(
    label: string,
    value: number | undefined,
    range: Range,
    extra: { suffix?: string; hint?: string } = {},
  ) {
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
    const wrap = h(
      'div',
      { class: 'field' },
      h('label', { class: 'field-label', for: id }, label),
      h(
        'div',
        { class: 'field__control' },
        input,
        extra.suffix
          ? h('span', { class: 'field__suffix', 'aria-hidden': 'true' }, extra.suffix)
          : null,
      ),
      extra.hint ? h('p', { class: 'field__hint', id: hintId }, extra.hint) : null,
    );
    return { wrap, input };
  }

  function selectField(
    label: string,
    options: readonly (readonly [string, string])[],
    value: string,
  ) {
    const id = nextId();
    const select = h(
      'select',
      { id, class: 'input select' },
      ...options.map(([v, text]) => h('option', { value: v, selected: v === value }, text)),
    );
    const wrap = h(
      'div',
      { class: 'field' },
      h('label', { class: 'field-label', for: id }, label),
      select,
    );
    return { wrap, select };
  }

  function checkField(label: string, checked: boolean) {
    const id = nextId();
    const input = h('input', { id, class: 'check__input', type: 'checkbox', checked });
    const wrap = h(
      'div',
      { class: 'check' },
      input,
      h('label', { class: 'check__label', for: id }, label),
    );
    return { wrap, input };
  }

  const group = (legend: string, ...children: HTMLElement[]) =>
    h(
      'fieldset',
      { class: 'form-group' },
      h('legend', { class: 'form-group__legend' }, legend),
      ...children,
    );

  const reveal = (...children: HTMLElement[]) =>
    h('div', { class: 'form-reveal form-grid' }, ...children);

  // ---- Step 1: Household ----
  const hh = initial.household;
  const adults = numberField('Adults', hh.adults, COUNT);
  const children = numberField('Children under 12', hh.children, COUNT);
  const older = numberField('Adults 65 or older', hh.olderAdults, COUNT);
  const pregnant = checkField('Someone is pregnant', hh.pregnant);
  const respiratory = checkField(
    'Someone has asthma, COPD or another lung condition',
    hh.respiratory,
  );
  const heart = checkField('Someone has a heart condition', hh.heart);

  // ---- Step 2: Getting around ----
  const commute = initial.commute;
  const mode = selectField('Usual commute or school run', COMMUTE_OPTIONS, commute?.mode ?? 'none');
  const km = numberField('One-way distance', commute?.oneWayKm ?? COMMUTE_START.oneWayKm, KM, {
    suffix: 'km',
    hint: 'In kilometres.',
  });
  const departs = numberField('Leaves at', commute?.departHour ?? COMMUTE_START.departHour, HOUR, {
    suffix: ':00',
    hint: 'Hour on the 24-hour clock.',
  });
  const commuteDetails = reveal(km.wrap, departs.wrap);

  const exercise = initial.exercise;
  const exType = selectField('Outdoor exercise', EXERCISE_OPTIONS, exercise?.type ?? 'none');
  const exHour = numberField('Starts at', exercise?.hour ?? EXERCISE_START.hour, HOUR, {
    suffix: ':00',
    hint: 'Hour on the 24-hour clock.',
  });
  const exMinutes = numberField('Minutes', exercise?.minutes ?? EXERCISE_START.minutes, MINUTES, {
    suffix: 'min',
    hint: 'How long you are usually out.',
  });
  const exerciseDetails = reveal(exHour.wrap, exMinutes.wrap);

  // ---- Step 3: Home ----
  const home = initial.home;
  const purifier = checkField('We have an air purifier', home.purifier);
  const cadr = numberField('Clean air delivery rate (CADR)', home.purifierCadrM3h, CAPACITY, {
    suffix: 'm³/h',
    hint: 'On the box or label. Leave blank if you don’t know.',
  });
  const room = numberField('Room size', home.roomM3, CAPACITY, {
    suffix: 'm³',
    hint: 'Length × width × height of the room it’s in. Leave blank if unsure.',
  });
  const purifierDetails = reveal(cadr.wrap, room.wrap);
  const cooking = selectField('Cooking', COOKING_OPTIONS, home.cooking);
  const heating = selectField('Heating', HEATING_OPTIONS, home.heating);
  const windows = checkField('We can open our windows', home.canOpenWindows);
  const smoking = checkField('Someone smokes indoors', home.indoorSmoking);

  const syncReveals = (): void => {
    commuteDetails.hidden = mode.select.value === 'none';
    exerciseDetails.hidden = exType.select.value === 'none';
    purifierDetails.hidden = !purifier.input.checked;
  };
  for (const el of [mode.select, exType.select, purifier.input])
    el.addEventListener('change', syncReveals);
  syncReveals();

  // ---- Steps ----
  const step = (title: string, ...body: (HTMLElement | null)[]) => {
    const heading = h('h3', { class: 'form-step__title', tabindex: '-1' }, title);
    const fieldset = h('fieldset', { class: 'form-step' }, h('legend', {}, heading), ...body);
    return { fieldset, heading };
  };
  const steps = [
    step(
      'Household',
      h(
        'p',
        { class: 'form-step__intro' },
        'Children, older adults and anyone with a health condition feel polluted air sooner, so this shapes the health advice.',
      ),
      h('div', { class: 'form-grid form-grid--3' }, adults.wrap, children.wrap, older.wrap),
      group('Health', pregnant.wrap, respiratory.wrap, heart.wrap),
      h(
        'div',
        { class: 'privacy-note' },
        icon('lock', 'privacy-note__icon'),
        h('p', { class: 'privacy-note__text' }, PRIVACY_NOTICE),
      ),
    ),
    step(
      'Getting around',
      h(
        'p',
        { class: 'form-step__intro' },
        'Your trips and workouts decide when timing matters and what a greener swap could save.',
      ),
      mode.wrap,
      commuteDetails,
      exType.wrap,
      exerciseDetails,
    ),
    step(
      'Home',
      h(
        'p',
        { class: 'form-step__intro' },
        'What happens indoors decides which air hacks will help most.',
      ),
      purifier.wrap,
      purifierDetails,
      h('div', { class: 'form-grid' }, cooking.wrap, heating.wrap),
      group('Windows and smoke', windows.wrap, smoking.wrap),
    ),
  ];

  // ---- Reading the form ----
  const num = (input: HTMLInputElement, range: Range, fallback: number) =>
    readNumber(input.value, range) ?? fallback;

  function read(): Profile {
    const profile: Profile = {
      household: {
        adults: num(adults.input, COUNT, hh.adults),
        children: num(children.input, COUNT, hh.children),
        olderAdults: num(older.input, COUNT, hh.olderAdults),
        pregnant: pregnant.input.checked,
        respiratory: respiratory.input.checked,
        heart: heart.input.checked,
      },
      commute:
        mode.select.value === 'none'
          ? null
          : {
              mode: mode.select.value as CommuteMode,
              oneWayKm: num(km.input, KM, commute?.oneWayKm ?? COMMUTE_START.oneWayKm),
              departHour: num(departs.input, HOUR, commute?.departHour ?? COMMUTE_START.departHour),
            },
      exercise:
        exType.select.value === 'none'
          ? null
          : {
              type: exType.select.value as NonNullable<Profile['exercise']>['type'],
              hour: num(exHour.input, HOUR, exercise?.hour ?? EXERCISE_START.hour),
              minutes: num(exMinutes.input, MINUTES, exercise?.minutes ?? EXERCISE_START.minutes),
            },
      home: {
        purifier: purifier.input.checked,
        cooking: cooking.select.value as Profile['home']['cooking'],
        heating: heating.select.value as Profile['home']['heating'],
        canOpenWindows: windows.input.checked,
        indoorSmoking: smoking.input.checked,
      },
    };
    if (profile.home.purifier) {
      const c = readNumber(cadr.input.value, CAPACITY);
      const r = readNumber(room.input.value, CAPACITY);
      if (c !== null) profile.home.purifierCadrM3h = c;
      if (r !== null) profile.home.roomM3 = r;
    }
    return profile;
  }

  // ---- Dialog chrome ----
  const titleId = `${prefix}-title`;
  const progress = h('p', { class: 'profile-form__progress' });
  const bars = h(
    'div',
    { class: 'profile-form__bars', 'aria-hidden': 'true' },
    ...steps.map(() => h('span', { class: 'profile-form__bar' })),
  );
  const skip = h('button', { type: 'button', class: 'btn btn--ghost' }, 'Skip');
  const back = h('button', { type: 'button', class: 'btn btn--secondary' }, 'Back');
  const next = h('button', { type: 'submit', class: 'btn btn--primary' }, 'Next');
  const save = h('button', { type: 'submit', class: 'btn btn--primary' }, 'Save');

  const form = h(
    'form',
    { class: 'profile-form', novalidate: true },
    h(
      'div',
      { class: 'profile-form__head' },
      h('h2', { class: 'profile-form__title', id: titleId }, 'About your household'),
      progress,
      bars,
    ),
    h('div', { class: 'profile-form__body' }, ...steps.map((s) => s.fieldset)),
    h(
      'div',
      { class: 'profile-form__foot' },
      skip,
      h('div', { class: 'profile-form__nav' }, back, next, save),
    ),
  );
  const dialog = h('dialog', { class: 'dialog', 'aria-labelledby': titleId }, form);

  let current = 0;
  function show(index: number): void {
    current = index;
    steps.forEach((s, i) => (s.fieldset.hidden = i !== index));
    [...bars.children].forEach((b, i) => b.toggleAttribute('data-done', i <= index));
    const last = index === steps.length - 1;
    back.hidden = index === 0;
    next.hidden = last;
    save.hidden = !last;
    progress.textContent = `Step ${index + 1} of ${steps.length}`;
    steps[index]?.heading.focus();
  }

  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let closed = false;
  function finish(profile: Profile | null): void {
    if (closed) return;
    closed = true;
    if (typeof dialog.close === 'function' && dialog.hasAttribute('open')) dialog.close();
    dialog.remove();
    if (opener?.isConnected) opener.focus();
    if (profile) onSave(profile);
    else onDismiss?.();
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (current < steps.length - 1) show(current + 1);
    else finish(read());
  });
  back.addEventListener('click', () => show(Math.max(0, current - 1)));
  skip.addEventListener('click', () => finish(null));
  dialog.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    finish(null);
  });
  // The browser's own close request (e.g. Android back), and any other way it closes.
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    finish(null);
  });
  dialog.addEventListener('close', () => finish(null));

  document.body.append(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  show(0);
}
