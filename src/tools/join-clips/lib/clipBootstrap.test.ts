import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildInitialClipsFromSettings,
  padClipsWithEmptySlots,
} from './clipBootstrap';

const generateUUIDMock = vi.hoisted(() => vi.fn());

vi.mock('@/shared/lib/taskCreation', () => ({
  generateUUID: () => generateUUIDMock(),
}));

describe('clipBootstrap', () => {
  beforeEach(() => {
    generateUUIDMock.mockReset();
    generateUUIDMock
      .mockReturnValueOnce('clip-1')
      .mockReturnValueOnce('clip-2')
      .mockReturnValueOnce('empty-1')
      .mockReturnValueOnce('empty-2')
      .mockReturnValueOnce('empty-3');
  });

  it('builds initial clips and transition prompts from the multi-clip settings format', () => {
    const result = buildInitialClipsFromSettings({
      clips: [
        {
          url: 'https://example.com/a.mp4',
          posterUrl: 'https://example.com/a.jpg',
          finalFrameUrl: 'https://example.com/a-final.jpg',
          durationSeconds: 4,
        },
        {
          url: 'https://example.com/b.mp4',
          posterUrl: 'https://example.com/b.jpg',
          durationSeconds: 6,
        },
      ],
      transitionPrompts: [{ clipIndex: 1, prompt: 'Blend the scenes' }],
    } as never);

    expect(result.clips).toEqual([
      {
        id: 'clip-1',
        url: 'https://example.com/a.mp4',
        posterUrl: 'https://example.com/a.jpg',
        finalFrameUrl: 'https://example.com/a-final.jpg',
        durationSeconds: 4,
        loaded: false,
        playing: false,
      },
      {
        id: 'clip-2',
        url: 'https://example.com/b.mp4',
        posterUrl: 'https://example.com/b.jpg',
        finalFrameUrl: undefined,
        durationSeconds: 6,
        loaded: false,
        playing: false,
      },
    ]);
    expect(result.transitionPrompts).toEqual([
      { id: 'clip-2', prompt: 'Blend the scenes' },
    ]);
    expect(result.posterUrlsToPreload).toEqual([
      'https://example.com/a.jpg',
      'https://example.com/b.jpg',
    ]);
  });

  it('falls back to the legacy two-video format and carries the legacy prompt to the second clip', () => {
    const result = buildInitialClipsFromSettings({
      startingVideoUrl: 'https://example.com/start.mp4',
      startingVideoPosterUrl: 'https://example.com/start.jpg',
      endingVideoUrl: 'https://example.com/end.mp4',
      endingVideoPosterUrl: 'https://example.com/end.jpg',
      prompt: 'Legacy transition prompt',
    } as never);

    expect(result.clips).toHaveLength(2);
    expect(result.transitionPrompts).toEqual([
      { id: 'clip-2', prompt: 'Legacy transition prompt' },
    ]);
    expect(result.posterUrlsToPreload).toEqual([
      'https://example.com/start.jpg',
      'https://example.com/end.jpg',
    ]);
  });

  it('pads clips with the expected empty slots for zero, one, and many inputs', () => {
    expect(padClipsWithEmptySlots([])).toEqual([
      { id: 'clip-1', url: '', loaded: false, playing: false },
      { id: 'clip-2', url: '', loaded: false, playing: false },
    ]);

    expect(padClipsWithEmptySlots([
      { id: 'clip-1', url: 'https://example.com/a.mp4', loaded: false, playing: false },
    ] as never)).toEqual([
      { id: 'clip-1', url: 'https://example.com/a.mp4', loaded: false, playing: false },
      { id: 'empty-1', url: '', loaded: false, playing: false },
    ]);
  });
});
