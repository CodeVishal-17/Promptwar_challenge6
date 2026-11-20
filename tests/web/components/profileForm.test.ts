import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROFILE } from '../../../shared/profile.js';
import type { Profile } from '../../../shared/types.js';
import { openProfileForm } from '../../../web/src/components/profileForm.js';
import { loadProfile, saveProfile } from '../../../web/src/store.js';

const PRIVACY =
  'Your household details stay in this browser. To personalise your plan, a short summary (no names or exact details) is sent to Google Gemini, whose free tier may use it to improve Google products.';

// jsdom has no showModal/close; stand in for the browser's versions.
const proto = HTMLDialogElement.prototype as Partial<HTMLDialogElement>;
const original = { showModal: proto.showModal, close: proto.close };
beforeEach(() => {
  proto.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  proto.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  });
  localStorage.clear();
  const opener = document.createElement('button');
  opener.id = 'opener';
  document.body.replaceChildren(opener);
  opener.focus();
});
afterEach(() => {
  proto.showModal = original.showModal;
  proto.close = original.close;
});

const dialog = () => document.querySelector('dialog') as HTMLDialogElement;

function control<T extends HTMLElement = HTMLInputElement>(labelText: string): T {
  const label = [...dialog().querySelectorAll('label')].find((l) => l.textContent === labelText);
  if (!label) throw new Error(`No label "${labelText}"`);
  const el = document.getElementById(label.htmlFor);
  if (!el) throw new Error(`Label "${labelText}" points nowhere`);
  return el as T;
}

function set(labelText: string, value: string): void {
  const el = control<HTMLInputElement | HTMLSelectElement>(labelText);
  el.value = value;
  el.dispatchEvent(
    new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }),
  );
}

function check(labelText: string, on: boolean): void {
  const el = control(labelText);
  el.checked = on;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function button(name: string): HTMLButtonElement {
  const b = [...dialog().querySelectorAll('button')].find(
    (x) => x.textContent === name && !x.hidden,
  );
  if (!b) throw new Error(`No visible button "${name}"`);
  return b;
}

const visibleStep = () =>
  [...dialog().querySelectorAll<HTMLElement>('fieldset.form-step')].find((f) => !f.hidden);

function open(initial: Profile = structuredClone(DEFAULT_PROFILE)) {
  const onSave = vi.fn<(p: Profile) => void>();
  const onDismiss = vi.fn();
  openProfileForm(initial, onSave, onDismiss);
  return { onSave, onDismiss };
}

const saved = (onSave: ReturnType<typeof open>['onSave']): Profile => {
  const call = onSave.mock.calls[0];
  if (!call) throw new Error('onSave was not called');
  return call[0];
};

describe('openProfileForm', () => {
  it('opens a modal dialog labelled by its title', () => {
    open();
    expect(dialog()).not.toBeNull();
    expect(proto.showModal).toHaveBeenCalledOnce();
    const title = document.getElementById(dialog().getAttribute('aria-labelledby') ?? '');
    expect(title?.textContent).toBe('About your household');
  });

  it('labels every control and makes every step a fieldset with a legend', () => {
    open();
    const steps = dialog().querySelectorAll('fieldset.form-step');
    expect(steps).toHaveLength(3);
    expect([...steps].map((s) => s.querySelector(':scope > legend')?.textContent)).toEqual([
      'Household',
      'Getting around',
      'Home',
    ]);
    const controls = dialog().querySelectorAll('input, select, textarea');
    expect(controls.length).toBeGreaterThan(10);
    for (const c of controls) {
      const label = dialog().querySelector(`label[for="${c.id}"]`);
      expect(label?.textContent, c.id).toBeTruthy();
    }
  });

  it('shows the privacy notice, word for word, on step 1', () => {
    open();
    const notice = visibleStep()?.querySelector('.privacy-note__text');
    expect(notice?.textContent).toBe(PRIVACY);
  });

  it('moves focus to each step’s heading as you go forward and back', () => {
    open();
    expect(document.activeElement?.textContent).toBe('Household');
    button('Next').click();
    expect(document.activeElement?.textContent).toBe('Getting around');
    expect(visibleStep()?.querySelector('legend')?.textContent).toBe('Getting around');
    button('Next').click();
    expect(document.activeElement?.textContent).toBe('Home');
    expect(() => button('Next')).toThrow();
    button('Back').click();
    expect(document.activeElement?.textContent).toBe('Getting around');
  });

  it('offers Back only after step 1 and Save only on the last step', () => {
    open();
    expect(() => button('Back')).toThrow();
    expect(() => button('Save')).toThrow();
    expect(dialog().textContent).toContain('Step 1 of 3');
    button('Next').click();
    button('Next').click();
    expect(button('Save')).toBeTruthy();
    expect(dialog().textContent).toContain('Step 3 of 3');
  });

  it('closes on Skip without saving, and returns focus to the opener', () => {
    const { onSave, onDismiss } = open();
    button('Skip').click();
    expect(document.querySelector('dialog')).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(document.activeElement?.id).toBe('opener');
  });

  it('closes on Escape without saving', () => {
    const { onSave, onDismiss } = open();
    set('Adults', '5');
    dialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('dialog')).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('treats the browser’s own cancel (e.g. a back gesture) like Escape', () => {
    const { onSave, onDismiss } = open();
    dialog().dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(document.querySelector('dialog')).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('starts from the given profile', () => {
    open({
      ...structuredClone(DEFAULT_PROFILE),
      commute: { mode: 'bus', oneWayKm: 7.5, departHour: 8 },
    });
    expect(control('Adults').value).toBe('2');
    expect(control<HTMLSelectElement>('Usual commute or school run').value).toBe('bus');
    expect(control('One-way distance').value).toBe('7.5');
    expect(control('Leaves at').value).toBe('8');
  });

  it('hides the commute and exercise details until a mode is chosen', () => {
    open();
    button('Next').click();
    const reveal = (label: string) => control(label).closest('.form-reveal') as HTMLElement;
    expect(reveal('One-way distance').hidden).toBe(true);
    set('Usual commute or school run', 'car_petrol');
    expect(reveal('One-way distance').hidden).toBe(false);
    expect(reveal('Minutes').hidden).toBe(true);
  });

  it('saves a valid Profile with every number clamped to the range the server accepts', () => {
    const { onSave, onDismiss } = open();
    set('Adults', '25');
    set('Children under 12', '-3');
    set('Adults 65 or older', '1.6');
    check('Someone has asthma, COPD or another lung condition', true);
    button('Next').click();
    set('Usual commute or school run', 'car_petrol');
    set('One-way distance', '500');
    set('Leaves at', '30');
    set('Outdoor exercise', 'run');
    set('Starts at', '-2');
    set('Minutes', '2');
    button('Next').click();
    check('We have an air purifier', true);
    set('Clean air delivery rate (CADR)', '250');
    set('Room size', '');
    set('Cooking', 'electric');
    set('Heating', 'none');
    check('Someone smokes indoors', true);
    button('Save').click();

    expect(onDismiss).not.toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledOnce();
    const profile = saved(onSave);
    expect(profile).toEqual({
      household: {
        adults: 20,
        children: 0,
        olderAdults: 2,
        pregnant: false,
        respiratory: true,
        heart: false,
      },
      commute: { mode: 'car_petrol', oneWayKm: 200, departHour: 23 },
      exercise: { type: 'run', hour: 0, minutes: 5 },
      home: {
        purifier: true,
        purifierCadrM3h: 250,
        cooking: 'electric',
        heating: 'none',
        canOpenWindows: true,
        indoorSmoking: true,
      },
    });
    // The store's shape check (which mirrors the server schema) accepts it unchanged.
    saveProfile(profile);
    expect(loadProfile()).toEqual(profile);
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('falls back to the starting value when a number field is left empty or junk', () => {
    const { onSave } = open();
    set('Adults', '');
    button('Next').click();
    set('Usual commute or school run', 'bike');
    set('One-way distance', 'abc');
    button('Next').click();
    button('Save').click();
    const profile = saved(onSave);
    expect(profile.household.adults).toBe(2);
    expect(profile.commute).toEqual({ mode: 'bike', oneWayKm: 5, departHour: 8 });
    expect(profile.exercise).toBeNull();
  });

  it('drops purifier details when there is no purifier', () => {
    const { onSave } = open({
      ...structuredClone(DEFAULT_PROFILE),
      home: { ...DEFAULT_PROFILE.home, purifier: true, purifierCadrM3h: 300, roomM3: 50 },
    });
    button('Next').click();
    button('Next').click();
    expect(control('Room size').value).toBe('50');
    check('We have an air purifier', false);
    button('Save').click();
    const home = saved(onSave).home;
    expect(home.purifier).toBe(false);
    expect('purifierCadrM3h' in home).toBe(false);
    expect('roomM3' in home).toBe(false);
  });

  it('Enter in a field moves to the next step instead of submitting anywhere', () => {
    const { onSave } = open();
    const form = dialog().querySelector('form') as HTMLFormElement;
    const event = new Event('submit', { cancelable: true });
    form.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(visibleStep()?.querySelector('legend')?.textContent).toBe('Getting around');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('still opens and closes where the browser lacks showModal', () => {
    proto.showModal = undefined;
    proto.close = undefined;
    const { onDismiss } = open();
    expect(dialog().hasAttribute('open')).toBe(true);
    button('Skip').click();
    expect(document.querySelector('dialog')).toBeNull();
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
