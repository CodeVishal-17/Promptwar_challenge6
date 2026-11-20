import type { ErrorRequestHandler, RequestHandler } from 'express';
import { UpstreamError } from '../services/openMeteo.js';

/** A request that failed validation; carries only field paths. */
export class InvalidRequestError extends Error {
  constructor(readonly fields: string[]) {
    super('invalid_request');
    this.name = 'InvalidRequestError';
  }
}

/** The upstream answered but had no reading for the current hour. */
export class IncompleteDataError extends Error {
  constructor() {
    super('air_data_incomplete');
    this.name = 'IncompleteDataError';
  }
}

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'not_found' });
};

/** Body-parser errors carry `type` and `status`; anything else is internal. */
const bodyParserType = (err: unknown): string | undefined =>
  typeof err === 'object' && err !== null && 'type' in err ? String(err.type) : undefined;

/**
 * Maps every failure to a short JSON code. Nothing from the error (message, stack, input) reaches
 * the response, and only the error's name is logged, so request content never lands in logs.
 */
export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  const type = bodyParserType(err);
  if (err instanceof InvalidRequestError) {
    res.status(400).json({ error: 'invalid_request', fields: err.fields });
  } else if (type === 'entity.too.large') {
    res.status(413).json({ error: 'payload_too_large' });
  } else if (type === 'entity.parse.failed' || type === 'encoding.unsupported') {
    res.status(400).json({ error: 'invalid_request', fields: [] });
  } else if (err instanceof UpstreamError) {
    res.status(502).json({ error: 'air_data_unavailable' });
  } else if (err instanceof IncompleteDataError) {
    res.status(502).json({ error: 'air_data_incomplete' });
  } else {
    console.error(err instanceof Error ? err.name : 'UnknownError');
    res.status(500).json({ error: 'internal' });
  }
};
