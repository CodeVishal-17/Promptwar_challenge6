import type { Place } from '../../../shared/types.js';
import { ApiError, searchPlaces } from '../api.js';
import { announce, h, srOnly } from '../dom.js';
import { formatPlace } from '../format.js';
import { icon } from '../icons.js';

const DEBOUNCE_MS = 300;
const MIN_QUERY = 2;
const MAX_QUERY = 80;
const LOCATE_LABEL = 'Use my location';
const GEO_FAILED = "Couldn't get your location — search for your city instead.";
/** Keyed by GeolocationPositionError.code, so each failure says how to fix it. */
const GEO_MESSAGES: Record<number, string> = {
  1: "Location access is blocked for this site. Allow it in your browser's site settings, or search for your city.",
  2: "Your device couldn't work out where you are. Check that location is turned on, or search for your city.",
  3: 'Finding your location took too long. Try again, or search for your city.',
};

/** The message for a failed geolocation: specific for the browser's error codes, general otherwise. */
function geoErrorMessage(err: unknown): string {
  const code = (err as { code?: unknown } | null | undefined)?.code;
  return (typeof code === 'number' && GEO_MESSAGES[code]) || GEO_FAILED;
}
const NO_RESULTS = 'No places found. Check the spelling, or try a nearby larger city.';

interface Deps {
  search?: typeof searchPlaces;
  geolocate?: () => Promise<{ lat: number; lon: number }>;
}

/** The browser's position, coarse and possibly cached for 10 min: city-level air needs no more. */
export function browserGeolocate(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      reject,
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  });
}

function searchErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.code === 'rate_limited') {
    return 'Too many searches in a short time — please wait a minute and try again.';
  }
  return "Place search isn't available right now — please try again.";
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

let instances = 0;

/**
 * A city search following the ARIA 1.2 combobox pattern (editable input + listbox popup):
 * focus stays in the input while arrow keys move `aria-activedescendant` through the options,
 * Enter or a click picks, Escape and Tab close. Plus a "Use my location" button.
 */
export function mountLocationSearch(
  el: HTMLElement,
  onPick: (p: Place) => void,
  deps: Deps = {},
): void {
  const search = deps.search ?? searchPlaces;
  const geolocate = deps.geolocate ?? browserGeolocate;
  const id = `place-search-${++instances}`;

  const message = h('p', { id: `${id}-message`, class: 'location-search__message' });
  const listbox = h('ul', {
    id: `${id}-listbox`,
    class: 'listbox',
    role: 'listbox',
    'aria-label': 'Matching places',
    hidden: true,
  });
  const input = h('input', {
    id: `${id}-input`,
    class: 'combobox__input',
    type: 'text',
    role: 'combobox',
    'aria-autocomplete': 'list',
    'aria-expanded': 'false',
    'aria-controls': listbox.id,
    'aria-describedby': message.id,
    autocomplete: 'off',
    autocapitalize: 'words',
    spellcheck: 'false',
    enterkeyhint: 'search',
    maxlength: String(MAX_QUERY),
    placeholder: 'Search for a city',
  });
  const combobox = h(
    'div',
    { class: 'combobox' },
    icon('search', 'combobox__icon'),
    input,
    h('span', { class: 'combobox__spinner', 'aria-hidden': 'true' }),
    listbox,
  );
  const locateText = h('span', {}, LOCATE_LABEL);
  const locate = h(
    'button',
    { type: 'button', class: 'btn btn--secondary locate-button' },
    icon('locate'),
    locateText,
  );

  let results: Place[] = [];
  let active = -1;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: AbortController | null = null;
  let locating = false;

  const options = (): HTMLElement[] => [...listbox.children] as HTMLElement[];
  const isOpen = (): boolean => input.getAttribute('aria-expanded') === 'true';

  function setMessage(text: string, tone: 'info' | 'error' = 'info'): void {
    message.textContent = text;
    message.dataset.tone = tone;
  }

  function setActive(index: number): void {
    options()[active]?.setAttribute('aria-selected', 'false');
    active = index;
    const option = options()[index];
    if (!option) {
      input.removeAttribute('aria-activedescendant');
      return;
    }
    option.setAttribute('aria-selected', 'true');
    input.setAttribute('aria-activedescendant', option.id);
    option.scrollIntoView?.({ block: 'nearest' });
  }

  function open(): void {
    if (results.length === 0) return;
    listbox.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function close(): void {
    setActive(-1);
    listbox.hidden = true;
    input.setAttribute('aria-expanded', 'false');
  }

  /** Drops any pending or in-flight search, so a late answer cannot reopen the list. */
  function cancelSearch(): void {
    clearTimeout(timer);
    inFlight?.abort();
    inFlight = null;
    delete combobox.dataset.busy;
  }

  function pick(place: Place): void {
    cancelSearch();
    results = [];
    listbox.replaceChildren();
    close();
    input.value = formatPlace(place);
    setMessage('');
    onPick(place);
  }

  function option(place: Place, index: number): HTMLLIElement {
    const meta = [place.admin1, place.country].filter(Boolean).join(', ');
    return h(
      'li',
      {
        id: `${id}-option-${index}`,
        class: 'listbox__option',
        role: 'option',
        'aria-selected': 'false',
        onclick: () => pick(place),
      },
      h('span', { class: 'listbox__name' }, place.name),
      meta ? srOnly(', ') : null,
      meta ? h('span', { class: 'listbox__meta' }, meta) : null,
    );
  }

  function show(places: Place[]): void {
    results = places;
    active = -1;
    listbox.replaceChildren(...places.map(option));
    if (places.length === 0) {
      close();
      setMessage(NO_RESULTS);
      announce(NO_RESULTS);
      return;
    }
    setMessage('');
    // Results that land after the user has moved on fill the list but do not pop it open.
    if (document.activeElement === input) open();
    const noun = places.length === 1 ? 'place' : 'places';
    announce(`${places.length} ${noun} found. Use the up and down arrow keys to choose.`);
  }

  async function run(query: string): Promise<void> {
    const controller = new AbortController();
    inFlight = controller;
    combobox.dataset.busy = 'true';
    try {
      const places = await search(query, controller.signal);
      if (inFlight === controller) show(places);
    } catch (err) {
      if (controller.signal.aborted) return;
      const text = searchErrorMessage(err);
      setMessage(text, 'error');
      announce(text);
    } finally {
      if (inFlight === controller) {
        inFlight = null;
        delete combobox.dataset.busy;
      }
    }
  }

  input.addEventListener('input', () => {
    cancelSearch();
    const query = input.value.trim();
    if (query.length < MIN_QUERY) {
      results = [];
      listbox.replaceChildren();
      close();
      return;
    }
    timer = setTimeout(() => void run(query), DEBOUNCE_MS);
  });

  input.addEventListener('keydown', (event) => {
    const count = results.length;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        if (count === 0) return;
        event.preventDefault();
        open();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const from = active === -1 && step === -1 ? 0 : active;
        setActive((from + step + count) % count);
        return;
      }
      case 'Enter': {
        const place = results[active];
        if (isOpen() && place) {
          event.preventDefault();
          pick(place);
        }
        return;
      }
      case 'Escape':
        if (isOpen()) {
          event.preventDefault();
          close();
        }
        return;
      case 'Tab':
        close();
        return;
    }
  });

  input.addEventListener('blur', close);
  // Keep focus in the input while an option is pressed, so the click lands before blur closes.
  listbox.addEventListener('mousedown', (event) => event.preventDefault());

  locate.addEventListener('click', async () => {
    if (locating) return;
    locating = true;
    locate.setAttribute('aria-disabled', 'true');
    locateText.textContent = 'Locating…';
    setMessage('');
    try {
      const { lat, lon } = await geolocate();
      // A reverse lookup would be another request; the country is unknown, so grid figures
      // use the world average (the server treats an empty country code as absent).
      pick({
        name: 'Current location',
        country: '',
        countryCode: '',
        lat: round2(lat),
        lon: round2(lon),
      });
    } catch (err) {
      const text = geoErrorMessage(err);
      setMessage(text, 'error');
      announce(text);
    } finally {
      locating = false;
      locate.removeAttribute('aria-disabled');
      locateText.textContent = LOCATE_LABEL;
    }
  });

  el.replaceChildren(
    h(
      'div',
      { class: 'location-search' },
      h('label', { class: 'field-label', for: input.id }, 'Find a place'),
      h('div', { class: 'location-search__row' }, combobox, locate),
      message,
    ),
  );
}
