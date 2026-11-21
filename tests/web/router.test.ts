import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h } from '../../web/src/dom.js';
import { ROUTES, parseRoute, startRouter, type Router } from '../../web/src/router.js';

const screen = (route: string): HTMLElement =>
  document.getElementById(`screen-${route}`) as HTMLElement;
const visible = (): string[] => ROUTES.filter((r) => !screen(r).hidden);
const current = (): string[] =>
  [...document.querySelectorAll('[aria-current="page"]')].map(
    (a) => a.getAttribute('data-route') ?? '',
  );

function go(hash: string): void {
  location.hash = hash;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

let router: Router | undefined;
let place: string | null = 'São Paulo';
// jsdom has no layout, so scrolling is stubbed (and checked).
const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

beforeEach(() => {
  history.replaceState(null, '', location.pathname);
  place = 'São Paulo';
  scrollTo.mockClear();
  document.body.replaceChildren(
    h(
      'nav',
      {},
      ...ROUTES.map((r) => h('a', { href: `#/${r}`, 'data-route': r }, r)),
      h('a', { href: '#/about', 'data-route': 'about' }, 'footer about'),
    ),
    ...ROUTES.map((r) =>
      h('div', { id: `screen-${r}`, class: 'screen' }, h('h1', { tabindex: '-1' }, r)),
    ),
  );
});

afterEach(() => {
  router?.stop();
  router = undefined;
  history.replaceState(null, '', location.pathname);
});

describe('parseRoute', () => {
  it.each(['', '#', '#/', '#/nope', '#forecast', '#/Forecast'])('%j → today', (hash) => {
    expect(parseRoute(hash)).toBe('today');
  });

  it.each(ROUTES.map((r) => [r]))('#/%s → itself', (route) => {
    expect(parseRoute(`#/${route}`)).toBe(route);
  });
});

describe('startRouter', () => {
  it('shows Today by default, marks its link current and leaves focus alone', () => {
    router = startRouter({ placeName: () => place });
    expect(visible()).toEqual(['today']);
    expect(current()).toEqual(['today']);
    expect(document.activeElement).toBe(document.body);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(router.current()).toBe('today');
  });

  it('opens a deep link on first load without moving focus', () => {
    location.hash = '#/plan';
    router = startRouter({ placeName: () => place });
    expect(visible()).toEqual(['plan']);
    expect(document.activeElement).toBe(document.body);
  });

  it('on navigation shows that screen only, marks every matching link and focuses its heading', () => {
    router = startRouter({ placeName: () => place });
    go('#/about');
    expect(visible()).toEqual(['about']);
    expect(current()).toEqual(['about', 'about']);
    expect(document.activeElement).toBe(screen('about').querySelector('h1'));
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    expect(router.current()).toBe('about');
  });

  it('titles the page with the screen and the place', () => {
    router = startRouter({ placeName: () => place });
    go('#/forecast');
    expect(document.title).toBe('Forecast · São Paulo — Clearday');
  });

  it('titles the page with the screen alone before a place is chosen', () => {
    place = null;
    router = startRouter({ placeName: () => place });
    go('#/plan');
    expect(document.title).toBe('My plan — Clearday');
  });

  it('refresh re-applies the title without moving focus', () => {
    place = null;
    router = startRouter({ placeName: () => place });
    expect(document.title).toBe('Today — Clearday');
    place = 'Lima';
    router.refresh();
    expect(document.title).toBe('Today · Lima — Clearday');
    expect(document.activeElement).toBe(document.body);
  });

  it('goes back to Today when the hash returns to it', () => {
    router = startRouter({ placeName: () => place });
    go('#/ask');
    go('#/today');
    expect(visible()).toEqual(['today']);
  });

  it('an unknown hash shows Today', () => {
    router = startRouter({ placeName: () => place });
    go('#/ask');
    go('#/somewhere');
    expect(visible()).toEqual(['today']);
  });

  it('go switches screens at once and updates the address, focusing only when asked', () => {
    router = startRouter({ placeName: () => place });
    router.go('forecast', false);
    expect(location.hash).toBe('#/forecast');
    expect(visible()).toEqual(['forecast']);
    expect(document.activeElement).toBe(document.body);
    router.go('plan');
    expect(document.activeElement).toBe(screen('plan').querySelector('h1'));
  });

  it('ignores the hashchange that follows go, so focus stays where the caller put it', () => {
    router = startRouter({ placeName: () => place });
    const input = document.body.appendChild(h('input', {}));
    router.go('ask', false);
    input.focus();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(document.activeElement).toBe(input);
  });

  it('keeps the screen when an in-page link such as the skip link changes the hash', () => {
    router = startRouter({ placeName: () => place });
    go('#/plan');
    const heading = screen('plan').querySelector('h1');
    go('#main');
    expect(visible()).toEqual(['plan']);
    expect(router.current()).toBe('plan');
    expect(document.activeElement).toBe(heading);
  });

  it('stop removes the listener', () => {
    router = startRouter({ placeName: () => place });
    router.stop();
    go('#/forecast');
    expect(visible()).toEqual(['today']);
  });
});
