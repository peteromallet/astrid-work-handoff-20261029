import { describe, it, expect } from 'vitest';
import { validateHuggingFaceUrl } from '../validation-utils';

describe('validateHuggingFaceUrl', () => {
  it('rejects empty URL', () => {
    const result = validateHuggingFaceUrl('');
    expect(result.isValid).toBe(false);
    expect(result.message).toBe('URL is required');
  });

  it('rejects blob URLs', () => {
    const result = validateHuggingFaceUrl('blob:https://example.com/abc');
    expect(result.isValid).toBe(false);
    expect(result.message).toContain('blob URL');
  });

  it('rejects HuggingFace /blob/ URLs', () => {
    const result = validateHuggingFaceUrl('https://huggingface.co/user/model/blob/main/model.safetensors');
    expect(result.isValid).toBe(false);
    expect(result.message).toContain('Replace /blob/ with /resolve/');
  });

  it('rejects URLs without /resolve/', () => {
    const result = validateHuggingFaceUrl('https://huggingface.co/user/model/main/model.safetensors');
    expect(result.isValid).toBe(false);
    expect(result.message).toContain('/resolve/');
  });

  it('rejects non-HuggingFace /resolve/ URLs', () => {
    const result = validateHuggingFaceUrl('https://example.com/resolve/main/model.safetensors');
    expect(result.isValid).toBe(false);
    expect(result.message).toContain('HuggingFace URL');
  });

  it('accepts valid HuggingFace /resolve/ URLs', () => {
    const result = validateHuggingFaceUrl('https://huggingface.co/user/model/resolve/main/model.safetensors');
    expect(result.isValid).toBe(true);
    expect(result.message).toBe('');
  });
});
