import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROFILE } from '../../shared/profile.js';
import { ApiError, ask, getAir, getPlan, searchPlaces } from '../../web/src/api.js';
import { PLACE, makeReport } from './helpers.js';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const calledUrl = (): string => String(fetchMock.mock.calls[0]?.[0]);
const calledInit = (): RequestInit => fetchMock.mock.calls[0]?.[1] as RequestInit;

describe('errors', () => {
  it('rejects with the server error code on a non-OK response', async () => {
    fetchMock.mockResolvedValue(json({ error: 'rate_limited' }, 429));
    const err = await getAir(1, 2).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: 'rate_limited', status: 429 });
  });

  it('uses http_error when the error body is not the JSON shape', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(getAir(1, 2)).rejects.toMatchObject({ code: 'http_error', status: 502 });
  });

  it('turns a network failure into ApiError network', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(getAir(1, 2)).rejects.toMatchObject({ code: 'network', status: 0 });
  });

  it('gives up after 15 s with ApiError timeout', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const pending = getAir(1, 2).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(calledInit().signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toMatchObject({ code: 'timeout', status: 0 });
  });

  it('passes a caller abort through as an AbortError, not an ApiError', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const controller = new AbortController();
    const pending = searchPlaces('Delhi', controller.signal).catch((e: unknown) => e);
    controller.abort();
    const err = await pending;
    expect(err).not.toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ name: 'AbortError' });
  });

  it('rejects a success body that is not the expected shape', async () => {
    fetchMock.mockResolvedValue(json({ results: [] }));
    await expect(searchPlaces('Delhi')).rejects.toMatchObject({ code: 'bad_response' });
  });
});

describe('searchPlaces', () => {
  it('URL-encodes non-ASCII queries and returns the places', async () => {
    fetchMock.mockResolvedValue(json({ places: [PLACE] }));
    expect(await searchPlaces('  São Paulo ')).toEqual([PLACE]);
    expect(calledUrl()).toBe('/api/geocode?q=S%C3%A3o+Paulo');
  });

  it('returns an empty list as a normal result', async () => {
    fetchMock.mockResolvedValue(json({ places: [] }));
    expect(await searchPlaces('qqqq')).toEqual([]);
  });
});

describe('coordinates', () => {
  it('rounds lat/lon to 2 decimals before they leave the browser', async () => {
    fetchMock.mockResolvedValue(json(makeReport()));
    await getAir(-23.5475, -46.63611);
    expect(calledUrl()).toBe('/api/air?lat=-23.55&lon=-46.64');
  });

  it('posts a rounded plan request as JSON', async () => {
    fetchMock.mockResolvedValue(json({ summary: 'ok' }));
    await getPlan({ lat: 28.6139, lon: 77.209, countryCode: 'IN', profile: DEFAULT_PROFILE });
    expect(calledUrl()).toBe('/api/plan');
    expect(calledInit().method).toBe('POST');
    expect(new Headers(calledInit().headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(calledInit().body))).toEqual({
      lat: 28.61,
      lon: 77.21,
      countryCode: 'IN',
      profile: DEFAULT_PROFILE,
    });
  });

  it('posts a rounded question', async () => {
    fetchMock.mockResolvedValue(json({ answer: 'Yes.', aiUsed: true }));
    const out = await ask({ lat: 1.005, lon: 2.004, profile: DEFAULT_PROFILE, question: 'Run?' });
    expect(out).toEqual({ answer: 'Yes.', aiUsed: true });
    expect(JSON.parse(String(calledInit().body))).toMatchObject({ lon: 2, question: 'Run?' });
  });
});
