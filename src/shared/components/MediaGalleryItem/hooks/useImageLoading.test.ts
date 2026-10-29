import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useImageLoading } from './useImageLoading';

const mocks = vi.hoisted(() => ({
  getDisplayUrl: vi.fn((url: string, bustCache?: boolean) => `${url}${bustCache ? '?retry=1' : ''}`),
  stripQueryParameters: vi.fn((url?: string | null) => (url ? url.split('?')[0] : '')),
  hasLoadedImage: vi.fn(() => false),
  setImageLoadStatus: vi.fn(),
}));

vi.mock('@/shared/lib/media/mediaUrl', () => ({
  getDisplayUrl: (...args: unknown[]) => mocks.getDisplayUrl(...args),
  stripQueryParameters: (...args: unknown[]) => mocks.stripQueryParameters(...args),
}));

vi.mock('@/shared/lib/preloading', () => ({
  hasLoadedImage: (...args: unknown[]) => mocks.hasLoadedImage(...args),
  setImageLoadStatus: (...args: unknown[]) => mocks.setImageLoadStatus(...args),
}));

describe('useImageLoading', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.hasLoadedImage.mockReturnValue(false);
  });

  it('schedules one retry path and clears the scheduled attempt once applied', () => {
    const image = {
      id: 'img-1',
      url: 'https://cdn/image.png',
      thumbUrl: 'https://cdn/thumb.png',
    };
    const onImageLoaded = vi.fn();

    const { result } = renderHook(() =>
      useImageLoading({
        image: image as never,
        displayUrl: 'https://cdn/thumb.png',
        shouldLoad: true,
        onImageLoaded,
      }),
    );

    act(() => {
      result.current.handleImageError({
        target: { src: 'https://cdn/thumb.png' },
      } as never);
    });

    expect(result.current.imageLoadError).toBe(false);
    expect(result.current.actualSrc).toBe('https://cdn/thumb.png');

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(mocks.getDisplayUrl).toHaveBeenCalledWith('https://cdn/thumb.png', true);
    expect(result.current.actualSrc).toBe('https://cdn/thumb.png?retry=1');
  });

  it('clears pending retry timers when a new image arrives', () => {
    const initialImage = {
      id: 'img-1',
      url: 'https://cdn/image.png',
      thumbUrl: 'https://cdn/thumb.png',
    };
    const nextImage = {
      id: 'img-2',
      url: 'https://cdn/image-2.png',
      thumbUrl: 'https://cdn/thumb-2.png',
    };

    const { result, rerender } = renderHook(
      ({ image }) =>
        useImageLoading({
          image: image as never,
          displayUrl: image.thumbUrl,
          shouldLoad: true,
        }),
      { initialProps: { image: initialImage } },
    );

    act(() => {
      result.current.handleImageError({
        target: { src: 'https://cdn/thumb.png' },
      } as never);
    });

    rerender({ image: nextImage });

    act(() => {
      vi.runAllTimers();
    });

    expect(result.current.actualSrc).toBe('https://cdn/thumb-2.png');
    expect(result.current.imageLoadError).toBe(false);
  });
});
