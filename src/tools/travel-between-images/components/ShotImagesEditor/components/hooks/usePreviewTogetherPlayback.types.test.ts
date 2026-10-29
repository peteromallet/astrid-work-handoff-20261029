import { describe, expect, it } from 'vitest';
import { NOOP_VIDEO_HANDLERS } from './usePreviewTogetherPlayback.types';

describe('usePreviewTogetherPlayback.types', () => {
  it('exports stable no-op video handlers for each playback event hook point', () => {
    expect(Object.keys(NOOP_VIDEO_HANDLERS)).toEqual([
      'onClick',
      'onPlay',
      'onPause',
      'onTimeUpdate',
      'onSeeked',
      'onLoadedMetadata',
      'onEnded',
    ]);

    expect(NOOP_VIDEO_HANDLERS.onClick()).toBeUndefined();
    expect(NOOP_VIDEO_HANDLERS.onPlay()).toBeUndefined();
    expect(NOOP_VIDEO_HANDLERS.onPause()).toBeUndefined();
    expect(NOOP_VIDEO_HANDLERS.onTimeUpdate()).toBeUndefined();
    expect(NOOP_VIDEO_HANDLERS.onSeeked()).toBeUndefined();
    expect(NOOP_VIDEO_HANDLERS.onLoadedMetadata()).toBeUndefined();
    expect(NOOP_VIDEO_HANDLERS.onEnded()).toBeUndefined();
  });
});
