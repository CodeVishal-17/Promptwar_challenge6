import type { Profile } from './types.js';

/** Starting point before a family describes themselves: two adults, nothing special. */
export const DEFAULT_PROFILE: Profile = {
  household: {
    adults: 2,
    children: 0,
    olderAdults: 0,
    pregnant: false,
    respiratory: false,
    heart: false,
  },
  commute: null,
  exercise: null,
  home: {
    purifier: false,
    cooking: 'gas',
    heating: 'gas',
    canOpenWindows: true,
    indoorSmoking: false,
  },
};
