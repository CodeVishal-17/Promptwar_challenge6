import { join } from 'node:path';
import compression from 'compression';
import express, { type Express, type RequestHandler } from 'express';
import { errorHandler, notFound } from './middleware/errors.js';
import { DEFAULT_LIMITS, limiter, securityHeaders, type Limits } from './middleware/security.js';
import { airRoute } from './routes/air.js';
import { askRoute } from './routes/ask.js';
import { geocodeRoute } from './routes/geocode.js';
import { planRoute } from './routes/plan.js';
import type { GeminiClient } from './services/gemini.js';
import type { AirService, GeocodeService } from './services/openMeteo.js';

export interface AppDeps {
  air: AirService;
  geocode: GeocodeService;
  gemini: GeminiClient | null;
  now?: () => Date;
  limits?: Limits;
  /** Built frontend; when absent only the API is served. */
  staticDir?: string;
  /** Reverse-proxy hops in front of the app (0 = none); the rate limiter keys on the client IP they reveal. */
  trustProxy?: number;
}

const BODY_LIMIT = '10kb';
const ONE_YEAR_S = 31_536_000;

/** Hashed bundles never change, so they cache forever; the HTML shell must always revalidate. */
function staticFiles(dir: string): RequestHandler[] {
  const serve = express.static(dir, {
    index: false,
    setHeaders(res, path) {
      const hashed = /[\\/]assets[\\/]/.test(path);
      res.setHeader(
        'Cache-Control',
        hashed ? `public, max-age=${ONE_YEAR_S}, immutable` : 'no-cache',
      );
    },
  });
  const shell: RequestHandler = (req, res, next) => {
    // Missing files under /assets are real 404s, not the app shell.
    if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.startsWith('/assets/')) {
      next();
      return;
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(join(dir, 'index.html'), (err) => err && next());
  };
  return [serve, shell];
}

/** Builds the app from injected services. Reads no environment, so tests need no setup. */
export function createApp(deps: AppDeps): Express {
  const now = deps.now ?? (() => new Date());
  const limits = deps.limits ?? DEFAULT_LIMITS;
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', deps.trustProxy ?? 0);

  app.use(securityHeaders());
  app.use(compression());
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });
  app.use(express.json({ limit: BODY_LIMIT }));

  const heavy = limiter(limits.heavyMax, limits.windowMs);
  const light = limiter(limits.lightMax, limits.windowMs);
  const api = express.Router();
  api.use(geocodeRoute(deps.geocode), airRoute(deps.air));
  api.use(['/plan', '/ask'], heavy);
  api.use(planRoute({ air: deps.air, gemini: deps.gemini, now }));
  api.use(askRoute({ air: deps.air, gemini: deps.gemini, now }));
  app.use('/api', light, api, notFound);

  if (deps.staticDir) app.use(...staticFiles(deps.staticDir));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
