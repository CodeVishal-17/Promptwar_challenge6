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
  const id = `ask-${++panels}`;
  let generation = 0;
  let busy = false;

  const textarea = h('textarea', {
    id: `${id}-question`,
    class: 'input ask__input',
    rows: '3',
    'aria-describedby': `${id}-privacy ${id}-count`,
  });
  const privacy = h('p', { class: 'ask__privacy', id: `${id}-privacy` }, ASK_PRIVACY);
  const counter = h('p', { class: 'ask__count', id: `${id}-count` });
  const submit = h('button', { type: 'submit', class: 'btn btn--primary ask__submit' }, 'Ask');
  const answer = h('div', { class: 'ask__answer', 'aria-live': 'polite', 'aria-atomic': 'true' });

  // The chat above the form: Puff's greeting, the question as the user's bubble (outside the
  // live region, so only the answer is announced), then Puff's answer bubble.
  const avatar = () => h('span', { class: 'chat__avatar' }, puff('moderate', 'sm'));
  const userText = h('p', { class: 'chat__text' });
  const userBubble = h('div', { class: 'chat__msg chat__msg--user', hidden: true }, userText);
  const typing = h(
    'span',
    { class: 'chat__typing', 'aria-hidden': 'true', hidden: true },
    h('span', { class: 'chat__dot' }),
    h('span', { class: 'chat__dot' }),
    h('span', { class: 'chat__dot' }),
  );
  const answerBubble = h(
    'div',
    { class: 'chat__msg chat__msg--bot chat__msg--answer' },
    avatar(),
    h('div', { class: 'chat__bubble' }, typing, answer),
  );
  const chat = h(
    'div',
    { class: 'chat' },
    h(
      'div',
      { class: 'chat__msg chat__msg--bot chat__msg--intro' },
      avatar(),
      h('p', { class: 'chat__bubble' }, GREETING),
    ),
    userBubble,
    answerBubble,
  );

  /** The answer bubble shows while Puff is thinking or has something to say. */
  function syncChat(): void {
    typing.hidden = !busy;
    answerBubble.toggleAttribute('data-active', busy || answer.childElementCount > 0);
  }

  const question = () => textarea.value.trim();

  function sync(): void {
    const n = question().length;
    counter.textContent = `${n}/${MAX_QUESTION}`;
    counter.classList.toggle('ask__count--over', n > MAX_QUESTION);
    // aria-disabled, not disabled, while thinking: keyboard focus stays on the button.
    submit.disabled = !busy && (n === 0 || n > MAX_QUESTION);
    if (busy) submit.setAttribute('aria-disabled', 'true');
    else submit.removeAttribute('aria-disabled');
    submit.textContent = busy ? 'Thinking…' : 'Ask';
    syncChat();
  }

  function show(...nodes: (HTMLElement | null)[]): void {
    answer.replaceChildren(...nodes.filter((n): n is HTMLElement => n !== null));
    syncChat();
  }

  function finish(): void {
    busy = false;
    answer.removeAttribute('aria-busy');
    sync();
  }

  async function onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    const n = question().length;
    if (busy || n === 0 || n > MAX_QUESTION) return;
    const context = getContext();
    if (!context) {
      show(h('p', { class: 'ask__message' }, NO_PLACE));
      return;
    }
    const { place, profile } = context;
    const request: AskRequest = {
      lat: place.lat,
      lon: place.lon,
      ...(place.countryCode ? { countryCode: place.countryCode } : {}),
      profile,
      question: question(),
    };
    const mine = ++generation;
    userText.textContent = request.question;
    userBubble.hidden = false;
    busy = true;
    answer.setAttribute('aria-busy', 'true');
    show();
    sync();
    try {
      const out = await ask(request);
      if (mine !== generation) return;
      finish(); // not busy when the text lands, or some screen readers stay silent
      show(
        ...paragraphs(out.answer),
        out.aiUsed ? null : h('p', { class: 'ask__note' }, STANDARD_ANSWER),
      );
    } catch (err) {
      if (mine !== generation) return;
      finish();
      const limited = err instanceof ApiError && err.code === 'rate_limited';
      show(h('p', { class: 'ask__message' }, limited ? RATE_LIMITED : GENERIC_ERROR));
    }
  }

  textarea.addEventListener('input', sync);
  const suggestions = SUGGESTIONS.map((text) =>
    h(
      'button',
      {
        type: 'button',
        class: 'ask__suggestion',
        onclick: () => {
          textarea.value = text;
          sync();
          textarea.focus();
        },
      },
      text,
    ),
  );

  el.replaceChildren(
    chat,
    h(
      'form',
      { class: 'card ask', novalidate: true, onsubmit: (e) => void onSubmit(e) },
      h('label', { class: 'field-label', for: textarea.id }, "Ask about today's air"),
      privacy,
      textarea,
      h(
        'div',
        { class: 'ask__row' },
        h('p', { class: 'ask__disclaimer' }, DISCLAIMER),
        counter,
        submit,
      ),
      h('div', { class: 'ask__suggestions' }, ...suggestions),
    ),
  );
  sync();

  return {
    reset() {
      generation++;
      userText.textContent = '';
      userBubble.hidden = true;
      show();
      finish();
    },
  };
}
