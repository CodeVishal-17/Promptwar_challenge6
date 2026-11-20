import { beforeEach, describe, expect, it, vi } from 'vitest';
import { announce, h } from '../../web/src/dom.js';
import { resetDom, statusText } from './helpers.js';

describe('h', () => {
  it('turns strings into text nodes, never markup', () => {
    expect(h('p', {}, '<b>x</b>').innerHTML).toBe('&lt;b&gt;x&lt;/b&gt;');
  });

  it('sets string attributes, adds true booleans and omits false ones', () => {
    const el = h('button', {
      type: 'button',
      'aria-expanded': 'false',
      disabled: true,
      hidden: false,
    });
    expect(el.getAttribute('type')).toBe('button');
    expect(el.getAttribute('aria-expanded')).toBe('false');
    expect(el.hasAttribute('disabled')).toBe(true);
    expect(el.hasAttribute('hidden')).toBe(false);
  });

  it('wires on* functions as event listeners rather than attributes', () => {
    const onClick = vi.fn();
    const el = h('button', { onclick: onClick });
    el.click();
    expect(onClick).toHaveBeenCalledOnce();
    expect(el.hasAttribute('onclick')).toBe(false);
  });

  it('appends element children in order and skips nulls', () => {
    const el = h('ul', {}, h('li', {}, 'a'), null, h('li', {}, 'b'));
    expect([...el.children].map((c) => c.textContent)).toEqual(['a', 'b']);
  });

  it('refuses a style attribute, which the CSP would block', () => {
    expect(() => h('div', { style: 'color: red' })).toThrow(/style/);
  });
});

describe('announce', () => {
  beforeEach(resetDom);

  it('writes the message into the live status region', () => {
    announce('No places found');
    expect(statusText()).toBe('No places found');
  });

  it('replaces the text node so a repeated message is announced again', () => {
    announce('Saved');
    const first = document.getElementById('status')?.firstChild;
    announce('Saved');
    expect(document.getElementById('status')?.firstChild).not.toBe(first);
    expect(statusText()).toBe('Saved');
  });

  it('creates a polite status region when the page has none', () => {
    document.body.replaceChildren();
    announce('Hello');
    const region = document.getElementById('status');
    expect(region?.getAttribute('aria-live')).toBe('polite');
    expect(region?.textContent).toBe('Hello');
  });
});
