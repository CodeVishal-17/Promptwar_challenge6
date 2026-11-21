import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROFILE } from '../../shared/profile.js';
import type { AirReport, AskRequest, Place, Plan, PlanRequest } from '../../shared/types.js';
import { ApiError } from '../../web/src/api.js';
import { boot } from '../../web/src/main.js';
import {
  hasSeenOnboarding,
  loadProfile,
  markOnboardingSeen,
  savePlace,
  saveProfile,
} from '../../web/src/store.js';
import html from '../../web/index.html?raw';
import { PLACE, makePlan, makeReport, statusText } from './helpers.js';

/** Loads the real page shell into jsdom without parsing HTML through innerHTML. */
function loadShell(): void {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  document.body.replaceChildren(
    ...[...doc.body.childNodes].map((n) => document.importNode(n, true)),
  );
}

const nowBody = (): HTMLElement => document.getElementById('now-body') as HTMLElement;
const planBody = (): HTMLElement => document.getElementById('plan-body') as HTMLElement;
const section = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
const flush = () => new Promise((r) => setTimeout(r, 0));
const byText = (root: ParentNode, text: string): HTMLButtonElement | undefined =>
  [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);

let getAir: ReturnType<typeof vi.fn<(lat: number, lon: number) => Promise<AirReport>>>;
let getPlan: ReturnType<typeof vi.fn<(body: PlanRequest) => Promise<Plan>>>;
const searchPlaces = vi.fn(async (): Promise<Place[]> => []);
let ask: ReturnType<
  typeof vi.fn<(body: AskRequest) => Promise<{ answer: string; aiUsed: boolean }>>
>;
const deps = () => ({ api: { getAir, getPlan, searchPlaces, ask } });

/** Types a query into the location search and picks the first suggestion. */
async function pickFromSearch(): Promise<void> {
  const input = document.querySelector('input') as HTMLInputElement;
  input.value = 'Lima';
  input.dispatchEvent(new Event('input'));
  await new Promise((r) => setTimeout(r, 350));
  (document.querySelector('[role="option"]') as HTMLElement).click();
}

beforeEach(() => {
  localStorage.clear();
  markOnboardingSeen();
  loadShell();
  getAir = vi.fn(async () => makeReport());
  getPlan = vi.fn(async () => makePlan());
  ask = vi.fn(async () => ({ answer: 'Go at dusk.', aiUsed: true }));
});
afterEach(() => {
  document.title = '';
  history.replaceState(null, '', location.pathname);
});

// jsdom has no layout; the router scrolls to the top on navigation.
vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

function go(hash: string): void {
  location.hash = hash;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

const visibleScreens = (): string[] =>
  [...document.querySelectorAll<HTMLElement>('.screen')].filter((s) => !s.hidden).map((s) => s.id);
const emptyTitle = (id: string): string | null | undefined =>
  document.querySelector(`#${id}:not([hidden]) .screen-empty__title`)?.textContent;

describe('boot', () => {
  it('without a saved place, shows the welcome state and fetches nothing', async () => {
    await boot(deps());
    expect(getAir).not.toHaveBeenCalled();
    expect(getPlan).not.toHaveBeenCalled();
    expect(document.querySelector('#today-puff svg')?.getAttribute('data-mood')).toBe('wave');
    expect(document.querySelector('#today-puff .puff-says__bubble')?.textContent).toMatch(
      /Hi, I'm Puff!/,
    );
    expect(section('now').hidden).toBe(true);
    expect(section('search-panel').hidden).toBe(false);
    expect(document.querySelector('[role="combobox"]')).not.toBeNull();
    for (const id of ['forecast-empty', 'plan-empty', 'ask-empty']) {
      expect(emptyTitle(id), id).toBe('Pick a place first');
    }
    expect(visibleScreens()).toEqual(['screen-today']);
    expect(document.title).toBe('Today — Clearday');
  });

  it('reveals the forecast section and draws the chart once the air arrives', async () => {
    savePlace(PLACE);
    expect(section('forecast').hidden).toBe(true);
    await boot(deps());
    expect(section('forecast').hidden).toBe(false);
    expect(document.querySelector('#forecast-body svg[role="img"]')).not.toBeNull();
  });

  it('loads the saved place, fetches its air and renders the AQI card', async () => {
    savePlace(PLACE);
    getPlan.mockImplementationOnce(() => new Promise(() => {}));
    await Promise.race([boot(deps()), flush().then(flush)]);
    expect(getAir).toHaveBeenCalledWith(PLACE.lat, PLACE.lon);
    expect(nowBody().querySelector('.aqi-number')?.textContent).toBe('162');
    expect(nowBody().hasAttribute('aria-busy')).toBe(false);
    expect(statusText()).toBe('Air quality for São Paulo, Brazil: AQI 162, Unhealthy.');
    expect(document.title).toBe('Today · São Paulo — Clearday');
  });

  it('shows an error with Retry when the air request fails, and Retry tries again', async () => {
    savePlace(PLACE);
    getAir.mockRejectedValueOnce(new ApiError('air_data_unavailable', 502));
    await boot(deps());
    expect(nowBody().textContent).toMatch(/not responding/);
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    byText(nowBody(), 'Retry')?.click();
    await flush();
    expect(getAir).toHaveBeenCalledTimes(2);
    expect(nowBody().querySelector('.aqi-number')).not.toBeNull();
  });

  it('ignores a slow answer for a place the user has already moved away from', async () => {
    savePlace(PLACE);
    let resolveFirst: (r: AirReport) => void = () => {};
    getAir.mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)));
    getAir.mockImplementationOnce(async () =>
      makeReport({ now: { ...makeReport().now!, aqi: 42, category: 'good' } }),
    );
    searchPlaces.mockResolvedValueOnce([
      { ...PLACE, name: 'Lima', admin1: undefined, country: 'Peru', countryCode: 'PE' },
    ]);
    const pending = boot(deps());
    await pickFromSearch();
    await flush();
    resolveFirst(makeReport());
    await pending;
    await flush();

    expect(nowBody().querySelector('.aqi-number')?.textContent).toBe('42');
    expect(nowBody().textContent).toContain('Lima, Peru');
    expect(getPlan).toHaveBeenCalledOnce();
    expect(getPlan.mock.calls[0]?.[0].countryCode).toBe('PE');
  });

  it('renders the “How we calculate” section', async () => {
    await boot(deps());
    expect(section('method-body').textContent).toContain('Numbers from code, words from AI');
  });
});

describe('the plan', () => {
  it('requests the plan for the place and saved profile, then shows and announces it', async () => {
    savePlace(PLACE);
    const profile = structuredClone(DEFAULT_PROFILE);
    profile.household.children = 1;
    saveProfile(profile);
    await boot(deps());
    expect(getPlan).toHaveBeenCalledWith({
      lat: PLACE.lat,
      lon: PLACE.lon,
      countryCode: 'BR',
      profile,
    });
    expect(section('plan').hidden).toBe(false);
    expect(planBody().querySelectorAll('.plan-section')).toHaveLength(3);
    expect(statusText()).toBe('Your plan is ready.');
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('leaves out an empty country code (a geolocated place)', async () => {
    savePlace({ ...PLACE, countryCode: '' });
    await boot(deps());
    expect(getPlan.mock.calls[0]?.[0]).not.toHaveProperty('countryCode');
  });

  it('shows a skeleton marked busy while the plan loads', async () => {
    savePlace(PLACE);
    let resolve: (p: Plan) => void = () => {};
    getPlan.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    const pending = boot(deps());
    await flush();
    expect(section('plan').getAttribute('aria-busy')).toBe('true');
    expect(planBody().querySelector('.skeleton')).not.toBeNull();
    resolve(makePlan());
    await pending;
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('when the plan fails, keeps the AQI card, offers Retry, and leaves nothing busy', async () => {
    savePlace(PLACE);
    getPlan.mockRejectedValueOnce(new ApiError('network', 0));
    await boot(deps());

    expect(nowBody().querySelector('.aqi-number')?.textContent).toBe('162');
    expect(planBody().textContent).toContain("We couldn't load your plan.");
    expect(planBody().textContent).toContain('Check your connection');
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(statusText()).toBe("We couldn't load your plan.");

    byText(planBody(), 'Retry')?.click();
    await flush();
    expect(getPlan).toHaveBeenCalledTimes(2);
    expect(planBody().querySelectorAll('.plan-section')).toHaveLength(3);
    expect(document.activeElement?.id).toBe('plan-title');
  });

  it('contains a malformed plan: error UI, nothing busy, no unhandled rejection', async () => {
    savePlace(PLACE);
    getPlan.mockResolvedValueOnce({} as Plan);
    await boot(deps());
    expect(planBody().textContent).toContain("We couldn't load your plan.");
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('contains a malformed air report: error UI, nothing busy, no plan request', async () => {
    savePlace(PLACE);
    getAir.mockResolvedValueOnce({ ...makeReport(), hourly: undefined } as unknown as AirReport);
    await boot(deps());
    expect(nowBody().textContent).toContain("We couldn't load the air quality");
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(getPlan).not.toHaveBeenCalled();
    expect(section('plan').hidden).toBe(true);
  });

  it('hides the previous place’s plan and forecast when the next place’s air fails', async () => {
    savePlace(PLACE);
    await boot(deps());
    expect(section('plan').hidden).toBe(false);

    searchPlaces.mockResolvedValueOnce([{ ...PLACE, name: 'Lima', countryCode: 'PE' }]);
    getAir.mockRejectedValueOnce(new ApiError('air_data_unavailable', 502));
    await pickFromSearch();
    await flush();
    expect(section('plan').hidden).toBe(true);
    expect(section('forecast').hidden).toBe(true);
  });

  it('drops a slow plan for a place the user has moved away from', async () => {
    savePlace(PLACE);
    let resolveFirst: (p: Plan) => void = () => {};
    getPlan.mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)));
    getPlan.mockImplementationOnce(async () => makePlan({ summary: 'Lima plan' }));
    searchPlaces.mockResolvedValueOnce([{ ...PLACE, name: 'Lima', countryCode: 'PE', lat: -12 }]);
    const pending = boot(deps());
    await flush();
    await pickFromSearch();
    await flush();
    resolveFirst(makePlan({ summary: 'São Paulo plan' }));
    await pending;
    await flush();
    expect(planBody().textContent).toContain('Lima plan');
    expect(planBody().textContent).not.toContain('São Paulo plan');
  });

  it('while the next place’s air loads, shows nothing of the previous place’s plan or forecast', async () => {
    savePlace(PLACE);
    await boot(deps());
    expect(section('plan').hidden).toBe(false);
    expect(section('forecast').hidden).toBe(false);

    searchPlaces.mockResolvedValueOnce([{ ...PLACE, name: 'Lima', countryCode: 'PE', lat: -12 }]);
    getAir.mockImplementationOnce(() => new Promise(() => {}));
    await pickFromSearch();
    await flush();

    expect(nowBody().querySelector('.skeleton')).not.toBeNull();
    expect(section('plan').hidden).toBe(true);
    expect(section('forecast').hidden).toBe(true);
    expect(planBody().childNodes).toHaveLength(0);
    expect(section('forecast-body').childNodes).toHaveLength(0);
    expect(document.querySelector('[aria-busy="true"]:not(#now-body)')).toBeNull();
  });

  it('leaves nothing busy when a plan is pending, the place changes and the new air fails', async () => {
    savePlace(PLACE);
    getPlan.mockImplementationOnce(() => new Promise(() => {}));
    void boot(deps());
    await flush();
    await flush();
    expect(section('plan').getAttribute('aria-busy')).toBe('true');

    searchPlaces.mockResolvedValueOnce([{ ...PLACE, name: 'Lima', countryCode: 'PE', lat: -12 }]);
    getAir.mockRejectedValueOnce(new ApiError('air_data_unavailable', 502));
    await pickFromSearch();
    await flush();

    expect(nowBody().textContent).toMatch(/not responding/);
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(section('plan').hidden).toBe(true);
  });

  it('a profile saved while the next place’s air loads is planned only once that air arrives', async () => {
    savePlace(PLACE);
    await boot(deps());
    expect(getPlan).toHaveBeenCalledTimes(1);

    const lima = { ...PLACE, name: 'Lima', countryCode: 'PE', lat: -12 };
    searchPlaces.mockResolvedValueOnce([lima]);
    let resolveAir: (r: AirReport) => void = () => {};
    getAir.mockImplementationOnce(() => new Promise((r) => (resolveAir = r)));
    await pickFromSearch();
    await flush();

    byText(document, 'Edit household')?.click();
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    (dialog.querySelector('input[type="number"]') as HTMLInputElement).value = '4';
    byText(dialog, 'Next')?.click();
    byText(dialog, 'Next')?.click();
    byText(dialog, 'Save')?.click();
    await flush();
    expect(loadProfile().household.adults).toBe(4);
    expect(getPlan).toHaveBeenCalledTimes(1);
    expect(section('plan').hidden).toBe(true);

    resolveAir(makeReport());
    await flush();
    expect(getPlan).toHaveBeenCalledTimes(2);
    expect(getPlan.mock.calls[1]?.[0]).toMatchObject({ lat: -12, countryCode: 'PE' });
    expect(getPlan.mock.calls[1]?.[0].profile.household.adults).toBe(4);
  });

  it('reuses the cached plan when the place, profile and hour are unchanged', async () => {
    savePlace(PLACE);
    await boot(deps());
    byText(document, 'Edit household')?.click();
    byText(document.querySelector('dialog') as HTMLDialogElement, 'Next')?.click();
    byText(document.querySelector('dialog') as HTMLDialogElement, 'Next')?.click();
    byText(document.querySelector('dialog') as HTMLDialogElement, 'Save')?.click();
    await flush();
    expect(getPlan).toHaveBeenCalledTimes(1);
    expect(planBody().querySelectorAll('.plan-section')).toHaveLength(3);
    expect(statusText()).toBe('Your plan is ready.');
  });

  it('“Edit household” reopens the form, and saving a change re-requests the plan', async () => {
    savePlace(PLACE);
    await boot(deps());
    expect(getPlan).toHaveBeenCalledTimes(1);

    byText(document, 'Edit household')?.click();
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    expect(dialog).not.toBeNull();
    const adults = dialog.querySelector('input[type="number"]') as HTMLInputElement;
    adults.value = '3';
    byText(dialog, 'Next')?.click();
    byText(dialog, 'Next')?.click();
    byText(dialog, 'Save')?.click();
    await flush();

    expect(document.querySelector('dialog')).toBeNull();
    expect(loadProfile().household.adults).toBe(3);
    expect(getPlan).toHaveBeenCalledTimes(2);
    expect(getPlan.mock.calls[1]?.[0].profile.household.adults).toBe(3);
  });
});

describe('first visit', () => {
  beforeEach(() => localStorage.clear());

  it('opens the profile form after the air loads; skipping still gives a default plan', async () => {
    savePlace(PLACE);
    await boot(deps());
    expect(nowBody().querySelector('.aqi-number')).not.toBeNull();
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    expect(dialog).not.toBeNull();
    expect(getPlan).not.toHaveBeenCalled();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();

    byText(dialog, 'Skip')?.click();
    await flush();
    expect(hasSeenOnboarding()).toBe(true);
    expect(getPlan).toHaveBeenCalledOnce();
    expect(getPlan.mock.calls[0]?.[0].profile).toEqual(DEFAULT_PROFILE);
  });

  it('does not plan for the previous place when the place changes while the form is open', async () => {
    savePlace(PLACE);
    const geolocate = async () => ({ lat: 10, lon: 20 });
    await boot({ ...deps(), geolocate });
    const first = document.querySelector('dialog') as HTMLDialogElement;
    expect(first).not.toBeNull();

    // A slow "Use my location" lands while the form is open; its air is still loading.
    getAir.mockImplementation(() => new Promise(() => {}));
    byText(document, 'Use my location')?.click();
    await flush();
    expect(getAir).toHaveBeenLastCalledWith(10, 20);

    byText(first, 'Skip')?.click();
    await flush();
    expect(hasSeenOnboarding()).toBe(true);
    expect(getPlan).not.toHaveBeenCalled();
  });

  it('saving the first-visit form stores the profile and plans with it', async () => {
    savePlace(PLACE);
    await boot(deps());
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    byText(dialog, 'Next')?.click();
    byText(dialog, 'Next')?.click();
    const smoking = [...dialog.querySelectorAll('label')].find(
      (l) => l.textContent === 'Someone smokes indoors',
    );
    (document.getElementById(smoking?.htmlFor ?? '') as HTMLInputElement).checked = true;
    byText(dialog, 'Save')?.click();
    await flush();
    expect(hasSeenOnboarding()).toBe(true);
    expect(loadProfile().home.indoorSmoking).toBe(true);
    expect(getPlan.mock.calls[0]?.[0].profile.home.indoorSmoking).toBe(true);
  });
});

describe('ask panel', () => {
  async function submitQuestion(text: string): Promise<void> {
    const textarea = document.querySelector('#ask-body textarea') as HTMLTextAreaElement;
    textarea.value = text;
    textarea.dispatchEvent(new Event('input'));
    (document.querySelector('#ask-body button[type="submit"]') as HTMLButtonElement).click();
    await flush();
  }

  it('is hidden until a place’s air has loaded, then asks with that place and profile', async () => {
    expect(section('ask').hidden).toBe(true);
    savePlace(PLACE);
    await boot(deps());
    expect(section('ask').hidden).toBe(false);
    await submitQuestion('Should I run?');
    expect(ask).toHaveBeenCalledWith(
      expect.objectContaining({ lat: PLACE.lat, lon: PLACE.lon, question: 'Should I run?' }),
    );
    expect(document.getElementById('ask-body')?.textContent).toContain('Go at dusk.');
  });

  it('hides and clears the answer when the place changes, and drops a pending answer', async () => {
    savePlace(PLACE);
    await boot(deps());
    let resolveAsk: (r: { answer: string; aiUsed: boolean }) => void = () => {};
    ask.mockImplementationOnce(() => new Promise((r) => (resolveAsk = r)));
    await submitQuestion('Should I run?');
    searchPlaces.mockResolvedValueOnce([
      { ...PLACE, name: 'Lima', admin1: undefined, country: 'Peru', countryCode: 'PE' },
    ]);
    getAir.mockImplementationOnce(() => new Promise(() => {}));
    await pickFromSearch();
    await flush();
    expect(section('ask').hidden).toBe(true);
    resolveAsk({ answer: 'Old place answer.', aiUsed: true });
    await flush();
    expect(document.querySelector('#ask-body .ask__answer')?.textContent).toBe('');
  });
});

describe('app shell', () => {
  it('opens a deep link before any place on its empty state', async () => {
    location.hash = '#/plan';
    await boot(deps());
    expect(visibleScreens()).toEqual(['screen-plan']);
    expect(emptyTitle('plan-empty')).toBe('Pick a place first');
    expect(document.querySelector('#plan-empty a')?.getAttribute('href')).toBe('#/today');
    expect(document.title).toBe('My plan — Clearday');
  });

  it('shows Puff in the air’s mood with his line, and hides the empty states', async () => {
    savePlace(PLACE);
    await boot(deps());
    expect(document.querySelector('#today-puff svg')?.getAttribute('data-mood')).toBe('unhealthy');
    expect(document.querySelector('#today-puff .puff-says__bubble')?.textContent).toContain(
      'Rough air today, so keep outdoor effort light.',
    );
    for (const id of ['forecast-empty', 'plan-empty', 'ask-empty']) {
      expect(section(id).hidden, id).toBe(true);
    }
  });

  it('collapses the search once a place is chosen, and names it in the header', async () => {
    savePlace(PLACE);
    await boot(deps());
    expect(section('search-panel').hidden).toBe(true);
    expect(section('place-pill').hidden).toBe(false);
    expect(section('place-pill-name').textContent).toBe('São Paulo');
    expect(section('change-place').hidden).toBe(false);
    expect(section('now').hidden).toBe(false);
  });

  it('marks the plan card busy on Today while the plan loads, then fills it in', async () => {
    savePlace(PLACE);
    let resolve: (p: Plan) => void = () => {};
    getPlan.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    const pending = boot(deps());
    await flush();
    await flush();
    expect(section('highlights').hidden).toBe(false);
    expect(document.querySelector('.highlight--plan')?.getAttribute('aria-busy')).toBe('true');
    resolve(makePlan());
    await pending;
    expect(document.querySelector('.highlight--plan .highlight__value')?.textContent).toBe(
      '3 steps for today',
    );
    expect(document.querySelector('.highlight--indoor')).not.toBeNull();
  });

  it('says the plan is unavailable on Today when it fails', async () => {
    savePlace(PLACE);
    getPlan.mockRejectedValueOnce(new ApiError('network', 0));
    await boot(deps());
    expect(document.querySelector('.highlight--plan .highlight__value')?.textContent).toBe(
      'Open your plan',
    );
  });

  it('the place pill opens the search on Today from any screen, and a pick closes it', async () => {
    savePlace(PLACE);
    await boot(deps());
    go('#/forecast');
    section('place-pill').click();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(location.hash).toBe('#/today');
    expect(visibleScreens()).toEqual(['screen-today']);
    expect(section('search-panel').hidden).toBe(false);
    expect(section('place-pill').getAttribute('aria-expanded')).toBe('true');
    expect(section('change-place').getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(document.querySelector('#location-search input'));

    searchPlaces.mockResolvedValueOnce([{ ...PLACE, name: 'Lima', countryCode: 'PE' }]);
    await pickFromSearch();
    await flush();
    expect(section('search-panel').hidden).toBe(true);
    expect(section('change-place').getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement?.id).toBe('now-title');
    expect(section('place-pill-name').textContent).toBe('Lima');
  });

  it('Change place toggles the search open and closed', async () => {
    savePlace(PLACE);
    await boot(deps());
    section('change-place').click();
    expect(section('search-panel').hidden).toBe(false);
    section('change-place').click();
    expect(section('search-panel').hidden).toBe(true);
    expect(section('change-place').getAttribute('aria-expanded')).toBe('false');
  });

  it('shows “checking” on the other screens while a place loads', async () => {
    getAir.mockImplementationOnce(() => new Promise(() => {}));
    savePlace(PLACE);
    void boot(deps());
    await flush();
    expect(emptyTitle('forecast-empty')).toBe('Checking the air…');
    expect(section('highlights').hidden).toBe(true);
  });

  it('when the air fails, the other screens point back to Today', async () => {
    savePlace(PLACE);
    getAir.mockRejectedValueOnce(new ApiError('air_data_unavailable', 502));
    await boot(deps());
    for (const id of ['forecast-empty', 'plan-empty', 'ask-empty']) {
      expect(emptyTitle(id), id).toBe("We couldn't load the air");
    }
    expect(section('highlights').hidden).toBe(true);
  });

  it('titles the page with the screen and the place on navigation', async () => {
    savePlace(PLACE);
    await boot(deps());
    go('#/ask');
    expect(document.title).toBe('Ask · São Paulo — Clearday');
    expect(document.activeElement?.id).toBe('ask-title');
  });
});
