import { GoogleGenAI } from '@google/genai';

/** The one seam to the AI model: structured JSON in, parsed JSON out. Tests swap in a fake. */
/**
 * One line when a Gemini call fails, so a wrong key, quota or model id is visible on the server.
 * Only the error's name is logged: never its message, the prompt, the question or the profile.
 */
export function logGeminiFailure(err: unknown): void {
  console.warn('gemini_failed', err instanceof Error && err.name ? err.name : 'unknown');
}

export interface GeminiClient {
  generateJson(req: {
    system: string;
    user: string;
    /** A Gemini `responseSchema` (OpenAPI subset). */
    schema: object;
    timeoutMs: number;
  }): Promise<unknown>;
}

/** The slice of the SDK this module uses, so a test can stub it. */
export interface GenerateSdk {
  models: { generateContent(params: unknown): Promise<{ text?: string }> };
}

/** Low enough to stay close to the supplied facts, high enough to read naturally. */
const TEMPERATURE = 0.4;

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
 * Gemini over the official SDK. This is a thin adapter: it sets the JSON-only response
 * config and the timeout, and leaves every judgement about the answer to the callers.
 */
export function createGeminiClient(
  apiKey: string,
  model: string,
  sdk: GenerateSdk = new GoogleGenAI({ apiKey }) as unknown as GenerateSdk,
): GeminiClient {
  return {
    async generateJson({ system, user, schema, timeoutMs }) {
      const controller = new AbortController();
      const response = await withTimeout(
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
        }),
        timeoutMs,
        'Gemini request',
        () => controller.abort(),
      );
      if (!response.text) throw new Error('Gemini returned no text');
      return JSON.parse(response.text) as unknown;
    },
  };
}
