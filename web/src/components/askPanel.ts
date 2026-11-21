import type { AskRequest, Place, Profile } from '../../../shared/types.js';
import { ask as realAsk, ApiError } from '../api.js';
import { h } from '../dom.js';
import { puff } from './mascot.js';

export const MAX_QUESTION = 500;
export const DISCLAIMER = 'General guidance, not medical advice.';
/** Free text leaves the browser, so say where it goes right where it is typed. */
export const ASK_PRIVACY =
  "Questions you type are sent to Google Gemini, whose free tier may use them to improve Google products. Don't include personal details.";
export const NO_PLACE = 'Choose a place first.';
export const RATE_LIMITED = "You've asked a lot in a short time — please wait a few minutes.";
export const GENERIC_ERROR = "Sorry, I couldn't answer that just now. Please try again.";
export const STANDARD_ANSWER = "Standard answer — the AI assistant isn't available right now.";
export const GREETING =
  "Hi, I'm Puff! Ask me anything about today’s air and I'll answer from the forecast and your plan.";

const SUGGESTIONS = [
  'When is the best time to go outside today?',
  'How can I keep indoor air cleaner?',
  "What's the greenest way to commute?",
] as const;

export interface AskContext {
  place: Place;
  profile: Profile;
}

export interface AskPanel {
  /** Clears the answer and drops any request still in flight; call when the place changes. */
  reset(): void;
}

let panels = 0;

/** The answer as paragraphs split on blank lines; always text, never markup. */
function paragraphs(answer: string): HTMLElement[] {
  return answer
    .split(/\r?\n[ \t]*\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => h('p', { class: 'ask__paragraph' }, part));
}

const avatar = (): HTMLElement => h('span', { class: 'chat__avatar' }, puff('moderate', 'sm'));
const message = (text: string): HTMLElement => h('p', { class: 'ask__message' }, text);

/**
 * The chat above the form: Puff's greeting, the question as the user's bubble (outside the
 * live region, so only the answer is announced), then Puff's answer bubble, which shows while
 * Puff is thinking or has something to say.
 */
function chatView() {
  const answer = h('div', { class: 'ask__answer', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const userText = h('p', { class: 'chat__text' });
  const userBubble = h('div', { class: 'chat__msg chat__msg--user', hidden: true }, userText);
  const dots = [1, 2, 3].map(() => h('span', { class: 'chat__dot' }));
  const typing = h('span', { class: 'chat__typing', 'aria-hidden': 'true', hidden: true }, ...dots);
  const answerBubble = h(
    'div',
    { class: 'chat__msg chat__msg--bot chat__msg--answer' },
    avatar(),
    h('div', { class: 'chat__bubble' }, typing, answer),
  );
  const intro = h(
    'div',
    { class: 'chat__msg chat__msg--bot chat__msg--intro' },
    avatar(),
    h('p', { class: 'chat__bubble' }, GREETING),
  );
  let thinking = false;
  const sync = (): void => {
    typing.hidden = !thinking;
    answerBubble.toggleAttribute('data-active', thinking || answer.childElementCount > 0);
  };
  return {
    el: h('div', { class: 'chat' }, intro, userBubble, answerBubble),
    /** The user's question in its bubble; empty text hides the bubble. */
    question(text: string): void {
      userText.textContent = text;
      userBubble.hidden = text === '';
    },
    /** Typing dots and aria-busy while waiting; cleared before the answer lands, or some
     * screen readers stay silent. */
    thinking(on: boolean): void {
      thinking = on;
      if (on) answer.setAttribute('aria-busy', 'true');
      else answer.removeAttribute('aria-busy');
      sync();
    },
    answer(...nodes: (HTMLElement | null)[]): void {
      answer.replaceChildren(...nodes.filter((n): n is HTMLElement => n !== null));
      sync();
    },
  };
}

/** The question form: label, privacy note, textarea, counter, Ask button and suggestions. */
function questionForm(id: string, onSuggest: (text: string) => void) {
  const textarea = h('textarea', {
    id: `${id}-question`,
    class: 'input ask__input',
    rows: '3',
    'aria-describedby': `${id}-privacy ${id}-count`,
  });
  const counter = h('p', { class: 'ask__count', id: `${id}-count` });
  const submit = h('button', { type: 'submit', class: 'btn btn--primary ask__submit' }, 'Ask');
  const suggestions = SUGGESTIONS.map((text) =>
    h(
      'button',
      {
        type: 'button',
        class: 'ask__suggestion',
        onclick: () => {
          onSuggest(text);
        },
      },
      text,
    ),
  );
  const form = h(
    'form',
    { class: 'card ask', novalidate: true },
    h('label', { class: 'field-label', for: textarea.id }, "Ask about today's air"),
    h('p', { class: 'ask__privacy', id: `${id}-privacy` }, ASK_PRIVACY),
    textarea,
    h(
      'div',
      { class: 'ask__row' },
      h('p', { class: 'ask__disclaimer' }, DISCLAIMER),
      counter,
      submit,
    ),
    h('div', { class: 'ask__suggestions' }, ...suggestions),
  );
  return { form, textarea, counter, submit };
}

type QuestionForm = ReturnType<typeof questionForm>;

/** Counter and button state. While thinking the button is aria-disabled, not disabled, so
 * keyboard focus stays on it. */
function syncForm(ui: QuestionForm, busy: boolean): void {
  const n = ui.textarea.value.trim().length;
  ui.counter.textContent = `${String(n)}/${String(MAX_QUESTION)}`;
  ui.counter.classList.toggle('ask__count--over', n > MAX_QUESTION);
  ui.submit.disabled = !busy && (n === 0 || n > MAX_QUESTION);
  if (busy) ui.submit.setAttribute('aria-disabled', 'true');
  else ui.submit.removeAttribute('aria-disabled');
  ui.submit.textContent = busy ? 'Thinking…' : 'Ask';
}

const toRequest = ({ place, profile }: AskContext, question: string): AskRequest => ({
  lat: place.lat,
  lon: place.lon,
  ...(place.countryCode ? { countryCode: place.countryCode } : {}),
  profile,
  question,
});

/** The answer's paragraphs, with a note when it is the server's standard text. */
const answerNodes = (out: { answer: string; aiUsed: boolean }): (HTMLElement | null)[] => [
  ...paragraphs(out.answer),
  out.aiUsed ? null : h('p', { class: 'ask__note' }, STANDARD_ANSWER),
];

const errorNode = (err: unknown): HTMLElement =>
  message(err instanceof ApiError && err.code === 'rate_limited' ? RATE_LIMITED : GENERIC_ERROR);

/**
 * A grounded Q&A form. The server answers from today's air and the household plan, or returns
 * its own fixed text when the AI is unavailable. The answer region is a polite live region, so
 * a screen reader hears each answer or message once it arrives.
 */
export function mountAskPanel(
  el: HTMLElement,
  getContext: () => AskContext | null,
  deps: { ask?: typeof realAsk } = {},
): AskPanel {
  const ask = deps.ask ?? realAsk;
  const chat = chatView();
  const ui = questionForm(`ask-${String(++panels)}`, (text) => {
    ui.textarea.value = text;
    sync();
    ui.textarea.focus();
  });
  let generation = 0;
  let busy = false;
  const sync = (): void => {
    syncForm(ui, busy);
  };
  const setBusy = (on: boolean): void => {
    busy = on;
    chat.thinking(on);
    sync();
  };

  const submit = async (): Promise<void> => {
    const question = ui.textarea.value.trim();
    if (busy || question.length === 0 || question.length > MAX_QUESTION) return;
    const context = getContext();
    if (!context) {
      chat.answer(message(NO_PLACE));
      return;
    }
    const mine = ++generation;
    chat.question(question);
    chat.answer();
    setBusy(true);
    let reply: (HTMLElement | null)[];
    try {
      reply = answerNodes(await ask(toRequest(context, question)));
    } catch (err) {
      reply = [errorNode(err)];
    }
    if (mine !== generation) return;
    setBusy(false);
    chat.answer(...reply);
  };

  ui.textarea.addEventListener('input', sync);
  ui.form.addEventListener('submit', (event) => {
    event.preventDefault();
    void submit();
  });
  el.replaceChildren(chat.el, ui.form);
  sync();

  return {
    reset() {
      generation++;
      chat.question('');
      chat.answer();
      setBusy(false);
    },
  };
}
