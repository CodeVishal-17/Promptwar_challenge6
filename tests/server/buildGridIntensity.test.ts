import { describe, expect, it } from 'vitest';
import { buildGridIntensity } from '../../scripts/build-grid-intensity.mjs';

const HEADER = 'entity,code,year,co2_intensity__gco2_kwh';

describe('buildGridIntensity', () => {
  it('keeps the latest year per country, maps ISO3 to ISO2 and drops aggregates', () => {
    const csv = [
      HEADER,
      'ASEAN (Ember),,2024,500',
      'Africa,OWID_AFR,2024,600',
      'Kosovo,OWID_KOS,2024,900',
      'World,OWID_WRL,2024,471.08',
      'World,OWID_WRL,2025,458.29',
      'India,IND,2024,705.4',
      'India,IND,2025,670.13',
      '"Korea, Republic of",KOR,2025,410',
      'France,FRA,2025,41.44',
      'Nowhere,ATA,2025,',
    ].join('\r\n');
    const out = buildGridIntensity(csv);
    expect(out.worldAverage).toEqual({ gPerKwh: 458.29, year: 2025 });
    expect(out.countries).toEqual({
      FR: { gPerKwh: 41.44, year: 2025 },
      IN: { gPerKwh: 670.13, year: 2025 },
      KR: { gPerKwh: 410, year: 2025 },
    });
    expect(out.source.url).toBe('https://ourworldindata.org/grapher/carbon-intensity-electricity');
  });

  it('fails loudly on an unmapped code or a missing world row', () => {
    expect(() =>
      buildGridIntensity([HEADER, 'World,OWID_WRL,2025,1', 'X,XYZ,2025,1'].join('\n')),
    ).toThrow(/XYZ/);
    expect(() => buildGridIntensity([HEADER, 'India,IND,2025,1'].join('\n'))).toThrow(/World/);
  });
});
