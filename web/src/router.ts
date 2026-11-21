/**
 * A small hash router: each screen lives at its own `#/…` address, so Back, refresh and shared
 * links work. It shows one `#screen-<route>` and hides the rest, marks the matching nav links
 * with `aria-current="page"`, titles the page, and — on navigation, not on first load — moves
 * focus to the new screen's heading so keyboard and screen-reader users land on it.
 */
export type Route = 'today' | 'forecast' | 'plan' | 'ask' | 'about';

export const ROUTES: readonly Route[] = ['today', 'forecast', 'plan', 'ask', 'about'];

export const SCREEN_TITLE: Record<Route, string> = {
  today: 'Today',
  forecast: 'Forecast',
  plan: 'My plan',
  ask: 'Ask',
  about: 'How it works',
};

/** `#/plan` → `plan`; anything else, including an empty hash, is Today. */
export function parseRoute(hash: string): Route {
  const name = hash.startsWith('#/') ? hash.slice(2) : '';
  return (ROUTES as readonly string[]).includes(name) ? (name as Route) : 'today';
}

export interface Router {
  current(): Route;
  /** Re-applies the page title, e.g. after the place changes. */
  refresh(): void;
  stop(): void;
}

export function startRouter(opts: { placeName: () => string | null }): Router {
  let route = parseRoute(location.hash);

  const title = () => {
    const place = opts.placeName();
    document.title = place
      ? `${SCREEN_TITLE[route]} · ${place} — Clearday`
      : `${SCREEN_TITLE[route]} — Clearday`;
  };

  const apply = (moveFocus: boolean) => {
    for (const r of ROUTES) {
      const screen = document.getElementById(`screen-${r}`);
      if (screen) screen.hidden = r !== route;
    }
    for (const link of document.querySelectorAll('[data-route]')) {
      if (link.getAttribute('data-route') === route) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    title();
    if (moveFocus) {
      document.querySelector<HTMLElement>(`#screen-${route} h1`)?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  };

  const onHashChange = () => {
    route = parseRoute(location.hash);
    apply(true);
  };

  apply(false);
  window.addEventListener('hashchange', onHashChange);

  return {
    current: () => route,
    refresh: title,
    stop: () => window.removeEventListener('hashchange', onHashChange),
  };
}
