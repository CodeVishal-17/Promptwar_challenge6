import { AIRNOW_PM_GUIDE, EPA_WILDFIRES_IAQ } from '../guidanceSources.js';
import { EPA_EFH_CH6 } from '../impact/sources.js';
import { AQI_UNHEALTHY, AQI_USG, aqiAtLeast, type Action } from '../planContext.js';
import { windowOf } from '../reportTime.js';
import {
  exerciseSlots,
  moveExerciseImpact,
  schoolRunImpact,
  schoolRunSlots,
  worthMoving,
} from '../timing.js';

/** Routine: low-emission daily routines and how to move through the day. */
export const ROUTINE_ACTIONS: readonly Action[] = [
  {
    id: 'exercise-indoors',
    section: 'routine',
    title: 'Move today’s workout indoors',
    defaultWhy:
      'Hard exercise makes you breathe far more air, so smog does the most harm while you work out. Indoors you breathe in much less of it.',
    priority: 90,
    applies: (ctx) => ctx.profile.exercise !== null && aqiAtLeast(AQI_UNHEALTHY)(ctx),
    sources: [AIRNOW_PM_GUIDE, EPA_EFH_CH6],
  },
  {
    id: 'n95-outdoors',
    section: 'routine',
    title: 'Wear a snug N95 or FFP2 mask if you must go out',
    defaultWhy:
      'A well-fitted respirator filters out most fine smog particles before you breathe them in. A loose cloth or surgical mask lets them slip in around the edges, and children’s faces are usually too small to seal one, so for them staying in is safer. If you have a heart or lung condition, check with your doctor before using a respirator.',
    priority: 85,
    applies: aqiAtLeast(AQI_UNHEALTHY),
    sources: [AIRNOW_PM_GUIDE, EPA_WILDFIRES_IAQ],
  },
  {
    id: 'move-exercise-to-best-window',
    section: 'routine',
    title: 'Shift your exercise to the cleanest hours',
    defaultWhy:
      'Smog rises and falls through the day. Exercising when it is lowest means every breath carries less pollution.',
    priority: 80,
    applies: (ctx) => worthMoving(ctx, exerciseSlots(ctx)),
    impact: moveExerciseImpact,
    sources: [AIRNOW_PM_GUIDE, EPA_EFH_CH6],
  },
  {
    id: 'school-run-timing',
    section: 'routine',
    title: 'Time the school run for cleaner air',
    defaultWhy:
      'Children are among those most at risk from fine particles. Leaving when the air is cleaner, and keeping them off the busiest roads, lowers what they breathe in.',
    priority: 75,
    applies: (ctx) => worthMoving(ctx, schoolRunSlots(ctx)),
    impact: schoolRunImpact,
    sources: [AIRNOW_PM_GUIDE, EPA_EFH_CH6],
  },
  {
    id: 'keep-medication-handy',
    section: 'routine',
    title: 'Keep your reliever medicine and action plan close',
    defaultWhy:
      'Smog can set off asthma and heart symptoms. With your medicine and plan to hand, you can act at the first sign instead of waiting for it to get worse.',
    priority: 70,
    applies: (ctx) =>
      (ctx.profile.household.respiratory || ctx.profile.household.heart) &&
      aqiAtLeast(AQI_USG)(ctx),
    sources: [AIRNOW_PM_GUIDE],
  },
  {
    id: 'lighter-activity',
    section: 'routine',
    title: 'Keep outdoor effort light and take breaks',
    defaultWhy:
      'The harder you breathe, the more smog reaches deep into your lungs. Easier effort and regular rests cut what you take in.',
    priority: 60,
    applies: aqiAtLeast(AQI_USG),
    sources: [AIRNOW_PM_GUIDE],
  },
  {
    id: 'avoid-worst-window',
    section: 'routine',
    title: 'Keep errands out of the smoggiest hours',
    defaultWhy:
      'Pollution peaks at certain hours. Doing outdoor jobs just before or after the peak keeps you out of the thickest air.',
    priority: 55,
    applies: (ctx) => {
      const worst = windowOf(ctx.report, 'worst');
      return worst !== undefined && worst.meanAqi >= AQI_USG;
    },
    sources: [AIRNOW_PM_GUIDE],
  },
  {
    id: 'check-hourly-outlook',
    section: 'routine',
    title: 'Check the hourly outlook before you head out',
    defaultWhy:
      'Air quality changes through the day, so a quick look at the hours ahead beats guessing from this morning.',
    priority: 30,
    applies: () => true,
    sources: [AIRNOW_PM_GUIDE],
  },
];
