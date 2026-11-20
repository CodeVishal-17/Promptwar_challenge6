import { describe, expect, it } from 'vitest';
import { allowedNumbers, passesNumberGuard } from '../../../server/src/domain/numberGuard.js';

describe('number guard', () => {
  const allowed = allowedNumbers(JSON.stringify({ aqi: 212, best: '15:00', kg: '1,180' }));

  it('accepts numbers present in the context', () => {
    expect(passesNumberGuard('AQI is 212 until 15:00', allowed)).toBe(true);
    expect(passesNumberGuard('saves 1,180 kg', allowed)).toBe(true);
  });
  it('rejects numbers that are not in the context', () => {
    expect(passesNumberGuard('cuts exposure by 40%', allowed)).toBe(false);
  });
  it('accepts text with no numbers', () => {
    expect(passesNumberGuard('no numbers here', allowed)).toBe(true);
  });
  it('compares by value, so 07 equals 7 and 1180 equals 1,180', () => {
    expect(passesNumberGuard('at 07', allowedNumbers('7'))).toBe(true);
    expect(passesNumberGuard('1180 kg', allowed)).toBe(true);
  });
  it('rejects one wrong number among right ones', () => {
    expect(passesNumberGuard('AQI 212 then 99', allowed)).toBe(false);
  });
  it('does not treat a trailing full stop as part of the number', () => {
    expect(passesNumberGuard('The AQI is 212.', allowed)).toBe(true);
  });
});
