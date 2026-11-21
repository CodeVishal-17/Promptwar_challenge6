import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROFILE } from '../../../shared/profile.js';
import type { AskRequest } from '../../../shared/types.js';
import { ApiError } from '../../../web/src/api.js';
import { mountAskPanel } from '../../../web/src/components/askPanel.js';
import { PLACE } from '../helpers.js';

type Answer = { answer: string; aiUsed: boolean };
type AskFn = (body: AskRequest) => Promise<Answer>;

let root: HTMLElement;
const flush = () => new Promise((r) => setTimeout(r, 0));
const context = () => ({ place: PLACE, profile: DEFAULT_PROFILE });

beforeEach(() => {
  root = document.createElement('div');
  document.body.replaceChildren(root);
});

function mount(ask: AskFn, getContext: () => ReturnType<typeof context> | null = context) {
  const panel = mountAskPanel(root, getContext, { ask });
  const textarea = root.querySelector('textarea') as HTMLTextAreaElement;
  const submit = root.querySelector('button[type="submit"]') as HTMLButtonElement;
  const answer = root.querySelector('[aria-live="polite"]') as HTMLElement;
  const type = (text: string) => {
    textarea.value = text;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const send = async (text: string) => {
    type(text);
    submit.click();
    await flush();
  };
  return { panel, textarea, submit, answer, type, send };
}

const resolved = (a: Partial<Answer> = {}): AskFn =>
  vi.fn(async () => ({ answer: 'Go at dusk.', aiUsed: true, ...a }));

describe('askPanel', () => {
  it('has a labelled textarea, a live counter and an always-visible disclaimer', () => {
    const { textarea } = mount(resolved());
    const label = root.querySelector(`label[for="${textarea.id}"]`);
    expect(label?.textContent).toBe("Ask about today's air");
    expect(root.textContent).toContain('0/500');
    expect(root.textContent).toContain('General guidance, not medical advice.');
  });

  it('says beside the textarea that questions go to Gemini, linked by aria-describedby', () => {
    const { textarea } = mount(resolved());
    const notice = root.querySelector('.ask__privacy');
    expect(notice?.textContent).toBe(
      "Questions you type are sent to Google Gemini, whose free tier may use them to improve Google products. Don't include personal details.",
    );
    const described = (textarea.getAttribute('aria-describedby') ?? '').split(' ');
    expect(described).toContain(notice?.id);
    expect(described.every((id) => document.getElementById(id))).toBe(true);
  });

  it('disables submit when empty, whitespace-only or over 500 characters', () => {
    const { submit, type } = mount(resolved());
    expect(submit.disabled).toBe(true);
    type('   \n ');
    expect(submit.disabled).toBe(true);
    type('Is it safe to run?');
    expect(submit.disabled).toBe(false);
    type('a'.repeat(501));
    expect(submit.disabled).toBe(true);
    expect(root.textContent).toContain('501/500');
    type('a'.repeat(500));
    expect(submit.disabled).toBe(false);
  });

  it('counts the trimmed question', () => {
    const { type } = mount(resolved());
    type('  hello  ');
    expect(root.textContent).toContain('5/500');
  });

  it('sends the trimmed question with place and profile, and shows the answer as text', async () => {
    const ask = resolved({ answer: 'First.\n\n<script>alert(1)</script>\n\nThird.' });
    const { send, answer } = mount(ask);
    await send('  Should I run?  ');
    expect(ask).toHaveBeenCalledWith({
      lat: PLACE.lat,
      lon: PLACE.lon,
      countryCode: 'BR',
      profile: DEFAULT_PROFILE,
      question: 'Should I run?',
    });
    expect([...answer.querySelectorAll('p')].map((p) => p.textContent)).toEqual([
      'First.',
      '<script>alert(1)</script>',
      'Third.',
    ]);
    expect(answer.querySelector('script')).toBeNull();
    expect(answer.hasAttribute('aria-busy')).toBe(false);
  });

  it('shows Thinking…, marks the answer busy, and ignores a second submit in flight', async () => {
    let finish: (a: Answer) => void = () => {};
    const ask = vi.fn<AskFn>(() => new Promise((r) => (finish = r)));
    const { submit, answer, type } = mount(ask);
    type('Question');
    submit.click();
    submit.click();
    await flush();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(submit.textContent).toBe('Thinking…');
    expect(answer.getAttribute('aria-busy')).toBe('true');
    finish({ answer: 'Done.', aiUsed: true });
    await flush();
    expect(submit.textContent).toBe('Ask');
    expect(submit.disabled).toBe(false);
    expect(answer.hasAttribute('aria-busy')).toBe(false);
  });

  it('notes a standard answer only when the AI was not used', async () => {
    const { send, answer } = mount(resolved({ aiUsed: false }));
    await send('Hi');
    expect(answer.textContent).toContain(
      "Standard answer — the AI assistant isn't available right now.",
    );
    const ai = mount(resolved({ aiUsed: true }));
    await ai.send('Hi');
    expect(ai.answer.textContent).not.toContain('Standard answer');
  });

  it('explains a rate limit', async () => {
    const { send, answer, submit } = mount(
      vi.fn(async () => {
        throw new ApiError('rate_limited', 429);
      }),
    );
    await send('Hi');
    expect(answer.textContent).toBe(
      "You've asked a lot in a short time — please wait a few minutes.",
    );
    expect(submit.textContent).toBe('Ask');
    expect(answer.hasAttribute('aria-busy')).toBe(false);
  });

  it('gives a calm generic message for any other failure', async () => {
    for (const err of [
      new ApiError('timeout', 0),
      new ApiError('invalid_request', 400),
      new Error('x'),
    ]) {
      const { send, answer } = mount(
        vi.fn(async () => {
          throw err;
        }),
      );
      await send('Hi');
      expect(answer.textContent).toBe("Sorry, I couldn't answer that just now. Please try again.");
    }
  });

  it('asks to choose a place first, without calling the API', async () => {
    const ask = resolved();
    const { send, answer } = mount(ask, () => null);
    await send('Hi');
    expect(ask).not.toHaveBeenCalled();
    expect(answer.textContent).toBe('Choose a place first.');
  });

  it('suggestions fill the textarea without submitting', () => {
    const ask = resolved();
    const { textarea, submit } = mount(ask);
    const suggestions = [...root.querySelectorAll<HTMLButtonElement>('button[type="button"]')];
    expect(suggestions.map((b) => b.textContent)).toEqual([
      'When is the best time to go outside today?',
      'How can I keep indoor air cleaner?',
      "What's the greenest way to commute?",
    ]);
    suggestions[1]?.click();
    expect(textarea.value).toBe('How can I keep indoor air cleaner?');
    expect(submit.disabled).toBe(false);
    expect(root.textContent).toContain('34/500');
    expect(ask).not.toHaveBeenCalled();
  });

  it('reset clears the answer and drops an in-flight answer for the old place', async () => {
    let finish: (a: Answer) => void = () => {};
    const ask = vi.fn<AskFn>(() => new Promise((r) => (finish = r)));
    const { panel, submit, answer, type } = mount(ask);
    type('Question');
    submit.click();
    await flush();
    panel.reset();
    expect(answer.hasAttribute('aria-busy')).toBe(false);
    expect(submit.textContent).toBe('Ask');
    finish({ answer: 'Old place answer.', aiUsed: true });
    await flush();
    expect(answer.textContent).toBe('');
  });

  it('clears aria-busy before the answer or error is inserted, so it is announced', async () => {
    for (const ask of [
      resolved(),
      vi.fn<AskFn>(async () => {
        throw new ApiError('timeout', 0);
      }),
    ]) {
      const { send, answer, submit } = mount(ask);
      const seen: (string | null)[] = [];
      const original = answer.replaceChildren.bind(answer);
      answer.replaceChildren = (...nodes) => {
        if (nodes.length) seen.push(answer.getAttribute('aria-busy'));
        original(...nodes);
      };
      submit.disabled = false;
      await send('Hi');
      expect(seen).toHaveLength(1);
      expect(seen[0]).not.toBe('true');
    }
  });
});
