import type { Source } from '../../../shared/types.js';

/**
 * Sources behind the plain-language guidance and the words-only actions. Each page was
 * opened and read as HTML when the copy was written; the copy paraphrases them.
 */

/** AirNow guide to protecting your health when particle pollution is high (page last modified 02/2023). */
export const AIRNOW_PM_GUIDE: Source = {
  title: 'Air Quality Guide for Particle Pollution',
  url: 'https://www.airnow.gov/publications/air-quality-index/air-quality-guide-for-particle-pollution/',
  year: 2023,
};

/** EPA, three strategies for cleaner indoor air: source control, ventilation, filtration (updated 3 Aug 2026). */
export const EPA_IMPROVING_IAQ: Source = {
  title: 'US EPA, Improving Indoor Air Quality',
  url: 'https://www.epa.gov/indoor-air-quality-iaq/improving-indoor-air-quality',
  year: 2026,
};

/** EPA, common indoor pollutant sources including tobacco products and combustion appliances (updated 19 Mar 2026). */
export const EPA_INTRO_IAQ: Source = {
  title: 'US EPA, Introduction to Indoor Air Quality',
  url: 'https://www.epa.gov/indoor-air-quality-iaq/introduction-indoor-air-quality',
  year: 2026,
};

/** EPA, smoke indoors and out during wildfires, N95 respirators, DIY air cleaners (updated 16 Nov 2026). */
export const EPA_WILDFIRES_IAQ: Source = {
  title: 'US EPA, Wildfires and Indoor Air Quality',
  url: 'https://www.epa.gov/indoor-air-quality-iaq/wildfires-and-indoor-air-quality-iaq',
  year: 2026,
};

/** EPA, do-it-yourself air cleaners built from box fans and furnace filters (updated 1 Oct 2026). */
export const EPA_DIY_AIR_CLEANERS: Source = {
  title: 'US EPA, Air Cleaners, HVAC Filters, and Respiratory Viruses (DIY air cleaners)',
  url: 'https://www.epa.gov/indoor-air-quality-iaq/air-cleaners-hvac-filters-and-respiratory-viruses',
  year: 2026,
};

/** EPA, smoke from residential wood burning (updated 10 Nov 2026). */
export const EPA_WOOD_SMOKE: Source = {
  title: 'US EPA, Smoke from Residential Wood Burning',
  url: 'https://www.epa.gov/indoor-air-quality-iaq/smoke-residential-wood-burning',
  year: 2026,
};

/** WHO fact sheet on outdoor air pollution: sources, transport, waste, energy (24 Oct 2024). */
export const WHO_AMBIENT_AIR: Source = {
  title: 'WHO, Ambient (outdoor) air pollution fact sheet',
  url: 'https://www.who.int/news-room/fact-sheets/detail/ambient-(outdoor)-air-quality-and-health',
  year: 2024,
};

/** WHO fact sheet on household air pollution: cooking and heating fuels (16 Dec 2025). */
export const WHO_HOUSEHOLD_AIR: Source = {
  title: 'WHO, Household air pollution fact sheet',
  url: 'https://www.who.int/news-room/fact-sheets/detail/household-air-pollution-and-health',
  year: 2025,
};
