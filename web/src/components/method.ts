import { externalLink, h } from '../dom.js';

/**
 * The sources behind every figure, as plain copy (the server's Source objects stay on the
 * server). Each link here matches the one cited beside the constant it supports.
 */
const SOURCES: readonly { title: string; url: string; note: string }[] = [
  {
    title: 'Open-Meteo Air Quality API',
    url: 'https://open-meteo.com/en/docs/air-quality-api',
    note: 'hourly pollutant forecasts, CC BY 4.0',
  },
  {
    title: 'Copernicus Atmosphere Monitoring Service (CAMS)',
    url: 'https://atmosphere.copernicus.eu/',
    note: 'the European and global models behind those forecasts',
  },
  {
    title:
      'US EPA, Technical Assistance Document for the Reporting of Daily Air Quality (AQI), 2024',
    url: 'https://document.airnow.gov/technical-assistance-document-for-the-reporting-of-daily-air-quailty.pdf',
    note: 'AQI breakpoints, averaging and categories',
  },
  {
    title: 'UK Government GHG Conversion Factors 2026 (DESNZ)',
    url: 'https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2026',
    note: 'emissions per km for cars, motorbikes, buses and trains',
  },
  {
    title: 'Our World in Data, based on Ember: carbon intensity of electricity',
    url: 'https://ourworldindata.org/grapher/carbon-intensity-electricity',
    note: 'each country’s grid, for electric cars and rail',
  },
  {
    title: 'US EPA Exposure Factors Handbook, Chapter 6: Inhalation Rates',
    url: 'https://www.epa.gov/expobox/exposure-factors-handbook-chapter-6',
    note: 'how much air you breathe at rest and during exercise',
  },
  {
    title: 'Xiang et al. (2021), PM2.5 infiltration and portable air cleaners in US homes',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8026580/',
    note: 'how much outdoor air gets in, measured in real homes',
  },
  {
    title: 'US EPA, Guide to Air Cleaners in the Home',
    url: 'https://www.epa.gov/indoor-air-quality-iaq/guide-air-cleaners-home',
    note: 'purifier sizing and clean air delivery rate',
  },
  {
    title: 'AirNow, Air Quality Guide for Particle Pollution',
    url: 'https://www.airnow.gov/publications/air-quality-index/air-quality-guide-for-particle-pollution/',
    note: 'the health advice for each AQI category',
  },
];

const block = (title: string, ...body: HTMLElement[]) =>
  h('div', { class: 'method__block' }, h('h3', { class: 'method__title' }, title), ...body);

/** "How we calculate": data, method, the numbers rule, sources and limits, as static copy. */
export function renderMethod(el: HTMLElement): void {
  el.replaceChildren(
    h(
      'div',
      { class: 'card method' },
      block(
        'Where the data comes from',
        h(
          'p',
          {},
          'Air quality comes from the Copernicus Atmosphere Monitoring Service (CAMS) forecasts, served by Open-Meteo. These are modelled estimates for an area roughly 11 km across in Europe and 40 km elsewhere — not readings from a monitor on your street.',
        ),
      ),
      block(
        'How we work out the AQI',
        h(
          'p',
          {},
          'We compute the US EPA Air Quality Index ourselves, on its scale from 0 to 500 and above, using the EPA’s 2024 breakpoints for PM2.5. Particles (PM2.5 and PM10) use the EPA’s NowCast, as AirNow does for hourly reports: a weighted average of the last 12 hours that leans on the latest hours when the air is changing fast, read against the 24-hour breakpoints. Ozone uses the higher of its 8-hour and 1-hour figures, and nitrogen dioxide the 1-hour figure. The highest of these is the AQI, and that pollutant is shown as the main one. Because the averages look back over earlier hours, “now” is an hourly estimate rather than an official daily report. The cleanest daytime hours are the best two hours between 06:00 and 21:00, when most people are up and about; the worst two hours can fall at any time.',
        ),
      ),
      block(
        'Numbers from code, words from AI',
        h(
          'p',
          {},
          'Every number you see — the AQI, the best times, the percentages and the kilograms of CO₂e — is calculated by Clearday’s own tested code from the sources below, and each impact shows its formula, inputs and assumptions. Google Gemini only chooses and words the advice. If an AI sentence contains a number we didn’t calculate, we replace it with our standard text, and if Gemini is unavailable you get the same plan built from our rules.',
        ),
      ),
      block(
        'Sources',
        h(
          'ul',
          { class: 'method__sources' },
          ...SOURCES.map((s) =>
            h(
              'li',
              {},
              externalLink(s.url, s.title),
              h('span', { class: 'method__note' }, ` — ${s.note}`),
            ),
          ),
        ),
      ),
      block(
        'Limits',
        h(
          'ul',
          { class: 'method__limits' },
          h(
            'li',
            {},
            'Forecasts can miss very local sources such as a busy road, a fire nearby or a neighbour’s stove.',
          ),
          h(
            'li',
            {},
            'Impacts are estimates for a typical home, body and vehicle under the stated assumptions; your own may differ.',
          ),
          h(
            'li',
            {},
            'Grid carbon intensity is a yearly national average, not the mix at the moment you charge.',
          ),
          h(
            'li',
            {},
            'Clearday is not medical advice. If you have symptoms or a health condition, follow your clinician’s guidance.',
          ),
        ),
      ),
    ),
  );
}
