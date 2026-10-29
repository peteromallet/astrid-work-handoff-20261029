import { describe, expect, it } from 'vitest';

import { TOOL_IDS } from '@/shared/lib/tooling/toolIds';

import { isHomeToolPathActive, resolveHomeToolPath } from './homeNavigation';

describe('resolveHomeToolPath', () => {
  it('returns the preferred eligible tool path', () => {
    expect(
      resolveHomeToolPath({
        preferredToolId: TOOL_IDS.IMAGE_GENERATION,
      }),
    ).toBe('/tools/image-generation');
  });

  it('builds the video editor path with the saved timeline', () => {
    expect(
      resolveHomeToolPath({
        preferredToolId: TOOL_IDS.VIDEO_EDITOR,
        videoEditorTimelineId: 'timeline-123',
      }),
    ).toBe('/tools/video-editor?timeline=timeline-123');
  });

  it('falls back to the Video Editor when the preferred tool is unavailable', () => {
    expect(
      resolveHomeToolPath({
        preferredToolId: 'missing-tool',
      }),
    ).toBe('/tools/video-editor');
  });

  it('keeps the character animate tool reachable as the preferred tool', () => {
    expect(
      resolveHomeToolPath({
        preferredToolId: TOOL_IDS.CHARACTER_ANIMATE,
      }),
    ).toBe('/tools/character-animate');
  });
});

describe('isHomeToolPathActive', () => {
  it('treats the current tool page as active even when the target has query params', () => {
    expect(isHomeToolPathActive('/tools/video-editor', '/tools/video-editor?timeline=timeline-123')).toBe(true);
  });

  it('returns false for different tool pages', () => {
    expect(isHomeToolPathActive('/tools/edit-video', '/tools/video-editor?timeline=timeline-123')).toBe(false);
  });
});
