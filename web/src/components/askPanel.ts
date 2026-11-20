import type { AskRequest, Place, Profile } from '../../../shared/types.js';
import { ask as realAsk, ApiError } from '../api.js';
import { h } from '../dom.js';

export const MAX_QUESTION = 500;
export const DISCLAIMER = 'General guidance, not medical advice.';
export const NO_PLACE = 'Choose a place first.';
export const RATE_LIMITED = "You've asked a lot in a short time — please wait a few minutes.";
export const GENERIC_ERROR = "Sorry, I couldn't answer that just now. Please try again.";
export const STANDARD_ANSWER = "Standard answer — the AI assistant isn't available right now.";

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
    'aria-describedby': `${id}-count`,
  });
  const counter = h('p', { class: 'ask__count', id: `${id}-count` });
  const submit = h('button', { type: 'submit', class: 'btn btn--primary ask__submit' }, 'Ask');
  const answer = h('div', { class: 'ask__answer', 'aria-live': 'polite', 'aria-atomic': 'true' });

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
  }

  function show(...nodes: (HTMLElement | null)[]): void {
    answer.replaceChildren(...nodes.filter((n): n is HTMLElement => n !== null));
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
    busy = true;
    answer.setAttribute('aria-busy', 'true');
    show();
    sync();
    try {
      const out = await ask(request);
      if (mine !== generation) return;
      show(
        ...paragraphs(out.answer),
        out.aiUsed ? null : h('p', { class: 'ask__note' }, STANDARD_ANSWER),
      );
    } catch (err) {
      if (mine !== generation) return;
      const limited = err instanceof ApiError && err.code === 'rate_limited';
      show(h('p', { class: 'ask__message' }, limited ? RATE_LIMITED : GENERIC_ERROR));
    }
    finish();
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
    h(
      'form',
      { class: 'card ask', novalidate: true, onsubmit: (e) => void onSubmit(e) },
      h('label', { class: 'field-label', for: textarea.id }, "Ask about today's air"),
      textarea,
      h(
        'div',
        { class: 'ask__row' },
        h('p', { class: 'ask__disclaimer' }, DISCLAIMER),
        counter,
        submit,
      ),
      h('div', { class: 'ask__suggestions' }, ...suggestions),
      answer,
    ),
  );
  sync();

  return {
    reset() {
      generation++;
      show();
      finish();
    },
  };
}
