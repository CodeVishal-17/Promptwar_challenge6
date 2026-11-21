import type { Impact } from '../../../shared/types.js';
import { h, sourceNode, srOnly } from '../dom.js';
import { icon } from '../icons.js';

let chips = 0;

/** A small labelled block inside the panel, or nothing when the part is empty. */
function part(title: string, body: HTMLElement | null): HTMLElement | null {
  return (
    body &&
    h('div', { class: 'impact-panel__part' }, h('p', { class: 'impact-panel__label' }, title), body)
  );
}

/**
 * Everything behind one number, exactly as the server computed it: the formula, each input,
 * each assumption and the sources. Nothing here adds, rounds or rewrites a number.
 */
function panel(impact: Impact, id: string): HTMLElement {
  const { formula, inputs, assumptions, sources } = impact;
  return h(
    'div',
    {
      id,
      class: 'impact-panel',
      role: 'group',
      'aria-label': 'How we calculated this',
      hidden: true,
    },
    h('p', { class: 'impact-panel__title' }, 'How we calculated this'),
    part('Formula', formula ? h('p', { class: 'impact-panel__formula' }, formula) : null),
    part(
      'Inputs',
      inputs.length
        ? h(
            'dl',
            { class: 'impact-panel__inputs' },
            ...inputs.map((i) => h('div', {}, h('dt', {}, i.label), h('dd', {}, i.value))),
          )
        : null,
    ),
    part(
      'Assumptions',
      assumptions.length
        ? h('ul', { class: 'impact-panel__assumptions' }, ...assumptions.map((a) => h('li', {}, a)))
        : null,
    ),
    part(
      sources.length === 1 ? 'Source' : 'Sources',
      sources.length
        ? h(
            'ul',
            { class: 'impact-panel__sources' },
            ...sources.map((s) => h('li', {}, sourceNode(s))),
          )
        : null,
    ),
  );
}

/**
 * An impact figure as a disclosure button: its label is `impact.display`, verbatim, and it
 * opens an inline "How we calculated this" panel. Escape closes the panel and returns focus.
 */
export function impactChip(impact: Impact): HTMLElement {
  const id = `impact-panel-${++chips}`;
  const details = panel(impact, id);
  const button = h(
    'button',
    { type: 'button', class: 'impact-chip', 'aria-expanded': 'false', 'aria-controls': id },
    h('span', { class: 'impact-chip__value' }, impact.display),
    srOnly(' — how we calculated this'),
    icon('info', 'impact-chip__icon'),
  );

  const setOpen = (open: boolean): void => {
    button.setAttribute('aria-expanded', String(open));
    details.hidden = !open;
  };
  button.addEventListener('click', () => {
    setOpen(button.getAttribute('aria-expanded') !== 'true');
  });

  const wrap = h('div', { class: 'impact' }, button, details);
  wrap.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || details.hidden) return;
    e.stopPropagation();
    setOpen(false);
    button.focus();
  });
  return wrap;
}
