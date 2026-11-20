import { describe, expect, it } from 'vitest';
import { ugm3ToPpb } from '../../../server/src/domain/units.js';

describe('ugm3ToPpb', () => {
  it('converts NO2', () => {
    expect(ugm3ToPpb(100, 'no2')).toBeCloseTo(53.14, 2);
  });
  it('converts O3', () => {
    expect(ugm3ToPpb(100, 'o3')).toBeCloseTo(50.94, 2);
  });
  it('maps zero to zero', () => {
    expect(ugm3ToPpb(0, 'o3')).toBe(0);
  });
});
