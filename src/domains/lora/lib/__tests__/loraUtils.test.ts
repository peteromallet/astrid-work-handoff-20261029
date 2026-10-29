import { describe, it, expect } from 'vitest';
import { getDisplayNameFromUrl, PREDEFINED_LORAS } from '../loraUtils';

describe('getDisplayNameFromUrl', () => {
  it('returns predefined display name for known URLs', () => {
    const predefined = PREDEFINED_LORAS[0];
    expect(getDisplayNameFromUrl(predefined.url)).toBe(predefined.displayName);
  });

  it('uses fallback name when provided', () => {
    expect(getDisplayNameFromUrl(
      'https://example.com/unknown.safetensors',
      'Custom Name',
    )).toBe('Custom Name');
  });

  it('cleans filename from URL as last resort', () => {
    expect(getDisplayNameFromUrl('https://example.com/my_cool_model.safetensors'))
      .toBe('my cool model');
  });

  it('removes .ckpt and .pt extensions', () => {
    expect(getDisplayNameFromUrl('https://example.com/model.ckpt'))
      .toBe('model');
    expect(getDisplayNameFromUrl('https://example.com/model.pt'))
      .toBe('model');
  });

  it('replaces underscores and hyphens with spaces', () => {
    expect(getDisplayNameFromUrl('https://example.com/some-model_v2.safetensors'))
      .toBe('some model v2');
  });

  it('returns empty string for empty URL', () => {
    expect(getDisplayNameFromUrl('')).toBe('');
  });

  it('ignores blank fallback name', () => {
    expect(getDisplayNameFromUrl(
      'https://example.com/model.safetensors',
      '   ',
    )).toBe('model');
  });
});

describe('PREDEFINED_LORAS', () => {
  it('has entries with required fields', () => {
    expect(PREDEFINED_LORAS.length).toBeGreaterThan(0);
    for (const lora of PREDEFINED_LORAS) {
      expect(lora.name).toBeTruthy();
      expect(lora.url).toBeTruthy();
      expect(lora.displayName).toBeTruthy();
      expect(lora.category).toBeTruthy();
    }
  });
});
