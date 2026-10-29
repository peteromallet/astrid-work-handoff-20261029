// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HoverPeekButton } from './HoverPeek';
import type { GeneratedImageWithMetadata } from '../../MediaGallery/types';
import * as peekPlacement from './peekPlacement';

const FULL_URL = 'https://cdn.example/full.png';
const THUMB_URL = 'https://cdn.example/thumb.png';

const preloaded: string[] = [];

function imageFixture(overrides: Partial<GeneratedImageWithMetadata> = {}): GeneratedImageWithMetadata {
  return {
    id: 'img-1',
    url: FULL_URL,
    thumbUrl: THUMB_URL,
    prompt: 'Sunset',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as GeneratedImageWithMetadata;
}

function renderPeek(options: { image?: GeneratedImageWithMetadata; onOpenLightbox?: () => void; isVideo?: boolean; onOpenChange?: (open: boolean) => void } = {}) {
  const onOpenLightbox = options.onOpenLightbox ?? vi.fn();
  const utils = render(
    <HoverPeekButton
      image={options.image ?? imageFixture()}
      thumbSrc={THUMB_URL}
      fullSrc={options.isVideo ? null : FULL_URL}
      videoSrc={options.isVideo ? 'https://cdn.example/clip.mp4' : null}
      isVideo={options.isVideo ?? false}
      metadataAspectRatio={null}
      projectAspectRatio={null}
      onOpenLightbox={onOpenLightbox}
      onOpenChange={options.onOpenChange}
    />,
  );
  const eye = screen.getByLabelText('Preview');
  vi.spyOn(eye, 'getBoundingClientRect').mockReturnValue({
    left: 100,
    top: 100,
    right: 128,
    bottom: 128,
    width: 28,
    height: 28,
    x: 100,
    y: 100,
    toJSON: () => ({}),
  } as DOMRect);
  return { ...utils, onOpenLightbox, eye };
}

const peekEl = () => screen.queryByTestId('gallery-tile-peek');
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

describe('HoverPeekButton', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('innerWidth', 500);
    vi.stubGlobal('innerHeight', 400);
    preloaded.length = 0;
    vi.stubGlobal('Image', class {
      crossOrigin: string | null = null;
      onload: (() => void) | null = null;
      set src(value: string) { preloaded.push(value); }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('starts preloading the full image as soon as the eye is entered', () => {
    const { eye } = renderPeek();

    fireEvent.pointerEnter(eye);

    expect(preloaded).toContain(FULL_URL);
    expect(peekEl()).toBeNull();
  });

  it('opens the peek after the open delay, not before', () => {
    const { eye } = renderPeek();
    expect(eye).not.toHaveAttribute('data-state', 'open');

    fireEvent.pointerEnter(eye);
    advance(119);
    expect(peekEl()).toBeNull();

    advance(1);
    expect(peekEl()).toBeInTheDocument();
    expect(eye).toHaveAttribute('data-state', 'open');
    expect(eye).toHaveClass('data-[state=open]:opacity-100');
    expect(Number.parseFloat(peekEl()?.style.left ?? '')).toBeCloseTo(31.333, 3);
    expect(peekEl()).toHaveStyle({ top: '142px', height: '246px' });
    expect(peekEl()?.parentElement?.children).toHaveLength(2);
  });

  it('draws a horizontal connector for a peek placed to the right of the eye', () => {
    const placementSpy = vi.spyOn(peekPlacement, 'placePeek').mockReturnValue({
      side: 'right',
      left: 142,
      top: 80,
      width: 100,
      height: 56,
    });
    const { eye } = renderPeek();

    fireEvent.pointerEnter(eye);
    advance(120);
    advance(16);

    const bridge = screen.getByTestId('gallery-tile-peek-bridge');
    const connector = screen.getByTestId('gallery-tile-peek-connector');
    expect(bridge).toHaveStyle({ left: '128px', top: '100px', width: '14px', height: '28px' });
    expect(connector).toHaveStyle({ left: '0px', top: '13px', width: '14px', height: '2px' });
    expect(connector).toHaveStyle({ transformOrigin: 'left center' });
    expect(connector).toHaveClass('scale-x-100');
    placementSpy.mockRestore();
  });

  it('stays open while the pointer moves from the eye through the bridge onto the peek', () => {
    const { eye } = renderPeek();
    fireEvent.pointerEnter(eye);
    advance(120);

    fireEvent.pointerLeave(eye);
    advance(100);
    const bridge = screen.getByTestId('gallery-tile-peek-bridge');
    fireEvent.pointerEnter(bridge);
    advance(500);
    expect(peekEl()).toBeInTheDocument();

    fireEvent.pointerLeave(bridge);
    fireEvent.pointerEnter(peekEl() as HTMLElement);
    advance(1000);

    expect(peekEl()).toBeInTheDocument();
  });

  it('recomputes the anchored size when the viewport resizes', () => {
    const { eye } = renderPeek();
    fireEvent.pointerEnter(eye);
    advance(120);
    expect(Number.parseFloat(peekEl()?.style.width ?? '')).toBeCloseTo(437.333333, 3);

    vi.stubGlobal('innerWidth', 800);
    vi.stubGlobal('innerHeight', 600);
    fireEvent(window, new Event('resize'));

    expect(peekEl()).toHaveStyle({ width: '776px', height: '436.5px' });
  });

  it('repositions once the thumbnail natural size is known', () => {
    const { eye } = renderPeek();
    fireEvent.pointerEnter(eye);
    advance(120);
    expect(Number.parseFloat(peekEl()?.style.left ?? '')).toBeCloseTo(31.333, 3);

    const thumbnail = peekEl()?.querySelector('img[alt=""]') as HTMLImageElement;
    Object.defineProperty(thumbnail, 'naturalWidth', { configurable: true, value: 9 });
    Object.defineProperty(thumbnail, 'naturalHeight', { configurable: true, value: 16 });
    fireEvent.load(thumbnail);

    expect(Number.parseFloat(peekEl()?.style.left ?? '')).toBeCloseTo(144.25, 2);
    expect(peekEl()).toHaveStyle({ width: '211.5px', height: '376px' });
  });

  it('closes after the grace period once the pointer leaves the peek', () => {
    const { eye } = renderPeek();
    fireEvent.pointerEnter(eye);
    advance(120);
    fireEvent.pointerLeave(eye);
    fireEvent.pointerEnter(peekEl() as HTMLElement);

    fireEvent.pointerLeave(peekEl() as HTMLElement);
    advance(119);
    expect(peekEl()).toBeInTheDocument();

    advance(1);
    expect(peekEl()).toBeNull();
  });

  it('reports open and close through onOpenChange so the tile can hide its timestamp', () => {
    const onOpenChange = vi.fn();
    const { eye } = renderPeek({ onOpenChange });
    onOpenChange.mockClear();
    fireEvent.pointerEnter(eye);
    advance(120);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);

    fireEvent.pointerLeave(eye);
    fireEvent.pointerEnter(peekEl() as HTMLElement);
    fireEvent.pointerLeave(peekEl() as HTMLElement);
    advance(120);
    expect(peekEl()).toBeNull();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('cancels a pending open when the pointer leaves the eye early', () => {
    const { eye } = renderPeek();
    fireEvent.pointerEnter(eye);
    advance(60);
    fireEvent.pointerLeave(eye);

    advance(500);

    expect(peekEl()).toBeNull();
  });

  it('opens the lightbox and closes the peek when the peek is clicked', () => {
    const onOpenLightbox = vi.fn();
    const { eye } = renderPeek({ onOpenLightbox });
    fireEvent.pointerEnter(eye);
    advance(120);

    fireEvent.click(peekEl() as HTMLElement);

    expect(onOpenLightbox).toHaveBeenCalledWith(expect.objectContaining({ id: 'img-1' }));
    expect(peekEl()).toBeNull();
  });

  it('closes on Escape', () => {
    const { eye } = renderPeek();
    fireEvent.pointerEnter(eye);
    advance(120);
    expect(peekEl()).toBeInTheDocument();
    expect(eye).toHaveAttribute('data-state', 'open');

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(peekEl()).toBeNull();
    expect(eye).not.toHaveAttribute('data-state', 'open');
  });

  it('keeps only one peek open: a second one closes the first', () => {
    const first = renderPeek();
    const second = render(
      <HoverPeekButton
        image={imageFixture({ id: 'img-2' })}
        thumbSrc={THUMB_URL}
        fullSrc={FULL_URL}
        videoSrc={null}
        isVideo={false}
        metadataAspectRatio={null}
        projectAspectRatio={null}
        onOpenLightbox={vi.fn()}
      />,
    );
    fireEvent.pointerEnter(first.eye);
    advance(120);
    expect(peekEl()).toBeInTheDocument();

    fireEvent.pointerEnter(screen.getAllByLabelText('Preview')[1]);
    advance(120);

    expect(screen.getAllByTestId('gallery-tile-peek')).toHaveLength(1);
    second.unmount();
  });

  it('clears its timers on unmount so a late open does not fire', () => {
    const { eye, unmount } = renderPeek();
    fireEvent.pointerEnter(eye);

    unmount();

    expect(() => advance(500)).not.toThrow();
  });

  it('renders a video peek with the full video and the thumbnail as poster', () => {
    const { eye } = renderPeek({ isVideo: true });
    fireEvent.pointerEnter(eye);
    advance(120);

    const video = peekEl()?.querySelector('video');
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute('src', 'https://cdn.example/clip.mp4');
    expect(video).toHaveAttribute('poster', THUMB_URL);
    expect(preloaded).not.toContain(FULL_URL);
  });
});
