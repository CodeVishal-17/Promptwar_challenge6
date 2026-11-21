import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Place } from '../../../shared/types.js';
import { ApiError } from '../../../web/src/api.js';
import { mountLocationSearch } from '../../../web/src/components/locationSearch.js';
import { PLACE, resetDom, statusText } from '../helpers.js';

const ZURICH: Place = {
  name: 'Zürich',
  admin1: 'Zurich',
  country: 'Switzerland',
  countryCode: 'CH',
  lat: 47.37,
  lon: 8.55,
};

let root: HTMLElement;
let onPick: ReturnType<typeof vi.fn<(p: Place) => void>>;
let search: ReturnType<typeof vi.fn<(q: string, signal?: AbortSignal) => Promise<Place[]>>>;

function mount(geolocate?: () => Promise<{ lat: number; lon: number }>): void {
  mountLocationSearch(root, onPick, {
    search,
    geolocate: geolocate ?? (() => new Promise(() => {})),
  });
}

const input = (): HTMLInputElement => root.querySelector('input') as HTMLInputElement;
const listbox = (): HTMLElement => root.querySelector('[role="listbox"]') as HTMLElement;
const options = (): HTMLElement[] => [...root.querySelectorAll<HTMLElement>('[role="option"]')];
const locateButton = (): HTMLButtonElement =>
  root.querySelector('button.locate-button') as HTMLButtonElement;

function type(value: string): void {
  input().focus();
  input().value = value;
  input().dispatchEvent(new Event('input', { bubbles: true }));
}

function key(k: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  input().dispatchEvent(event);
  return event;
}

beforeEach(() => {
  vi.useFakeTimers();
  resetDom();
  root = document.createElement('div');
  document.body.append(root);
  onPick = vi.fn();
  search = vi.fn(async () => [PLACE, ZURICH]);
});
afterEach(() => vi.useRealTimers());

describe('combobox markup (ARIA 1.2)', () => {
  it('labels an input with role combobox that controls a hidden listbox', () => {
    mount();
    const box = input();
    expect(box.getAttribute('role')).toBe('combobox');
    expect(box.getAttribute('aria-autocomplete')).toBe('list');
    expect(box.getAttribute('aria-expanded')).toBe('false');
    expect(box.getAttribute('aria-controls')).toBe(listbox().id);
    expect(listbox().hidden).toBe(true);
    expect(box.hasAttribute('aria-activedescendant')).toBe(false);
    const label = root.querySelector(`label[for="${box.id}"]`);
    expect(label?.textContent).toBeTruthy();
    expect(
      listbox().getAttribute('aria-label') ?? listbox().getAttribute('aria-labelledby'),
    ).toBeTruthy();
    expect(locateButton().textContent).toContain('Use my location');
    expect(locateButton().type).toBe('button');
  });
});

describe('searching', () => {
  it('waits 300 ms after typing before it searches, and only searches the last value', async () => {
    mount();
    type('Sa');
    type('São');
    await vi.advanceTimersByTimeAsync(299);
    expect(search).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(search).toHaveBeenCalledOnce();
    expect(search.mock.calls[0]?.[0]).toBe('São');
  });

  it('does not search for fewer than 2 characters', async () => {
    mount();
    type(' S ');
    await vi.advanceTimersByTimeAsync(500);
    expect(search).not.toHaveBeenCalled();
  });

  it('opens the listbox with one option per place and announces the count', async () => {
    mount();
    type('Sao');
    await vi.advanceTimersByTimeAsync(300);
    expect(input().getAttribute('aria-expanded')).toBe('true');
    expect(listbox().hidden).toBe(false);
    expect(options()).toHaveLength(2);
    expect(options()[1]?.textContent).toContain('Zürich');
    expect(options()[1]?.textContent).toContain('Switzerland');
    expect(options().every((o) => o.getAttribute('aria-selected') === 'false')).toBe(true);
    expect(statusText()).toMatch(/2 places found/);
  });

  it('announces "No places found" and keeps the listbox closed for zero results', async () => {
    search.mockResolvedValue([]);
    mount();
    type('qqqq');
    await vi.advanceTimersByTimeAsync(300);
    expect(statusText()).toMatch(/No places found/);
    expect(root.textContent).toMatch(/No places found/);
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(options()).toHaveLength(0);
  });

  it('announces a friendly message when search fails', async () => {
    search.mockRejectedValue(new ApiError('rate_limited', 429));
    mount();
    type('Delhi');
    await vi.advanceTimersByTimeAsync(300);
    expect(statusText()).toMatch(/wait/i);
    expect(input().disabled).toBe(false);
  });

  it('aborts the previous request when the query changes', async () => {
    let first: AbortSignal | undefined;
    search.mockImplementationOnce((_q, signal) => {
      first = signal;
      return new Promise(() => {});
    });
    mount();
    type('Del');
    await vi.advanceTimersByTimeAsync(300);
    type('Delhi');
    expect(first?.aborted).toBe(true);
  });
});

describe('keyboard', () => {
  async function openList(): Promise<void> {
    mount();
    type('Sao');
    await vi.advanceTimersByTimeAsync(300);
  }

  it('moves the active option with the arrow keys via aria-activedescendant', async () => {
    await openList();
    expect(key('ArrowDown').defaultPrevented).toBe(true);
    expect(input().getAttribute('aria-activedescendant')).toBe(options()[0]?.id);
    expect(options()[0]?.getAttribute('aria-selected')).toBe('true');
    key('ArrowDown');
    expect(input().getAttribute('aria-activedescendant')).toBe(options()[1]?.id);
    expect(options()[0]?.getAttribute('aria-selected')).toBe('false');
    key('ArrowDown');
    expect(input().getAttribute('aria-activedescendant')).toBe(options()[0]?.id);
    key('ArrowUp');
    expect(input().getAttribute('aria-activedescendant')).toBe(options()[1]?.id);
    expect(document.activeElement).toBe(input());
  });

  it('picks the active option with Enter and closes the list', async () => {
    await openList();
    key('ArrowDown');
    key('ArrowDown');
    expect(key('Enter').defaultPrevented).toBe(true);
    expect(onPick).toHaveBeenCalledWith(ZURICH);
    expect(input().value).toBe('Zürich, Zurich, Switzerland');
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(input().hasAttribute('aria-activedescendant')).toBe(false);
    expect(listbox().hidden).toBe(true);
  });

  it('closes the list with Escape without picking', async () => {
    await openList();
    key('ArrowDown');
    key('Escape');
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(onPick).not.toHaveBeenCalled();
  });

  it('reopens a closed list with ArrowDown', async () => {
    await openList();
    key('Escape');
    key('ArrowDown');
    expect(input().getAttribute('aria-expanded')).toBe('true');
    expect(input().getAttribute('aria-activedescendant')).toBe(options()[0]?.id);
  });

  it('picks an option by click', async () => {
    await openList();
    options()[0]?.click();
    expect(onPick).toHaveBeenCalledWith(PLACE);
  });
});

describe('no stale list after a pick or a blur', () => {
  it('a pick cancels the pending search and clears the results', async () => {
    mount();
    type('Sao');
    await vi.advanceTimersByTimeAsync(300);
    expect(input().getAttribute('aria-expanded')).toBe('true');
    type('São P'); // starts a new debounce while the old options are still listed
    key('ArrowDown');
    key('Enter');
    expect(onPick).toHaveBeenCalledWith(PLACE);
    await vi.advanceTimersByTimeAsync(400);
    expect(search).toHaveBeenCalledTimes(1);
    expect(listbox().hidden).toBe(true);
    expect(options()).toHaveLength(0);
    key('ArrowDown');
    expect(input().getAttribute('aria-expanded')).toBe('false');
  });

  it('a pick aborts a search already in flight, and its late answer opens nothing', async () => {
    let resolve: (p: Place[]) => void = () => {};
    let signal: AbortSignal | undefined;
    search.mockImplementation((_q, s) => {
      signal = s;
      return new Promise((r) => (resolve = r));
    });
    mount(async () => ({ lat: 10, lon: 20 }));
    type('Lima');
    await vi.advanceTimersByTimeAsync(300);
    locateButton().click();
    await vi.advanceTimersByTimeAsync(0);
    expect(onPick).toHaveBeenCalledOnce();
    expect(signal?.aborted).toBe(true);
    resolve([PLACE]);
    await vi.advanceTimersByTimeAsync(0);
    expect(listbox().hidden).toBe(true);
    expect(input().getAttribute('aria-expanded')).toBe('false');
  });

  it('results that arrive after the input lost focus fill the list but do not open it', async () => {
    mount();
    type('Lima');
    input().blur();
    await vi.advanceTimersByTimeAsync(300);
    expect(search).toHaveBeenCalledOnce();
    expect(listbox().hidden).toBe(true);
    expect(input().getAttribute('aria-expanded')).toBe('false');
    input().focus();
    key('ArrowDown');
    expect(input().getAttribute('aria-expanded')).toBe('true');
  });
});

describe('use my location', () => {
  it('picks a rounded place with an empty country code, so grid figures use the world average', async () => {
    mount(async () => ({ lat: 28.613912, lon: 77.209023 }));
    locateButton().click();
    await vi.advanceTimersByTimeAsync(0);
    expect(onPick).toHaveBeenCalledWith({
      name: 'Current location',
      country: '',
      countryCode: '',
      lat: 28.61,
      lon: 77.21,
    });
  });

  it('explains a refusal, keeps the input enabled and re-enables the button', async () => {
    mount(async () => {
      throw new Error('denied');
    });
    locateButton().click();
    await vi.advanceTimersByTimeAsync(0);
    const message = "Couldn't get your location — search for your city instead.";
    expect(root.textContent).toContain(message);
    expect(statusText()).toBe(message);
    expect(input().disabled).toBe(false);
    expect(locateButton().hasAttribute('aria-disabled')).toBe(false);
    expect(locateButton().textContent).toContain('Use my location');
    expect(input().getAttribute('aria-describedby')).toContain(
      root.querySelector('.location-search__message')?.id,
    );
    expect(onPick).not.toHaveBeenCalled();
  });

  // GeolocationPositionError codes: 1 PERMISSION_DENIED, 2 POSITION_UNAVAILABLE, 3 TIMEOUT.
  it.each([
    [1, /blocked for this site.*site settings/],
    [2, /couldn't work out where you are.*location is turned on/],
    [3, /took too long.*Try again/],
  ])(
    'says what went wrong for geolocation error code %i, and how to fix it',
    async (code, text) => {
      mount(async () => {
        throw { code, message: 'from the browser' };
      });
      locateButton().click();
      await vi.advanceTimersByTimeAsync(0);
      const message = root.querySelector('.location-search__message');
      expect(message?.textContent).toMatch(text);
      expect(message?.textContent).toMatch(/search for your city/);
      expect(message?.getAttribute('data-tone')).toBe('error');
      expect(statusText()).toBe(message?.textContent);
      expect(onPick).not.toHaveBeenCalled();
    },
  );

  it('shows that it is locating while it waits, keeps focus, and ignores repeat clicks', () => {
    const geolocate = vi.fn(() => new Promise<{ lat: number; lon: number }>(() => {}));
    mount(geolocate);
    locateButton().focus();
    locateButton().click();
    locateButton().click();
    expect(geolocate).toHaveBeenCalledOnce();
    expect(locateButton().getAttribute('aria-disabled')).toBe('true');
    expect(locateButton().textContent).toMatch(/Locating/);
    expect(document.activeElement).toBe(locateButton());
    expect(input().disabled).toBe(false);
  });
});
