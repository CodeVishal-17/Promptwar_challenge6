import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createGeminiClient } from './services/gemini.js';
import { createAirService, createGeocodeService } from './services/openMeteo.js';

const config = loadConfig(process.env);
const now = () => new Date();

const gemini = config.geminiApiKey
  ? createGeminiClient(config.geminiApiKey, config.geminiModel)
  : null;
if (!gemini) console.warn('GEMINI_API_KEY is not set: plans use the built-in rules only.');

// Compiled to dist/server/src, with the built frontend in dist/web.
const staticDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../web');

const app = createApp({
  air: createAirService(fetch, now),
  geocode: createGeocodeService(fetch),
  gemini,
  now,
  staticDir,
  trustProxy: config.trustProxy,
});

const server = app.listen(config.port, () => {
  console.log(`Clearday listening on port ${config.port} (AI ${gemini ? 'on' : 'off'})`);
});

const shutdown = (): void => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
