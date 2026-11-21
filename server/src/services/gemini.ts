import { GoogleGenAI } from '@google/genai';

/** The one seam to the AI model: structured JSON in, parsed JSON out. Tests swap in a fake. */
export interface GeminiClient {
  generateJson(req: {
    system: string;
    user: string;
    /** A Gemini `responseSchema` (OpenAPI subset). */
    schema: object;
    /** The budget for the whole call, retry included. */
    timeoutMs: number;
  }): Promise<unknown>;
}

/** The HTTP status on an SDK `ApiError`, or undefined for any other failure. */
function httpStatus(err: unknown): number | undefined {
  const status = (err as { status?: unknown } | null | undefined)?.status;
  return typeof status === 'number' ? status : undefined;
}

/**
 * One line when a Gemini call fails, so a wrong key, quota or model id is visible on the server.
 * Only the error's name and HTTP status are logged: never its message, the prompt, the question or the profile.
 */
export function logGeminiFailure(err: unknown): void {
  const name = err instanceof Error && err.name ? err.name : 'unknown';
  const status = httpStatus(err);
  if (status === undefined) console.warn('gemini_failed', name);
  else console.warn('gemini_failed', name, status);
}

/** The slice of the SDK this module uses, so a test can stub it. */
export interface GenerateSdk {
  models: { generateContent(params: unknown): Promise<{ text?: string }> };
}

/** Low enough to stay close to the supplied facts, high enough to read naturally. */
const TEMPERATURE = 0.4;

/** The pause before the single retry, so a momentary overload on Google's side can clear. */
export const RETRY_DELAY_MS = 300;

/**
 * Google's 5xx answers (overloaded, internal error) are usually momentary, so they are worth one retry.
 * A 4xx (bad key, retired model, used-up quota) will not change on a retry, so it fails fast.
 */
function isTransient(err: unknown): boolean {
  const status = httpStatus(err);
  return status !== undefined && status >= 500 && status < 600;
}

/** Waits `ms`, or less if `signal` aborts first; the timer never outlives the abort. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/** Rejects if `work` takes longer than `ms`. The timer is always cleared, so nothing is left pending. */
export async function withTimeout<T>(
  work: Promise<T>,
  ms: number,
  label: string,
  onTimeout?: () => void,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error(`${label} timed out`));
    }, ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Gemini over the official SDK. This is a thin adapter: it sets the JSON-only response config,
 * retries once on a transient server error inside the same time budget, and leaves every
 * judgement about the answer to the callers.
 */
export function createGeminiClient(
  apiKey: string,
  model: string,
  sdk: GenerateSdk = new GoogleGenAI({ apiKey }),
): GeminiClient {
  return {
    async generateJson({ system, user, schema, timeoutMs }) {
      const controller = new AbortController();
      // A function, not a property read: the abort can land while a retry pause is awaited.
      const aborted = (): boolean => controller.signal.aborted;
      const call = () =>
        sdk.models.generateContent({
          model,
          contents: user,
          config: {
            systemInstruction: system,
            responseMimeType: 'application/json',
            responseSchema: schema,
            temperature: TEMPERATURE,
            abortSignal: controller.signal,
          },
        });
      const callWithRetry = async () => {
        try {
          return await call();
        } catch (err) {
          if (!isTransient(err) || aborted()) throw err;
          await pause(RETRY_DELAY_MS, controller.signal);
          if (aborted()) throw err;
          return call();
        }
      };
      const response = await withTimeout(callWithRetry(), timeoutMs, 'Gemini request', () => {
        controller.abort();
      });
      if (!response.text) throw new Error('Gemini returned no text');
      return JSON.parse(response.text) as unknown;
    },
  };
}
