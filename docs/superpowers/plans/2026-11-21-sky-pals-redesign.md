# Sky Pals Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Clearday's single long page into a cheerful, hash-routed app (Today · Forecast · My plan · Ask · How it works) with Puff the cloud mascot, a sky-and-cream palette, Nunito, gentle motion and a routine checklist, without changing the server or any figure.

**Architecture:** `index.html` becomes an app shell: header, a `<nav aria-label="Main">` of plain `#/…` links, and five `.screen` containers in `<main>`, of which a small router shows one. Existing components keep their ids and logic and render into the same `*-body` elements inside the screens. New components (`mascot`, `highlights`, `emptyState`) and a checklist store are pure DOM builders using `h()` / `createElementNS`. All decorative motion lives in one CSS file wrapped in `@media (prefers-reduced-motion: no-preference)`.

**Tech Stack:** TypeScript (strict), Vite 8, Vitest 4 + jsdom, axe-core, Express 5 (unchanged), Nunito variable font (SIL OFL, self-hosted woff2).

**Spec:** `docs/superpowers/specs/2026-11-21-sky-pals-redesign-design.md`

## Global Constraints

- No change under `server/` or `shared/`. No new figures: every number on screen comes from `AirReport` / `Plan` fields or `.length`, formatted by `web/src/format.ts`.
- CSP unchanged (`default-src 'self'`, `style-src 'self'`, `font-src 'self'`): no inline `<script>`/`<style>`, no `style=` attributes, no `innerHTML`; DOM via `h()` from `web/src/dom.ts`, SVG via `document.createElementNS`, dynamic positions via CSSOM (`el.style.x = …`) only.
- No framework, no animation library, no new runtime npm dependency.
- WCAG 2.2 AA everywhere: text contrast ≥ 4.5:1, targets ≥ 44 px (`--target-min`), visible focus, one polite live region (`#status`), emoji either `aria-hidden` beside a text label or omitted.
- Palette (exact): sky `#8fd8ff` → `#bfeaff` → cream `#fff6e3`; text `#1b2a33`; muted `#4f5d68`; primary teal `#0e7490`; sunny `#ffd166` (dark text only); tiles sky `#e0f2fe`, mint `#dcfce7`, butter `#fef3c7`, peach `#ffe4d6`, lilac `#ede9fe`; the six EPA colours unchanged and never used as text.
- Font: Nunito variable, Latin subset only, `font-display: swap`, system fallback stack.
- Shapes: card radius 18–24 px, pill buttons and chips, soft blue-tinted shadows.
- Motion: screen fade + 12 px rise, 200 ms; Puff float 3.2 s; blink every 4 s; nothing flashes more than 3×/s; all decorative motion off under `prefers-reduced-motion: reduce`.
- Bundle: JS under 30 kB gzipped (today 16.1 kB); one woff2 (~30–40 kB).
- Existing tests keep passing; structure tests are updated, not deleted; coverage does not drop below today's 96.59 % statements / 90.2 % branches.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never commit `.env`. **Do not push.**

## Review Focus

1. **A deep link before any place** (`/#/plan` on first visit): the Plan screen shows the "Pick a place first" empty state with a link to Today, not a blank screen. Test in Task 6.
2. **Changing place while on another screen** (header place pill on `#/forecast`): goes to Today, opens the search and focuses its input; after a pick the search collapses and focus lands on "Air right now". Test in Task 6.
3. **Air fails after a place is chosen**: Forecast / Plan / Ask show the "couldn't load" empty state pointing back to Today, never stale data from the previous place. Test in Task 6.
4. **A plan re-fetched in a new hour, or after "Edit household"**, keeps today's ticks (ids unchanged) but a new local day or a different place starts empty. Test in Task 8.
5. **The celebration with an empty or one-item routine**: no progress bar and no celebration when the routine is empty; ticking the only step celebrates once; re-rendering an already-complete list does not re-announce. Test in Task 8.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `web/src/assets/fonts/nunito-latin-wght-normal.woff2`, `OFL.txt` | create | the self-hosted font and its licence |
| `web/src/styles/fonts.css` | create | `@font-face` for Nunito |
| `web/src/styles/tokens.css` | modify | Sky Pals palette, font stack, radii, shadows; band tokens removed |
| `web/src/styles/base.css` | modify | sky background on `body`, bottom padding for the phone tab bar |
| `web/src/styles/shell.css` | create | header, place pill, tab bar, screens, Today hero, highlights, empty states, Puff layout |
| `web/src/styles/components.css` | modify | existing components restyled (radii, pills, colours); `.hero` band rules removed |
| `web/src/styles/motion.css` | create | every decorative animation, inside one no-preference block |
| `web/src/router.ts` | create | hash → screen, `aria-current`, title, focus |
| `web/src/components/mascot.ts` | create | Puff SVG per mood, bubble copy |
| `web/src/components/emptyState.ts` | create | Puff + message for screens without data |
| `web/src/components/highlights.ts` | create | Today's three link cards |
| `web/src/components/planView.ts` | modify | routine checkboxes, progress, celebration |
| `web/src/components/askPanel.ts` | modify | chat bubbles |
| `web/src/components/aqiCard.ts` | modify | scale and facts inside a "More details" disclosure |
| `web/src/store.ts` | modify | `loadDone` / `saveDone` |
| `web/src/icons.ts` | modify | `today`, `chart`, `plan`, `chat` icons |
| `web/src/main.ts` | modify | router, stages, Puff, highlights, place pill, checklist wiring |
| `web/index.html` | modify | the app shell |
| `tests/web/…` | create/modify | as listed per task |
| `README.md` | modify | UI, font credit, accessibility numbers |

---

### Task 1: Palette, font and shapes

**Files:**
- Create: `web/src/assets/fonts/nunito-latin-wght-normal.woff2`, `web/src/assets/fonts/OFL.txt`, `web/src/styles/fonts.css`
- Modify: `web/src/styles/tokens.css`, `web/src/styles/base.css`, `web/src/main.ts` (import `fonts.css` first)
- Test: `tests/web/styles.test.ts`

**Interfaces:**
- Produces: CSS custom properties later tasks use: `--sky-top #8fd8ff`, `--sky-mid #bfeaff`, `--color-bg #fff6e3` (cream), `--color-surface #ffffff`, `--color-text #1b2a33`, `--color-text-muted #4f5d68`, `--color-accent #0e7490`, `--color-focus #0e7490`, `--color-sun #ffd166`, `--tile-sky #e0f2fe`, `--tile-mint #dcfce7`, `--tile-butter #fef3c7`, `--tile-peach #ffe4d6`, `--tile-lilac #ede9fe`, `--radius-card 20px`, `--radius-lg 24px`, `--radius-md 18px`, shadows tinted `rgb(14 116 144 / …)`, `--font-sans: 'Nunito', system-ui, …`. All `--band-*` tokens removed.

- [ ] **Step 1: Fetch the font.** In the scratchpad: `npm pack @fontsource-variable/nunito`, extract, copy `package/files/nunito-latin-wght-normal.woff2` and `package/LICENSE` (as `OFL.txt`) into `web/src/assets/fonts/`. No dependency is added to `package.json`.

- [ ] **Step 2: Write the failing test** `tests/web/styles.test.ts` (imports CSS with `?raw`):

```ts
import tokens from '../../web/src/styles/tokens.css?raw';
import fonts from '../../web/src/styles/fonts.css?raw';
it('uses the Sky Pals palette', () => {
  for (const v of ['#8fd8ff', '#bfeaff', '#fff6e3', '#1b2a33', '#4f5d68', '#0e7490', '#ffd166',
                   '#e0f2fe', '#dcfce7', '#fef3c7', '#ffe4d6', '#ede9fe'])
    expect(tokens.toLowerCase()).toContain(v);
  expect(tokens).not.toMatch(/--band-/);
});
it('self-hosts Nunito with swap and a Latin range', () => {
  expect(fonts).toMatch(/font-family:\s*'Nunito'/);
  expect(fonts).toMatch(/font-display:\s*swap/);
  expect(fonts).toMatch(/url\('\.\.\/assets\/fonts\/nunito-latin-wght-normal\.woff2'\)/);
  expect(fonts).toMatch(/unicode-range:/);
  expect(fonts).not.toMatch(/https?:/);
});
it('puts Nunito first in the font stack', () => {
  expect(tokens).toMatch(/--font-sans:\s*'Nunito',/);
});
```

- [ ] **Step 3: Run** `npx vitest run tests/web/styles.test.ts`. Expected: FAIL (no fonts.css, old palette).

- [ ] **Step 4: Implement.** `fonts.css`: one `@font-face` (`font-weight: 200 1000`, `font-style: normal`, `format('woff2')`, the Latin `unicode-range` copied from the package's `latin-wght.css` or `index.css`). Rewrite `tokens.css` with the values above. Update the header comment's contrast notes (text 9.4:1 on `#8fd8ff`, muted ≥ 5.3:1, teal 5.4:1 under white text). `base.css`: `body` background `linear-gradient(180deg, var(--sky-top) 0, var(--sky-mid) 18rem, var(--color-bg) 36rem) no-repeat, var(--color-bg)`. In `components.css`, delete the `.site-header, .hero` band block and `.hero …` rules, and point anything that used `--band-*` at the new tokens. Import `./styles/fonts.css` before `tokens.css` in `main.ts`.

- [ ] **Step 5: Run** `npx vitest run tests/web/styles.test.ts && npm run lint && npm run typecheck`. Expected: PASS, 0 errors.

- [ ] **Step 6: Commit** `feat(web): Sky Pals palette and self-hosted Nunito`.

---

### Task 2: Router

**Files:**
- Create: `web/src/router.ts`
- Test: `tests/web/router.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Route = 'today' | 'forecast' | 'plan' | 'ask' | 'about';
  export const ROUTES: readonly Route[];           // in that order
  export const SCREEN_TITLE: Record<Route, string>; // Today, Forecast, My plan, Ask, How it works
  export function parseRoute(hash: string): Route;  // '#/plan' → 'plan'; '', '#', '#/x', '#plan' → 'today'
  export interface Router { current(): Route; refresh(): void; stop(): void; }
  export function startRouter(opts: { placeName: () => string | null }): Router;
  ```
- DOM contract: each screen is `#screen-<route>` with class `screen`; its first `h1` has `tabindex="-1"`; nav links carry `data-route="<route>"`.

- [ ] **Step 1: Write the failing tests** (build a minimal shell with `h()` in `beforeEach`; set `location.hash` and dispatch `new HashChangeEvent('hashchange')`):
  - `parseRoute` table: `''`, `'#'`, `'#/'`, `'#/nope'`, `'#forecast'` → `'today'`; each `#/<route>` → that route.
  - `startRouter` with an empty hash shows `#screen-today` only (`hidden` false on it, true on the other four), sets `aria-current="page"` on every `[data-route="today"]` link and removes it from the others, and **does not** move focus (`document.activeElement` stays `body`).
  - after `location.hash = '#/forecast'` + hashchange: `#screen-forecast` visible, others hidden, focus is its `h1`, `document.title === 'Forecast · São Paulo — Clearday'` when `placeName` returns `'São Paulo'`, and `'Forecast — Clearday'` when it returns `null`.
  - `refresh()` re-applies the title after `placeName` changes, without moving focus.
  - Back: setting the hash back to `#/today` + hashchange shows Today again.
  - `stop()` removes the listener (a later hashchange changes nothing).

- [ ] **Step 2: Run** `npx vitest run tests/web/router.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement `startRouter`** in `web/src/router.ts`: `apply(route, moveFocus)` toggles `hidden` on `#screen-*`, sets or removes `aria-current` on `[data-route]`, sets the title, and if `moveFocus` focuses `#screen-<route> h1` with `{ preventScroll: true }` then `scrollTo(0, 0)`. Call `apply(parseRoute(location.hash), false)` once, then `apply(…, true)` from the `hashchange` listener.

- [ ] **Step 4: Run** the tests. Expected: PASS.

- [ ] **Step 5: Commit** `feat(web): hash router for app screens`.

---

### Task 3: Puff, the mascot

**Files:**
- Create: `web/src/components/mascot.ts`
- Modify: `web/src/format.ts` only if a helper is missing (none expected)
- Test: `tests/web/components/mascot.test.ts`

**Interfaces:**
- Consumes: `AirReport`, `AqiCategory` from `shared/types.ts`; `formatLocalTime` from `format.ts`; `h()` from `dom.ts`.
- Produces:
  ```ts
  export type Mood = AqiCategory | 'none' | 'wave' | 'cheer';
  export function moodFor(report: AirReport): Mood;          // report.now?.category ?? 'none'
  export function puffLine(report: AirReport): { text: string; emoji: string };
  export function puff(mood: Mood, size?: 'lg' | 'sm'): SVGSVGElement;   // default 'lg'
  export function puffSays(mood: Mood, line: { text: string; emoji: string }, size?: 'lg' | 'sm'): HTMLElement;
  export const WELCOME_LINE: { text: string; emoji: string };
  ```
- SVG contract (tests and CSS rely on these): root `<svg class="puff puff--lg|sm" data-mood="…" aria-hidden="true" focusable="false" viewBox="0 0 120 100">`; parts by class: `puff__body`, `puff__eye` (×2, plus `puff__eye--sleepy` for `none`), `puff__cheek` (×2), `puff__mouth` (grin for good/cheer, smile otherwise; absent when the mask is on), `puff__mask` with `data-pos="chin"` (usg) or `"on"` (unhealthy, very_unhealthy, hazardous), `puff__house` (very_unhealthy, hazardous), `puff__brow` (×2, hazardous only), `puff__sparkle` (good, cheer), `puff__z` (none), `puff__arm` (wave, cheer).
- `puffSays` returns `<div class="puff-says">` holding the SVG and `<p class="puff-says__bubble">text <span aria-hidden="true">emoji</span></p>`.

**Bubble copy (exact).** `{time}` is `formatLocalTime(best.start)`, prefixed `tomorrow at ` when `best.start.slice(0, 10) !== report.now.time.slice(0, 10)`, else `at `. The cleaner-window variant is used only when a `kind: 'best'` window exists **and** `best.meanAqi < report.now.aqi`.

| Mood | Plain | With a cleaner window | Emoji |
|---|---|---|---|
| good | Lovely air today! A great day to walk or cycle. | (same) | 🚲 |
| moderate | Pretty good air today. Most people can enjoy being outside. | Pretty good air today, and it's cleanest {time}. | ☀️ |
| usg | Okay for most people, but go easy if anyone at home is sensitive. | Okay for most people, but go easy if anyone at home is sensitive. Cleanest {time}. | 🙂 |
| unhealthy | Rough air today, so keep outdoor effort light. | Rough air today, but I found you a cleaner spell {time}. | 💪 |
| very_unhealthy | Very unhealthy air. It's an indoors day: windows shut, purifier on. | (same) | 🏠 |
| hazardous | Hazardous air. Please stay indoors and keep windows closed. | (same) | 🏠 |
| none | I can't get a reading for this hour. Check back soon. | (same) | 💤 |
| welcome | Hi, I'm Puff! Tell me where you are and I'll check the air for you. | — | 👋 |

- [ ] **Step 1: Write the failing tests:**
  - `moodFor` returns the category, and `'none'` when `now` is null.
  - `puff(m)` for each of the 9 moods: root has `aria-hidden="true"`, `focusable="false"`, `data-mood=m`, two `.puff__eye`.
  - good: has `.puff__sparkle` and a `.puff__mouth`, no `.puff__mask`. usg: `.puff__mask[data-pos="chin"]` **and** `.puff__mouth`. unhealthy: `.puff__mask[data-pos="on"]`, no `.puff__mouth`, no `.puff__house`. very_unhealthy: mask on and `.puff__house`. hazardous: mask on, house and two `.puff__brow`. none: `.puff__eye--sleepy` and `.puff__z`. wave: `.puff__arm`. cheer: `.puff__arm` and `.puff__sparkle`.
  - Honesty: no mood from `unhealthy` up has `.puff__sparkle` or a grin (`.puff__mouth[data-shape="grin"]`).
  - `puffLine` for each category with `windows: []` returns the plain text above exactly.
  - unhealthy with `best { start: '2026-11-20T16:00', meanAqi: 90 }` and now at `2026-11-20T14:00` AQI 162 → `'Rough air today, but I found you a cleaner spell at 16:00.'`; with start `2026-11-21T07:00` → `'… spell tomorrow at 07:00.'`; with `meanAqi: 170` (not cleaner) → the plain line.
  - hazardous with a cleaner window still returns the plain line (never invites going out).
  - `puffSays` puts the emoji in an `aria-hidden` span and the text as real text.

- [ ] **Step 2: Run** `npx vitest run tests/web/components/mascot.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** `mascot.ts`: one `svg(tag, attrs)` helper with `createElementNS`; the cloud body is a single path; each part is a small function added by mood, as in the contract. Copy table as a `const` record. No `innerHTML`, no `style`.

- [ ] **Step 4: Run** the tests. Expected: PASS.

- [ ] **Step 5: Commit** `feat(web): Puff mascot with honest moods`.

---

### Task 4: Empty states and Today highlights

**Files:**
- Create: `web/src/components/emptyState.ts`, `web/src/components/highlights.ts`
- Modify: `web/src/icons.ts` (add `today`, `chart`, `plan`, `chat` 24×24 stroke paths)
- Test: `tests/web/components/emptyState.test.ts`, `tests/web/components/highlights.test.ts`

**Interfaces:**
- Consumes: `puff`, `puffSays` (Task 3); `formatLocalTime`; `h`.
- Produces:
  ```ts
  // emptyState.ts
  export type Stage = 'no-place' | 'loading' | 'failed';
  export function renderEmptyState(el: HTMLElement, stage: Stage): void;
  // highlights.ts
  export type PlanState = Plan | 'loading' | 'unavailable';
  export function renderHighlights(el: HTMLElement, report: AirReport, plan: PlanState): void;
  ```

Puff's extra poses for loading ("bobbing faster") and errors ("oops") are on the spec's cut list; this plan uses `wave` and `none` instead.

**Empty-state copy (exact):** no-place: title "Pick a place first", text "Choose a city on Today and I'll fill this in.", link "Go to Today" (`href="#/today"`, class `btn btn--primary`). loading: "Checking the air…", "This only takes a moment.", no link. failed: "We couldn't load the air", "Head back to Today to try again.", link "Go to Today". Puff mood: `wave` for no-place and loading, `none` for failed. Title is a `<p class="screen-empty__title">` (the screen's `h1` is the heading).

**Highlight cards** (`<h2 class="visually-hidden">Today at a glance</h2>` then `<ul class="highlights">`, each `<li><a class="highlight highlight--<kind>" href>` with an `aria-hidden` emoji tile, `<span class="highlight__label">`, `<span class="highlight__value">`):
1. `cleanest` → `#/forecast`: label "Cleanest air", value `HH:MM–HH:MM` from the best window (`formatLocalTime` of `start` and `end`), prefixed "Tomorrow " when `report.now` exists and `start.slice(0, 10) !== report.now.time.slice(0, 10)`, plus `<span class="highlight__note">average AQI {Math.round(meanAqi)}</span>`. Omitted when there is no best window. Tile sky, 🌤️.
2. `plan` → `#/plan`: label "Today's plan". `'loading'` → skeleton bar and `aria-busy="true"` on the `<a>`; `'unavailable'` → value "Open your plan"; a Plan → value `"{n} steps for today"` (`"1 step for today"`, `"No steps today"` for 0) from `plan.routine.length`; plus a note with `item.impact.display` of the `sustainable` item whose `actionId === 'switch-commute'`, when it has an impact. Tile mint, ✅.
3. `indoor` → `#/plan`: label "Indoor tip", value `plan.indoor[0].title`, note `plan.indoor[0].impact?.display`. Omitted unless the plan is loaded and has an indoor item. Tile peach, 🏠.

- [ ] **Step 1: Write the failing tests:**
  - empty state: for each stage, the exact title and text; the link present only for no-place and failed, with `href="#/today"`; an `svg.puff` with the right `data-mood`; calling twice replaces the content.
  - highlights with `makeReport({ windows: [{ kind: 'best', start: '2026-11-20T16:00', end: '2026-11-20T18:00', meanAqi: 88.4 }] })` and `makePlan()`: three links with hrefs `#/forecast`, `#/plan`, `#/plan`; text `16:00–18:00` and `average AQI 88`; `3 steps for today`; indoor value equals `makePlan().indoor[0].title` and the note `−79% indoor PM2.5`.
  - a plan whose `sustainable` holds `makeItem({ actionId: 'switch-commute', section: 'sustainable', impact: makeImpact({ display: '≈480 kg CO₂e/yr saved', unit: 'kg CO₂e/yr', value: 480 }) })` shows `≈480 kg CO₂e/yr saved` in the plan card; without it no `kg` text appears anywhere.
  - no best window → no `.highlight--cleanest`; `indoor: []` → no `.highlight--indoor`; `routine` of length 1 → `1 step for today`.
  - `'loading'` → `.highlight--plan[aria-busy="true"]` and no indoor card; `'unavailable'` → `Open your plan`.
  - Numbers-from-code check: every digit sequence in the rendered text appears in the inputs' `JSON.stringify` (window times, rounded mean, routine length, impact display).

- [ ] **Step 2: Run** both test files. Expected: FAIL.

- [ ] **Step 3: Implement** both modules as specified.

- [ ] **Step 4: Run** the tests. Expected: PASS.

- [ ] **Step 5: Commit** `feat(web): empty states and Today highlight cards`.

---

### Task 5: Restyle the AQI card with a "More details" disclosure

**Files:**
- Modify: `web/src/components/aqiCard.ts`, `tests/web/components/aqiCard.test.ts`

**Interfaces:**
- Produces: unchanged signatures. `reading()` keeps `.aqi-card__reading` (styled as the big round AQI bubble in Task 6's CSS); the scale and `.aqi-card__facts` move into `<details class="aqi-card__more"><summary>More details</summary>…</details>`. The source line stays outside the disclosure.

- [ ] **Step 1: Add failing tests:** with a reading, `.aqi-card__more` exists, is closed (`open` false), contains `.aqi-scale` and the "Main pollutant" fact, and its summary text is `More details`; `.aqi-card__source` is **not** inside it; with no reading there is no `.aqi-card__more`.
- [ ] **Step 2: Run** `npx vitest run tests/web/components/aqiCard.test.ts`. Expected: the new tests FAIL, the old ones pass.
- [ ] **Step 3: Implement** the change in `reading()`.
- [ ] **Step 4: Run** the tests. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(web): fold AQI scale and facts into More details`.

---

### Task 6: The app shell

**Files:**
- Modify: `web/index.html`, `web/src/main.ts`, `web/src/styles/components.css`, `web/src/styles/base.css`
- Create: `web/src/styles/shell.css`
- Test: `tests/web/indexHtml.test.ts`, `tests/web/main.test.ts`, `tests/web/a11y.test.ts`

**Interfaces:**
- Consumes: `startRouter`, `Router`, `Route` (Task 2); `puffSays`, `moodFor`, `puffLine`, `WELCOME_LINE` (Task 3); `renderEmptyState`, `Stage`, `renderHighlights`, `PlanState` (Task 4).
- Produces (for Tasks 8 and 9): the ids below, and in `main.ts` the module-level `currentPlace: Place | null` and `function drawToday(plan: PlanState): void`.

**Shell (`index.html`, in order):** skip link → `header.site-header` (brand link `href="#/today"`; `<button id="place-pill" class="place-pill" type="button" hidden aria-controls="search-panel" aria-expanded="false">` holding a pin icon, `<span class="visually-hidden">Change place: </span>` and `<span id="place-pill-name"></span>`; `<a class="header-link" href="#/about" data-route="about">` with info icon + "How it works") → `<nav class="tabbar" aria-label="Main"><ul>` four `<li><a class="tabbar__link" href="#/<route>" data-route="<route>">` (inline SVG `aria-hidden` + label: Today, Forecast, My plan, Ask) → `<main id="main" tabindex="-1">` with:

| Screen | Contents (ids) |
|---|---|
| `#screen-today` | `h1#today-title` "How’s the air today?" (`tabindex=-1`); `#today-puff`; `p#today-lede` (current lede); `#search-panel` > `#location-search`; `<button id="change-place" type="button" class="btn btn--secondary btn--small" hidden aria-controls="search-panel" aria-expanded="false">Change place</button>`; `<noscript>`; `section#now[aria-labelledby=now-title][hidden]` > `h2#now-title` "Air right now" (`tabindex=-1`) + `#now-body`; `div#highlights[hidden]` (its visually hidden `h2` from Task 4 names it) |
| `#screen-forecast` | `h1#forecast-title` "Next 48 hours"; `section#forecast[aria-labelledby=forecast-title][hidden]` > `#forecast-body`; `#forecast-empty.screen-empty` |
| `#screen-plan` | `.screen__head` > `h1#plan-title` "Your plan for today" + `button#edit-profile`; `section#plan[aria-labelledby=plan-title][hidden]` > `#plan-body`; `#plan-empty.screen-empty` |
| `#screen-ask` | `h1#ask-title` "Ask about today’s air"; `section#ask[aria-labelledby=ask-title][hidden]` > `#ask-body`; `#ask-empty.screen-empty` |
| `#screen-about` | `h1#method-title` "How it works"; `section#method[aria-labelledby=method-title]` > `#method-body.prose` (current text) |

Every screen is `<div class="screen" id="screen-…">`, all but Today with `hidden`; every `h1` has `tabindex="-1"`. `#status` stays the only live region. The footer keeps its credits and gains a "How it works" link (`href="#/about"`, `data-route="about"`).

**`main.ts` behaviour:**
- `boot` starts the router with `placeName: () => currentPlace?.name ?? null`, mounts Puff `WELCOME_LINE` / `'wave'` in `#today-puff`, and calls `setStage('no-place')` when no place is saved.
- `setStage(stage: Stage | 'ready')`: for `forecast`, `plan`, `ask`: when `'ready'` hide `#<id>-empty`, otherwise show it and `renderEmptyState(…, stage)`. Called with `'loading'` at the start of `showPlace`, `'failed'` in its `fail`, `'ready'` once the air is drawn.
- `showPlace` sets `currentPlace`, shows `#now`, fills `#place-pill-name`, unhides the pill and `#change-place`, collapses `#search-panel` (and sets both `aria-expanded="false"`), calls `router.refresh()` (replaces the old `document.title = …` line), and after the air: Puff `moodFor(report)` / `puffLine(report)` in `#today-puff`, `drawToday('loading')`, then `drawToday(plan)` on plan success, `drawToday('unavailable')` on plan failure.
- `openSearch()`: used by both buttons: sets `location.hash = '#/today'` if not already, unhides `#search-panel`, sets `aria-expanded="true"` on both, focuses `#location-search input`. After a pick from an opened panel, the panel collapses and focus moves to `#now-title`.
- `resetDependents` also hides `#highlights`.

**CSS (`shell.css`, imported after `components.css`):** the tab bar is fixed to the bottom on phones (`inset-inline: var(--space-3)`, `bottom: max(var(--space-3), env(safe-area-inset-bottom))`, white, pill radius, `--shadow-lg`, links ≥ 44 px with the icon above the label, `[aria-current=page]` link in teal with a `--tile-sky` pill) and `body` gets matching bottom padding. From `48rem` it becomes `position: static`, a centred row of pill links under the header, and body padding resets. `.screen` max-width `--measure`, centred. Today: Puff centred above the lede on phones, beside it from `48rem`; `.aqi-card__reading` as a white circle (`border-radius: 50%`, ≥ 11rem, the category colour as a 6 px ring via `--aqi-color`, the number in `--text-display`); `.highlights` a 1-column grid, 3 columns from `48rem`; each `.highlight` a white `--radius-card` card with a 3rem pastel tile. `.screen-empty`: centred, Puff `sm`. `.place-pill`: white pill, teal text, `--target-min`.

- [ ] **Step 1: Update `tests/web/indexHtml.test.ts`:** replace the sections and "one h1" tests with: one `header`, one `main`, one `footer`, one `nav[aria-label="Main"]`; five `.screen` with the ids above, all but `#screen-today` `hidden`; each screen has exactly one `h1` with `tabindex="-1"`; nav links `#/today`, `#/forecast`, `#/plan`, `#/ask` each with `data-route` and visible text; `#forecast`, `#plan`, `#ask`, `#now` are `section`s labelled by an existing heading; `#place-pill` and `#change-place` have `aria-controls="search-panel"`. Keep the skip-link, live-region, noscript, footer and CSP tests.
- [ ] **Step 2: Update `tests/web/main.test.ts`:**
  - first test: no place → `#forecast-empty`, `#plan-empty`, `#ask-empty` each show "Pick a place first", `#today-puff svg[data-mood="wave"]` exists, `#now` hidden, the combobox present.
  - title test → `document.title === 'Today · São Paulo — Clearday'`.
  - new: after the air loads, `#today-puff svg[data-mood="unhealthy"]` and the bubble shows the line for `makeReport()`; `#highlights` visible with three links once the plan resolves; while the plan is pending, `.highlight--plan[aria-busy="true"]`.
  - new (Review Focus 1): `location.hash = '#/plan'` before `boot` with no saved place → `#screen-plan` visible and `#plan-empty` contains "Pick a place first".
  - new (Review Focus 2): with a place loaded and the hash at `#/forecast`, clicking `#place-pill` → hash `#/today`, `#search-panel` not hidden, both buttons `aria-expanded="true"`, focus on the search input; picking a result → panel hidden and `document.activeElement` is `#now-title`.
  - new (Review Focus 3): air failure after a pick → `#forecast-empty` and `#plan-empty` show "We couldn't load the air".
  - every test that asserted `section('forecast'|'plan'|'ask').hidden` keeps its assertion (the ids are unchanged).
  - reset `location.hash = ''` in `afterEach`.
- [ ] **Step 3: Update `tests/web/a11y.test.ts`:** add a helper `visit(route)` that sets the hash and dispatches `hashchange`; run axe on every screen with no place (`today`, `forecast`, `plan`, `ask`, `about`) and with a place loaded (same five), plus the existing dialog, impact panel and Q&A cases.
- [ ] **Step 4: Run** `npx vitest run tests/web`. Expected: the updated tests FAIL.
- [ ] **Step 5: Implement** `index.html`, the `main.ts` changes and `shell.css`; restyle components in `components.css` with the new tokens (cards `--radius-card`, buttons and chips pills, `.btn--primary` teal with white text, `.btn--sun` sunny with dark text for "Use my location").
- [ ] **Step 6: Run** `npx vitest run tests/web && npm run lint && npm run typecheck`. Expected: PASS, 0 errors.
- [ ] **Step 7: Check in the browser:** `npm run build && npm start`, open `http://localhost:8080` in the preview at 375 px and desktop width, visit every screen with and without a place. No horizontal scroll, the tab bar never covers content, focus is visible on every link.
- [ ] **Step 8: Commit** `feat(web): app shell with screens, tab bar and Today`.

---

### Task 7: Motion

**Files:**
- Create: `web/src/styles/motion.css` (imported last in `main.ts`)
- Test: `tests/web/motion.test.ts`

**Interfaces:**
- Consumes: classes from Tasks 3–6 (`.screen`, `.puff`, `.puff__eye`, `.highlight`, `.aqi-number`).
- Produces: keyframes `screen-in`, `puff-float`, `puff-blink`, `pop-in`; Task 8 adds `confetti-fall` and `puff-cheer` to this file; Task 10 adds `squish`, `bar-grow`.

**Contents (all inside one `@media (prefers-reduced-motion: no-preference) { … }`):** `.screen:not([hidden]) { animation: screen-in 200ms var(--ease) }` (opacity 0 → 1, `translateY(12px)` → 0; it replays each time `hidden` is removed); `.puff { animation: puff-float 3.2s ease-in-out infinite }` (±4 px); `.puff__eye { transform-box: fill-box; transform-origin: center; animation: puff-blink 4s infinite }` (scaleY 0.1 for the 4 % around 96 %: one blink per 4 s); `.highlight, .aqi-card { animation: pop-in 260ms var(--ease) both }` (scale 0.96 → 1, opacity); `.aqi-number { animation: pop-in 320ms var(--ease) both }`.

- [ ] **Step 1: Write the failing test** `tests/web/motion.test.ts` with `?raw` imports:
  - `motion.css`, after stripping comments, starts with `@media (prefers-reduced-motion: no-preference) {` and ends with its matching `}` (count braces), so no rule sits outside the block.
  - `shell.css` and `components.css` contain no `@keyframes` and no `animation:` outside a `prefers-reduced-motion: no-preference` block, except the existing `spin` and `shimmer` (loading feedback, cut to 0.01 ms by `base.css`).
  - `base.css` still has the `prefers-reduced-motion: reduce` block with `animation-duration: 0.01ms !important`, `animation-iteration-count: 1 !important` and `transition-duration: 0.01ms !important`.
  - the blink keyframes close the eyes for at most 8 % of 4 s (≤ 1 flash per second, well under 3/s): assert the `puff-blink` block's closed-eye stops are within `92%`–`100%`.
- [ ] **Step 2: Run** `npx vitest run tests/web/motion.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `motion.css`; move the existing `reveal` and `rise` keyframes from `components.css` into it.
- [ ] **Step 4: Run** the tests and `npx vitest run tests/web`. Expected: PASS.
- [ ] **Step 5: Check in the browser** that screens fade in and Puff floats and blinks, and that with the preview's reduced-motion emulation (`prefers-reduced-motion: reduce` through DevTools, or the OS setting) nothing moves.
- [ ] **Step 6: Commit** `feat(web): screen transitions and Puff's float and blink`.

---

### Task 8: Routine checklist and celebration

**Files:**
- Modify: `web/src/store.ts`, `web/src/components/planView.ts`, `web/src/main.ts`, `web/src/styles/shell.css`, `web/src/styles/motion.css`
- Test: `tests/web/store.test.ts`, `tests/web/components/planView.test.ts`, `tests/web/main.test.ts`

**Interfaces:**
- Consumes: `puff('cheer', 'sm')` (Task 3); `announce` (`dom.ts`).
- Produces:
  ```ts
  // store.ts — one entry only ('clearday.done.v1' → { key: string; ids: string[] }), so storage never grows
  export function doneKey(place: Place, now?: Date): string; // `${lat},${lon}|YYYY-MM-DD`, browser local date
  export function loadDone(key: string): Set<string>;        // empty when the stored key differs or data is bad
  export function saveDone(key: string, ids: ReadonlySet<string>): void;
  // planView.ts
  export interface Checklist { done: ReadonlySet<string>; onChange(done: ReadonlySet<string>): void; }
  export interface PlanViewOptions { hasReading?: boolean; checklist?: Checklist; }
  export const ALL_DONE = 'All done for today, nice work!';
  ```

**Behaviour:** only `routine` items get a checkbox: inside the timeline card, `<input type="checkbox" class="done__box" id="done-<actionId>">` + `<label for=…>Done<span class="visually-hidden">: <item title></span></label>`, ticked from `checklist.done`. Ids in `done` that are not in today's routine are ignored for the count. Above the timeline, when the routine is non-empty: `<p class="routine-progress" id="routine-progress">{k} of {n} done</p>` and `<progress max="{n}" value="{k}" aria-labelledby="routine-progress">`. On change: update both, add `data-done` on the card, call `onChange` with the new set; when the count reaches `n` from below `n`, show `<div class="celebration">` (Puff cheer + 12 `span.confetti__piece` inside `div.confetti[aria-hidden="true"]` + `<p>` with `ALL_DONE`) and `announce(ALL_DONE)` once. Rendering an already-complete list shows the celebration without announcing. Unticking hides it. `.confetti` is `display: none` in `shell.css` and shown, with `confetti-fall` (≤ 1.2 s, runs once), only in `motion.css`. Without `checklist`, `renderPlan` renders no checkboxes (existing tests unchanged).

`main.ts` builds the checklist in `requestPlan` from `doneKey(place)` / `loadDone` / `saveDone`.

- [ ] **Step 1: Write failing store tests:** `doneKey(PLACE, new Date(2026, 10, 21, 23, 30))` is `'-23.5475,-46.63611|2026-11-21'`; save then load with the same key returns the ids; loading with the next day's key or another place's key returns an empty set; a corrupt stored value (`'{'`, `{ key: 1 }`, `{ key: 'k', ids: [1] }`) returns an empty set; saving a second key replaces the first (only one entry in `localStorage` under `clearday.done.v1`).
- [ ] **Step 2: Write failing planView tests:** with a checklist of `new Set(['exercise-indoors'])` and `makePlan()` (3 routine items): three checkboxes only in `#plan-section-routine`'s section, none in indoor or sustainable; the `exercise-indoors` box is ticked; progress `1 of 3 done` and `progress.value === 1`; each label's text is `Done: <title>`; ticking the other two calls `onChange` with all three ids, shows `.celebration` with `ALL_DONE`, and the `#status` text is `ALL_DONE` exactly once (spy on the region's `replaceChildren` or count announcements); unticking one hides `.celebration`; rendering with all three already done shows `.celebration` and leaves `#status` empty; `routine: []` → no progress, no checkbox; a one-item routine celebrates on its single tick; a stale id in `done` not in the routine does not count.
- [ ] **Step 3: Write failing main test (Review Focus 4):** tick a box, then trigger a re-plan via "Edit household" save → the box is still ticked; with `vi.setSystemTime` moved to the next local day and boot again → no box ticked.
- [ ] **Step 4: Run** the three test files. Expected: the new tests FAIL.
- [ ] **Step 5: Implement** store, planView, main wiring, CSS (checkbox ≥ 24 px inside a ≥ 44 px label target, teal tick, done card tinted `--tile-mint`, confetti pieces in the five tile colours plus sun).
- [ ] **Step 6: Run** `npx vitest run tests/web`. Expected: PASS.
- [ ] **Step 7: Commit** `feat(web): routine checklist with a small celebration`.

---

### Task 9: Chat-style Ask

**Files:**
- Modify: `web/src/components/askPanel.ts`, `web/src/styles/shell.css`, `tests/web/components/askPanel.test.ts`

**Interfaces:**
- Consumes: `puff('moderate', 'sm')` as the avatar (Task 3).
- Produces: unchanged `mountAskPanel` signature and `AskPanel`. New DOM: `<div class="chat">` placed **above** the form, holding `<div class="chat__msg chat__msg--user" hidden><p class="chat__text"></p></div>` (not live) and `<div class="chat__msg chat__msg--bot">` with the avatar (`aria-hidden`) and the existing `.ask__answer` live region. While busy, the bot bubble shows `<span class="chat__typing" aria-hidden="true">` with three dots. `reset()` also hides and clears the user bubble.

- [ ] **Step 1: Add failing tests:** after a submit, `.chat__msg--user` is visible and its text is the trimmed question; the answer paragraphs are inside `.chat__msg--bot .ask__answer`; while busy `.chat__typing` exists and is `aria-hidden`; the user bubble is outside every `[aria-live]` element; `reset()` hides the user bubble and empties it. The existing tests stay as they are.
- [ ] **Step 2: Run** `npx vitest run tests/web/components/askPanel.test.ts`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** and style (user bubble teal with white text, right-aligned; bot bubble white, left with the avatar; suggestion buttons as sky pills; three-dot typing in `motion.css` only).
- [ ] **Step 4: Run** `npx vitest run tests/web`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): chat-style Ask`.

---

### Task 10: Polish (cut first, in this order if time runs short)

**Files:**
- Modify: `web/src/styles/motion.css`, `web/src/styles/shell.css`, `web/src/main.ts`
- Test: `tests/web/motion.test.ts`, `tests/web/main.test.ts`

Each step below is independent; stop wherever the time budget ends. Cut order (first cut first): 1 squish, 2 stagger, 3 bars growing, 4 sky tint.

- [ ] **Step 1: Sky tint** — `main.ts` sets `document.body.dataset.sky = moodFor(report)` after the air loads and deletes it on `resetDependents`; `shell.css` maps `[data-sky]` to the gradient tops in the spec's table (good/moderate clear and soft blue, usg pale blue → cream, unhealthy/very_unhealthy/hazardous hazy, dusky and deep peach, none neutral blue), each checked for ≥ 4.5:1 under `--color-text`. Test in `main.test.ts`: `document.body.dataset.sky === 'unhealthy'` after boot with `makeReport()`.
- [ ] **Step 2: Chart bars grow** — in `motion.css`: `.chart__bar { transform-box: fill-box; transform-origin: bottom; animation: bar-grow 500ms var(--ease) both }`.
- [ ] **Step 3: Card stagger** — `.highlights > li:nth-child(2) .highlight { animation-delay: 60ms }`, `:nth-child(3)` 120 ms.
- [ ] **Step 4: Button squish** — `.btn:active, .highlight:active, .tabbar__link:active { animation: squish 160ms var(--ease) }`.
- [ ] **Step 5: Run** `npx vitest run tests/web` (the motion test still passes: everything is inside the block). Expected: PASS.
- [ ] **Step 6: Commit** `feat(web): sky tint and motion polish`.

---

### Task 11: Verify, document, commit

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run every gate:** `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run build`. Expected: 0 lint errors, 0 type errors, every test passes, statements ≥ 96.59 %, branches ≥ 90.2 %, build OK; report the JS gzip size from Vite's output (must be < 30 kB) and the woff2 size.
- [ ] **Step 2: Live check** with `npm start` in the preview pane at 320 px, 375 px and desktop: on every screen, with and without a place, run axe-core from the page (`node_modules/axe-core/axe.min.js` loaded through the preview's JS tool) with `color-contrast` and `target-size` enabled; expect 0 violations. Confirm no horizontal scroll and that the tab bar never hides content.
- [ ] **Step 3: Update `README.md`:** a "What it looks like" paragraph (screens, Puff, checklist); Nunito credit (SIL OFL 1.1, self-hosted); the accessibility section's live-check numbers from Step 2; the bundle sizes from Step 1.
- [ ] **Step 4: Commit** `docs: README for the Sky Pals redesign`. **Do not push**: ask the owner first.
