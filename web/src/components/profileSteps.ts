import type { CommuteMode, Profile } from '../../../shared/types.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';
import {
  CAPACITY,
  COUNT,
  HOUR,
  KM,
  MINUTES,
  type Fields,
  type Step,
  formStep,
  group,
  readNumber,
  reveal,
  revealWhen,
} from './formFields.js';

/** The three steps of the household form, each able to read back its part of the profile. */

export const PRIVACY_NOTICE =
  'Your household details stay in this browser. To personalise your plan, a short summary (no names or exact details) is sent to Google Gemini, whose free tier may use it to improve Google products.';

/** Starting values for details the household has not given yet. */
const COMMUTE_START = { oneWayKm: 5, departHour: 8 };
const EXERCISE_START = { hour: 7, minutes: 30 };

const COMMUTE_OPTIONS: readonly [CommuteMode | 'none', string][] = [
  ['none', 'I don’t commute'],
  ['car_petrol', 'Car (petrol)'],
  ['car_diesel', 'Car (diesel)'],
  ['car_ev', 'Electric car'],
  ['motorbike', 'Motorbike or scooter'],
  ['bus', 'Bus'],
  ['rail', 'Metro or train'],
  ['bike', 'Bike'],
  ['walk', 'Walking'],
];
const EXERCISE_OPTIONS = [
  ['none', 'None outdoors'],
  ['run', 'Running'],
  ['cycle', 'Cycling'],
  ['walk', 'Walking'],
  ['sport', 'Team sport'],
] as const;
const COOKING_OPTIONS = [
  ['gas', 'Gas'],
  ['electric', 'Electric or induction'],
  ['solid', 'Wood, coal or charcoal'],
] as const;
const HEATING_OPTIONS = [
  ['gas', 'Gas'],
  ['electric', 'Electric or heat pump'],
  ['wood_coal', 'Wood or coal'],
  ['none', 'No heating'],
] as const;

const HOUR_HINT = 'Hour on the 24-hour clock.';

/** A form step and how to read its answers back. */
export interface ProfileStep<T> {
  step: Step;
  read(): T;
}

export function householdStep(
  f: Fields,
  initial: Profile['household'],
): ProfileStep<Profile['household']> {
  const adults = f.number('Adults', initial.adults, COUNT);
  const children = f.number('Children under 12', initial.children, COUNT);
  const older = f.number('Adults 65 or older', initial.olderAdults, COUNT);
  const pregnant = f.check('Someone is pregnant', initial.pregnant);
  const respiratory = f.check(
    'Someone has asthma, COPD or another lung condition',
    initial.respiratory,
  );
  const heart = f.check('Someone has a heart condition', initial.heart);

  const step = formStep(
    'Household',
    'Children, older adults and anyone with a health condition feel polluted air sooner, so this shapes the health advice.',
    h('div', { class: 'form-grid form-grid--3' }, adults.wrap, children.wrap, older.wrap),
    group('Health', pregnant.wrap, respiratory.wrap, heart.wrap),
    h(
      'div',
      { class: 'privacy-note' },
      icon('lock', 'privacy-note__icon'),
      h('p', { class: 'privacy-note__text' }, PRIVACY_NOTICE),
    ),
  );
  return {
    step,
    read: () => ({
      adults: adults.read(initial.adults),
      children: children.read(initial.children),
      olderAdults: older.read(initial.olderAdults),
      pregnant: pregnant.input.checked,
      respiratory: respiratory.input.checked,
      heart: heart.input.checked,
    }),
  };
}

type Travel = Pick<Profile, 'commute' | 'exercise'>;
type ExerciseType = NonNullable<Profile['exercise']>['type'];

function commuteQuestion(f: Fields, initial: Profile['commute']) {
  const start = { ...COMMUTE_START, ...initial };
  const mode = f.select('Usual commute or school run', COMMUTE_OPTIONS, initial?.mode ?? 'none');
  const km = f.number('One-way distance', start.oneWayKm, KM, {
    suffix: 'km',
    hint: 'In kilometres.',
  });
  const departs = f.number('Leaves at', start.departHour, HOUR, { suffix: ':00', hint: HOUR_HINT });
  const details = reveal(km.wrap, departs.wrap);
  revealWhen(mode.select, details, () => mode.select.value === 'none');
  const read = (): Profile['commute'] =>
    mode.select.value === 'none'
      ? null
      : {
          mode: mode.select.value as CommuteMode,
          oneWayKm: km.read(start.oneWayKm),
          departHour: departs.read(start.departHour),
        };
  return { nodes: [mode.wrap, details], read };
}

function exerciseQuestion(f: Fields, initial: Profile['exercise']) {
  const start = { ...EXERCISE_START, ...initial };
  const type = f.select('Outdoor exercise', EXERCISE_OPTIONS, initial?.type ?? 'none');
  const hour = f.number('Starts at', start.hour, HOUR, { suffix: ':00', hint: HOUR_HINT });
  const minutes = f.number('Minutes', start.minutes, MINUTES, {
    suffix: 'min',
    hint: 'How long you are usually out.',
  });
  const details = reveal(hour.wrap, minutes.wrap);
  revealWhen(type.select, details, () => type.select.value === 'none');
  const read = (): Profile['exercise'] =>
    type.select.value === 'none'
      ? null
      : {
          type: type.select.value as ExerciseType,
          hour: hour.read(start.hour),
          minutes: minutes.read(start.minutes),
        };
  return { nodes: [type.wrap, details], read };
}

export function travelStep(f: Fields, initial: Travel): ProfileStep<Travel> {
  const commute = commuteQuestion(f, initial.commute);
  const exercise = exerciseQuestion(f, initial.exercise);
  const step = formStep(
    'Getting around',
    'Your trips and workouts decide when timing matters and what a greener swap could save.',
    ...commute.nodes,
    ...exercise.nodes,
  );
  return { step, read: () => ({ commute: commute.read(), exercise: exercise.read() }) };
}

export function homeStep(f: Fields, initial: Profile['home']): ProfileStep<Profile['home']> {
  const purifier = f.check('We have an air purifier', initial.purifier);
  const cadr = f.number('Clean air delivery rate (CADR)', initial.purifierCadrM3h, CAPACITY, {
    suffix: 'm³/h',
    hint: 'On the box or label. Leave blank if you don’t know.',
  });
  const room = f.number('Room size', initial.roomM3, CAPACITY, {
    suffix: 'm³',
    hint: 'Length × width × height of the room it’s in. Leave blank if unsure.',
  });
  const purifierDetails = reveal(cadr.wrap, room.wrap);
  revealWhen(purifier.input, purifierDetails, () => !purifier.input.checked);
  const cooking = f.select('Cooking', COOKING_OPTIONS, initial.cooking);
  const heating = f.select('Heating', HEATING_OPTIONS, initial.heating);
  const windows = f.check('We can open our windows', initial.canOpenWindows);
  const smoking = f.check('Someone smokes indoors', initial.indoorSmoking);

  const step = formStep(
    'Home',
    'What happens indoors decides which air hacks will help most.',
    purifier.wrap,
    purifierDetails,
    h('div', { class: 'form-grid' }, cooking.wrap, heating.wrap),
    group('Windows and smoke', windows.wrap, smoking.wrap),
  );

  const read = (): Profile['home'] => {
    const home: Profile['home'] = {
      purifier: purifier.input.checked,
      cooking: cooking.select.value as Profile['home']['cooking'],
      heating: heating.select.value as Profile['home']['heating'],
      canOpenWindows: windows.input.checked,
      indoorSmoking: smoking.input.checked,
    };
    if (!home.purifier) return home;
    // Purifier size is optional: a blank field means "don't know", so it is left out, not defaulted.
    const c = readNumber(cadr.input.value, CAPACITY);
    const r = readNumber(room.input.value, CAPACITY);
    return { ...home, ...(c !== null && { purifierCadrM3h: c }), ...(r !== null && { roomM3: r }) };
  };
  return { step, read };
}
