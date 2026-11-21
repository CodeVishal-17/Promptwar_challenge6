import {
  EPA_DIY_AIR_CLEANERS,
  EPA_IMPROVING_IAQ,
  EPA_INTRO_IAQ,
  EPA_WILDFIRES_IAQ,
  EPA_WOOD_SMOKE,
  WHO_HOUSEHOLD_AIR,
} from '../guidanceSources.js';
import { keepWindowsClosedImpact, purifierImpact } from '../impact/indoor.js';
import { EPA_AIR_CLEANER_GUIDE, XIANG_2021 } from '../impact/sources.js';
import {
  AQI_UNHEALTHY,
  AQI_USG,
  aqiAtLeast,
  type Action,
  type PlanContext,
} from '../planContext.js';
import { windowOf } from '../reportTime.js';

const pm25Now = (ctx: PlanContext): number | null => ctx.report.pm25[0] ?? null;

/** The best window is only worth airing the home in when the air is not itself unhealthy. */
function canAirOut(ctx: PlanContext): boolean {
  const best = windowOf(ctx.report, 'best');
  return ctx.profile.home.canOpenWindows && best !== undefined && best.meanAqi < AQI_UNHEALTHY;
}

/** Indoor: hacks that keep the air at home as clean as it can be. */
export const INDOOR_ACTIONS: readonly Action[] = [
  {
    id: 'keep-windows-closed',
    section: 'indoor',
    title: 'Keep windows and doors shut while the air is bad',
    defaultWhy:
      'A shut-up home stays cleaner than the air outside because far less smog leaks in. Every open window lets it flow straight through.',
    priority: 88,
    applies: aqiAtLeast(AQI_USG),
    impact: (ctx) => {
      const pm = pm25Now(ctx);
      return pm === null ? null : keepWindowsClosedImpact(pm);
    },
    sources: [XIANG_2021, EPA_WILDFIRES_IAQ],
  },
  {
    id: 'run-purifier',
    section: 'indoor',
    title: 'Run your air purifier in the room you use most',
    defaultWhy:
      'A purifier keeps pulling fine particles out of the room’s air, so the air you breathe indoors gets cleaner than closing the windows alone.',
    priority: 84,
    applies: (ctx) => ctx.profile.home.purifier,
    impact: (ctx) => {
      const pm = pm25Now(ctx);
      const { purifierCadrM3h, roomM3 } = ctx.profile.home;
      return pm === null ? null : purifierImpact(pm, purifierCadrM3h, roomM3);
    },
    sources: [EPA_AIR_CLEANER_GUIDE, XIANG_2021],
  },
  {
    id: 'no-indoor-smoking',
    section: 'indoor',
    title: 'Take smoking outside',
    defaultWhy:
      'Tobacco smoke fills a closed home with the same fine particles as smog, and they linger. Smoking outside keeps your indoor air as clean as it can be.',
    priority: 80,
    applies: (ctx) => ctx.profile.home.indoorSmoking,
    sources: [EPA_INTRO_IAQ],
  },
  {
    id: 'diy-box-fan-filter',
    section: 'indoor',
    title: 'Build a box-fan air cleaner',
    defaultWhy:
      'When buying a purifier is not an option, a box fan with a furnace filter fixed to it can clear fine particles from a room, as long as it is built carefully.',
    priority: 74,
    applies: (ctx) => !ctx.profile.home.purifier,
    sources: [EPA_DIY_AIR_CLEANERS, EPA_WILDFIRES_IAQ],
  },
  {
    id: 'avoid-wood-coal-heating',
    section: 'indoor',
    title: 'Heat with something cleaner than wood or coal',
    defaultWhy:
      'Burning wood or coal fills the room and the street with fine particles. Cleaner heat keeps both your air and your neighbours’ air better.',
    priority: 72,
    applies: (ctx) => ctx.profile.home.heating === 'wood_coal',
    sources: [EPA_WOOD_SMOKE, WHO_HOUSEHOLD_AIR],
  },
  {
    id: 'clean-room',
    section: 'indoor',
    title: 'Set up one clean room for the family',
    defaultWhy:
      'Keeping one room closed up, with a purifier or box-fan cleaner running, gives everyone, especially sensitive family members, a place to breathe easier.',
    priority: 68,
    applies: aqiAtLeast(AQI_UNHEALTHY),
    sources: [EPA_WILDFIRES_IAQ],
  },
  {
    id: 'air-out-in-best-window',
    section: 'indoor',
    title: 'Open the windows briefly at the cleanest hour',
    defaultWhy:
      'Stale air builds up in a sealed home. A short airing when the outdoor air is at its best refreshes the rooms with the least smog coming in.',
    priority: 66,
    applies: canAirOut,
    sources: [EPA_IMPROVING_IAQ],
  },
  {
    id: 'ventilate-while-cooking',
    section: 'indoor',
    title: 'Use the cooker hood or a window while you cook',
    defaultWhy:
      'Cooking over gas or solid fuel releases fine particles and gases into the room. Venting them outside stops them adding to the smog you are already breathing.',
    priority: 62,
    applies: (ctx) => ctx.profile.home.cooking === 'gas' || ctx.profile.home.cooking === 'solid',
    sources: [EPA_IMPROVING_IAQ, WHO_HOUSEHOLD_AIR],
  },
  {
    id: 'swap-purifier-filter',
    section: 'indoor',
    title: 'Check your purifier’s filter',
    defaultWhy:
      'A clogged filter moves less clean air. Replacing it on schedule keeps the purifier doing its job.',
    priority: 40,
    applies: (ctx) => ctx.profile.home.purifier,
    sources: [EPA_AIR_CLEANER_GUIDE],
  },
];
