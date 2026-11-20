/** Molar volume of an ideal gas at 25 °C and 1 atm, in litres per mole. */
const MOLAR_VOLUME_L = 24.45;

/** Molecular weights in g/mol. */
const MOLECULAR_WEIGHT = { o3: 48.0, no2: 46.01 } as const;

/** Converts a gas concentration from µg/m³ to parts per billion (25 °C, 1 atm). */
export function ugm3ToPpb(ug: number, gas: 'o3' | 'no2'): number {
  return (ug * MOLAR_VOLUME_L) / MOLECULAR_WEIGHT[gas];
}
