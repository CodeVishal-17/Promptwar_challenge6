import type { AirReport, AqiCategory } from '../../../shared/types.js';
import { h } from '../dom.js';
import { dayOffset, formatLocalTime, weekday } from '../format.js';

/**
 * Puff, Clearday's cloud mascot. His face follows the air honestly: he grins only on good days,
 * wears a mask once the air is unhealthy, and stays indoors when it is worse. He is decoration
 * (`aria-hidden`); what he says is real text, from the fixed table below, never from the AI.
 */
export type Mood = AqiCategory | 'none' | 'wave' | 'cheer';

export interface Line {
  text: string;
  /** Shown beside the text and hidden from screen readers. */
  emoji: string;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(tag: string, attrs: Record<string, string>, ...children: SVGElement[]): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  el.append(...children);
  return el;
}

const BODY = 'M30 80H92A16 16 0 0 0 94 48A22 22 0 0 0 54 32A20 20 0 0 0 26 50A15 15 0 0 0 30 80Z';
const SPARKLE = (x: number, y: number) =>
  svg('path', { class: 'puff__sparkle', d: `M${x} ${y}l2 6 6 2-6 2-2 6-2-6-6-2 6-2z` });

function eyes(mood: Mood): SVGElement[] {
  if (mood === 'none') {
    return [44, 68].map((x) =>
      svg('path', { class: 'puff__eye puff__eye--sleepy', d: `M${x} 58q4 3 8 0` }),
    );
  }
  return [48, 72].map((cx) =>
    svg('ellipse', { class: 'puff__eye', cx: String(cx), cy: '58', rx: '3.5', ry: '4.5' }),
  );
}

function mouth(shape: 'grin' | 'smile'): SVGElement {
  return shape === 'grin'
    ? svg('path', { class: 'puff__mouth', 'data-shape': 'grin', d: 'M52 65q8 10 16 0z' })
    : svg('path', { class: 'puff__mouth', 'data-shape': 'smile', d: 'M54 66q6 6 12 0' });
}

/** A face mask with ear straps; on the chin it sits lower, below a visible smile. */
function mask(pos: 'on' | 'chin'): SVGElement {
  return svg(
    'g',
    {
      class: 'puff__mask',
      'data-pos': pos,
      ...(pos === 'chin' ? { transform: 'translate(0 9)' } : {}),
    },
    svg('path', { class: 'puff__mask-strap', d: 'M46 64L36 57M74 64L84 57' }),
    svg('path', {
      class: 'puff__mask-cloth',
      d: 'M46 62h28a4 4 0 0 1 4 4v4a10 10 0 0 1-10 9H52a10 10 0 0 1-10-9v-4a4 4 0 0 1 4-4Z',
    }),
    svg('path', { class: 'puff__mask-fold', d: 'M48 68h24M50 73h20' }),
  );
}

function house(): SVGElement {
  return svg(
    'g',
    { class: 'puff__house' },
    svg('path', { class: 'puff__house-wall', d: 'M98 92V80l8-7 8 7v12Z' }),
    svg('path', { class: 'puff__house-door', d: 'M104 92v-6h4v6' }),
  );
}

/** Moods that earn a grin and sparkles, a full mask, or a retreat indoors. */
const HAPPY: ReadonlySet<Mood> = new Set(['good', 'cheer']);
const MASKED: ReadonlySet<Mood> = new Set(['unhealthy', 'very_unhealthy', 'hazardous']);
const INDOORS: ReadonlySet<Mood> = new Set(['very_unhealthy', 'hazardous']);

const arm = (d: string): SVGElement => svg('path', { class: 'puff__arm', d });
const RIGHT_ARM = 'M92 62q12-4 15-18';
const LEFT_ARM = 'M28 62q-12-4-15-18';

function arms(mood: Mood): SVGElement[] {
  if (mood === 'wave') return [arm(RIGHT_ARM)];
  if (mood === 'cheer') return [arm(LEFT_ARM), arm(RIGHT_ARM)];
  return [];
}

function cheeks(): SVGElement[] {
  return [40, 80].map((cx) =>
    svg('circle', { class: 'puff__cheek', cx: String(cx), cy: '67', r: '4' }),
  );
}

/** Frowning brows, only when the air is hazardous. */
function brows(mood: Mood): SVGElement[] {
  if (mood !== 'hazardous') return [];
  return [
    svg('path', { class: 'puff__brow', d: 'M43 51l9-3' }),
    svg('path', { class: 'puff__brow', d: 'M77 51l-9-3' }),
  ];
}

/** A full mask from unhealthy up; otherwise a mouth, with the mask on the chin for sensitive groups. */
function lowerFace(mood: Mood): SVGElement[] {
  if (MASKED.has(mood)) return [mask('on')];
  const face = mouth(HAPPY.has(mood) ? 'grin' : 'smile');
  return mood === 'usg' ? [face, mask('chin')] : [face];
}

/** A "z" when there is no reading, so Puff is asleep rather than wrong. */
function snooze(mood: Mood): SVGElement[] {
  if (mood !== 'none') return [];
  const z = svg('text', { class: 'puff__z', x: '94', y: '32' });
  z.textContent = 'z';
  return [z];
}

function parts(mood: Mood): SVGElement[] {
  return [
    ...(HAPPY.has(mood) ? [SPARKLE(14, 18), SPARKLE(100, 14)] : []),
    ...arms(mood),
    svg('path', { class: 'puff__body', d: BODY }),
    ...eyes(mood),
    ...cheeks(),
    ...brows(mood),
    ...lowerFace(mood),
    ...(INDOORS.has(mood) ? [house()] : []),
    ...snooze(mood),
  ];
}

/** Puff as a decorative inline SVG. */
export function puff(mood: Mood, size: 'lg' | 'sm' = 'lg'): SVGSVGElement {
  return svg(
    'svg',
    {
      class: `puff puff--${size}`,
      'data-mood': mood,
      viewBox: '0 0 120 100',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    ...parts(mood),
  ) as SVGSVGElement;
}

export const WELCOME_LINE: Line = {
  text: "Hi, I'm Puff! Tell me where you are and I'll check the air for you.",
  emoji: '👋',
};

interface Copy {
  plain: string;
  cleaner?: (when: string) => string;
  emoji: string;
}

/** What Puff says per category. `when` is "at 16:00", "tomorrow at 07:00" or "on Sunday at 06:00". */
const COPY: Record<AqiCategory | 'none', Copy> = {
  good: { plain: 'Lovely air today! A great day to walk or cycle.', emoji: '🚲' },
  moderate: {
    plain: 'Pretty good air today. Most people can enjoy being outside.',
    cleaner: (when) => `Pretty good air today, and it's cleanest ${when}.`,
    emoji: '☀️',
  },
  usg: {
    plain: 'Okay for most people, but go easy if anyone at home is sensitive.',
    cleaner: (when) =>
      `Okay for most people, but go easy if anyone at home is sensitive. Cleanest ${when}.`,
    emoji: '🙂',
  },
  unhealthy: {
    plain: 'Rough air today, so keep outdoor effort light.',
    cleaner: (when) => `Rough air today, but I found you a cleaner spell ${when}.`,
    emoji: '💪',
  },
  // From very unhealthy up, Puff never invites anyone out, even when a cleaner hour is coming.
  very_unhealthy: {
    plain: "Very unhealthy air. It's an indoors day: windows shut, purifier on.",
    emoji: '🏠',
  },
  hazardous: { plain: 'Hazardous air. Please stay indoors and keep windows closed.', emoji: '🏠' },
  none: { plain: "I can't get a reading for this hour. Check back soon.", emoji: '💤' },
};

export const moodFor = (report: AirReport): Mood => report.now?.category ?? 'none';

/** Puff's line for this report; it names a cleaner time only when one really is cleaner. */
export function puffLine(report: AirReport): Line {
  const { now } = report;
  const copy = COPY[now?.category ?? 'none'];
  const best = report.windows.find((w) => w.kind === 'best');
  if (now && copy.cleaner && best && best.meanAqi < now.aqi) {
    const days = dayOffset(now.time, best.start);
    const day =
      days <= 0
        ? 'at'
        : days === 1
          ? 'tomorrow at'
          : `on ${weekday(best.start.slice(0, 10), 'long')} at`;
    return { text: copy.cleaner(`${day} ${formatLocalTime(best.start)}`), emoji: copy.emoji };
  }
  return { text: copy.plain, emoji: copy.emoji };
}

/** Puff with a speech bubble. */
export function puffSays(mood: Mood, line: Line, size: 'lg' | 'sm' = 'lg'): HTMLElement {
  return h(
    'div',
    { class: 'puff-says' },
    puff(mood, size),
    h(
      'p',
      { class: 'puff-says__bubble' },
      line.text,
      ' ',
      h('span', { 'aria-hidden': 'true' }, line.emoji),
    ),
  );
}
