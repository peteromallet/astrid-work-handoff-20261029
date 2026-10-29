import { describe, it, expect } from 'vitest';
import {
  TEXT_TO_IMAGE_MODELS,
  getLoraCategoryForModel,
} from './types';

describe('ImageGenerationForm types helpers', () => {
  it('exposes expected text-to-image model options', () => {
    const modelIds = TEXT_TO_IMAGE_MODELS.map((model) => model.id);

    expect(modelIds).toContain('qwen-image');
    expect(modelIds).toContain('qwen-image-2512');
    expect(modelIds).toContain('z-image');
  });

  it('maps models into qwen and z-image LoRA categories', () => {
    expect(getLoraCategoryForModel('qwen-image')).toBe('qwen');
    expect(getLoraCategoryForModel('qwen-image-2512')).toBe('qwen');
    expect(getLoraCategoryForModel('z-image')).toBe('z-image');
  });
});
