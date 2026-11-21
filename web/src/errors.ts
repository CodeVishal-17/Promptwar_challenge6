import { ApiError } from './api.js';

/** What to tell people when a request fails, by the API error code. */
export type ErrorCopy = Partial<Record<string, string>>;

const COMMON_ERRORS: ErrorCopy = {
  network: "We couldn't reach Clearday. Check your connection and try again.",
  timeout: "We couldn't reach Clearday. Check your connection and try again.",
};

const SERVICE_DOWN =
  'The air-quality service is not responding right now. Please try again in a moment.';

export const AIR_ERRORS: ErrorCopy = {
  ...COMMON_ERRORS,
  rate_limited: 'Too many requests in a short time — please wait a few minutes and try again.',
  air_data_incomplete:
    'The air-quality model has no reading for this place right now. Please try again later.',
  air_data_unavailable: SERVICE_DOWN,
};

export const PLAN_ERRORS: ErrorCopy = {
  ...COMMON_ERRORS,
  rate_limited: 'Too many plan requests in a short time — please wait a few minutes and try again.',
  air_data_incomplete:
    'The air-quality model has no reading for this place right now, so we can’t tailor a plan yet.',
  air_data_unavailable: SERVICE_DOWN,
};

/** The message for `err` from `copy`, or a general one for anything unexpected. */
export function errorMessage(err: unknown, copy: ErrorCopy): string {
  const code = err instanceof ApiError ? err.code : 'unknown';
  return copy[code] ?? 'Something went wrong on our side. Please try again.';
}
