import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../server/src/config.js';

describe('loadConfig', () => {
  it('uses safe defaults', () => {
    expect(loadConfig({})).toEqual({
      port: 8080,
      geminiApiKey: null,
      geminiModel: 'gemini-2.5-flash',
      trustProxy: false,
    });
  });

  it('treats an empty or blank API key as absent', () => {
    expect(loadConfig({ GEMINI_API_KEY: '' }).geminiApiKey).toBeNull();
    expect(loadConfig({ GEMINI_API_KEY: '   ' }).geminiApiKey).toBeNull();
  });

  it('reads the environment', () => {
    expect(
      loadConfig({ PORT: '3000', GEMINI_API_KEY: ' k ', GEMINI_MODEL: 'm', TRUST_PROXY: 'true' }),
    ).toEqual({ port: 3000, geminiApiKey: 'k', geminiModel: 'm', trustProxy: true });
  });

  it('falls back to the default port when PORT is invalid', () => {
    expect(loadConfig({ PORT: 'abc' }).port).toBe(8080);
    expect(loadConfig({ PORT: '99999' }).port).toBe(8080);
  });
});
