import { INDOOR_ACTIONS } from './actions/indoor.js';
import { ROUTINE_ACTIONS } from './actions/routine.js';
import { SUSTAINABLE_ACTIONS } from './actions/sustainable.js';
import type { Action } from './planContext.js';

/**
 * The plan catalogue: every action Clearday can suggest, in three sections. Each action decides
 * for itself whether it applies today and, where a cited source allows, computes its impact.
 * The helpers callers need are re-exported here so the catalogue stays the one entry point.
 */
export type { Action, PlanContext } from './planContext.js';
export { currentAqi } from './planContext.js';
export { clockTime, dayLabel, dayWord, reportToday, windowOf } from './reportTime.js';
export { schoolRunStart } from './timing.js';

export const ACTIONS: readonly Action[] = [
  ...ROUTINE_ACTIONS,
  ...INDOOR_ACTIONS,
  ...SUSTAINABLE_ACTIONS,
];
