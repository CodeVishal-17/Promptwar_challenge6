import { Router } from 'express';
import { planBody } from '../schemas.js';
import type { GeminiClient } from '../services/gemini.js';
import type { AirService } from '../services/openMeteo.js';
import { makePlan } from '../services/planService.js';
import { currentReport, parse } from './helpers.js';

export function planRoute(deps: {
  air: AirService;
  gemini: GeminiClient | null;
  now: () => Date;
}): Router {
  const router = Router();
  router.post('/plan', async (req, res) => {
    const { lat, lon, countryCode, profile } = parse(planBody, req.body ?? {});
    const report = await currentReport(deps.air, lat, lon);
    res.json(
      await makePlan(
        { report, profile, ...(countryCode ? { countryCode } : {}) },
        { gemini: deps.gemini, now: deps.now },
      ),
    );
  });
  return router;
}
