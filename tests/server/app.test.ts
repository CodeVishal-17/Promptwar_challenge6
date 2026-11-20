import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROFILE } from '../../shared/profile.js';
import type { AirReport } from '../../shared/types.js';
import { createApp } from '../../server/src/app.js';
import { DEFAULT_LIMITS } from '../../server/src/middleware/security.js';
import type { GeminiClient } from '../../server/src/services/gemini.js';
import { UpstreamError } from '../../server/src/services/openMeteo.js';
import { makeReport } from './domain/fixtures.js';

const NOW = new Date('2026-11-19T08:30:00Z');
const place = { name: 'Delhi', country: 'India', countryCode: 'IN', lat: 28.6, lon: 77.2 };

const build = (
  over: Partial<Parameters<typeof createApp>[0]> = {},
  report: AirReport = makeReport(),
) =>
  createApp({
    air: { getReport: async () => report },
    geocode: { search: async () => [place] },
    gemini: null,
    now: () => NOW,
    ...over,
  });

const planBody = { lat: 28.6, lon: 77.2, countryCode: 'IN', profile: DEFAULT_PROFILE };

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

afterEach(() => vi.restoreAllMocks());

describe('routes', () => {
  it('GET /healthz', async () => {
    const res = await request(build()).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('GET /api/geocode returns places', async () => {
    const res = await request(build()).get('/api/geocode').query({ q: '  Delhi ' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ places: [place] });
  });

  it('GET /api/air returns the report', async () => {
    const res = await request(build()).get('/api/air').query({ lat: '28.6', lon: '77.2' });
    expect(res.status).toBe(200);
    expect(res.body.now.aqi).toBeTypeOf('number');
    expect(res.body.hourly).toBeInstanceOf(Array);
  });

  it('POST /api/plan returns a plan', async () => {
    const res = await request(build()).post('/api/plan').send(planBody);
    expect(res.status).toBe(200);
    expect(res.body.aiUsed).toBe(false);
    expect(res.body.health.headline).toBeTypeOf('string');
    expect(res.body.routine).toBeInstanceOf(Array);
  });

  it('POST /api/plan accepts an empty countryCode from a geolocated place', async () => {
    const res = await request(build())
      .post('/api/plan')
      .send({ ...planBody, countryCode: '' });
    expect(res.status).toBe(200);
  });

  it('POST /api/ask returns an answer', async () => {
    const res = await request(build())
      .post('/api/ask')
      .send({ ...planBody, question: 'Can I run today?' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ answer: expect.any(String), aiUsed: false });
  });

  it('uses Gemini when configured', async () => {
    const generateJson = vi.fn().mockResolvedValue({ answer: 'x', onTopic: false });
    const gemini: GeminiClient = { generateJson };
    const res = await request(build({ gemini }))
      .post('/api/ask')
      .send({ ...planBody, question: 'hi' });
    expect(res.status).toBe(200);
    expect(generateJson).toHaveBeenCalled();
  });
});

describe('validation', () => {
  it('rejects out-of-range lat', async () => {
    const res = await request(build()).get('/api/air').query({ lat: '91', lon: '0' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.fields).toContain('lat');
  });

  it.each(['abc', 'NaN', 'Infinity', ''])('rejects non-finite lon %j', async (lon) => {
    const res = await request(build()).get('/api/air').query({ lat: '1', lon });
    expect(res.status).toBe(400);
    expect(res.body.fields).toContain('lon');
  });

  it('rejects short and long q', async () => {
    for (const q of ['a', ' a ', 'x'.repeat(81)]) {
      const res = await request(build()).get('/api/geocode').query({ q });
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual(['q']);
    }
    expect((await request(build()).get('/api/geocode')).status).toBe(400);
  });

  it('rejects a profile with an unknown key, without echoing it', async () => {
    const profile = { ...DEFAULT_PROFILE, home: { ...DEFAULT_PROFILE.home, secretKey: 1 } };
    const res = await request(build())
      .post('/api/plan')
      .send({ ...planBody, profile });
    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual(['profile.home']);
    expect(JSON.stringify(res.body)).not.toContain('secretKey');
  });

  it('reports dotted paths for bad values', async () => {
    const profile = { ...DEFAULT_PROFILE, home: { ...DEFAULT_PROFILE.home, cooking: 'coal' } };
    const res = await request(build())
      .post('/api/plan')
      .send({ ...planBody, profile });
    expect(res.body.fields).toEqual(['profile.home.cooking']);
  });

  it('enforces numeric ranges in the profile', async () => {
    const profile = { ...DEFAULT_PROFILE, exercise: { type: 'run', hour: 24, minutes: 4 } };
    const res = await request(build())
      .post('/api/plan')
      .send({ ...planBody, profile });
    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual(
      expect.arrayContaining(['profile.exercise.hour', 'profile.exercise.minutes']),
    );
  });

  it('rejects a missing profile and a bad countryCode', async () => {
    const a = await request(build()).post('/api/plan').send({ lat: 1, lon: 1 });
    expect(a.body.fields).toContain('profile');
    const b = await request(build())
      .post('/api/plan')
      .send({ ...planBody, countryCode: 'in' });
    expect(b.body.fields).toEqual(['countryCode']);
  });

  it('rejects a question of 501 chars and an empty one', async () => {
    const long = await request(build())
      .post('/api/ask')
      .send({ ...planBody, question: 'x'.repeat(501) });
    expect(long.status).toBe(400);
    expect(long.body.fields).toEqual(['question']);
    const empty = await request(build())
      .post('/api/ask')
      .send({ ...planBody, question: '   ' });
    expect(empty.status).toBe(400);
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await request(build())
      .post('/api/plan')
      .set('Content-Type', 'application/json')
      .send('{"lat":');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_request', fields: [] });
  });

  it('rejects a body over 10 kb with 413', async () => {
    const res = await request(build())
      .post('/api/ask')
      .send({ ...planBody, question: 'x'.repeat(11_000) });
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'payload_too_large' });
  });
});

describe('rate limits', () => {
  it('defaults to 20 heavy and 120 light requests per 10 minutes', () => {
    expect(DEFAULT_LIMITS).toEqual({ heavyMax: 20, lightMax: 120, windowMs: 600_000 });
  });

  it('ignores X-Forwarded-For unless proxy hops are trusted', async () => {
    const limits = { heavyMax: 1, lightMax: 100, windowMs: 60_000 };
    const spoof = (app: ReturnType<typeof build>, ip: string) =>
      request(app).post('/api/plan').set('X-Forwarded-For', ip).send(planBody);
    const direct = build({ limits });
    expect((await spoof(direct, '1.1.1.1')).status).toBe(200);
    expect((await spoof(direct, '2.2.2.2')).status).toBe(429);
    const proxied = build({ limits, trustProxy: 1 });
    expect((await spoof(proxied, '1.1.1.1')).status).toBe(200);
    expect((await spoof(proxied, '2.2.2.2')).status).toBe(200);
  });

  it('returns 429 on the 21st plan request', async () => {
    const app = build({ limits: { heavyMax: 20, lightMax: 100, windowMs: 60_000 } });
    for (let i = 0; i < 20; i++) {
      expect((await request(app).post('/api/plan').send(planBody)).status).toBe(200);
    }
    const res = await request(app).post('/api/plan').send(planBody);
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'rate_limited' });
    expect(res.headers['ratelimit']).toBeDefined();
    expect(res.headers['x-ratelimit-limit']).toBeUndefined();
  });

  it('limits light routes separately and leaves healthz alone', async () => {
    const app = build({ limits: { heavyMax: 1, lightMax: 2, windowMs: 60_000 } });
    const q = { lat: '1', lon: '1' };
    expect((await request(app).get('/api/air').query(q)).status).toBe(200);
    expect((await request(app).get('/api/air').query(q)).status).toBe(200);
    expect((await request(app).get('/api/air').query(q)).status).toBe(429);
    expect((await request(app).get('/healthz')).status).toBe(200);
  });
});

describe('errors', () => {
  it('maps UpstreamError to 502 air_data_unavailable', async () => {
    const app = build({
      air: { getReport: () => Promise.reject(new UpstreamError('boom')) },
      geocode: { search: () => Promise.reject(new UpstreamError('boom')) },
    });
    const a = await request(app).get('/api/air').query({ lat: '1', lon: '1' });
    expect(a.status).toBe(502);
    expect(a.body).toEqual({ error: 'air_data_unavailable' });
    const g = await request(app).get('/api/geocode').query({ q: 'Delhi' });
    expect(g.status).toBe(502);
  });

  it('maps a report without a current reading to 502 air_data_incomplete', async () => {
    const app = build({}, { ...makeReport(), now: null });
    for (const res of [
      await request(app).get('/api/air').query({ lat: '1', lon: '1' }),
      await request(app).post('/api/plan').send(planBody),
      await request(app)
        .post('/api/ask')
        .send({ ...planBody, question: 'hi' }),
    ]) {
      expect(res.status).toBe(502);
      expect(res.body).toEqual({ error: 'air_data_incomplete' });
    }
  });

  it('maps a generic error to 500 with no stack and logs only its name', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = build({ air: { getReport: () => Promise.reject(new TypeError('secret detail')) } });
    const res = await request(app).get('/api/air').query({ lat: '1', lon: '1' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'internal' });
    expect(JSON.stringify(res.body)).not.toContain('secret');
    expect(spy.mock.calls.flat().join(' ')).toBe('TypeError');
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const res = await request(build()).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
    const post = await request(build()).post('/nope');
    expect(post.status).toBe(404);
    expect(post.body).toEqual({ error: 'not_found' });
  });

  it('never logs the question text', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => undefined),
    );
    const question = 'my-very-private-question';
    const app = build({ gemini: { generateJson: () => Promise.reject(new Error(question)) } });
    await request(app)
      .post('/api/ask')
      .send({ ...planBody, question });
    await request(app)
      .post('/api/ask')
      .send({ ...planBody, question: question + 'x'.repeat(600) });
    for (const s of spies) expect(JSON.stringify(s.mock.calls)).not.toContain(question);
  });
});

describe('security headers', () => {
  it('sets the exact CSP, nosniff and no x-powered-by', async () => {
    const res = await request(build()).get('/healthz');
    const csp = String(res.headers['content-security-policy']);
    const directives = csp
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean);
    expect([...directives].sort()).toEqual([...CSP].sort());
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('static files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'clearday-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>x</title>');
  writeFileSync(join(dir, 'assets', 'app-abc123.js'), 'console.log(1)');
  const app = build({ staticDir: dir });

  it('serves index.html with no-cache at / and for SPA routes', async () => {
    for (const path of ['/', '/some/route']) {
      const res = await request(app).get(path);
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-cache');
      expect(res.text).toContain('<title>');
    }
  });

  it('serves hashed assets as immutable', async () => {
    const res = await request(app).get('/assets/app-abc123.js');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('does not let the SPA fallback swallow API 404s or missing assets', async () => {
    expect((await request(app).get('/api/nope')).body).toEqual({ error: 'not_found' });
    expect((await request(app).get('/assets/missing.js')).status).toBe(404);
  });
});
