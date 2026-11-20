/**
 * A cheap guard against invented figures, not a proof of accuracy. It checks that every
 * ASCII number in a reply also appears in the context. It does NOT check number words
 * ("twelve"), signs or direction ("down" vs "up"), or which unit or noun a number is
 * attached to. Non-ASCII digits are rejected outright because the pattern cannot read them.
 */

/** A run of digits, optionally with `,` or `.` separators between digit groups. */
const NUMBER = /\d+(?:[.,]\d+)*/g;

/** Reads a matched number by value: thousands separators are dropped, so `1,180` is 1180 and `07` is 7. */
const toValue = (match: string): number => parseFloat(match.replace(/,/g, ''));

const numbersIn = (text: string): number[] => (text.match(NUMBER) ?? []).map(toValue);

/** Every number that appears in the context the model was given. */
export function allowedNumbers(context: string): Set<number> {
  return new Set(numbersIn(context));
}

/** True when every number in `text` also appears in the context, so the model invented none. */
export function passesNumberGuard(text: string, allowed: Set<number>): boolean {
  if (/(?![0-9])\p{Nd}/u.test(text)) return false;
  return numbersIn(text).every((n) => allowed.has(n));
}
