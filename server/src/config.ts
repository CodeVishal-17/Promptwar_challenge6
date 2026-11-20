export interface Config {
  port: number;
  geminiApiKey: string | null;
  geminiModel: string;
  trustProxy: boolean;
}

const DEFAULT_PORT = 8080;
const DEFAULT_MODEL = 'gemini-2.5-flash';

function parsePort(raw: string | undefined): number {
  const port = Number(raw);
  return raw && Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT;
}

/** The only place environment variables are read; everything else receives plain values. */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  return {
    port: parsePort(env.PORT),
    geminiApiKey: env.GEMINI_API_KEY?.trim() || null,
    geminiModel: env.GEMINI_MODEL?.trim() || DEFAULT_MODEL,
    trustProxy: env.TRUST_PROXY === 'true',
  };
}
