# Sky Pals: Clearday UI redesign

Date: 2026-11-21 · Status: draft for approval · Builds on `2026-11-18-urban-air-quality-assistant-design.md`

## Intent and why

The owner tested the finished app and found it felt like "reading a long one-page PDF or a news
article instead of a website", with colours that felt depressing. They want it to feel like an
app: separate screens, motion, livelier colour and some character ("smiles"), so that it feels
happy to look at. They chose direction **A · Sky Pals** from three mockups (the others were a
colourful tile dashboard and a guided four-step story).

Sky Pals, as shown in the mockup: a soft sky gradient fading into warm cream, a white cloud
mascot ("Puff") who floats, blinks and talks in a speech bubble, a big AQI bubble, rounded white
highlight cards with pastel icon tiles, and an app-style tab bar: Today · Forecast · My plan · Ask.

The app is a hackathon entry (PromptWars Challenge 6), due 2026-11-29 23:59 IST and scored by an AI
on code quality, security, efficiency, testing, accessibility and alignment with the brief
("help families and communities navigate severe winter smog… clearly explaining the direct impact
of their choices"). The redesign must not cost points on any of those.

## Goals

- Separate screens instead of one long scroll, each reachable by its own address.
- A cheerful, family-friendly look: sky and cream, pastel accents, rounded friendly type.
- Puff, a mascot whose mood follows the air honestly but always stays encouraging.
- Motion that adds life: screen transitions, Puff's float and blink, cards popping in, chart bars
  growing, a small celebration when a family ticks off its plan.
- Every existing feature and figure kept, with the same accuracy rules.

## Non-goals

- No new data sources, no change to the server, the AQI maths, the impact maths or the AI rules.
- No dark mode (removed on purpose in bf210c7).
- No framework, no animation library.

## Anti-goals (a failure even if it works)

- Puff looking happy about dangerous air, or any cheerful copy that understates a health risk.
- Motion that ignores "reduce motion", or anything that flashes more than 3 times a second.
- Losing WCAG 2.2 AA anywhere (contrast, focus, keyboard, screen reader announcements).
- Breaking the strict CSP: no inline styles or scripts, no `innerHTML`, no style attributes.
- A number on screen that did not come from code (the "numbers come from code" rule).

## Constraints

- Framework-free TypeScript + Vite; DOM built with the existing `h()` helper; SVG built with
  `createElementNS`. Styles only through classes and CSSOM.
- CSP stays exactly as it is (`font-src 'self'` allows a self-hosted font).
- The existing component tests (501 tests, ~96% statement coverage) keep passing; tests that
  assert on page structure are updated, not deleted. Coverage must not drop.
- Bundle stays small: today 42 kB JS (16 kB gzipped). The redesign keeps JS under 30 kB gzipped;
  the font adds one Latin woff2 file (roughly 30–40 kB).
- Deadline: about a week. The work must be finishable in 2–3 days to leave time for the video.

## Approaches considered

1. **Hash-routed screens around the existing components (chosen).** The page becomes an app shell
   with screens for Today, Forecast, My plan, Ask and How it works, each at its own `#/…`
   address so Back, refresh and shared links work. Existing components are kept and restyled;
   Puff is a new component. Lowest risk; keeps the tested code.
2. **In-page tabs without addresses.** Less work, but Back leaves the site and screens cannot be
   linked, so it feels less like an app.
3. **Rewrite in a framework (e.g. Preact) with an animation library.** Throws away tested
   components a week before the deadline, and the strict CSP makes most animation libraries
   (which set inline styles) awkward.

The owner handed over the how; option 1 is the builder's call.

## The design

### Screens and navigation

| Address | Screen | Contents |
|---|---|---|
| `#/today` (default) | Today | Puff + speech bubble, AQI bubble, three highlight cards, then the full AQI card details |
| `#/forecast` | Forecast | the 48-hour chart (with its table toggle) and the coming-days list |
| `#/plan` | My plan | the plan (health card, routine timeline, plan cards with impact chips), "Edit household", and the new checklist progress |
| `#/ask` | Ask | the Q&A panel, styled as a chat |
| `#/about` | How it works | the method notes and data sources (today's "How we calculate") |

- Unknown or empty hash → Today. The router is a small module: it reads `location.hash`, shows
  one screen, hides the others (`hidden`), sets `aria-current="page"` on the matching nav link,
  updates `document.title` ("Forecast · Lahore — Clearday"), and moves focus to the new screen's
  heading (not on first load).
- Navigation is a `<nav aria-label="Main">` of plain links (`<a href="#/forecast">`), not ARIA
  tabs: links match the URL model and need no custom keyboard handling.
- Layout: on phones the nav is a floating tab bar fixed to the bottom (icon + label, 44 px
  targets, safe-area padding); from 48 rem wide it moves to the top, under the header, as a row
  of pill links. "How it works" is a link in the header (an info icon with a text label) and in
  the footer, not a tab.
- Before a place is chosen, Forecast, My plan and Ask show a friendly empty state (Puff waving,
  "Pick a place first" with a link back to Today) instead of being hidden, so the nav never
  changes shape.
- Screen changes animate: the incoming screen fades in and slides 12 px up (200 ms). Under
  `prefers-reduced-motion: reduce` it simply appears.

### Header and place search

- Header: the Clearday logo (sun mark) on the left; on the right a location pill ("📍 Lahore")
  once a place is chosen, and the "How it works" link.
- On Today with no place chosen: a welcome card with Puff waving, the headline "How's the air
  today?", and the existing search combobox plus the sunny "Use my location" button.
- With a place chosen, the search collapses: the location pill (and a "Change place" button on
  Today) reopens it inline at the top of Today. The combobox itself (ARIA 1.2 pattern, tests) is
  unchanged.

### Puff, the mascot

- One component, `mascot.ts`, building an inline SVG cloud (body, two eyes that blink, rosy
  cheeks, a mouth or a mask, optional extras) with `createElementNS`, plus a speech bubble.
  The SVG is decorative (`aria-hidden`); the bubble text is real text.
- Mood follows the EPA category, honestly:

  | Category | Puff | Sky behind Today |
  |---|---|---|
  | Good | big grin, sparkles | clear blue |
  | Moderate | smile | soft blue |
  | Unhealthy for sensitive groups | smile, mask around the chin | pale blue → cream |
  | Unhealthy | mask on, smiling eyes | hazy peach |
  | Very unhealthy | mask on, small house beside him ("indoors day") | dusky peach |
  | Hazardous | mask on, house, gentle concerned brows | deep peach |
  | No reading | sleepy eyes, "z" | neutral blue |

- The bubble's words come from a fixed table in code keyed by category (and whether a cleaner
  window exists), never from Gemini; any number in it (AQI, a time, a percentage) comes from the
  report or plan objects, formatted by the existing format helpers. Examples: Good — "Lovely air
  today! A great day to walk or cycle 🚲"; Unhealthy with a cleaner window — "Rough air today,
  but I found you a cleaner spell at 14:00 💪".
- Puff also appears in empty states (waving), loading (bobbing faster), errors (a gentle "oops"
  face) and the plan celebration (cheering).
- Motion: float (3.2 s), blink (every 4 s), all disabled under reduced motion.

### Today screen

- Puff + bubble, then the AQI bubble (big number + category chip), then three highlight cards,
  each a link to its screen:
  1. Cleanest hours → `#/forecast` (from the report's cleanest daytime window; hidden if none).
  2. Today's plan → `#/plan`: the number of routine steps for today ("4 steps for today"), plus,
     only when the plan contains a commute switch, that item's own figure exactly as the server
     states it (e.g. "≈480 kg CO₂e/yr from taking the bus"). No totals, no per-day conversions:
     those would be new impact maths. Shows a skeleton while the plan loads. *(Builder's call,
     after review: the mockup's "3.2 kg CO₂ saved" had no source in the data.)*
  3. Indoor tip → `#/plan` (the first indoor item and its figure).
- Below: the existing AQI card details (pollutants, scale), restyled.

### My plan: a checklist with a small celebration (new behaviour)

- Only the steps in **"Your low-emission routine"** get a "Done" checkbox: they are things a
  family does today. "Indoor air" and "Greener swaps" items include one-off changes (electrify
  heating, a cleaner cooking fuel, a purifier filter), so ticking them daily would make the
  celebration dishonest; they keep no checkbox. *(Builder's call, after review.)* Ticks are
  stored in `localStorage` by action id, keyed by place + local date, so they reset the next day
  and survive hourly re-plans; nothing is sent to the server.
- A progress line at the top of the routine: "2 of 4 done" with a bar. When every routine step
  is ticked, Puff cheers
  and a short CSS confetti burst plays (decorative, `aria-hidden`; one polite announcement:
  "All done for today, nice work!"). No confetti under reduced motion.
- This exists to make the brief's "low-emission daily routines" something families act on,
  not just read.

### Ask screen

- The question and answer are shown as chat bubbles (user right, Clearday left with a small Puff
  avatar). The panel logic, limits, notices and announcements are unchanged.

### Look

- Palette (contrast checked, WCAG relative luminance):
  - sky gradient `#8fd8ff` → `#bfeaff` → cream `#fff6e3`; body text `#1b2a33` (9.4:1 on the
    darkest sky stop), muted `#4f5d68` (≥ 5.3:1 on every surface it sits on);
  - primary teal `#0e7490` (white text on it 5.4:1; as link text ≥ 5.0:1 on cream and white);
  - sunny `#ffd166` buttons with dark text; pastel icon tiles (sky `#e0f2fe`, mint `#dcfce7`,
    butter `#fef3c7`, peach `#ffe4d6`, lilac `#ede9fe`) behind emoji or icons, never behind
    body text that would fall under 4.5:1;
  - the six EPA AQI colours unchanged, still never used as text.
- Type: **Nunito** (SIL OFL), self-hosted from the `@fontsource-variable/nunito` package, Latin
  subset only, `font-display: swap`; system fonts as fallback. Rounded type is a large part of
  the "friendly" feel.
- Shapes: 18–24 px card radii, pill chips and buttons, soft blue-tinted shadows.
- Motion (all off under reduced motion): screen fade/slide, Puff float/blink, cards popping in
  with a 60 ms stagger, chart bars growing from the baseline, the AQI number scaling in, button
  press "squish", the plan celebration. No parallax, nothing over 3 flashes a second.

## Build order and what gets cut first

*(Builder's call, after review.)* Build so that every stage is shippable and scores well on its
own:

1. **Must have:** app shell and router with the five screens and empty states; the Sky Pals
   palette, Nunito and shapes; Puff with all seven moods (simple variations of one SVG: mouth,
   mask, house, eyes) and the bubble copy; Today's highlight cards; screen transitions, Puff's
   float and blink, card pop-in; all tests, axe on every screen, the live contrast pass.
2. **Should have:** the routine checklist with progress and celebration; the chat-style Ask.
3. **Nice to have, cut first, in this order:** button squish, card stagger, chart bars growing,
   per-category sky tint (falls back to the single sky gradient), Puff's extra poses in loading
   and error states (fall back to the normal Puff).

## Testing

- Keep every existing component test; update `main.test.ts`, `indexHtml.test.ts` and
  `a11y.test.ts` for the new shell.
- New tests: router (default route, unknown hash, `aria-current`, focus moves to the heading on
  navigation but not on first load, title updates, Back via `hashchange`); mascot (mood per
  category, no-reading state, bubble copy per category, numbers only from inputs); highlight
  cards (links, hidden when data is missing); checklist (persist per place and date, reset next
  day, progress text, celebration announcement once); empty states per screen.
- axe-core run on every screen (empty and loaded), plus a live-browser contrast pass at 320 px,
  375 px and desktop width.
- A CSS test that every `animation`/`transition` is switched off in the reduced-motion block.

## Left to the builder

- Exact icon set (inline SVG icons vs emoji in tiles); emoji must have text alternatives or be
  `aria-hidden` next to a text label.
- Exact copy of Puff's bubble lines (within the rules above), and confetti shapes.
- Whether the AQI card details on Today are collapsed behind a "More details" toggle.
- File split for the new CSS (one file per screen or per component).
