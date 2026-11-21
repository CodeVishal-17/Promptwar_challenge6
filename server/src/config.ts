export interface Config {
  port: number;
  geminiApiKey: string | null;
  geminiModel: string;
  /** Number of reverse-proxy hops to trust for the client IP; 0 trusts none. Deploy behind exactly this many. */
  trustProxy: number;
}

const DEFAULT_PORT = 8080;
/** Fast enough for the 8–10 s AI budget on the free tier; `gemini-2.5-flash` is closed to new keys. */
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

function parsePort(raw: string | undefined): number {
  const port = Number(raw);
  return raw && Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT;
}

/** '' / 'false' / invalid -> 0, 'true' -> 1, a non-negative integer -> itself. */
function parseHops(raw: string | undefined): number {
  if (raw === 'true') return 1;
  return raw && /^\d+$/.test(raw) ? Number(raw) : 0;
}

/** The only place environment variables are read; everything else receives plain values. */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  return {
    port: parsePort(env.PORT),
    geminiApiKey: env.GEMINI_API_KEY?.trim() || null,
    geminiModel: env.GEMINI_MODEL?.trim() || DEFAULT_MODEL,
    trustProxy: parseHops(env.TRUST_PROXY),
  };
}
