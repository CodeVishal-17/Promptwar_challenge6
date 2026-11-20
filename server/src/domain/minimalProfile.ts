import type { MinimalProfile, Profile } from '../../../shared/types.js';

/**
 * Reduces a profile to what an AI model needs to personalise advice: which sensitive
 * groups are present (flags, not counts), the household size, and habits without
 * times of day or device sizes.
 */
export function minimiseProfile(p: Profile): MinimalProfile {
  const h = p.household;
  const sensitiveGroups: MinimalProfile['sensitiveGroups'] = [];
  if (h.children > 0) sensitiveGroups.push('children');
  if (h.olderAdults > 0) sensitiveGroups.push('older_adults');
  if (h.pregnant) sensitiveGroups.push('pregnancy');
  if (h.respiratory) sensitiveGroups.push('respiratory');
  if (h.heart) sensitiveGroups.push('heart');
  return {
    sensitiveGroups,
    householdSize: h.adults + h.children + h.olderAdults,
    commute: p.commute ? { mode: p.commute.mode, oneWayKm: p.commute.oneWayKm } : null,
    exercise: p.exercise ? { type: p.exercise.type, minutes: p.exercise.minutes } : null,
    home: {
      purifier: p.home.purifier,
      cooking: p.home.cooking,
      heating: p.home.heating,
      canOpenWindows: p.home.canOpenWindows,
      indoorSmoking: p.home.indoorSmoking,
    },
  };
}
