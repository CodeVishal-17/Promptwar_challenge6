#!/usr/bin/env node
// Builds server/src/domain/data/gridIntensity.json from Our World in Data's
// "carbon intensity of electricity" CSV (Ember-derived, CC-BY 4.0):
//   https://ourworldindata.org/grapher/carbon-intensity-electricity.csv?v=1&csvType=full&useColumnShortNames=true
//
// Usage: node scripts/build-grid-intensity.mjs <path-to-csv> [out-path]
//
// Keeps each country's latest year, maps ISO 3166-1 alpha-3 codes to alpha-2,
// takes the `World` row (OWID_WRL) as the world average, and drops every other
// aggregate (blank code or an `OWID_` code, e.g. continents and income groups).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SOURCE = {
  title:
    'Lifecycle carbon intensity of electricity (g CO₂e/kWh), Our World in Data, based on Ember (2026) and Energy Institute Statistical Review of World Energy (2026)',
  url: 'https://ourworldindata.org/grapher/carbon-intensity-electricity',
  year: 2026,
};

const VALUE_COLUMN = 'co2_intensity__gco2_kwh';
const WORLD_CODE = 'OWID_WRL';

// ISO 3166-1 alpha-3 → alpha-2 for all 249 assigned codes, written as
// "<alpha-3><alpha-2>". Transcribed from the ISO 3166-1 code table at
// https://en.wikipedia.org/wiki/ISO_3166-1 (read 2026-11-20).
const ISO3_TO_ISO2 = new Map(
  `
  ABWAW AFGAF AGOAO AIAAI ALAAX ALBAL ANDAD AREAE ARGAR ARMAM ASMAS ATAAQ
  ATFTF ATGAG AUSAU AUTAT AZEAZ BDIBI BELBE BENBJ BESBQ BFABF BGDBD BGRBG
  BHRBH BHSBS BIHBA BLMBL BLRBY BLZBZ BMUBM BOLBO BRABR BRBBB BRNBN BTNBT
  BVTBV BWABW CAFCF CANCA CCKCC CHECH CHLCL CHNCN CIVCI CMRCM CODCD COGCG
  COKCK COLCO COMKM CPVCV CRICR CUBCU CUWCW CXRCX CYMKY CYPCY CZECZ DEUDE
  DJIDJ DMADM DNKDK DOMDO DZADZ ECUEC EGYEG ERIER ESHEH ESPES ESTEE ETHET
  FINFI FJIFJ FLKFK FRAFR FROFO FSMFM GABGA GBRGB GEOGE GGYGG GHAGH GIBGI
  GINGN GLPGP GMBGM GNBGW GNQGQ GRCGR GRDGD GRLGL GTMGT GUFGF GUMGU GUYGY
  HKGHK HMDHM HNDHN HRVHR HTIHT HUNHU IDNID IMNIM INDIN IOTIO IRLIE IRNIR
  IRQIQ ISLIS ISRIL ITAIT JAMJM JEYJE JORJO JPNJP KAZKZ KENKE KGZKG KHMKH
  KIRKI KNAKN KORKR KWTKW LAOLA LBNLB LBRLR LBYLY LCALC LIELI LKALK LSOLS
  LTULT LUXLU LVALV MACMO MAFMF MARMA MCOMC MDAMD MDGMG MDVMV MEXMX MHLMH
  MKDMK MLIML MLTMT MMRMM MNEME MNGMN MNPMP MOZMZ MRTMR MSRMS MTQMQ MUSMU
  MWIMW MYSMY MYTYT NAMNA NCLNC NERNE NFKNF NGANG NICNI NIUNU NLDNL NORNO
  NPLNP NRUNR NZLNZ OMNOM PAKPK PANPA PCNPN PERPE PHLPH PLWPW PNGPG POLPL
  PRIPR PRKKP PRTPT PRYPY PSEPS PYFPF QATQA REURE ROURO RUSRU RWARW SAUSA
  SDNSD SENSN SGPSG SGSGS SHNSH SJMSJ SLBSB SLESL SLVSV SMRSM SOMSO SPMPM
  SRBRS SSDSS STPST SURSR SVKSK SVNSI SWESE SWZSZ SXMSX SYCSC SYRSY TCATC
  TCDTD TGOTG THATH TJKTJ TKLTK TKMTM TLSTL TONTO TTOTT TUNTN TURTR TUVTV
  TWNTW TZATZ UGAUG UKRUA UMIUM URYUY USAUS UZBUZ VATVA VCTVC VENVE VGBVG
  VIRVI VNMVN VUTVU WLFWF WSMWS YEMYE ZAFZA ZMBZM ZWEZW
  `
    .trim()
    .split(/\s+/)
    .map((pair) => [pair.slice(0, 3), pair.slice(3)]),
);

/** Splits one CSV line, honouring double-quoted fields with "" escapes. */
function parseCsvLine(line) {
  const fields = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      fields.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

export function buildGridIntensity(csvText) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = parseCsvLine(lines[0]);
  const col = (name) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`CSV is missing the "${name}" column`);
    return i;
  };
  const iCode = col('code');
  const iYear = col('year');
  const iValue = col(VALUE_COLUMN);

  /** @type {Map<string, { gPerKwh: number; year: number }>} */
  const latest = new Map();
  for (const line of lines.slice(1)) {
    const f = parseCsvLine(line);
    const code = f[iCode];
    const year = Number(f[iYear]);
    const value = f[iValue];
    if (!code || value === '' || value === undefined) continue;
    if (code.startsWith('OWID_') && code !== WORLD_CODE) continue;
    const gPerKwh = Number(value);
    if (!Number.isFinite(gPerKwh) || !Number.isInteger(year)) {
      throw new Error(`Bad row: ${line}`);
    }
    const prev = latest.get(code);
    if (!prev || year > prev.year) latest.set(code, { gPerKwh, year });
  }

  const world = latest.get(WORLD_CODE);
  if (!world) throw new Error('CSV has no World (OWID_WRL) row');
  latest.delete(WORLD_CODE);

  const countries = {};
  for (const code of [...latest.keys()].sort()) {
    const iso2 = ISO3_TO_ISO2.get(code);
    if (!iso2) throw new Error(`No ISO 3166-1 alpha-2 code for "${code}"`);
    countries[iso2] = latest.get(code);
  }
  const sorted = Object.fromEntries(
    Object.entries(countries).sort(([a], [b]) => a.localeCompare(b)),
  );
  return { source: SOURCE, worldAverage: world, countries: sorted };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [csvPath, outArg] = process.argv.slice(2);
  if (!csvPath) {
    console.error('Usage: node scripts/build-grid-intensity.mjs <path-to-csv> [out-path]');
    process.exit(1);
  }
  const outPath =
    outArg ??
    fileURLToPath(new URL('../server/src/domain/data/gridIntensity.json', import.meta.url));
  const data = buildGridIntensity(readFileSync(csvPath, 'utf8'));
  writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n');
  console.log(
    `Wrote ${Object.keys(data.countries).length} countries + world average (${data.worldAverage.gPerKwh} g/kWh, ${data.worldAverage.year}) to ${outPath}`,
  );
}
