import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AirReport, Place } from '../../shared/types.js';
import { ApiError } from '../../web/src/api.js';
import { boot } from '../../web/src/main.js';
import { savePlace } from '../../web/src/store.js';
import html from '../../web/index.html?raw';
import { PLACE, makeReport, statusText } from './helpers.js';

/** Loads the real page shell into jsdom without parsing HTML through innerHTML. */
function loadShell(): void {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  document.body.replaceChildren(
    ...[...doc.body.childNodes].map((n) => document.importNode(n, true)),
  );
}

const nowBody = (): HTMLElement => document.getElementById('now-body') as HTMLElement;
const flush = () => new Promise((r) => setTimeout(r, 0));

let getAir: ReturnType<typeof vi.fn<(lat: number, lon: number) => Promise<AirReport>>>;
const searchPlaces = vi.fn(async (): Promise<Place[]> => []);

beforeEach(() => {
  localStorage.clear();
  loadShell();
  getAir = vi.fn(async () => makeReport());
});
afterEach(() => {
  document.title = '';
});

describe('boot', () => {
  it('without a saved place, shows the welcome state and fetches nothing', async () => {
    await boot({ api: { getAir, searchPlaces } });
    expect(getAir).not.toHaveBeenCalled();
    expect(nowBody().textContent).toMatch(/Search for your city/);
    expect(document.querySelector('[role="combobox"]')).not.toBeNull();
  });

  it('loads the saved place, fetches its air and renders the AQI card', async () => {
    savePlace(PLACE);
    await boot({ api: { getAir, searchPlaces } });
    expect(getAir).toHaveBeenCalledWith(PLACE.lat, PLACE.lon);
    expect(nowBody().querySelector('.aqi-number')?.textContent).toBe('162');
    expect(nowBody().hasAttribute('aria-busy')).toBe(false);
    expect(statusText()).toBe('Air quality for São Paulo, Brazil: AQI 162, Unhealthy.');
    expect(document.title).toBe('São Paulo — Clearday');
  });

  it('shows an error with Retry when the air request fails, and Retry tries again', async () => {
    savePlace(PLACE);
    getAir.mockRejectedValueOnce(new ApiError('air_data_unavailable', 502));
    await boot({ api: { getAir, searchPlaces } });
    expect(nowBody().textContent).toMatch(/not responding/);
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    const retry = [...nowBody().querySelectorAll('button')].find((b) => b.textContent === 'Retry');
    retry?.click();
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
    const pending = boot({
      api: {
        getAir,
        searchPlaces: async () => [
          { ...PLACE, name: 'Lima', admin1: undefined, country: 'Peru', countryCode: 'PE' },
        ],
      },
    });

    const input = document.querySelector('input') as HTMLInputElement;
    input.value = 'Lima';
    input.dispatchEvent(new Event('input'));
    await new Promise((r) => setTimeout(r, 350));
    (document.querySelector('[role="option"]') as HTMLElement).click();
    await flush();
    resolveFirst(makeReport());
    await pending;
    await flush();

    expect(nowBody().querySelector('.aqi-number')?.textContent).toBe('42');
    expect(nowBody().textContent).toContain('Lima, Peru');
  });
});
