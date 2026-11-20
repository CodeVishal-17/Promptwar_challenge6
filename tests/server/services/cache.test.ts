import { describe, expect, it, vi } from 'vitest';
import { TtlCache } from '../../../server/src/services/cache.js';

describe('TtlCache', () => {
  it('coalesces concurrent loads for the same key', async () => {
    const cache = new TtlCache<number>(1000, 10, () => 0);
    const load = vi.fn(async () => 42);
    const [a, b] = await Promise.all([cache.getOrLoad('k', load), cache.getOrLoad('k', load)]);
    expect([a, b]).toEqual([42, 42]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('serves from cache until the TTL passes, then reloads', async () => {
    let t = 0;
    const cache = new TtlCache<number>(1000, 10, () => t);
    const load = vi.fn(async () => 1);
    await cache.getOrLoad('k', load);
    t = 999;
    await cache.getOrLoad('k', load);
    expect(load).toHaveBeenCalledTimes(1);
    t = 1000;
    await cache.getOrLoad('k', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not cache rejections', async () => {
    const cache = new TtlCache<number>(1000, 10, () => 0);
    const load = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(7);
    await expect(cache.getOrLoad('k', load)).rejects.toThrow('boom');
    await expect(cache.getOrLoad('k', load)).resolves.toBe(7);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('evicts the oldest entry when full', async () => {
    const cache = new TtlCache<number>(1000, 500, () => 0);
    const load = vi.fn(async () => 1);
    for (let i = 0; i < 501; i++) await cache.getOrLoad(`k${i}`, load);
    expect(load).toHaveBeenCalledTimes(501);
    await cache.getOrLoad('k500', load);
    expect(load).toHaveBeenCalledTimes(501);
    await cache.getOrLoad('k0', load);
    expect(load).toHaveBeenCalledTimes(502);
  });
});
