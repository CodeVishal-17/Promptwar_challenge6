import type { z } from 'zod';
import type { AirReport } from '../../../shared/types.js';
import { IncompleteDataError, InvalidRequestError } from '../middleware/errors.js';
import { failedFields } from '../schemas.js';
import type { AirService } from '../services/openMeteo.js';

/** Parses `input` or throws an error that carries only the failed field paths. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw new InvalidRequestError(failedFields(result.error));
  return result.data;
}

/** Fetches a report and insists it has a current reading, which every consumer relies on. */
export async function currentReport(air: AirService, lat: number, lon: number): Promise<AirReport> {
  const report = await air.getReport(lat, lon);
  if (!report.now) throw new IncompleteDataError();
  return report;
}
