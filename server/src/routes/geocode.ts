import { Router } from 'express';
import { geocodeQuery } from '../schemas.js';
import type { GeocodeService } from '../services/openMeteo.js';
import { parse } from './helpers.js';

export function geocodeRoute(geocode: GeocodeService): Router {
  const router = Router();
  router.get('/geocode', async (req, res) => {
    const { q } = parse(geocodeQuery, req.query);
    res.json({ places: await geocode.search(q) });
  });
  return router;
}
