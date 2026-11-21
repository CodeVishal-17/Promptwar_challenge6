import type { CommuteMode, Impact } from '../../../../shared/types.js';
import { WHO_AMBIENT_AIR, WHO_HOUSEHOLD_AIR } from '../guidanceSources.js';
import { commuteSwitchImpact } from '../impact/commute.js';
import { DESNZ_2026 } from '../impact/sources.js';
import type { Action, PlanContext } from '../planContext.js';

/** Longest commute, one way, for which a bike is offered as the swap. */
const BIKE_MAX_KM = 8;

const POLLUTING_MODES: readonly CommuteMode[] = ['car_petrol', 'car_diesel', 'motorbike'];
const CAR_MODES: readonly CommuteMode[] = ['car_petrol', 'car_diesel'];
const LOW_EMISSION_MODES: readonly CommuteMode[] = ['bus', 'rail', 'bike', 'walk', 'car_ev'];

const commuteIn =
  (modes: readonly CommuteMode[]) =>
  (ctx: PlanContext): boolean => {
    const { commute } = ctx.profile;
    return commute !== null && modes.includes(commute.mode);
  };

function switchCommuteImpact(ctx: PlanContext): Impact | null {
  const { commute } = ctx.profile;
  if (!commute) return null;
  const to: CommuteMode = commute.oneWayKm <= BIKE_MAX_KM ? 'bike' : 'rail';
  return commuteSwitchImpact(commute.mode, to, commute.oneWayKm, ctx.countryCode);
}

/** Sustainable: lower-emission alternatives that cut smog at the source. */
export const SUSTAINABLE_ACTIONS: readonly Action[] = [
  {
    id: 'no-waste-burning',
    section: 'sustainable',
    title: 'Never burn rubbish, leaves or crop waste',
    defaultWhy:
      'Open burning puts thick smoke and fine particles straight into the air around homes. Sending waste for collection stops it at the source.',
    priority: 76,
    applies: () => true,
    sources: [WHO_AMBIENT_AIR],
  },
  {
    id: 'switch-commute',
    section: 'sustainable',
    title: 'Leave the car or motorbike at home when you can',
    defaultWhy:
      'Every trip not made in a petrol or diesel vehicle means less exhaust on your street and less carbon in the atmosphere. The chip shows what a regular switch saves.',
    priority: 78,
    applies: commuteIn(POLLUTING_MODES),
    impact: switchCommuteImpact,
    sources: [DESNZ_2026, WHO_AMBIENT_AIR],
  },
  {
    id: 'cleaner-cooking-fuel',
    section: 'sustainable',
    title: 'Move toward cleaner cooking fuel',
    defaultWhy:
      'Cooking on wood, dung or charcoal is a major source of fine particles in the home. Gas, electric or induction cooking removes most of that smoke at the source.',
    priority: 64,
    applies: (ctx) => ctx.profile.home.cooking === 'solid',
    sources: [WHO_HOUSEHOLD_AIR],
  },
  {
    id: 'combine-trips',
    section: 'sustainable',
    title: 'Combine errands into one trip',
    defaultWhy: 'Fewer, planned trips mean less driving, so less exhaust on your street.',
    priority: 58,
    applies: commuteIn(CAR_MODES),
    sources: [WHO_AMBIENT_AIR],
  },
  {
    id: 'share-the-ride',
    section: 'sustainable',
    title: 'Share the ride with a neighbour or colleague',
    defaultWhy: 'Two people in one car take one vehicle’s exhaust off the road instead of two.',
    priority: 52,
    applies: commuteIn(CAR_MODES),
    sources: [WHO_AMBIENT_AIR],
  },
  {
    id: 'electrify-heating',
    section: 'sustainable',
    title: 'Plan a switch to electric heating',
    defaultWhy:
      'Electric heating puts no smoke or exhaust into your home or street, so the smog you add in winter drops at the source.',
    priority: 50,
    // Wood and coal only: WHO counts gas among the clean household fuels, so its sources do
    // not support this card for gas heating.
    applies: (ctx) => ctx.profile.home.heating === 'wood_coal',
    sources: [WHO_AMBIENT_AIR, WHO_HOUSEHOLD_AIR],
  },
  {
    id: 'keep-low-emission-commute',
    section: 'sustainable',
    title: 'Keep up your low-emission commute',
    defaultWhy:
      'Bikes, walking and electric cars add no tailpipe exhaust to your street, and a bus or train means less exhaust per person than driving alone. Your commute is already helping, so hold on to it.',
    priority: 45,
    applies: commuteIn(LOW_EMISSION_MODES),
    sources: [DESNZ_2026, WHO_AMBIENT_AIR],
  },
  {
    id: 'community-air-action',
    section: 'sustainable',
    title: 'Share what you have learned with your street or school',
    defaultWhy:
      'Much of a city’s air pollution is beyond what one household can control, so agreeing on habits like no burning, or backing local clean-air measures, goes further than going it alone.',
    priority: 35,
    applies: () => true,
    sources: [WHO_AMBIENT_AIR],
  },
];
