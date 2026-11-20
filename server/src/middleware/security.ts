import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';

export interface Limits {
  /** Requests per window for the Gemini-backed routes. */
  heavyMax: number;
  /** Requests per window for everything else under /api. */
  lightMax: number;
  windowMs: number;
}

export const DEFAULT_LIMITS: Limits = { heavyMax: 20, lightMax: 120, windowMs: 10 * 60_000 };

/** Exactly the policy the frontend is built for: same-origin only, no inline script or style. */
export const securityHeaders = (): RequestHandler =>
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  });

/** A fresh limiter (and counter) per call, so apps do not share state. */
export const limiter = (max: number, windowMs: number): RequestHandler =>
  rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'rate_limited' },
  });
