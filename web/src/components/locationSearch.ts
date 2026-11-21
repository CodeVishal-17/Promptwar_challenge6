import type { Place } from '../../../shared/types.js';
import { ApiError, searchPlaces } from '../api.js';
import { announce, h } from '../dom.js';
import { formatPlace } from '../format.js';
import { icon } from '../icons.js';
import { type Coords, browserGeolocate, locateButton } from './locateButton.js';
import { PlaceList } from './placeList.js';

export { browserGeolocate } from './locateButton.js';

const DEBOUNCE_MS = 300;
const MIN_QUERY = 2;
const MAX_QUERY = 80;
const NO_RESULTS = 'No places found. Check the spelling, or try a nearby larger city.';

interface Deps {
  search?: typeof searchPlaces;
  geolocate?: () => Promise<Coords>;
}

function searchErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.code === 'rate_limited') {
    return 'Too many searches in a short time — please wait a minute and try again.';
  }
  return "Place search isn't available right now — please try again.";
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** A place for the browser's own position. A reverse lookup would be another request, so the
 * country is unknown and grid figures use the world average (an empty code counts as absent). */
const currentLocation = ({ lat, lon }: Coords): Place => ({
  name: 'Current location',
  country: '',
  countryCode: '',
  lat: round2(lat),
  lon: round2(lon),
});

/** The input, its listbox popup and the message line, wired with ARIA ids under `id`. */
function searchElements(id: string) {
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
  return { message, listbox, input, combobox };
}

/**
 * Debounced, cancellable place search. A newer query, or `cancel()`, drops any pending or
 * in-flight one, so a late answer can never overwrite a newer one or reopen the list.
 */
function searchRunner(
  search: typeof searchPlaces,
  busyEl: HTMLElement,
  on: { results(places: Place[]): void; error(err: unknown): void },
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: AbortController | null = null;

  const settle = (controller: AbortController): void => {
    if (inFlight !== controller) return;
    inFlight = null;
    delete busyEl.dataset.busy;
  };

  const run = async (query: string): Promise<void> => {
    const controller = new AbortController();
    inFlight = controller;
    busyEl.dataset.busy = 'true';
    try {
      const places = await search(query, controller.signal);
      if (inFlight === controller) on.results(places);
    } catch (err) {
      if (!controller.signal.aborted) on.error(err);
    } finally {
      settle(controller);
    }
  };

  return {
    cancel(): void {
      clearTimeout(timer);
      inFlight?.abort();
      inFlight = null;
      delete busyEl.dataset.busy;
    },
    schedule(query: string): void {
      timer = setTimeout(() => void run(query), DEBOUNCE_MS);
    },
  };
}

const ARROW_STEP: Partial<Record<string, 1 | -1>> = { ArrowDown: 1, ArrowUp: -1 };

/** Arrow keys move through the options, Enter picks, Escape closes, Tab closes and moves on. */
function onComboboxKey(event: KeyboardEvent, list: PlaceList, pick: (p: Place) => void): void {
  const step = ARROW_STEP[event.key];
  if (step !== undefined) {
    if (list.count === 0) return;
    event.preventDefault();
    list.move(step);
    return;
  }
  const place = list.highlighted();
  if (event.key === 'Enter' && place) {
    event.preventDefault();
    pick(place);
  } else if (event.key === 'Escape' && list.isOpen()) {
    event.preventDefault();
    list.close();
  } else if (event.key === 'Tab') {
    list.close();
  }
}

/** The message line under the search: `show` writes it silently, `say` also announces it. */
function messageLine(message: HTMLElement) {
  const show = (text: string, tone: 'info' | 'error' = 'info'): void => {
    message.textContent = text;
    message.dataset.tone = tone;
  };
  const say = (text: string, tone: 'info' | 'error' = 'info'): void => {
    show(text, tone);
    announce(text);
  };
  return { show, say };
}

/** Fills the list with search results, opening it only if the input still has focus. */
function resultsHandler(
  list: PlaceList,
  input: HTMLInputElement,
  line: ReturnType<typeof messageLine>,
) {
  return (places: Place[]): void => {
    list.fill(places);
    if (places.length === 0) {
      list.close();
      line.say(NO_RESULTS);
      return;
    }
    line.show('');
    // Results that land after the user has moved on fill the list but do not pop it open.
    if (document.activeElement === input) list.open();
    const noun = places.length === 1 ? 'place' : 'places';
    announce(`${String(places.length)} ${noun} found. Use the up and down arrow keys to choose.`);
  };
}

type Runner = ReturnType<typeof searchRunner>;

/** Typing searches (after MIN_QUERY characters), keys drive the list, blur closes it. */
function wireInput(
  input: HTMLInputElement,
  list: PlaceList,
  runner: Runner,
  pick: (p: Place) => void,
) {
  input.addEventListener('input', () => {
    runner.cancel();
    const query = input.value.trim();
    if (query.length < MIN_QUERY) list.clear();
    else runner.schedule(query);
  });
  input.addEventListener('keydown', (event) => {
    onComboboxKey(event, list, pick);
  });
  input.addEventListener('blur', () => {
    list.close();
  });
}

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
  const id = `place-search-${String(++instances)}`;
  const { message, listbox, input, combobox } = searchElements(id);
  const line = messageLine(message);

  const pick = (place: Place): void => {
    runner.cancel();
    list.clear();
    input.value = formatPlace(place);
    line.show('');
    onPick(place);
  };
  const list = new PlaceList(id, input, listbox, pick);
  const runner = searchRunner(deps.search ?? searchPlaces, combobox, {
    results: resultsHandler(list, input, line),
    error: (err) => {
      line.say(searchErrorMessage(err), 'error');
    },
  });
  wireInput(input, list, runner, pick);
  // Keep focus in the input while an option is pressed, so the click lands before blur closes.
  listbox.addEventListener('mousedown', (event) => {
    event.preventDefault();
  });

  const locate = locateButton(deps.geolocate ?? browserGeolocate, {
    onStart: () => {
      line.show('');
    },
    onFound: (coords) => {
      pick(currentLocation(coords));
    },
    onError: (text) => {
      line.say(text, 'error');
    },
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
