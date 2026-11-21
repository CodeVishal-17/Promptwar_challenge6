import type { Profile } from '../../../shared/types.js';
import { h } from '../dom.js';
import { type Step, createFields } from './formFields.js';
import { homeStep, householdStep, travelStep } from './profileSteps.js';

let forms = 0;

/** The dialog's fixed parts: heading, progress text and bars, and the navigation buttons. */
function chrome(titleId: string, steps: readonly Step[]) {
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
  return { dialog, form, progress, bars, skip, back, next, save };
}

type Chrome = ReturnType<typeof chrome>;

/** Shows step `index`: only its fieldset, the bars up to it, the right buttons, focus on its heading. */
function showStep(ui: Chrome, steps: readonly Step[], index: number): void {
  steps.forEach((s, i) => {
    s.fieldset.hidden = i !== index;
  });
  [...ui.bars.children].forEach((b, i) => b.toggleAttribute('data-done', i <= index));
  const last = index === steps.length - 1;
  ui.back.hidden = index === 0;
  ui.next.hidden = last;
  ui.save.hidden = !last;
  ui.progress.textContent = `Step ${String(index + 1)} of ${String(steps.length)}`;
  steps[index]?.heading.focus();
}

/** Every way out of the dialog: Skip, Escape, the browser's close request, or any other close. */
function onDismissed(ui: Chrome, dismiss: () => void): void {
  ui.skip.addEventListener('click', dismiss);
  ui.dialog.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    dismiss();
  });
  // The browser's own close request (e.g. Android back).
  ui.dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    dismiss();
  });
  ui.dialog.addEventListener('close', dismiss);
}

function openModal(dialog: HTMLDialogElement): void {
  document.body.append(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

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
  const prefix = `profile-${String(++forms)}`;
  const fields = createFields(prefix);
  const household = householdStep(fields, initial.household);
  const travel = travelStep(fields, initial);
  const home = homeStep(fields, initial.home);
  const steps = [household.step, travel.step, home.step];
  const read = (): Profile => ({
    household: household.read(),
    ...travel.read(),
    home: home.read(),
  });

  const ui = chrome(`${prefix}-title`, steps);
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let current = 0;
  let closed = false;
  const show = (index: number): void => {
    current = index;
    showStep(ui, steps, index);
  };
  const finish = (profile: Profile | null): void => {
    if (closed) return;
    closed = true;
    if (typeof ui.dialog.close === 'function' && ui.dialog.hasAttribute('open')) ui.dialog.close();
    ui.dialog.remove();
    if (opener?.isConnected) opener.focus();
    if (profile) onSave(profile);
    else onDismiss?.();
  };

  ui.form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (current < steps.length - 1) show(current + 1);
    else finish(read());
  });
  ui.back.addEventListener('click', () => {
    show(Math.max(0, current - 1));
  });
  onDismissed(ui, () => {
    finish(null);
  });
  openModal(ui.dialog);
  show(0);
}
