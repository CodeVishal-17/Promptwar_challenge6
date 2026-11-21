import type { Place } from '../../../shared/types.js';
import { h, srOnly } from '../dom.js';

/**
 * The popup half of the ARIA 1.2 combobox: a listbox of places whose active option is
 * announced through the input's `aria-activedescendant`, so focus never leaves the input.
 */
export class PlaceList {
  private places: Place[] = [];
  private active = -1;

  constructor(
    /** Option ids are `<idPrefix>-option-<n>`. */
    private readonly idPrefix: string,
    private readonly input: HTMLInputElement,
    private readonly listbox: HTMLElement,
    private readonly onChoose: (place: Place) => void,
  ) {}

  get count(): number {
    return this.places.length;
  }

  isOpen(): boolean {
    return this.input.getAttribute('aria-expanded') === 'true';
  }

  /** The place under the keyboard highlight, if the list is open and one is highlighted. */
  highlighted(): Place | undefined {
    return this.isOpen() ? this.places[this.active] : undefined;
  }

  open(): void {
    if (this.places.length === 0) return;
    this.listbox.hidden = false;
    this.input.setAttribute('aria-expanded', 'true');
  }

  close(): void {
    this.setActive(-1);
    this.listbox.hidden = true;
    this.input.setAttribute('aria-expanded', 'false');
  }

  /** Replaces the options; the list stays closed until `open()`. */
  fill(places: Place[]): void {
    this.places = places;
    this.active = -1;
    this.listbox.replaceChildren(...places.map((p, i) => this.option(p, i)));
  }

  clear(): void {
    this.fill([]);
    this.close();
  }

  /** Moves the highlight one option down (+1) or up (-1), wrapping, and opens the list. */
  move(step: 1 | -1): void {
    const count = this.places.length;
    this.open();
    const from = this.active === -1 && step === -1 ? 0 : this.active;
    this.setActive((from + step + count) % count);
  }

  private options(): Element[] {
    return [...this.listbox.children];
  }

  private setActive(index: number): void {
    this.options()[this.active]?.setAttribute('aria-selected', 'false');
    this.active = index;
    const option = this.options()[index];
    if (!option) {
      this.input.removeAttribute('aria-activedescendant');
      return;
    }
    option.setAttribute('aria-selected', 'true');
    this.input.setAttribute('aria-activedescendant', option.id);
    // Optional: not every DOM implementation (jsdom, for one) has scrollIntoView.
    (option as Partial<Pick<Element, 'scrollIntoView'>>).scrollIntoView?.({ block: 'nearest' });
  }

  private option(place: Place, index: number): HTMLLIElement {
    const meta = [place.admin1, place.country].filter(Boolean).join(', ');
    return h(
      'li',
      {
        id: `${this.idPrefix}-option-${String(index)}`,
        class: 'listbox__option',
        role: 'option',
        'aria-selected': 'false',
        onclick: () => {
          this.onChoose(place);
        },
      },
      h('span', { class: 'listbox__name' }, place.name),
      meta ? srOnly(', ') : null,
      meta ? h('span', { class: 'listbox__meta' }, meta) : null,
    );
  }
}
