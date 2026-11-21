import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RETRY_DELAY_MS,
  createGeminiClient,
  logGeminiFailure,
  withTimeout,
} from '../../../server/src/services/gemini.js';

afterEach(() => vi.useRealTimers());

const req = { system: 'sys', user: 'usr', schema: { type: 'object' }, timeoutMs: 1000 };

describe('createGeminiClient', () => {
  it('calls generateContent with the JSON config and parses the text', async () => {
    const generateContent = vi.fn().mockResolvedValue({ text: '{"a":1}' });
    const client = createGeminiClient('key', 'm-1', { models: { generateContent } });
    await expect(client.generateJson(req)).resolves.toEqual({ a: 1 });
    const arg = generateContent.mock.calls[0]![0];
    expect(arg.model).toBe('m-1');
    expect(arg.contents).toBe('usr');
    expect(arg.config).toMatchObject({
      systemInstruction: 'sys',
      responseMimeType: 'application/json',
      responseSchema: { type: 'object' },
      temperature: 0.4,
    });
  });

  it('rejects when the model returns no text or invalid JSON', async () => {
    const empty = createGeminiClient('k', 'm', { models: { generateContent: async () => ({}) } });
    await expect(empty.generateJson(req)).rejects.toThrow();
    const bad = createGeminiClient('k', 'm', {
      models: { generateContent: async () => ({ text: 'not json' }) },
    });
    await expect(bad.generateJson(req)).rejects.toThrow();
  });

  it('rejects on timeout and aborts the request', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const client = createGeminiClient('k', 'm', {
      models: {
        generateContent: (p: { config: { abortSignal: AbortSignal } }) => {
          signal = p.config.abortSignal;
          return new Promise(() => {});
        },
      },
    });
    const result = client.generateJson(req).catch((e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toMatch(/timed out/);
    expect(signal?.aborted).toBe(true);
  });
});

describe('createGeminiClient retry', () => {
  /** Shaped like the SDK's ApiError: an Error with a numeric HTTP status. */
  const apiError = (status: number) => Object.assign(new Error(`status ${status}`), { status });

  it.each([500, 502, 503, 504])(
    'retries once after a %i and returns the second answer',
    async (status) => {
      vi.useFakeTimers();
      const generateContent = vi
        .fn()
        .mockRejectedValueOnce(apiError(status))
        .mockResolvedValueOnce({ text: '{"ok":true}' });
      const client = createGeminiClient('k', 'm', { models: { generateContent } });
      const result = client.generateJson(req);
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS);
      await expect(result).resolves.toEqual({ ok: true });
      expect(generateContent).toHaveBeenCalledTimes(2);
    },
  );

  it('gives up after a second server error', async () => {
    vi.useFakeTimers();
    const generateContent = vi.fn().mockRejectedValue(apiError(503));
    const client = createGeminiClient('k', 'm', { models: { generateContent } });
    const result = client.generateJson(req).catch((e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS);
    expect(await result).toBe('status 503');
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it.each([400, 403, 404, 429])(
    'does not retry a %i, so a bad key, model or quota fails fast',
    async (status) => {
      const generateContent = vi.fn().mockRejectedValue(apiError(status));
      const client = createGeminiClient('k', 'm', { models: { generateContent } });
      await expect(client.generateJson(req)).rejects.toThrow(`status ${status}`);
      expect(generateContent).toHaveBeenCalledTimes(1);
    },
  );

  it('does not retry errors without a status, such as invalid JSON', async () => {
    const generateContent = vi.fn().mockResolvedValue({ text: 'not json' });
    const client = createGeminiClient('k', 'm', { models: { generateContent } });
    await expect(client.generateJson(req)).rejects.toThrow();
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('does not start a retry once the time budget has run out', async () => {
    vi.useFakeTimers();
    const generateContent = vi.fn().mockRejectedValue(apiError(503));
    const client = createGeminiClient('k', 'm', { models: { generateContent } });
    const result = client
      .generateJson({ ...req, timeoutMs: RETRY_DELAY_MS / 2 })
      .catch((e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * 2);
    expect(await result).toMatch(/timed out/);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('logGeminiFailure', () => {
  it('logs the error name, plus the HTTP status when there is one, and nothing else', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const withStatus = Object.assign(new Error('secret prompt text'), {
      name: 'ApiError',
      status: 404,
    });
    logGeminiFailure(withStatus);
    logGeminiFailure(new Error('also secret'));
    logGeminiFailure('not an error');
    expect(warn.mock.calls).toEqual([
      ['gemini_failed', 'ApiError', 404],
      ['gemini_failed', 'Error'],
      ['gemini_failed', 'unknown'],
    ]);
    warn.mockRestore();
  });
});

describe('withTimeout', () => {
  it('clears its timer when the work finishes first', async () => {
    vi.useFakeTimers();
    await expect(withTimeout(Promise.resolve(7), 5000, 'x')).resolves.toBe(7);
    expect(vi.getTimerCount()).toBe(0);
  });
});
