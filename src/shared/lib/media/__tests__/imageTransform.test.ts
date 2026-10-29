import { describe, expect, it } from 'vitest';
import {
  decodeImageTransform,
  DEFAULT_IMAGE_TRANSFORM,
  describeImageTransform,
  hasImageTransformChanges,
} from '../imageTransform';

describe('imageTransform helpers', () => {
  it('decodes persisted transform payloads with safe defaults', () => {
    expect(decodeImageTransform(null)).toBeNull();
    expect(decodeImageTransform('bad')).toBeNull();

    expect(decodeImageTransform({
      translateX: 12,
      rotation: 30,
      flipH: true,
      scale: Number.NaN,
    })).toEqual({
      translateX: 12,
      translateY: 0,
      scale: 1,
      rotation: 30,
      flipH: true,
      flipV: false,
    });
  });

  it('detects whether a transform differs from the default state', () => {
    expect(hasImageTransformChanges(DEFAULT_IMAGE_TRANSFORM)).toBe(false);
    expect(hasImageTransformChanges({
      ...DEFAULT_IMAGE_TRANSFORM,
      flipH: true,
    })).toBe(true);
  });

  it('describes transforms for human-friendly variant naming', () => {
    expect(describeImageTransform({
      ...DEFAULT_IMAGE_TRANSFORM,
      flipH: true,
    })).toBe('Flipped Horizontal');

    expect(describeImageTransform({
      ...DEFAULT_IMAGE_TRANSFORM,
      translateX: -10,
      scale: 1.2,
      rotation: 15,
    })).toBe('Rotated 15° + Zoom 120% + Repositioned');
  });
});
