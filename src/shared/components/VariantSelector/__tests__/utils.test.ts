// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { Film, Scissors, Sparkles } from 'lucide-react';
import type { GenerationVariant } from '@/shared/hooks/variants/useVariants';
import {
  getVariantIcon,
  getVariantLabel,
  hasLoadableSettings,
  isNewVariant,
} from '../variantPresentation';

const baseVariant: GenerationVariant = {
  id: 'variant-1',
  generation_id: 'generation-1',
  location: 'generations/path.mp4',
  thumbnail_url: null,
  params: null,
  is_primary: false,
  starred: false,
  variant_type: null,
  name: null,
  created_at: '2026-02-16T00:00:00.000Z',
  viewed_at: null,
};

describe('getVariantIcon', () => {
  it('returns the expected icon for known variant types', () => {
    expect(getVariantIcon('trimmed')).toBe(Scissors);
    expect(getVariantIcon('upscaled')).toBe(Sparkles);
    expect(getVariantIcon('magic_edit')).toBe(Sparkles);
  });

  it('falls back to Film for unknown types', () => {
    expect(getVariantIcon('custom')).toBe(Film);
    expect(getVariantIcon(null)).toBe(Film);
  });
});

describe('getVariantLabel', () => {
  it('formats trimmed variants with duration when available', () => {
    const trimmedVariant = {
      ...baseVariant,
      variant_type: 'trimmed',
      params: { trimmed_duration: 4.56 },
    };
    expect(getVariantLabel(trimmedVariant)).toBe('Trimmed (4.6s)');
  });

  it('uses base labels for known variant types', () => {
    expect(getVariantLabel({ ...baseVariant, variant_type: 'upscaled' })).toBe('Upscaled');
    expect(getVariantLabel({ ...baseVariant, variant_type: 'magic_edit' })).toBe('Magic Edit');
    expect(getVariantLabel({ ...baseVariant, variant_type: 'original' })).toBe('Original');
    expect(getVariantLabel({ ...baseVariant, variant_type: null })).toBe('Variant');
  });
});

describe('isNewVariant', () => {
  it('returns false for the active variant', () => {
    const variant = { ...baseVariant, id: 'active-id', viewed_at: null };
    expect(isNewVariant(variant, 'active-id')).toBe(false);
  });

  it('returns true when variant was never viewed and is not active', () => {
    const variant = { ...baseVariant, viewed_at: null };
    expect(isNewVariant(variant, 'different-id')).toBe(true);
  });
});

describe('hasLoadableSettings', () => {
  it('skips known non-loadable variant types', () => {
    const variant = {
      ...baseVariant,
      variant_type: 'trimmed',
      params: { prompt: 'kept for regression' },
    };
    expect(hasLoadableSettings(variant)).toBe(false);
  });

  it('supports video enhance and prompt-based variants', () => {
    const videoEnhanceVariant = {
      ...baseVariant,
      params: { task_type: 'video_enhance' },
    };
    const promptVariant = {
      ...baseVariant,
      params: { prompt: 'hello world' },
    };

    expect(hasLoadableSettings(videoEnhanceVariant)).toBe(true);
    expect(hasLoadableSettings(promptVariant)).toBe(true);
  });
});
