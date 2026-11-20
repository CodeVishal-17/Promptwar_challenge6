import type { AirReport, Place, Plan, PlanRequest, Profile } from '../../shared/types.js';
import * as realApi from './api.js';
import { ApiError } from './api.js';
import { mountAskPanel, type AskPanel } from './components/askPanel.js';
import { renderAqiCard, renderAqiError, renderAqiSkeleton } from './components/aqiCard.js';
import { renderForecast as drawForecast } from './components/forecastChart.js';
import { mountLocationSearch } from './components/locationSearch.js';
import { renderMethod } from './components/method.js';
import { renderPlan, renderPlanError, renderPlanSkeleton } from './components/planView.js';
import { openProfileForm } from './components/profileForm.js';
import { announce } from './dom.js';
import { CATEGORY_LABEL, formatPlace } from './format.js';
import {
  hasSeenOnboarding,
  loadPlace,
  loadProfile,
  markOnboardingSeen,
  savePlace,
  saveProfile,
} from './store.js';
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

const byId = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in index.html`);
  return el;
};

/** Draws the 48-hour chart and outlook, and reveals their section. */
export function renderForecast(report: AirReport): void {
  drawForecast(byId('forecast-body'), report);
  byId('forecast').hidden = false;
}

type ErrorCopy = Partial<Record<string, string>>;

const COMMON_ERRORS: ErrorCopy = {
  network: "We couldn't reach Clearday. Check your connection and try again.",
  timeout: "We couldn't reach Clearday. Check your connection and try again.",
};
const AIR_ERRORS: ErrorCopy = {
  ...COMMON_ERRORS,
  rate_limited: 'Too many requests in a short time — please wait a few minutes and try again.',
  air_data_incomplete:
    'The air-quality model has no reading for this place right now. Please try again later.',
  air_data_unavailable:
    'The air-quality service is not responding right now. Please try again in a moment.',
};
const PLAN_ERRORS: ErrorCopy = {
  ...COMMON_ERRORS,
  rate_limited: 'Too many plan requests in a short time — please wait a few minutes and try again.',
  air_data_incomplete:
    'The air-quality model has no reading for this place right now, so we can’t tailor a plan yet.',
  air_data_unavailable:
    'The air-quality service is not responding right now. Please try again in a moment.',
};

function errorMessage(err: unknown, copy: ErrorCopy): string {
  const code = err instanceof ApiError ? err.code : 'unknown';
  return copy[code] ?? 'Something went wrong on our side. Please try again.';
}

// ---------- Plan ----------

/** Plans already fetched this visit, by place, profile and local hour. Small and bounded. */
const planCache = new Map<string, Plan>();
const PLAN_CACHE_MAX = 20;
/** Increments on every plan request and place change, so a stale plan is never shown. */
let planGeneration = 0;
/**
 * The place whose air report is on screen, and whether it had a current reading. Null while a
 * place's air is loading or has failed, so nothing can plan for a place without its air.
 */
let loaded: { place: Place; hasReading: boolean } | null = null;

/** The mounted Q&A panel, so a place change can clear its answer. */
let askPanel: AskPanel | null = null;

const pad = (n: number) => String(n).padStart(2, '0');

/** `lat,lon|profile|YYYY-MM-DDTHH` in the browser's local time: a new hour means a new plan. */
export function planKey(place: Place, profile: Profile, now = new Date()): string {
  const hour = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}`;
  return `${place.lat},${place.lon}|${JSON.stringify(profile)}|${hour}`;
}

function remember(key: string, plan: Plan): void {
  planCache.delete(key);
  planCache.set(key, plan);
  if (planCache.size > PLAN_CACHE_MAX) {
    const oldest = planCache.keys().next().value;
    if (oldest !== undefined) planCache.delete(oldest);
  }
}

/**
 * Fetches and shows the household plan, from memory when the place, profile and hour are
 * unchanged. `hasReading` says whether this place's report had a current reading. Never
 * rejects: a failure, or a malformed plan, becomes the plan error with Retry.
 */
export async function requestPlan(
  place: Place,
  profile: Profile,
  { hasReading = true }: { hasReading?: boolean } = {},
): Promise<void> {
  const mine = ++planGeneration;
  const body = byId('plan-body');
  byId('plan').hidden = false;
  const key = planKey(place, profile);
  const retry = () => {
    byId('plan-title').focus();
    void requestPlan(place, loadProfile(), { hasReading });
  };
  const fail = (err: unknown) => {
    renderPlanError(body, retry, errorMessage(err, PLAN_ERRORS));
    announce("We couldn't load your plan.");
  };

  let plan = planCache.get(key);
  if (!plan) {
    renderPlanSkeleton(body);
    const request: PlanRequest = {
      lat: place.lat,
      lon: place.lon,
      ...(place.countryCode ? { countryCode: place.countryCode } : {}),
      profile,
    };
    try {
      plan = await api.getPlan(request);
    } catch (err) {
      if (mine === planGeneration) fail(err);
      return;
    }
    if (mine !== planGeneration) return;
  }

  try {
    renderPlan(body, plan, { hasReading });
  } catch (err) {
    fail(err);
    return;
  }
  remember(key, plan);
  announce('Your plan is ready.');
}

/**
 * Opens the household form. A saved change is stored and, once a place's air is on screen,
 * re-planned; while the air is still loading, that load plans with the saved profile.
 */
function editProfile(): void {
  openProfileForm(loadProfile(), (profile) => {
    saveProfile(profile);
    if (loaded) void requestPlan(loaded.place, profile, { hasReading: loaded.hasReading });
  });
}

/** First visit: ask about the household once, then plan with whatever they chose. */
function onboardThenPlan(place: Place, hasReading: boolean): void {
  const done = (profile: Profile) => {
    markOnboardingSeen();
    void requestPlan(place, profile, { hasReading });
  };
  openProfileForm(
    loadProfile(),
    (profile) => {
      saveProfile(profile);
      done(profile);
    },
    () => done(loadProfile()),
  );
}

// ---------- Place ----------

/** Increments on every place change, so a slow answer for an earlier place is dropped. */
let generation = 0;

/**
 * Clears what belongs to the previous place — its forecast and plan — and any loading state
 * they carried, so nothing from one place shows beside another and nothing stays busy.
 */
function resetDependents(): void {
  loaded = null;
  planGeneration++;
  askPanel?.reset();
  byId('ask').hidden = true;
  for (const id of ['forecast', 'plan']) {
    const section = byId(id);
    section.hidden = true;
    section.removeAttribute('aria-busy');
    byId(`${id}-body`).replaceChildren();
  }
}

/**
 * Loads a place: AQI card, forecast, then the plan. Never rejects; any failure ends in the
 * error card with Retry, and nothing is left marked busy.
 */
async function showPlace(place: Place): Promise<void> {
  const mine = ++generation;
  resetDependents();
  const nowBody = byId('now-body');
  document.title = `${place.name} — Clearday`;
  renderAqiSkeleton(nowBody);

  const fail = (err: unknown) => {
    resetDependents();
    const message = errorMessage(err, AIR_ERRORS);
    renderAqiError(nowBody, message, () => {
      byId('now-title').focus();
      void showPlace(place);
    });
    announce(message);
  };

  let report: AirReport;
  try {
    report = await api.getAir(place.lat, place.lon);
  } catch (err) {
    if (mine === generation) fail(err);
    return;
  }
  if (mine !== generation) return;

  try {
    renderAqiCard(nowBody, report, place);
    renderForecast(report);
  } catch (err) {
    fail(err);
    return;
  }
  announce(
    report.now
      ? `Air quality for ${formatPlace(place)}: AQI ${report.now.aqi}, ${CATEGORY_LABEL[report.now.category]}.`
      : `No air-quality reading for ${formatPlace(place)} this hour.`,
  );
  const hasReading = report.now !== null;
  loaded = { place, hasReading };
  byId('ask').hidden = false;
  if (hasSeenOnboarding()) await requestPlan(place, loadProfile(), { hasReading });
  else onboardThenPlan(place, hasReading);
}

/**
 * Starts the app: mounts the location search and the method notes, then — if a place was
 * saved — loads its air report, renders the AQI card, the forecast and the plan, in that order.
 */
export async function boot(deps: BootDeps = {}): Promise<void> {
  api = { ...realApi, ...deps.api };
  planCache.clear();
  renderMethod(byId('method-body'));
  byId('edit-profile').onclick = editProfile;
  askPanel = mountAskPanel(
    byId('ask-body'),
    () => (loaded ? { place: loaded.place, profile: loadProfile() } : null),
    { ask: (body) => api.ask(body) },
  );
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
