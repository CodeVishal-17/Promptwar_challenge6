import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  createAirService,
  createGeocodeService,
  UpstreamError,
} from '../../../server/src/services/openMeteo.js';

const read = (name: string): string =>
  readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), 'utf8');
const airBody = read('openMeteoAir.json');
const geoBody = read('geocode.json');
const NOW = (): Date => new Date('2026-11-19T08:30:00Z');

const respond = (body: string, status = 200): Response => new Response(body, { status });
const fakeFetch = (body: string, status = 200) =>
  vi.fn<typeof fetch>(async () => respond(body, status));

describe('air service', () => {
  it('rounds to 0.1 degrees, builds the URL and caches by rounded key', async () => {
    const f = fakeFetch(airBody);
    const svc = createAirService(f, NOW);
    const a = await svc.getReport(28.6139, 77.209);
    const b = await svc.getReport(28.64, 77.22);
    expect(b).toBe(a);
    expect(f).toHaveBeenCalledTimes(1);
    const url = String(f.mock.calls[0]![0]);
    expect(url).toContain('latitude=28.6&longitude=77.2&');
    expect(url).toContain(
      'hourly=pm2_5,pm10,ozone,nitrogen_dioxide&past_days=1&forecast_days=5&timezone=auto',
    );
    expect(a.now).not.toBeNull();
  });

  it('throws UpstreamError on a non-200 response without leaking the query', async () => {
    const svc = createAirService(fakeFetch('nope', 500), NOW);
    const err = await svc.getReport(1, 2).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as Error).message).not.toContain('latitude');
  });

  it('throws UpstreamError on a malformed body', async () => {
    const svc = createAirService(fakeFetch('{"hourly":1}'), NOW);
    await expect(svc.getReport(1, 2)).rejects.toBeInstanceOf(UpstreamError);
  });

  it('throws UpstreamError on non-JSON', async () => {
    const svc = createAirService(fakeFetch('<html>'), NOW);
    await expect(svc.getReport(1, 2)).rejects.toBeInstanceOf(UpstreamError);
  });

  it('throws UpstreamError when the data does not cover now', async () => {
    const svc = createAirService(fakeFetch(airBody), () => new Date('2030-01-01T00:00:00Z'));
    await expect(svc.getReport(1, 2)).rejects.toBeInstanceOf(UpstreamError);
  });

  it('wraps network failures in UpstreamError', async () => {
    const f = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(createAirService(f, NOW).getReport(1, 2)).rejects.toBeInstanceOf(UpstreamError);
  });
});

describe('geocode service', () => {
  it('encodes the query and maps results, skipping ones without a country code', async () => {
    const f = fakeFetch(geoBody);
    const places = await createGeocodeService(f).search('São Paulo');
    expect(String(f.mock.calls[0]![0])).toBe(
      'https://geocoding-api.open-meteo.com/v1/search?name=S%C3%A3o%20Paulo&count=5&language=en&format=json',
    );
    expect(places).toEqual([
      {
        name: 'São Paulo',
        admin1: 'São Paulo',
        country: 'Brazil',
        countryCode: 'BR',
        lat: -23.5475,
        lon: -46.63611,
      },
      {
        name: 'Sao Paulo de Olivença',
        country: 'Brazil',
        countryCode: 'BR',
        lat: -3.37,
        lon: -68.87,
      },
    ]);
  });

  it('returns [] when there are no results', async () => {
    expect(
      await createGeocodeService(fakeFetch('{"generationtime_ms":0.1}')).search('zzzz'),
    ).toEqual([]);
  });

  it('caches by trimmed, lower-cased query', async () => {
    const f = fakeFetch(geoBody);
    const svc = createGeocodeService(f);
    await svc.search('Paris');
    await svc.search('  paris ');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('throws UpstreamError on non-200 and malformed bodies', async () => {
    await expect(createGeocodeService(fakeFetch('x', 503)).search('a')).rejects.toBeInstanceOf(
      UpstreamError,
    );
    await expect(
      createGeocodeService(fakeFetch('{"results":5}')).search('a'),
    ).rejects.toBeInstanceOf(UpstreamError);
  });
});
