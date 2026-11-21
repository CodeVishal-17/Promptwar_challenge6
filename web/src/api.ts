import type { AirReport, AskRequest, Place, Plan, PlanRequest } from '../../shared/types.js';

const TIMEOUT_MS = 15_000;

/**
 * A failed API call. `code` is the server's error code (`rate_limited`, `invalid_request`, …),
 * or one of `network`, `timeout`, `http_error` and `bad_response` for failures in between.
 * `status` is 0 when no response arrived.
 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

/** Two decimals (≈1 km): enough for city air, and no more precise than people expect to share. */
const round2 = (n: number): number => Math.round(n * 100) / 100;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

async function readJson(res: Response): Promise<unknown> {
  try {
    return (await res.json()) as unknown;
  } catch {
    return undefined;
  }
}

/** An abort signal that fires on the caller's own signal or after TIMEOUT_MS, whichever comes first. */
function deadline(caller?: AbortSignal) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);
  const forward = (): void => {
    controller.abort();
  };
  if (caller?.aborted) controller.abort();
  caller?.addEventListener('abort', forward, { once: true });
  return {
    signal: controller.signal,
    timedOut: (): boolean => timedOut,
    dispose: (): void => {
      clearTimeout(timer);
      caller?.removeEventListener('abort', forward);
    },
  };
}

/** The JSON object in a response; an error status or any other body becomes an ApiError. */
async function bodyOf(res: Response): Promise<Record<string, unknown>> {
  const body = await readJson(res);
  if (!res.ok) {
    const code = isObject(body) && typeof body.error === 'string' ? body.error : 'http_error';
    throw new ApiError(code, res.status);
  }
  if (!isObject(body)) throw new ApiError('bad_response', res.status);
  return body;
}

/**
 * One same-origin JSON request with a 15 s timeout. A caller's own abort is re-thrown as the
 * AbortError it is (so a superseded search can be ignored); everything else becomes ApiError.
 */
async function request(
  path: string,
  init: RequestInit = {},
  signal?: AbortSignal,
): Promise<unknown> {
  const limit = deadline(signal);
  try {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    let res: Response;
    try {
      res = await fetch(path, { ...init, headers, signal: limit.signal });
    } catch (err) {
      if (limit.timedOut()) throw new ApiError('timeout', 0);
      if (signal?.aborted) throw err;
      throw new ApiError('network', 0);
    }
    return await bodyOf(res);
  } finally {
    limit.dispose();
  }
}

const postJson = (path: string, body: unknown): Promise<unknown> =>
  request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

/** Places matching a city name; an empty list is a normal answer. */
export async function searchPlaces(q: string, signal?: AbortSignal): Promise<Place[]> {
  const query = new URLSearchParams({ q: q.trim() });
  const body = (await request(`/api/geocode?${query}`, {}, signal)) as { places?: unknown };
  if (!Array.isArray(body.places)) throw new ApiError('bad_response', 200);
  return body.places as Place[];
}

export async function getAir(lat: number, lon: number): Promise<AirReport> {
  const query = new URLSearchParams({ lat: String(round2(lat)), lon: String(round2(lon)) });
  const body = (await request(`/api/air?${query}`)) as Partial<AirReport>;
  if (!Array.isArray(body.hourly) || !isObject(body.source))
    throw new ApiError('bad_response', 200);
  return body as AirReport;
}

export async function getPlan(body: PlanRequest): Promise<Plan> {
  return (await postJson('/api/plan', {
    ...body,
    lat: round2(body.lat),
    lon: round2(body.lon),
  })) as Plan;
}

export async function ask(body: AskRequest): Promise<{ answer: string; aiUsed: boolean }> {
  const out = (await postJson('/api/ask', {
    ...body,
    lat: round2(body.lat),
    lon: round2(body.lon),
  })) as { answer?: unknown; aiUsed?: unknown };
  if (typeof out.answer !== 'string') throw new ApiError('bad_response', 200);
  return { answer: out.answer, aiUsed: out.aiUsed === true };
}
