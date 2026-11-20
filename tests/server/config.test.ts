import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../server/src/config.js';

describe('loadConfig', () => {
  it('uses safe defaults', () => {
    expect(loadConfig({})).toEqual({
      port: 8080,
      geminiApiKey: null,
      geminiModel: 'gemini-2.5-flash',
      trustProxy: 0,
    });
  });

  it('treats an empty or blank API key as absent', () => {
    expect(loadConfig({ GEMINI_API_KEY: '' }).geminiApiKey).toBeNull();
    expect(loadConfig({ GEMINI_API_KEY: '   ' }).geminiApiKey).toBeNull();
  });

  it('reads the environment', () => {
    expect(
      loadConfig({ PORT: '3000', GEMINI_API_KEY: ' k ', GEMINI_MODEL: 'm', TRUST_PROXY: 'true' }),
    ).toEqual({ port: 3000, geminiApiKey: 'k', geminiModel: 'm', trustProxy: 1 });
  });

  it('falls back to the default port when PORT is invalid', () => {
    expect(loadConfig({ PORT: 'abc' }).port).toBe(8080);
    expect(loadConfig({ PORT: '99999' }).port).toBe(8080);
  });

  it.each([
    [undefined, 0],
    ['', 0],
    ['false', 0],
    ['true', 1],
    ['2', 2],
    ['abc', 0],
    ['-1', 0],
    ['1.5', 0],
  ])('parses TRUST_PROXY %j as %j hops', (raw, hops) => {
    expect(loadConfig(raw === undefined ? {} : { TRUST_PROXY: raw }).trustProxy).toBe(hops);
  });
});
