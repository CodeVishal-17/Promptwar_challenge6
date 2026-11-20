import type { AirReport, Place, Profile } from '../../shared/types.js';
import * as realApi from './api.js';
import { ApiError } from './api.js';
import { renderAqiCard, renderAqiError, renderAqiSkeleton } from './components/aqiCard.js';
import { renderForecast as drawForecast } from './components/forecastChart.js';
import { mountLocationSearch } from './components/locationSearch.js';
import { announce } from './dom.js';
import { CATEGORY_LABEL, formatPlace } from './format.js';
import { loadPlace, loadProfile, savePlace } from './store.js';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

export type AppApi = Pick<typeof realApi, 'searchPlaces' | 'getAir' | 'getPlan' | 'ask'>;

export interface BootDeps {
  /** Replace any API call, e.g. with a fake in tests. */
  api?: Partial<AppApi>;
  geolocate?: () => Promise<{ lat: number; lon: number }>;
}

/** The API the app talks to; `boot` swaps in injected fakes. Later tasks read it from here. */
export let api: AppApi = realApi;

/** Draws the 48-hour chart and outlook, and reveals their section. */
export function renderForecast(report: AirReport): void {
  drawForecast(byId('forecast-body'), report);
  byId('forecast').hidden = false;
}

/** Fetches and shows the household plan. Placeholder until Task 10 replaces it. */
export async function requestPlan(place: Place, profile: Profile): Promise<void> {
  void place;
  void profile;
}

function airErrorMessage(err: unknown): string {
  const code = err instanceof ApiError ? err.code : 'unknown';
  switch (code) {
    case 'rate_limited':
      return 'Too many requests in a short time — please wait a few minutes and try again.';
    case 'air_data_incomplete':
      return 'The air-quality model has no reading for this place right now. Please try again later.';
    case 'air_data_unavailable':
      return 'The air-quality service is not responding right now. Please try again in a moment.';
    case 'network':
    case 'timeout':
      return "We couldn't reach Clearday. Check your connection and try again.";
    default:
      return 'Something went wrong on our side. Please try again.';
  }
}

const byId = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in index.html`);
  return el;
};

/** Increments on every place change, so a slow answer for an earlier place is dropped. */
let generation = 0;

async function showPlace(place: Place): Promise<void> {
  const mine = ++generation;
  const nowBody = byId('now-body');
  document.title = `${place.name} — Clearday`;
  renderAqiSkeleton(nowBody);

  let report: AirReport;
  try {
    report = await api.getAir(place.lat, place.lon);
  } catch (err) {
    if (mine !== generation) return;
    const message = airErrorMessage(err);
    renderAqiError(nowBody, message, () => {
      byId('now-title').focus();
      void showPlace(place);
    });
    announce(message);
    return;
  }
  if (mine !== generation) return;

  renderAqiCard(nowBody, report, place);
  announce(
    report.now
      ? `Air quality for ${formatPlace(place)}: AQI ${report.now.aqi}, ${CATEGORY_LABEL[report.now.category]}.`
      : `No air-quality reading for ${formatPlace(place)} this hour.`,
  );
  renderForecast(report);
  await requestPlan(place, loadProfile());
}

/**
 * Starts the app: mounts the location search, then — if a place was saved — loads its air
 * report, renders the AQI card, the forecast and the plan, in that order.
 */
export async function boot(deps: BootDeps = {}): Promise<void> {
  api = { ...realApi, ...deps.api };
  mountLocationSearch(
    byId('location-search'),
    (place) => {
      savePlace(place);
      void showPlace(place);
    },
    { search: api.searchPlaces, geolocate: deps.geolocate },
  );
  const place = loadPlace();
  if (place) await showPlace(place);
}

// Module scripts run before DOMContentLoaded, so this fires once in the browser; under test,
// the document has already loaded and tests call boot() themselves.
document.addEventListener('DOMContentLoaded', () => void boot());
