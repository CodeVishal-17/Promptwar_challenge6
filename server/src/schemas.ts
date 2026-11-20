import { z } from 'zod';

/** A coordinate that may arrive as a number (JSON) or a string (query); NaN and Infinity are rejected. */
const coordinate = (limit: number) =>
  z
    .union([z.number(), z.string().trim().min(1).pipe(z.coerce.number())])
    .pipe(z.number().min(-limit).max(limit));

const lat = coordinate(90);
const lon = coordinate(180);

/** Empty string (a geolocated place has no country) is treated as absent. */
const countryCode = z
  .union([z.literal('').transform(() => undefined), z.string().regex(/^[A-Z]{2}$/)])
  .optional();

const count = z.number().int().min(0).max(20);
const hour = z.number().int().min(0).max(23);
const capacity = z.number().min(1).max(2000);

const profile = z
  .object({
    household: z
      .object({
        adults: count,
        children: count,
        olderAdults: count,
        pregnant: z.boolean(),
        respiratory: z.boolean(),
        heart: z.boolean(),
      })
      .strict(),
    commute: z
      .object({
        mode: z.enum([
          'car_petrol',
          'car_diesel',
          'car_ev',
          'motorbike',
          'bus',
          'rail',
          'bike',
          'walk',
        ]),
        oneWayKm: z.number().min(0).max(200),
        departHour: hour,
      })
      .strict()
      .nullable(),
    exercise: z
      .object({
        type: z.enum(['run', 'cycle', 'walk', 'sport']),
        hour,
        minutes: z.number().min(5).max(240),
      })
      .strict()
      .nullable(),
    home: z
      .object({
        purifier: z.boolean(),
        purifierCadrM3h: capacity.optional(),
        roomM3: capacity.optional(),
        cooking: z.enum(['gas', 'electric', 'solid']),
        heating: z.enum(['gas', 'electric', 'wood_coal', 'none']),
        canOpenWindows: z.boolean(),
        indoorSmoking: z.boolean(),
      })
      .strict(),
  })
  .strict();

export const geocodeQuery = z.object({ q: z.string().trim().min(2).max(80) });

export const airQuery = z.object({ lat, lon });

export const planBody = z.object({ lat, lon, countryCode, profile }).strict();

export const askBody = planBody.extend({ question: z.string().trim().min(1).max(500) }).strict();

/**
 * Dotted paths of the invalid fields. Only paths are reported, never messages or values, so a
 * response cannot echo user input. An unknown key reports its parent object.
 */
export function failedFields(error: z.ZodError): string[] {
  const paths = error.issues.map((i) => i.path.map(String).join('.'));
  return [...new Set(paths.map((p) => p || 'body'))];
}
