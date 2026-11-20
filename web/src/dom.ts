/** Attribute values for h(): strings are set as-is, `true` adds a bare attribute, `false` omits it. */
export type Attrs = Record<string, string | boolean | EventListener>;

/**
 * Builds an element from data. Strings become text nodes and attributes go through
 * setAttribute, so nothing is ever parsed as HTML. `on*` functions become event listeners.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (name === 'style') {
      throw new Error('h(): style attributes are blocked by the CSP; use a class or el.style');
    }
    if (typeof value === 'function') {
      el.addEventListener(name.replace(/^on/, ''), value);
    } else if (value === true) {
      el.setAttribute(name, '');
    } else if (value !== false) {
      el.setAttribute(name, value);
    }
  }
  for (const child of children) if (child !== null) el.append(child);
  return el;
}

const STATUS_ID = 'status';

/**
 * Speaks a message through the page's single polite live region. The text node is replaced
 * rather than edited, so screen readers announce the same message twice in a row.
 */
export function announce(message: string): void {
  let region = document.getElementById(STATUS_ID);
  if (!region) {
    region = h('div', {
      id: STATUS_ID,
      class: 'visually-hidden',
      role: 'status',
      'aria-live': 'polite',
    });
    document.body.append(region);
  }
  region.replaceChildren(document.createTextNode(message));
}

/** A visually hidden note for screen readers, e.g. "(opens in new tab)". */
export const srOnly = (text: string): HTMLSpanElement =>
  h('span', { class: 'visually-hidden' }, text);

/** A link to another site: new tab, no opener or referrer, and it says so to screen readers. */
export function externalLink(href: string, text: string, attrs: Attrs = {}): HTMLAnchorElement {
  return h(
    'a',
    { href, target: '_blank', rel: 'noopener noreferrer', ...attrs },
    text,
    srOnly(' (opens in new tab)'),
  );
}
