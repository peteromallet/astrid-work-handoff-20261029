import { afterEach, describe, expect, it, vi } from 'vitest';
import { cloneFrame, FramePreviewCache, timelineSecondsToFrame } from './frame-preview-cache';
import type { TranscriptWordProjection } from '@/sdk/video/transcript';

const word = (timing: TranscriptWordProjection['timing'], timelineStart: number | null): TranscriptWordProjection => ({
  id: 'word-1', text: 'hello', start: 0, end: 1, timing, timelineStart, timelineEnd: 1,
});

afterEach(() => vi.restoreAllMocks());

describe('frame preview helpers', () => {
  it('rounds timeline seconds to a frame and clamps valid times that round to the end', () => {
    expect(timelineSecondsToFrame(1.24, 10, 20)).toBe(12);
    expect(timelineSecondsToFrame(1.99, 10, 20)).toBe(19);
    expect(timelineSecondsToFrame(2, 10, 20)).toBeNull();
  });

  it('rejects invalid times, rates, and durations', () => {
    for (const args of [
      [Number.NaN, 10, 20], [-0.01, 10, 20], [0, 0, 20], [0, -1, 20],
      [0, Number.POSITIVE_INFINITY, 20], [0, 10, 0], [0, 10, 2.5],
    ] as const) expect(timelineSecondsToFrame(...args)).toBeNull();
  });

  it('maps repeated word projections using their timeline placement', () => {
    expect(timelineSecondsToFrame(word('word', 0.26).timelineStart!, 10, 100)).toBe(3);
    expect(timelineSecondsToFrame(word('word', 0.26).timelineStart!, 10, 2)).toBeNull();
    const repeatedA = { ...word('word', 0.2), id: 'same-source@clip-a' };
    const repeatedB = { ...word('word', 1.2), id: 'same-source@clip-b' };
    expect(timelineSecondsToFrame(repeatedA.timelineStart!, 10, 30)).toBe(2);
    expect(timelineSecondsToFrame(repeatedB.timelineStart!, 10, 30)).toBe(12);
  });

  it('reuses entries, clears on revision identity changes, and evicts least recently used frames', () => {
    const cache = new FramePreviewCache<string>(2);
    const revisionA = {};
    const revisionB = {};
    cache.set(revisionA, 1, 'one');
    cache.set(revisionA, 2, 'two');
    expect(cache.get(revisionA, 1)).toBe('one');
    cache.set(revisionA, 3, 'three');
    expect(cache.get(revisionA, 2)).toBeUndefined();
    expect(cache.get(revisionA, 1)).toBe('one');
    expect(cache.get(revisionB, 1)).toBeUndefined();
    cache.set(revisionB, 1, 'new revision');
    expect(cache.get(revisionB, 1)).toBe('new revision');
  });

  it('clones decoded media, removes audio, and returns null when a frame is unavailable', () => {
    const root = document.createElement('div');
    root.className = 'composition';
    root.innerHTML = '<span>frame</span><audio></audio><video class="shot"></video><canvas></canvas>';
    const video = root.querySelector('video')!;
    Object.defineProperties(video, {
      readyState: { configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA },
      seeking: { configurable: true, value: false },
      videoWidth: { configurable: true, value: 320 }, videoHeight: { configurable: true, value: 180 },
    });
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    const cloned = cloneFrame(root)!;
    expect(cloned).not.toBe(root);
    expect(cloned.className).toBe('composition');
    expect(cloned.querySelector('audio')).toBeNull();
    expect(cloned.querySelector('video')).toBeNull();
    expect(cloned.querySelector('canvas.shot')).toBeTruthy();
    expect(cloned.querySelector('canvas.shot')?.width).toBe(320);
    expect(drawImage).toHaveBeenCalledTimes(2);

    Object.defineProperty(video, 'seeking', { configurable: true, value: true });
    expect(cloneFrame(root)).toBeNull();
  });

  it('returns null when copying canvas pixels throws', () => {
    const root = document.createElement('div');
    root.appendChild(document.createElement('canvas'));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: () => { throw new Error('tainted'); } } as unknown as CanvasRenderingContext2D);
    expect(cloneFrame(root)).toBeNull();
  });
});
