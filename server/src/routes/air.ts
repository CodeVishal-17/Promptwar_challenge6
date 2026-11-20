import { Router } from 'express';
import { airQuery } from '../schemas.js';
import type { AirService } from '../services/openMeteo.js';
import { currentReport, parse } from './helpers.js';

export function airRoute(air: AirService): Router {
  const router = Router();
  router.get('/air', async (req, res) => {
    const { lat, lon } = parse(airQuery, req.query);
    res.json(await currentReport(air, lat, lon));
  });
  return router;
}
