/** Display helpers shared by the impact calculators. */

const MINUS = '−'; // typographic minus "−"

const thousands = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

/** Rounds half away from zero to an integer, never returning −0. */
export function roundPercent(p: number): number {
  const r = Math.sign(p) * Math.round(Math.abs(p));
  return r === 0 ? 0 : r;
}

/** "−79%", "+25%" or "0%" for an integer percentage change. */
export function formatPercentChange(p: number): string {
  if (p < 0) return `${MINUS}${Math.abs(p)}%`;
  if (p > 0) return `+${p}%`;
  return '0%';
}

/** kg rounded for display: 2 significant figures from 100 up, 1 decimal below. */
export function formatKg(kg: number): string {
  if (kg === 0) return '0';
  const oneDecimal = Math.round(kg * 10) / 10;
  if (Math.abs(oneDecimal) >= 100) return thousands.format(Number(kg.toPrecision(2)));
  if (oneDecimal === 0 && kg > 0) return '<0.1';
  return oneDecimal.toFixed(1);
}

/** Formats a plain number with up to `digits` decimals, e.g. for formula inputs. */
export function formatNumber(n: number, digits = 2): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(n);
}

export function assertNonNegative(name: string, v: number): void {
  if (!Number.isFinite(v) || v < 0)
    throw new RangeError(`${name} must be a finite number ≥ 0 (got ${v})`);
}

export function assertPositive(name: string, v: number): void {
  if (!Number.isFinite(v) || v <= 0)
    throw new RangeError(`${name} must be a finite number > 0 (got ${v})`);
}
