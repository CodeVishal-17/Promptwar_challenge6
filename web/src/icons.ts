const SVG_NS = 'http://www.w3.org/2000/svg';

/** 24×24 stroke icons (1.75 px, round caps), drawn from paths so no image request is needed. */
const PATHS = {
  search: ['M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z', 'm20.5 20.5-4.7-4.7'],
  locate: [
    'M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z',
    'M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
    'M12 2v3M12 19v3M2 12h3M19 12h3',
  ],
  alert: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 7.5v5.5', 'M12 16.25v.25'],
  pin: [
    'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z',
    'M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  ],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 11v5.5', 'M12 7.75v.25'],
  lock: [
    'M6.5 10.5h11a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19v-7a1.5 1.5 0 0 1 1.5-1.5Z',
    'M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3',
  ],
  routine: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 7v5l3 2'],
  home: ['M4 10.5 12 4l8 6.5', 'M6 9v10.5h12V9', 'M10 19.5V14h4v5.5'],
  leaf: ['M5 19c0-8 5-13 14-14 0 9-5 14-13 14H5Z', 'M5 19c3-4 6-6.5 9.5-8.5'],
  edit: ['M4.5 19.5h4l10-10a2.83 2.83 0 0 0-4-4l-10 10v4Z', 'm13.5 6.5 4 4'],
} as const;

export type IconName = keyof typeof PATHS;

/** A decorative icon: hidden from assistive tech, never focusable, sized by CSS (`.icon`). */
export function icon(name: IconName, className = ''): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', `icon ${className}`.trim());
  for (const d of PATHS[name]) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
