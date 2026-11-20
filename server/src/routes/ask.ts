import { Router } from 'express';
import { askBody } from '../schemas.js';
import { answerQuestion } from '../services/askService.js';
import type { GeminiClient } from '../services/gemini.js';
import type { AirService } from '../services/openMeteo.js';
import { currentReport, parse } from './helpers.js';

export function askRoute(deps: {
  air: AirService;
  gemini: GeminiClient | null;
  now: () => Date;
}): Router {
  const router = Router();
  router.post('/ask', async (req, res) => {
    const { lat, lon, countryCode, profile, question } = parse(askBody, req.body ?? {});
    const report = await currentReport(deps.air, lat, lon);
    res.json(
      await answerQuestion({ report, profile, ...(countryCode ? { countryCode } : {}) }, question, {
        gemini: deps.gemini,
        now: deps.now,
      }),
    );
  });
  return router;
}
